package updater

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestApplyRequiresChecksumBeforeDownload(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "should not download without checksum", http.StatusInternalServerError)
	}))
	defer server.Close()

	err := Apply(map[string]interface{}{
		"version": "0.0.1",
		"url":     server.URL + "/connector",
	}, func(status, errMsg string) {})

	if err == nil {
		t.Fatal("Apply succeeded without checksum")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "checksum") {
		t.Fatalf("Apply error = %q, want checksum requirement", err.Error())
	}
	if hits.Load() != 0 {
		t.Fatalf("download endpoint hit %d times without checksum, want 0", hits.Load())
	}
}
