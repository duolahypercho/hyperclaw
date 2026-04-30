// Package plugin handles automatic installation of the HyperClaw OpenClaw plugin.
// Plugin source files are embedded in the binary and extracted to ~/.hyperclaw/plugins/
// on first run, then registered with OpenClaw via `openclaw plugins install`.
package plugin

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

//go:embed embed/index.ts embed/bridge.ts embed/package.json embed/openclaw.plugin.json
var pluginFiles embed.FS

// Setup extracts the embedded plugin files and installs them into OpenClaw.
// It is idempotent — skips if the plugin is already installed and up to date.
func Setup(hyperclawDir string) error {
	pluginDir := filepath.Join(hyperclawDir, "plugins")

	// Check if plugin is already extracted and has node_modules
	markerFile := filepath.Join(pluginDir, ".installed")
	if _, err := os.Stat(markerFile); err == nil {
		// Refresh embedded source on every connector upgrade so new tools are
		// available even when the previous install marker is still present.
		if err := extractPlugin(pluginDir); err != nil {
			return fmt.Errorf("refresh plugin files: %w", err)
		}
		if _, err := os.Stat(filepath.Join(pluginDir, "node_modules")); os.IsNotExist(err) {
			if err := npmInstall(pluginDir); err != nil {
				return fmt.Errorf("npm install: %w", err)
			}
		}
		// Re-register after refresh so OpenClaw's installed extension copy picks
		// up newly embedded tools; the command is idempotent and timeout-bounded.
		return registerPlugin(pluginDir)
	}

	log.Println("Setting up HyperClaw OpenClaw plugin...")

	// Extract plugin files
	if err := extractPlugin(pluginDir); err != nil {
		return fmt.Errorf("extract plugin: %w", err)
	}

	// Run npm install for dependencies (better-sqlite3)
	if err := npmInstall(pluginDir); err != nil {
		return fmt.Errorf("npm install: %w", err)
	}

	// Register with OpenClaw
	if err := registerPlugin(pluginDir); err != nil {
		return fmt.Errorf("register plugin: %w", err)
	}

	// Write marker file
	os.WriteFile(markerFile, []byte("installed"), 0644)

	log.Println("OpenClaw plugin installed successfully")
	return nil
}

// extractPlugin writes embedded files to the plugin directory.
func extractPlugin(pluginDir string) error {
	if err := os.MkdirAll(pluginDir, 0755); err != nil {
		return err
	}

	files := []string{"index.ts", "bridge.ts", "package.json", "openclaw.plugin.json"}
	for _, name := range files {
		data, err := pluginFiles.ReadFile("embed/" + name)
		if err != nil {
			return fmt.Errorf("read embedded %s: %w", name, err)
		}
		dst := filepath.Join(pluginDir, name)
		if err := os.WriteFile(dst, data, 0644); err != nil {
			return fmt.Errorf("write %s: %w", dst, err)
		}
	}

	log.Printf("Extracted plugin to %s", pluginDir)
	return nil
}

// pluginEnv builds an environment with an enriched PATH so npm shebangs
// (`#!/usr/bin/env node`) and openclaw CLI spawns can find their interpreters
// when the connector runs under launchd/systemd with a minimal inherited PATH.
func pluginEnv() []string {
	home, _ := os.UserHomeDir()
	base := os.Getenv("PATH")
	extra := []string{
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "bin"),
		filepath.Join(home, ".npm-global", "bin"),
		filepath.Join(home, "Library", "pnpm"),
		filepath.Join(home, ".local", "share", "pnpm"),
		"/usr/local/bin",
		"/opt/homebrew/bin",
	}
	pathValue := strings.Join(append(extra, base), string(os.PathListSeparator))
	env := os.Environ()
	filtered := make([]string, 0, len(env)+1)
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			continue
		}
		filtered = append(filtered, e)
	}
	filtered = append(filtered, "PATH="+pathValue)
	return filtered
}

// npmInstall runs `npm install` in the plugin directory.
func npmInstall(pluginDir string) error {
	npmBin := findNPM()
	if npmBin == "" {
		return fmt.Errorf("npm not found — Node.js is required for the OpenClaw plugin")
	}

	log.Printf("Running npm install in %s...", pluginDir)
	cmd := exec.Command(npmBin, "install", "--production")
	cmd.Dir = pluginDir
	cmd.Env = pluginEnv()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// registerPlugin runs `openclaw plugins install <path>`.
func registerPlugin(pluginDir string) error {
	openclawBin := findOpenClaw()
	if openclawBin == "" {
		log.Println("OpenClaw CLI not found — plugin extracted but not registered.")
		log.Printf("Run manually: openclaw plugins install %s", pluginDir)
		return nil // not fatal — user can register later
	}

	log.Println("Registering plugin with OpenClaw...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, openclawBin, "plugins", "install", pluginDir)
	cmd.Env = pluginEnv()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		// Try alternative: directly add to config
		log.Printf("Plugin registration via CLI failed: %v", err)
		log.Printf("Plugin files are at: %s", pluginDir)
		log.Println("You can register manually: openclaw plugins install " + pluginDir)
		return ensurePluginEnabledInConfig()
	}
	if err := ensurePluginEnabledInConfig(); err != nil {
		log.Printf("Plugin registration succeeded, but enabling config failed: %v", err)
	}

	// Restart gateway to load the new plugin
	restartCtx, restartCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer restartCancel()
	restartCmd := exec.CommandContext(restartCtx, openclawBin, "gateway", "restart")
	restartCmd.Env = pluginEnv()
	restartCmd.Stdout = os.Stdout
	restartCmd.Stderr = os.Stderr
	if err := restartCmd.Run(); err != nil {
		log.Printf("Gateway restart failed (may need manual restart): %v", err)
	}

	return nil
}

// isPluginRegistered checks if the hyperclaw plugin is already loaded in OpenClaw.
func isPluginRegistered() bool {
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".openclaw", "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return false
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return strings.Contains(string(data), `"hyperclaw"`)
	}
	plugins, ok := configMap(cfg, "plugins")
	if !ok {
		return false
	}
	entries, ok := configMap(plugins, "entries")
	if !ok {
		return false
	}
	entry, ok := configMap(entries, "hyperclaw")
	if !ok {
		return false
	}
	enabled, ok := entry["enabled"].(bool)
	return !ok || enabled
}

func ensurePluginEnabledInConfig() error {
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".openclaw", "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil
	}
	plugins := ensureConfigMap(cfg, "plugins")
	entries := ensureConfigMap(plugins, "entries")
	hyperclaw := ensureConfigMap(entries, "hyperclaw")
	hyperclaw["enabled"] = true
	updated, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	updated = append(updated, '\n')
	return os.WriteFile(configPath, updated, 0644)
}

func configMap(parent map[string]interface{}, key string) (map[string]interface{}, bool) {
	if parent == nil {
		return nil, false
	}
	value, ok := parent[key].(map[string]interface{})
	return value, ok
}

func ensureConfigMap(parent map[string]interface{}, key string) map[string]interface{} {
	if value, ok := parent[key].(map[string]interface{}); ok {
		return value
	}
	value := map[string]interface{}{}
	parent[key] = value
	return value
}

// findNPM locates the npm binary.
func findNPM() string {
	if p, err := exec.LookPath("npm"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "Library/pnpm/npm"),
		filepath.Join(home, ".local/share/pnpm/npm"),
		filepath.Join(home, ".nvm/current/bin/npm"),
		"/opt/homebrew/bin/npm",
		"/usr/local/bin/npm",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// findOpenClaw locates the openclaw binary.
func findOpenClaw() string {
	if p, err := exec.LookPath("openclaw"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "Library/pnpm/openclaw"),
		filepath.Join(home, ".local/share/pnpm/openclaw"),
		filepath.Join(home, ".local/bin/openclaw"),
		"/opt/homebrew/bin/openclaw",
		"/usr/local/bin/openclaw",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}
