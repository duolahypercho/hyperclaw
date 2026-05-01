package gateway

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/config"
)

func TestNewWithShortPersistedDeviceIDDoesNotPanic(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	identityDir := filepath.Join(home, ".openclaw", "identity")
	if err := os.MkdirAll(identityDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(identityDir, "device.json"), []byte(`{"deviceId":"short"}`), 0600); err != nil {
		t.Fatal(err)
	}

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("New panicked for short deviceId: %v", r)
		}
	}()

	g := New(&config.Config{})
	if g.identity == nil || g.identity.DeviceID != "short" {
		t.Fatalf("identity = %#v, want short device id loaded", g.identity)
	}
}
