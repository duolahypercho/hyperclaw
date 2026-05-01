package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

// drainHookMu guards drainHook so it can be wired from main without a race.
var drainHookMu sync.RWMutex

// drainHook is called by Apply before restart(). It should signal in-flight
// bridge dispatches to finish and wait up to the given deadline. The function
// is optional — if nil, Apply proceeds immediately. Wire it via SetDrainHook
// from hub/main after the bridge handler is created.
var drainHook func(timeout time.Duration) bool

// SetDrainHook registers the drain callback. Typically called once from main
// after the Hub is wired:
//
//	updater.SetDrainHook(func(d time.Duration) bool {
//	    return hub.ShutdownGracefully(d)
//	})
func SetDrainHook(fn func(timeout time.Duration) bool) {
	drainHookMu.Lock()
	drainHook = fn
	drainHookMu.Unlock()
}

// StatusFunc is called to report update progress back to the Hub.
type StatusFunc func(status, errMsg string)

// Apply downloads, verifies, and installs an update from the given payload.
// payload fields: version, url, checksum (sha256:hex), mandatory
func Apply(payload map[string]interface{}, reportStatus StatusFunc) error {
	if os.Getenv("HYPERCLAW_SKIP_UPDATE") == "1" {
		log.Printf("[updater] skipped (HYPERCLAW_SKIP_UPDATE=1)")
		reportStatus("skipped", "local dev mode")
		return nil
	}
	version, _ := payload["version"].(string)
	downloadURL, _ := payload["url"].(string)
	checksum, _ := payload["checksum"].(string)

	if downloadURL == "" {
		return fmt.Errorf("no download URL in update payload")
	}
	checksum = strings.TrimSpace(checksum)
	if checksum == "" {
		return fmt.Errorf("checksum is required in update payload")
	}

	log.Printf("[updater] Update available: v%s from %s", version, downloadURL)

	// 1. Download
	reportStatus("downloading", "")
	tmpPath, err := download(downloadURL)
	if err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("download failed: %w", err)
	}
	defer func() {
		// Clean up temp file on failure (on success it's been renamed)
		if _, statErr := os.Stat(tmpPath); statErr == nil {
			os.Remove(tmpPath)
		}
	}()

	// 2. Verify checksum
	reportStatus("verifying", "")
	if err := verify(tmpPath, checksum); err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("checksum verification failed: %w", err)
	}
	log.Printf("[updater] Checksum verified")

	// 3. Replace binary
	reportStatus("replacing", "")
	if err := replaceBinary(tmpPath); err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("binary replacement failed: %w", err)
	}
	log.Printf("[updater] Binary replaced successfully")

	// 4. Drain in-flight bridge dispatches before restarting.
	// This prevents SIGKILL from cutting off long-running actions such as
	// onboarding-install-runtime (which can take up to 20 minutes).
	drainHookMu.RLock()
	hook := drainHook
	drainHookMu.RUnlock()
	if hook != nil {
		const drainGrace = 60 * time.Second
		reportStatus("draining", "")
		log.Printf("[updater] Draining in-flight bridge requests (grace=%s)...", drainGrace)
		if drained := hook(drainGrace); drained {
			log.Printf("[updater] In-flight requests drained cleanly")
		} else {
			log.Printf("[updater] Drain grace period elapsed — proceeding with restart anyway")
		}
	}

	// 5. Restart
	reportStatus("restarting", "")
	log.Printf("[updater] Restarting connector...")
	restart()

	// If restart() returns (exec fallback didn't work), the process continues
	// with the old code in memory but the new binary on disk.
	// Next natural restart will pick up the new version.
	return nil
}

// download fetches the binary to a temp file in the same directory as the current executable.
func download(url string) (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	exeDir := filepath.Dir(exePath)

	tmpFile, err := os.CreateTemp(exeDir, "connector-update-*")
	if err != nil {
		return "", err
	}
	tmpPath := tmpFile.Name()

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		tmpFile.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	n, err := io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		os.Remove(tmpPath)
		return "", err
	}

	log.Printf("[updater] Downloaded %d bytes to %s", n, tmpPath)
	return tmpPath, nil
}

// verify checks the SHA-256 checksum. Expected format: "sha256:hexstring"
func verify(path, expected string) error {
	expected = strings.TrimPrefix(expected, "sha256:")

	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}

	actual := hex.EncodeToString(h.Sum(nil))
	if actual != expected {
		return fmt.Errorf("checksum mismatch: got %s, want %s", actual, expected)
	}
	return nil
}

// replaceBinary swaps the running binary using the rename trick.
// On Windows, renaming a running exe is allowed (unlike deleting), so the same
// approach works — the backup file will be cleaned up on next restart.
// Backups are stored in bin/backups/ subdirectory.
func replaceBinary(newPath string) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	// Resolve symlinks to get the real path
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return err
	}

	exeDir := filepath.Dir(exePath)
	exeName := filepath.Base(exePath)

	// Create backups directory (sibling to the binary)
	backupsDir := filepath.Join(exeDir, "backups")
	os.MkdirAll(backupsDir, 0755)

	// Timestamped backup path
	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(backupsDir, fmt.Sprintf("%s.bak-%s", exeName, timestamp))

	// Remove stale backups (keep last 3)
	cleanOldBackups(backupsDir, exeName, 3)

	// Rename current → backup
	if err := os.Rename(exePath, backupPath); err != nil {
		return fmt.Errorf("rename current to backup: %w", err)
	}

	// Rename new → current
	if err := os.Rename(newPath, exePath); err != nil {
		// Rollback: restore old binary
		os.Rename(backupPath, exePath)
		return fmt.Errorf("rename new to current: %w", err)
	}

	// Make executable (no-op on Windows, but harmless)
	os.Chmod(exePath, 0755)

	return nil
}

// cleanOldBackups removes old backup files, keeping the most recent N.
func cleanOldBackups(backupsDir, baseName string, keepCount int) {
	entries, err := os.ReadDir(backupsDir)
	if err != nil {
		return
	}

	var backups []string
	prefix := baseName + ".bak-"
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix) {
			backups = append(backups, e.Name())
		}
	}

	// Sort in reverse order (newest first)
	for i := 0; i < len(backups)-1; i++ {
		for j := i + 1; j < len(backups); j++ {
			if backups[i] < backups[j] {
				backups[i], backups[j] = backups[j], backups[i]
			}
		}
	}

	// Remove old backups beyond keepCount
	for i := keepCount; i < len(backups); i++ {
		os.Remove(filepath.Join(backupsDir, backups[i]))
	}
}

// restart attempts to restart the connector process gracefully.
// On macOS it first tries a SIGTERM via launchctl stop (which lets KeepAlive
// relaunch the process cleanly). Only falls back to kickstart -k (SIGKILL) if
// the stop command fails or times out.
func restart() {
	switch runtime.GOOS {
	case "darwin":
		uid := fmt.Sprintf("%d", os.Getuid())
		label := "gui/" + uid + "/com.hypercho.hyperclaw.connector"

		// Prefer a graceful SIGTERM: launchctl stop sends SIGTERM and launchd
		// KeepAlive relaunches. This avoids killing the process mid-write.
		stopCmd := exec.Command("launchctl", "stop", "com.hypercho.hyperclaw.connector")
		if err := stopCmd.Run(); err == nil {
			log.Printf("[updater] launchctl stop sent; waiting up to 5s for launchd to relaunch")
			time.Sleep(5 * time.Second)
			// If we're still running here launchd hasn't relaunched us yet (or stop
			// silently failed). Fall through to kickstart as a safety net.
			log.Printf("[updater] still alive after stop — escalating to kickstart -k")
		} else {
			log.Printf("[updater] launchctl stop failed (%v) — trying kickstart -k", err)
		}

		// kickstart -k: kill the running instance and immediately relaunch.
		cmd := exec.Command("launchctl", "kickstart", "-k", label)
		if err := cmd.Run(); err == nil {
			time.Sleep(5 * time.Second) // wait for kill
			return
		}
		log.Printf("[updater] launchctl kickstart -k failed, trying exec fallback")

	case "linux":
		// Try systemd restart
		cmd := exec.Command("systemctl", "--user", "restart", "hyperclaw")
		if err := cmd.Run(); err == nil {
			time.Sleep(5 * time.Second)
			return
		}
		log.Printf("[updater] systemd restart failed, trying exec fallback")

	case "windows":
		// Stop and re-run the scheduled task
		exec.Command("schtasks", "/End", "/TN", "HyperClawConnector").Run()
		cmd := exec.Command("schtasks", "/Run", "/TN", "HyperClawConnector")
		if err := cmd.Run(); err == nil {
			time.Sleep(5 * time.Second)
			return
		}
		log.Printf("[updater] schtasks restart failed, trying exec fallback")
	}

	// Fallback: re-exec self (not supported on Windows, process will exit and
	// the scheduled task / service manager will relaunch it)
	if runtime.GOOS == "windows" {
		log.Printf("[updater] Exiting for service manager to restart")
		os.Exit(0)
		return
	}
	exePath, err := os.Executable()
	if err != nil {
		log.Printf("[updater] Cannot determine executable path: %v", err)
		return
	}
	syscall.Exec(exePath, os.Args, os.Environ())
}
