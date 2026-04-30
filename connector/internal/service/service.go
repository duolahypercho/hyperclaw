package service

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	binaryName   = "hyperclaw"
	launchdLabel = "com.hypercho.hyperclaw.connector"
	systemdUnit  = "hyperclaw"
)

// Install copies the binary to ~/.hyperclaw/bin/ and registers it as a system service.
func Install() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot find home directory: %w", err)
	}

	installDir := filepath.Join(home, ".hyperclaw")
	binDir := filepath.Join(installDir, "bin")
	binPath := filepath.Join(binDir, binaryName)

	// Create install directories
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return fmt.Errorf("cannot create directory %s: %w", binDir, err)
	}

	// Copy current binary to install location
	selfPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot find current executable: %w", err)
	}
	selfPath, _ = filepath.EvalSymlinks(selfPath)

	if selfPath != binPath {
		data, err := os.ReadFile(selfPath)
		if err != nil {
			return fmt.Errorf("cannot read executable: %w", err)
		}
		if err := os.WriteFile(binPath, data, 0755); err != nil {
			return fmt.Errorf("cannot write to %s: %w", binPath, err)
		}
		log.Printf("Installed binary to %s", binPath)
	} else {
		log.Printf("Binary already at %s", binPath)
	}

	switch runtime.GOOS {
	case "darwin":
		return installLaunchd(binPath, installDir)
	case "linux":
		return installSystemd(binPath, installDir)
	case "windows":
		return installWindows(binPath, installDir)
	default:
		log.Printf("Auto-start not supported on %s. Run manually: %s", runtime.GOOS, binPath)
		return nil
	}
}

// Uninstall stops the service and removes the binary. Data is kept by default;
// pass keepData=false (via --purge) to also remove ~/.hyperclaw/ and the database.
func Uninstall(keepData bool) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot find home directory: %w", err)
	}

	installDir := filepath.Join(home, ".hyperclaw")
	binDir := filepath.Join(installDir, "bin")

	switch runtime.GOOS {
	case "darwin":
		uninstallLaunchd()
	case "linux":
		uninstallSystemd()
	case "windows":
		uninstallWindows()
	}

	// Remove binary from new location
	binPath := filepath.Join(binDir, binaryName)
	os.Remove(binPath)
	log.Printf("Removed %s", binPath)

	// Also remove legacy location if it exists
	legacyBinPath := filepath.Join(installDir, binaryName)
	os.Remove(legacyBinPath)

	if !keepData {
		// Remove all data (credentials, tokens, config)
		entries, _ := os.ReadDir(installDir)
		for _, e := range entries {
			p := filepath.Join(installDir, e.Name())
			os.RemoveAll(p)
		}
		os.Remove(installDir)
		log.Printf("Removed %s", installDir)
	} else {
		log.Printf("Kept data directory %s", installDir)
	}

	log.Println("HyperClaw Connector uninstalled successfully.")
	return nil
}

// Status prints the current service status.
func Status() {
	switch runtime.GOOS {
	case "darwin":
		statusLaunchd()
	case "linux":
		statusSystemd()
	case "windows":
		statusWindows()
	default:
		fmt.Println("Service management not supported on", runtime.GOOS)
	}
}

// --- macOS (launchd) ---

func launchdPlistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", launchdLabel+".plist")
}

func installLaunchd(binPath, dataDir string) error {
	plistPath := launchdPlistPath()
	uid := strconv.Itoa(os.Getuid())
	domain := "gui/" + uid
	serviceTarget := domain + "/" + launchdLabel

	// Ensure LaunchAgents directory exists
	os.MkdirAll(filepath.Dir(plistPath), 0755)

	// Ensure logs directory exists
	logsDir := filepath.Join(dataDir, "logs")
	os.MkdirAll(logsDir, 0755)

	// Cleanup legacy connector plist that used the app label.
	// Only remove it when it points to the connector binary path.
	legacyPlist := filepath.Join(filepath.Dir(plistPath), "com.hypercho.hyperclaw.plist")
	if legacyBytes, err := os.ReadFile(legacyPlist); err == nil {
		legacyText := string(legacyBytes)
		if strings.Contains(legacyText, ".hyperclaw/bin/hyperclaw") {
			exec.Command("launchctl", "bootout", domain+"/com.hypercho.hyperclaw").Run()
			_ = os.Remove(legacyPlist)
		}
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>%s/logs/connector.log</string>
	<key>StandardErrorPath</key>
	<string>%s/logs/connector.log</string>
	<key>WorkingDirectory</key>
	<string>%s</string>
	<key>ThrottleInterval</key>
	<integer>5</integer>
	<key>EnvironmentVariables</key>
	<dict>
		<key>HYPERCLAW_SKIP_UPDATE</key>
		<string>1</string>
	</dict>
</dict>
</plist>
`, launchdLabel, binPath, dataDir, dataDir, dataDir)

	// Best-effort stop of any existing registration before reinstall.
	// Modern macOS prefers bootout/bootstrap over load/unload.
	if out, err := exec.Command("launchctl", "bootout", serviceTarget).CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg != "" &&
			!strings.Contains(strings.ToLower(msg), "could not find service") &&
			!strings.Contains(strings.ToLower(msg), "no such process") {
			log.Printf("launchctl bootout warning (continuing): %s", msg)
		}
	}
	// Also attempt legacy unload for older launchd semantics.
	if out, err := exec.Command("launchctl", "unload", plistPath).CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg != "" && !strings.Contains(strings.ToLower(msg), "could not find specified service") {
			log.Printf("launchctl unload warning (continuing): %s", msg)
		}
	}

	// launchctl unload does not always terminate the managed process (seen when
	// the plist was loaded under a different session or the daemon was slow to
	// react to SIGTERM). Force-kill any stale process still holding our managed
	// binary path so the new daemon reads the freshly-written credentials.
	killStaleConnectorProcesses(binPath)

	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("cannot write plist: %w", err)
	}
	log.Printf("Created launchd plist at %s", plistPath)

	// Register + start service using modern launchctl flow.
	if out, err := exec.Command("launchctl", "bootstrap", domain, plistPath).CombinedOutput(); err != nil {
		return fmt.Errorf("launchctl bootstrap failed: %s %w", strings.TrimSpace(string(out)), err)
	} else {
		msg := strings.TrimSpace(string(out))
		if strings.Contains(strings.ToLower(msg), "load failed") {
			return fmt.Errorf("launchctl bootstrap reported failure: %s", msg)
		}
	}
	if out, err := exec.Command("launchctl", "kickstart", "-k", serviceTarget).CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		return fmt.Errorf("launchctl kickstart failed: %s %w", msg, err)
	}
	// Verify service exists in launchd after bootstrap.
	if out, err := exec.Command("launchctl", "print", serviceTarget).CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		return fmt.Errorf("launchd service did not register: %s %w", msg, err)
	}

	log.Println("Service started. It will auto-start on login.")
	log.Printf("Logs: %s/logs/connector.log", dataDir)
	return nil
}

func uninstallLaunchd() {
	plistPath := launchdPlistPath()
	uid := strconv.Itoa(os.Getuid())
	domain := "gui/" + uid
	serviceTarget := domain + "/" + launchdLabel
	exec.Command("launchctl", "bootout", serviceTarget).Run()
	exec.Command("launchctl", "unload", plistPath).Run() // legacy fallback
	os.Remove(plistPath)
	log.Printf("Removed launchd service")
}

func statusLaunchd() {
	uid := strconv.Itoa(os.Getuid())
	serviceTarget := "gui/" + uid + "/" + launchdLabel
	out, err := exec.Command("launchctl", "print", serviceTarget).CombinedOutput()
	if err != nil {
		fmt.Println("Service is not running")
		return
	}
	fmt.Println(string(out))
}

// --- Linux (systemd) ---

func systemdUnitPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "systemd", "user", systemdUnit+".service")
}

func installSystemd(binPath, dataDir string) error {
	unitPath := systemdUnitPath()

	os.MkdirAll(filepath.Dir(unitPath), 0755)

	// Ensure logs directory exists (for consistency, even though systemd uses journald)
	logsDir := filepath.Join(dataDir, "logs")
	os.MkdirAll(logsDir, 0755)

	unit := fmt.Sprintf(`[Unit]
Description=HyperClaw Connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%s
WorkingDirectory=%s
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`, binPath, dataDir)

	// Stop any currently-running unit before overwriting the unit file. Also
	// force-kill any stale process still holding the binary path — systemd
	// will occasionally leave an orphan running when the unit was started
	// outside systemctl (e.g. manual exec during development).
	exec.Command("systemctl", "--user", "stop", systemdUnit).Run()
	killStaleConnectorProcesses(binPath)

	if err := os.WriteFile(unitPath, []byte(unit), 0644); err != nil {
		return fmt.Errorf("cannot write systemd unit: %w", err)
	}
	log.Printf("Created systemd unit at %s", unitPath)

	// Reload and enable
	cmds := [][]string{
		{"systemctl", "--user", "daemon-reload"},
		{"systemctl", "--user", "enable", systemdUnit},
		{"systemctl", "--user", "start", systemdUnit},
	}
	for _, args := range cmds {
		if out, err := exec.Command(args[0], args[1:]...).CombinedOutput(); err != nil {
			outStr := strings.TrimSpace(string(out))
			log.Printf("Warning: %s: %s %v", strings.Join(args, " "), outStr, err)
		}
	}

	// Enable lingering so user services run without login
	if user := os.Getenv("USER"); user != "" {
		exec.Command("loginctl", "enable-linger", user).Run()
	}

	log.Println("Service started and enabled. It will auto-start on boot.")
	log.Printf("Logs: journalctl --user -u %s -f", systemdUnit)
	return nil
}

func uninstallSystemd() {
	cmds := [][]string{
		{"systemctl", "--user", "stop", systemdUnit},
		{"systemctl", "--user", "disable", systemdUnit},
	}
	for _, args := range cmds {
		exec.Command(args[0], args[1:]...).Run()
	}

	unitPath := systemdUnitPath()
	os.Remove(unitPath)
	exec.Command("systemctl", "--user", "daemon-reload").Run()
	log.Printf("Removed systemd service")
}

func statusSystemd() {
	out, err := exec.Command("systemctl", "--user", "status", systemdUnit).CombinedOutput()
	if err != nil && len(out) == 0 {
		fmt.Println("Service is not running")
		return
	}
	fmt.Println(string(out))
}

// --- Windows (Task Scheduler) ---
// Uses schtasks to create a scheduled task that runs at logon and restarts on failure.
// This avoids requiring administrator privileges (unlike sc.exe / Windows Services).

const windowsTaskName = "HyperClawConnector"

func installWindows(binPath, dataDir string) error {
	// Remove existing task if present
	exec.Command("schtasks", "/Delete", "/TN", windowsTaskName, "/F").Run()

	// Ensure logs directory exists
	logsDir := filepath.Join(dataDir, "logs")
	os.MkdirAll(logsDir, 0755)

	// Create a task that runs at logon. schtasks /Create with /SC ONLOGON
	// starts the connector when the user logs in.
	out, err := exec.Command("schtasks", "/Create",
		"/TN", windowsTaskName,
		"/TR", fmt.Sprintf(`"%s"`, binPath),
		"/SC", "ONLOGON",
		"/RL", "LIMITED",
		"/F",
	).CombinedOutput()
	if err != nil {
		return fmt.Errorf("schtasks create failed: %s %w", string(out), err)
	}
	log.Printf("Created Windows scheduled task: %s", windowsTaskName)

	// Start it now
	if out, err := exec.Command("schtasks", "/Run", "/TN", windowsTaskName).CombinedOutput(); err != nil {
		log.Printf("Warning: could not start task now: %s %v", string(out), err)
	}

	log.Println("Service started. It will auto-start on login.")
	log.Printf("Logs: %s\\logs\\connector.log", dataDir)
	return nil
}

func uninstallWindows() {
	out, err := exec.Command("schtasks", "/Delete", "/TN", windowsTaskName, "/F").CombinedOutput()
	if err != nil {
		log.Printf("Warning: schtasks delete: %s %v", string(out), err)
	}
	log.Printf("Removed Windows scheduled task")
}

func statusWindows() {
	out, err := exec.Command("schtasks", "/Query", "/TN", windowsTaskName, "/V", "/FO", "LIST").CombinedOutput()
	if err != nil {
		fmt.Println("Service is not registered")
		return
	}
	fmt.Println(string(out))
}

// --- shared helpers ---

// killStaleConnectorProcesses finds any running connector process that matches
// the managed binary path (or the legacy install location) and terminates it.
// Callers must invoke this before re-loading the service so the new daemon
// starts clean and re-reads credentials on disk.
//
// On Windows this is a no-op because installWindows uses schtasks which
// already handles /Delete + /Create correctly.
func killStaleConnectorProcesses(binPath string) {
	if runtime.GOOS == "windows" {
		return
	}

	self := os.Getpid()

	// Build candidate binary paths we want to match against.
	patterns := []string{binPath}
	if home, err := os.UserHomeDir(); err == nil {
		// Legacy pre-bin/ layout: ~/.hyperclaw/hyperclaw
		legacy := filepath.Join(home, ".hyperclaw", binaryName)
		if legacy != binPath {
			patterns = append(patterns, legacy)
		}
	}

	alivePids := func() []int {
		seen := map[int]bool{}
		var pids []int
		for _, p := range patterns {
			out, err := exec.Command("pgrep", "-f", p).Output()
			if err != nil {
				// pgrep exits non-zero when no match — that is not an error.
				continue
			}
			for _, s := range strings.Fields(string(out)) {
				pid, err := strconv.Atoi(s)
				if err != nil || pid == self || seen[pid] {
					continue
				}
				seen[pid] = true
				pids = append(pids, pid)
			}
		}
		return pids
	}

	pids := alivePids()
	if len(pids) == 0 {
		return
	}

	for _, pid := range pids {
		log.Printf("Stopping stale connector process pid=%d", pid)
		if proc, err := os.FindProcess(pid); err == nil {
			_ = proc.Signal(syscall.SIGTERM)
		}
	}

	// Wait up to 3s for graceful exit.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if len(alivePids()) == 0 {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}

	for _, pid := range alivePids() {
		log.Printf("Force-killing stuck connector process pid=%d", pid)
		if proc, err := os.FindProcess(pid); err == nil {
			_ = proc.Signal(syscall.SIGKILL)
		}
	}
}
