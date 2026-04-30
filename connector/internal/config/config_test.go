package config

import (
	"path/filepath"
	"testing"
)

func TestHasUsableGatewayURLRejectsPortZero(t *testing.T) {
	t.Parallel()

	if hasUsableGatewayURL("ws://127.0.0.1:0/gateway") {
		t.Fatal("expected port 0 gateway URL to be rejected")
	}
	if !hasUsableGatewayURL("ws://127.0.0.1:18789/gateway") {
		t.Fatal("expected normal gateway URL to be accepted")
	}
}

func TestRefreshGatewayConfigRepairsPortZeroURLFromKnownPort(t *testing.T) {
	t.Parallel()

	cfg := &Config{
		DataDir:     t.TempDir(),
		GatewayHost: "127.0.0.1",
		GatewayURL:  "ws://127.0.0.1:0/gateway",
		GatewayPort: 18789,
	}

	if ok := cfg.RefreshGatewayConfig(); !ok {
		t.Fatal("expected refresh to succeed")
	}
	if got := cfg.GatewayURL; got != "ws://127.0.0.1:18789/gateway" {
		t.Fatalf("unexpected gateway URL: %s", got)
	}
}

func TestGatewayNeedsSetupTreatsPortZeroURLAsUnconfigured(t *testing.T) {
	t.Parallel()

	cfg := &Config{
		DataDir:     t.TempDir(),
		GatewayHost: "127.0.0.1",
		GatewayURL:  "ws://127.0.0.1:0/gateway",
	}

	if !cfg.GatewayNeedsSetup() {
		t.Fatal("expected :0 gateway URL to require setup")
	}
}

func TestSaveGatewayConfigPersistsRecoveredURL(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	cfg := &Config{
		DataDir:      dir,
		GatewayURL:   "ws://127.0.0.1:18789/gateway",
		GatewayToken: "secret-token",
		GatewayHost:  "127.0.0.1",
		GatewayPort:  18789,
	}

	if err := cfg.SaveGatewayConfig(); err != nil {
		t.Fatalf("SaveGatewayConfig failed: %v", err)
	}

	loaded := &Config{DataDir: dir}
	loadGatewayConfig(loaded)
	if loaded.GatewayURL != cfg.GatewayURL {
		t.Fatalf("loaded gateway URL = %q, want %q", loaded.GatewayURL, cfg.GatewayURL)
	}
	if loaded.GatewayToken != cfg.GatewayToken {
		t.Fatalf("loaded gateway token = %q, want %q", loaded.GatewayToken, cfg.GatewayToken)
	}

	expected := filepath.Join(dir, "config", "gateway.json")
	if !hasUsableGatewayURL(loaded.GatewayURL) {
		t.Fatalf("expected usable gateway URL from %s", expected)
	}
}
