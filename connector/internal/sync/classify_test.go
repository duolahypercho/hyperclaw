package sync_test

import (
	"path/filepath"
	"runtime"
	"testing"

	synce "github.com/hypercho/hyperclaw-connector/internal/sync"
)

func TestClassifyFilePath(t *testing.T) {
	home := "/home/user"
	if runtime.GOOS == "windows" {
		home = `C:\Users\user`
	}
	roots := synce.WatchRoots(home)

	cases := []struct {
		path    string
		wantKey string
		wantID  string
		wantOK  bool
	}{
		{
			path:    filepath.Join(home, ".openclaw", "workspace-ceo", "SOUL.md"),
			wantKey: "SOUL", wantID: "ceo", wantOK: true,
		},
		{
			path:    filepath.Join(home, ".openclaw", "workspace-ceo", "IDENTITY.md"),
			wantKey: "IDENTITY", wantID: "ceo", wantOK: true,
		},
		{
			path:    filepath.Join(home, ".hyperclaw", "agents", "ceo", "SOUL.md"),
			wantKey: "SOUL", wantID: "ceo", wantOK: true,
		},
		{
			path:   filepath.Join(home, ".openclaw", "openclaw.json"),
			wantOK: false, // not a personality file
		},
	}

	for _, tc := range cases {
		fc, ok := synce.ClassifyPath(tc.path, roots)
		if ok != tc.wantOK {
			t.Errorf("path %q: ok=%v, want %v", tc.path, ok, tc.wantOK)
			continue
		}
		if !ok {
			continue
		}
		if fc.FileKey != tc.wantKey {
			t.Errorf("path %q: fileKey=%q, want %q", tc.path, fc.FileKey, tc.wantKey)
		}
		if fc.AgentID != tc.wantID {
			t.Errorf("path %q: agentID=%q, want %q", tc.path, fc.AgentID, tc.wantID)
		}
	}
}
