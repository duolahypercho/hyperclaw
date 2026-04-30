package plugin

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// StatusFunc reports update progress back to the caller.
type StatusFunc func(status, errMsg string)

// Update downloads a new plugin tarball and installs it.
// payload fields: version (string), url (string)
func Update(hyperclawDir string, payload map[string]interface{}, reportStatus StatusFunc) error {
	version, _ := payload["version"].(string)
	downloadURL, _ := payload["url"].(string)

	if downloadURL == "" {
		return fmt.Errorf("no download URL in update-plugin payload")
	}

	pluginDir := filepath.Join(hyperclawDir, "plugins")

	// Check installed version — skip if already up to date
	if version != "" {
		installed := readInstalledVersion(pluginDir)
		if installed == version {
			log.Printf("[plugin-update] Already at v%s, skipping", version)
			reportStatus("skipped", "")
			return nil
		}
	}

	log.Printf("[plugin-update] Updating plugin to v%s from %s", version, downloadURL)

	// 1. Download tarball
	reportStatus("downloading", "")
	tmpPath, err := downloadTarball(downloadURL)
	if err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("download failed: %w", err)
	}
	defer os.Remove(tmpPath)

	// 2. Extract to a temp dir first, then swap
	reportStatus("extracting", "")
	tmpDir, err := os.MkdirTemp("", "hyperclaw-plugin-*")
	if err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	if err := extractTarGz(tmpPath, tmpDir); err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("extract tarball: %w", err)
	}

	// 3. Copy extracted files to plugin dir (overwrite)
	reportStatus("installing", "")
	if err := os.MkdirAll(pluginDir, 0755); err != nil {
		reportStatus("failed", err.Error())
		return fmt.Errorf("create plugin dir: %w", err)
	}

	pluginFiles := []string{"index.ts", "bridge.ts", "package.json", "openclaw.plugin.json"}
	for _, name := range pluginFiles {
		src := findFile(tmpDir, name)
		if src == "" {
			continue // optional file
		}
		data, err := os.ReadFile(src)
		if err != nil {
			reportStatus("failed", err.Error())
			return fmt.Errorf("read %s: %w", name, err)
		}
		dst := filepath.Join(pluginDir, name)
		if err := os.WriteFile(dst, data, 0644); err != nil {
			reportStatus("failed", err.Error())
			return fmt.Errorf("write %s: %w", name, err)
		}
	}

	// 4. npm install for dependencies
	npmBin := findNPM()
	if npmBin != "" {
		log.Printf("[plugin-update] Running npm install...")
		if err := npmInstall(pluginDir); err != nil {
			log.Printf("[plugin-update] npm install failed (non-fatal): %v", err)
		}
	}

	// 5. Re-register with OpenClaw
	if err := registerPlugin(pluginDir); err != nil {
		log.Printf("[plugin-update] Registration failed (non-fatal): %v", err)
	}

	// 6. Update marker
	os.WriteFile(filepath.Join(pluginDir, ".installed"), []byte("installed"), 0644)

	reportStatus("completed", "")
	log.Printf("[plugin-update] Plugin updated to v%s", version)
	return nil
}

// readInstalledVersion reads the version from the installed plugin's package.json.
func readInstalledVersion(pluginDir string) string {
	data, err := os.ReadFile(filepath.Join(pluginDir, "package.json"))
	if err != nil {
		return ""
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(data, &pkg) != nil {
		return ""
	}
	return pkg.Version
}

// downloadTarball fetches the tarball to a temp file.
func downloadTarball(url string) (string, error) {
	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", "hyperclaw-plugin-*.tgz")
	if err != nil {
		return "", err
	}

	n, err := io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		os.Remove(tmpFile.Name())
		return "", err
	}

	log.Printf("[plugin-update] Downloaded %d bytes", n)
	return tmpFile.Name(), nil
}

// extractTarGz extracts a .tar.gz to the destination directory.
func extractTarGz(tgzPath, destDir string) error {
	f, err := os.Open(tgzPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar: %w", err)
		}

		// Security: skip absolute paths and path traversal
		name := hdr.Name
		if filepath.IsAbs(name) || strings.Contains(name, "..") {
			continue
		}

		target := filepath.Join(destDir, name)

		switch hdr.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(target, 0755)
		case tar.TypeReg:
			os.MkdirAll(filepath.Dir(target), 0755)
			out, err := os.Create(target)
			if err != nil {
				return err
			}
			// Limit file size to 10MB to prevent decompression bombs
			if _, err := io.Copy(out, io.LimitReader(tr, 10<<20)); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
	return nil
}

// findFile searches for a filename in dir and its immediate subdirectories.
// Tarballs sometimes have a top-level directory wrapper (e.g., package/).
func findFile(dir, name string) string {
	// Direct match
	direct := filepath.Join(dir, name)
	if _, err := os.Stat(direct); err == nil {
		return direct
	}

	// One level deep
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.IsDir() {
			nested := filepath.Join(dir, e.Name(), name)
			if _, err := os.Stat(nested); err == nil {
				return nested
			}
		}
	}
	return ""
}
