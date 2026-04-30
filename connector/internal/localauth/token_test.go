package localauth

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreate_GeneratesAndPersists(t *testing.T) {
	dir := t.TempDir()
	m := New(dir)

	first, err := m.LoadOrCreate()
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}
	if first == "" {
		t.Fatal("expected non-empty token")
	}

	// Re-load should return the same token (stable across restarts is the
	// whole point of file persistence — tests must catch any regression
	// that re-rolls the secret on every load).
	m2 := New(dir)
	second, err := m2.LoadOrCreate()
	if err != nil {
		t.Fatalf("LoadOrCreate (second): %v", err)
	}
	if second != first {
		t.Fatalf("token changed across loads: %q -> %q", first, second)
	}

	info, err := os.Stat(filepath.Join(dir, tokenFileName))
	if err != nil {
		t.Fatalf("stat token: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("token file mode = %o, want 0600", perm)
	}
}

func TestVerify(t *testing.T) {
	dir := t.TempDir()
	m := New(dir)
	tok, _ := m.LoadOrCreate()

	cases := []struct {
		name   string
		header string
		want   error
	}{
		{"valid bearer", "Bearer " + tok, nil},
		{"valid bare", tok, nil},
		{"empty", "", ErrMissingToken},
		{"wrong", "Bearer not-the-token", ErrInvalidToken},
		{"bearer empty", "Bearer ", ErrMissingToken},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := m.Verify(tc.header)
			if !errors.Is(err, tc.want) {
				t.Fatalf("Verify(%q) = %v, want %v", tc.header, err, tc.want)
			}
		})
	}
}

func TestRotate(t *testing.T) {
	dir := t.TempDir()
	m := New(dir)
	first, _ := m.LoadOrCreate()
	second, err := m.Rotate()
	if err != nil {
		t.Fatalf("Rotate: %v", err)
	}
	if second == first {
		t.Fatal("Rotate produced same token")
	}
	if err := m.Verify("Bearer " + first); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("old token should be invalid after Rotate, got: %v", err)
	}
	if err := m.Verify("Bearer " + second); err != nil {
		t.Fatalf("new token should verify: %v", err)
	}
}
