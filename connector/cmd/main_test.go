package main

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestLocalBridgeRejectsUntrustedOrigins(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("HYPERCLAW_AUTH_STRICT", "0")

	port := freeLocalPort(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- startLocalBridge(ctx, port, nil, nil, nil, nil, nil, nil, nil)
	}()
	waitForLocalBridge(t, port)
	defer func() {
		cancel()
		select {
		case err := <-errCh:
			if err != nil {
				t.Fatalf("local bridge exited with error: %v", err)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("local bridge did not stop")
		}
	}()

	client := &http.Client{Timeout: 2 * time.Second}

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/bridge", port), bytes.NewBufferString(`{"action":"connector-health"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("untrusted /bridge origin status = %d, want %d", resp.StatusCode, http.StatusForbidden)
	}

	req, err = http.NewRequest(http.MethodOptions, fmt.Sprintf("http://127.0.0.1:%d/mcp", port), nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://evil.example")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("untrusted /mcp preflight status = %d, want %d", resp.StatusCode, http.StatusForbidden)
	}

	req, err = http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/bridge", port), bytes.NewBufferString(`{"action":"connector-health"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "http://localhost:1000")
	req.Header.Set("Content-Type", "application/json")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		t.Fatalf("allowed /bridge origin was forbidden")
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:1000" {
		t.Fatalf("allowed /bridge origin header = %q, want %q", got, "http://localhost:1000")
	}

	req, err = http.NewRequest(http.MethodOptions, fmt.Sprintf("http://127.0.0.1:%d/mcp", port), nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "http://127.0.0.1:1000")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("allowed /mcp preflight status = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:1000" {
		t.Fatalf("allowed /mcp origin header = %q, want %q", got, "http://127.0.0.1:1000")
	}
}

func freeLocalPort(t *testing.T) int {
	t.Helper()

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()

	addr, ok := l.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener addr is %T, want *net.TCPAddr", l.Addr())
	}
	return addr.Port
}

func waitForLocalBridge(t *testing.T, port int) {
	t.Helper()

	client := &http.Client{Timeout: 100 * time.Millisecond}
	deadline := time.Now().Add(3 * time.Second)
	url := fmt.Sprintf("http://127.0.0.1:%d/bridge/health", port)
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("local bridge did not become ready at %s", url)
}
