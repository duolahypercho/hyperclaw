package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHermesProfileCredentialErrorForMissingProviderKey(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("MINIMAX_API_KEY", "")

	profileDir := filepath.Join(home, ".hermes", "profiles", "scout")
	if err := os.MkdirAll(profileDir, 0700); err != nil {
		t.Fatalf("mkdir profile: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, "config.yaml"), []byte(`model:
  default: MiniMax-M2.7
  provider: minimax
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, ".env"), []byte("API_SERVER_KEY=hc_test\nMINIMAX_API_KEY=None\n"), 0600); err != nil {
		t.Fatalf("write env: %v", err)
	}

	msg := hermesProfileCredentialError("scout")
	if !strings.Contains(msg, "MINIMAX_API_KEY") {
		t.Fatalf("expected missing MINIMAX_API_KEY message, got %q", msg)
	}
	if !strings.Contains(msg, "~/.hermes/profiles/scout/.env") {
		t.Fatalf("expected profile env path in message, got %q", msg)
	}
}

func TestHermesProfileCredentialErrorAcceptsProviderKeyFromEnvFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("MINIMAX_API_KEY", "")

	profileDir := filepath.Join(home, ".hermes", "profiles", "scout")
	if err := os.MkdirAll(profileDir, 0700); err != nil {
		t.Fatalf("mkdir profile: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, "config.yaml"), []byte(`model:
  default: MiniMax-M2.7
  provider: minimax
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, ".env"), []byte("MINIMAX_API_KEY=test-key\n"), 0600); err != nil {
		t.Fatalf("write env: %v", err)
	}

	if msg := hermesProfileCredentialError("scout"); msg != "" {
		t.Fatalf("expected no credential error, got %q", msg)
	}
}

func TestHermesProfileCredentialErrorAcceptsProviderKeyFromProcessEnv(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("MINIMAX_API_KEY", "test-key")

	profileDir := filepath.Join(home, ".hermes", "profiles", "scout")
	if err := os.MkdirAll(profileDir, 0700); err != nil {
		t.Fatalf("mkdir profile: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, "config.yaml"), []byte(`model:
  default: MiniMax-M2.7
  provider: minimax
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, ".env"), []byte("API_SERVER_KEY=hc_test\n"), 0600); err != nil {
		t.Fatalf("write env: %v", err)
	}

	if msg := hermesProfileCredentialError("scout"); msg != "" {
		t.Fatalf("expected no credential error, got %q", msg)
	}
}

func TestHermesProfileCredentialErrorUsesMainHermesHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("MINIMAX_API_KEY", "")

	hermesDir := filepath.Join(home, ".hermes")
	if err := os.MkdirAll(hermesDir, 0700); err != nil {
		t.Fatalf("mkdir hermes home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(hermesDir, "config.yaml"), []byte(`model:
  default: MiniMax-M2.7
  provider: minimax
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(hermesDir, ".env"), []byte("API_SERVER_KEY=hc_test\n"), 0600); err != nil {
		t.Fatalf("write env: %v", err)
	}

	msg := hermesProfileCredentialError("main")
	if !strings.Contains(msg, `Hermes profile "main"`) {
		t.Fatalf("expected main profile in message, got %q", msg)
	}
	if !strings.Contains(msg, "~/.hermes/.env") {
		t.Fatalf("expected main env path in message, got %q", msg)
	}
}
