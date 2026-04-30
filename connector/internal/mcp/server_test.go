package mcp

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/bridge"
)

// TestMCP_ToolsList verifies the curated catalog round-trips through the
// MCP server. Failure here means either the bridge.PublicTools() bridge is
// not wired, or mcp-go's Streamable HTTP transport is misconfigured.
func TestMCP_ToolsList(t *testing.T) {
	bh := bridge.NewBridgeHandler()
	srv := NewServer(bh)
	mux := http.NewServeMux()
	srv.Mount(mux, "/mcp")

	ts := httptest.NewServer(mux)
	defer ts.Close()

	resp := postJSONRPC(t, ts.URL+"/mcp", map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
	})
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("tools/list status=%d body=%s", resp.StatusCode, string(body))
	}

	body := decodeJSONRPC(t, resp.Body)
	result, ok := body["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("missing result: %+v", body)
	}
	tools, ok := result["tools"].([]interface{})
	if !ok || len(tools) == 0 {
		t.Fatalf("no tools registered: %+v", result)
	}

	// Sanity: at least one curated tool with the hyperclaw.* prefix.
	found := false
	for _, raw := range tools {
		t, _ := raw.(map[string]interface{})
		name, _ := t["name"].(string)
		if strings.HasPrefix(name, "hyperclaw.") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected at least one hyperclaw.* tool, got: %+v", tools)
	}
}

// TestMCP_DestructiveRequiresConfirm confirms the MCP layer rejects
// destructive calls without confirmed:true. The bridge dispatcher also
// enforces this; the duplicate is intentional defense in depth so the
// reject path stays cheap and visible at the boundary.
func TestMCP_DestructiveRequiresConfirm(t *testing.T) {
	bh := bridge.NewBridgeHandler()
	srv := NewServer(bh)
	mux := http.NewServeMux()
	srv.Mount(mux, "/mcp")
	ts := httptest.NewServer(mux)
	defer ts.Close()

	resp := postJSONRPC(t, ts.URL+"/mcp", map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/call",
		"params": map[string]interface{}{
			"name":      "hyperclaw.agents.delete",
			"arguments": map[string]interface{}{"agentId": "nope"},
		},
	})
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("unexpected http status=%d body=%s", resp.StatusCode, string(body))
	}
	body := decodeJSONRPC(t, resp.Body)
	result, ok := body["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("missing result: %+v", body)
	}
	if isErr, _ := result["isError"].(bool); !isErr {
		t.Fatalf("expected isError:true, got: %+v", result)
	}
	contentArr, _ := result["content"].([]interface{})
	if len(contentArr) == 0 {
		t.Fatalf("expected content with rejection, got: %+v", result)
	}
	first, _ := contentArr[0].(map[string]interface{})
	text, _ := first["text"].(string)
	if !strings.Contains(strings.ToLower(text), "destructive") && !strings.Contains(strings.ToLower(text), "confirm") {
		t.Fatalf("expected destructive/confirm wording, got: %q", text)
	}
}

// TestMCP_ShorthandCall verifies the /mcp/call endpoint Hermes uses. It
// must dispatch through the same hyperclaw-tool-call action as the MCP
// path, including destructive confirmation and unknown-tool rejection.
func TestMCP_ShorthandCall(t *testing.T) {
	bh := bridge.NewBridgeHandler()
	srv := NewServer(bh)
	mux := http.NewServeMux()
	srv.Mount(mux, "/mcp")
	ts := httptest.NewServer(mux)
	defer ts.Close()

	// Unknown tool: bridge's hyperclawToolCall returns success:false.
	resp := postJSON(t, ts.URL+"/mcp/call", map[string]interface{}{
		"name":      "hyperclaw.does.not.exist",
		"arguments": map[string]interface{}{},
	})
	defer resp.Body.Close()
	body := decodeJSON(t, resp.Body)
	if success, _ := body["success"].(bool); success {
		t.Fatalf("expected success:false for unknown tool, got: %+v", body)
	}

	// Destructive without confirmed must be rejected.
	resp2 := postJSON(t, ts.URL+"/mcp/call", map[string]interface{}{
		"name":      "hyperclaw.agents.delete",
		"arguments": map[string]interface{}{"agentId": "x"},
	})
	defer resp2.Body.Close()
	body2 := decodeJSON(t, resp2.Body)
	if success, _ := body2["success"].(bool); success {
		t.Fatalf("expected destructive rejection, got: %+v", body2)
	}
}

func postJSON(t *testing.T, url string, payload map[string]interface{}) *http.Response {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	return resp
}

func decodeJSON(t *testing.T, body io.Reader) map[string]interface{} {
	t.Helper()
	raw, err := io.ReadAll(body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode body=%q err=%v", string(raw), err)
	}
	return out
}

func postJSONRPC(t *testing.T, url string, payload map[string]interface{}) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	return resp
}

func decodeJSONRPC(t *testing.T, body io.Reader) map[string]interface{} {
	t.Helper()
	raw, err := io.ReadAll(body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	// Streamable HTTP can return either a JSON envelope or an SSE stream
	// depending on negotiation. For unary requests with json Accept we
	// expect a single JSON envelope; SSE returns a `data:` prefixed line.
	text := strings.TrimSpace(string(raw))
	if strings.HasPrefix(text, "data:") {
		// Take the first SSE event payload.
		for _, line := range strings.Split(text, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "data:") {
				text = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				break
			}
		}
	}
	var out map[string]interface{}
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("decode body=%q err=%v", text, err)
	}
	return out
}
