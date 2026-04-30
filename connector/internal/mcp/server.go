// Package mcp exposes Hyperclaw's curated tool catalog as a Model Context
// Protocol server. It mounts on the connector's existing local HTTP listener
// (see cmd/main.go startLocalBridge) so any agent runtime that speaks MCP —
// Claude Code, Codex, OpenClaw, future Hermes — can drive Hyperclaw without
// going through the dashboard.
//
// The server is a thin shim. All validation, permission gating, destructive
// confirmation, and per-tool orchestration already live in
// (BridgeHandler).hyperclawToolCall. Each MCP tool handler converts inbound
// arguments to the {toolName, arguments, confirmed} envelope and dispatches.
// Adding a new agent-facing capability happens in internal/bridge by
// appending to hyperclawBuiltinTools — the MCP server picks it up on next
// connector restart.
package mcp

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/bridge"
	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// Server wraps an mcp-go MCPServer + Streamable HTTP transport. The bridge
// handler is held by reference so the registered tools always reflect the
// current connector state (store, intel store, runtime worker, sync engine).
type Server struct {
	bh   *bridge.BridgeHandler
	mcp  *mcpserver.MCPServer
	http *mcpserver.StreamableHTTPServer
}

// NewServer constructs an MCP server bound to the given bridge handler.
// Callers should Mount it on the local HTTP mux. The connector lifetime
// owns this server — there's no Close() because shutdown happens via the
// http.Server that owns the mux.
func NewServer(bh *bridge.BridgeHandler) *Server {
	srv := mcpserver.NewMCPServer(
		"hyperclaw",
		ConnectorMCPVersion,
		mcpserver.WithToolCapabilities(true),
		mcpserver.WithLogging(),
	)
	registerTools(srv, bh)
	httpSrv := mcpserver.NewStreamableHTTPServer(
		srv,
		mcpserver.WithStateLess(true),
	)
	return &Server{bh: bh, mcp: srv, http: httpSrv}
}

// Mount registers the MCP endpoint under the given path on mux. The path
// should be "/mcp" by convention. Streamable HTTP handles GET, POST, and
// DELETE methods on the same path; mcp-go's ServeHTTP dispatches by method.
//
// In addition to the canonical MCP endpoint, Mount also registers a
// "<path>/call" shorthand that accepts a flat JSON body of the form
// {"name": "<tool>", "arguments": {...}, "confirmed": true}. This exists
// for runtimes that don't speak MCP (Hermes today). They get the same
// curated catalog and the same dispatch semantics — just over a plain
// POST instead of JSON-RPC.
func (s *Server) Mount(mux *http.ServeMux, path string) {
	mux.Handle(path, s.http)
	mux.HandleFunc(strings.TrimRight(path, "/")+"/call", s.handleShorthand)
}

// Handler returns the underlying ServeHTTP handler. Useful when callers want
// to wrap with their own middleware (e.g. bearer auth) before mounting.
func (s *Server) Handler() http.Handler {
	return s.http
}

// shutdown is provided as a courtesy for tests; the production lifetime is
// managed by the http.Server hosting the mux.
func (s *Server) shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}

// handleShorthand accepts plain POST {name, arguments, confirmed} and routes
// through the same bridge dispatcher MCP tool calls use. Hermes and any
// other non-MCP runtime can drive Hyperclaw through this endpoint with
// nothing more than curl. Errors come back as {"success": false, "error":...}
// at HTTP 200 to match the bridge's existing error shape (HTTP-as-transport,
// not HTTP-as-error-channel).
func (s *Server) handleShorthand(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false, "error": "POST only",
		})
		return
	}
	var payload struct {
		Name              string                 `json:"name"`
		Arguments         map[string]interface{} `json:"arguments"`
		Confirmed         bool                   `json:"confirmed"`
		RequestingAgentID string                 `json:"requestingAgentId"`
		CompanyID         string                 `json:"companyId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false, "error": "invalid JSON: " + err.Error(),
		})
		return
	}
	if strings.TrimSpace(payload.Name) == "" {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false, "error": "name is required",
		})
		return
	}
	if payload.Arguments == nil {
		payload.Arguments = map[string]interface{}{}
	}
	envelope := map[string]interface{}{
		"toolName":  payload.Name,
		"arguments": payload.Arguments,
		"confirmed": payload.Confirmed,
	}
	if payload.RequestingAgentID != "" {
		envelope["requestingAgentId"] = payload.RequestingAgentID
	}
	if payload.CompanyID != "" {
		envelope["companyId"] = payload.CompanyID
	}

	// Mirror the MCP-tool-handler bookkeeping: record the call as an
	// action and emit a hub broadcast on success so the dashboard's
	// activity stream and per-agent panels reflect calls regardless of
	// whether they came from MCP or the Hermes-style shorthand.
	log.Printf("[mcp/call] tool=%s agent=%q confirmed=%v", payload.Name, payload.RequestingAgentID, payload.Confirmed)
	actionID := s.bh.RecordActionStart("mcp:"+payload.Name, payload.RequestingAgentID)
	start := time.Now()

	result := s.bh.Dispatch("hyperclaw-tool-call", envelope)
	duration := time.Since(start).Milliseconds()
	isErr := false
	errMsg := ""
	if m, ok := result.(map[string]interface{}); ok {
		if success, ok := m["success"].(bool); ok && !success {
			isErr = true
			errMsg, _ = m["error"].(string)
		}
	}
	if isErr {
		log.Printf("[mcp/call] tool=%s ERROR (%dms): %s", payload.Name, duration, errMsg)
		s.bh.RecordActionComplete(actionID, "error", result, errMsg, duration)
	} else {
		log.Printf("[mcp/call] tool=%s OK (%dms)", payload.Name, duration)
		s.bh.RecordActionComplete(actionID, "completed", result, "", duration)
		s.bh.BroadcastEvent("hyperclaw.mcp.activity", map[string]interface{}{
			"tool":     payload.Name,
			"agentId":  payload.RequestingAgentID,
			"duration": duration,
			"source":   "shorthand",
		})
		if payload.Name == "hyperclaw.agents.create" || payload.Name == "hyperclaw.agents.delete" {
			s.bh.BroadcastEvent("agents.changed", map[string]interface{}{"source": "mcp"})
		}
	}
	_ = json.NewEncoder(w).Encode(result)
}

// Tool argument unmarshalling helper used by every registered handler.
// mcp-go gives us a CallToolRequest whose Params.Arguments is already a
// map[string]interface{} for typical JSON-RPC payloads. Defensive copy so
// downstream mutations don't surprise the caller.
func toolArgs(req mcp.CallToolRequest) map[string]interface{} {
	src, _ := req.Params.Arguments.(map[string]interface{})
	if src == nil {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}
