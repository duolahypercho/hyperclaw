package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/bridge"
	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// ConnectorMCPVersion identifies this build to MCP clients. Bump when the
// exposed catalog changes shape in a way clients should notice.
const ConnectorMCPVersion = "1.0.0"

// registerTools walks bridge.PublicTools() and binds each curated entry as
// an MCP tool whose handler dispatches through the bridge's existing
// hyperclaw-tool-call action. The dispatcher already enforces tool-name
// allowlisting, schema validation, destructive confirmation, and per-tool
// orchestration (e.g. agent creation also runs ensureAgenticStackForCreatedAgent).
// Keeping the MCP layer thin avoids drift between dashboard and MCP behaviour.
func registerTools(srv *mcpserver.MCPServer, bh *bridge.BridgeHandler) {
	for _, t := range bridge.PublicTools() {
		tool := buildTool(t)
		handler := makeToolHandler(t, bh)
		srv.AddTool(tool, handler)
	}
}

// buildTool converts a bridge.ToolMeta into an mcp.Tool. The catalog already
// carries a JSON-Schema-shaped InputSchema; we forward it via raw schema so
// mcp-go doesn't re-derive it from struct tags.
func buildTool(t bridge.ToolMeta) mcp.Tool {
	desc := t.Description
	if t.IsDestructive {
		desc += " (destructive — pass `confirmed: true` to authorize)"
	}
	schema, err := json.Marshal(t.InputSchema)
	if err != nil {
		// Fall back to an empty object schema rather than crashing the
		// server. The bridge's argument validator will still reject
		// malformed payloads at dispatch time.
		schema = []byte(`{"type":"object"}`)
	}
	return mcp.NewToolWithRawSchema(t.Name, desc, schema)
}

// makeToolHandler wraps the bridge dispatcher so MCP receives a structured
// JSON result. Errors come back as IsError tool results so MCP clients see
// them in the standard tool-error path instead of a transport-level failure.
//
// Each call is also persisted via the bridge's action recorder so dashboard
// surfaces (activity stream, per-agent timelines) display MCP-driven calls
// alongside dashboard-driven ones — same store, same shape, same UI.
func makeToolHandler(t bridge.ToolMeta, bh *bridge.BridgeHandler) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := toolArgs(req)

		// Translate MCP's `confirmed` argument into the bridge's expected
		// envelope. We accept both top-level `confirmed` and a nested
		// arguments.confirmed because different MCP clients flatten args
		// differently.
		confirmed := boolField(args, "confirmed") || boolField(args, "confirm")
		delete(args, "confirmed")
		delete(args, "confirm")

		// Surface destructive intent at the handler boundary, even though
		// the dispatcher also checks. Belt and suspenders here keeps the
		// surprise-budget low if the dispatcher's policy changes later.
		if t.IsDestructive && !confirmed {
			return mcp.NewToolResultError(fmt.Sprintf(
				"%s is destructive; re-call with confirmed:true to authorize.",
				t.Name,
			)), nil
		}

		envelope := map[string]interface{}{
			"toolName":  t.Name,
			"arguments": args,
			"confirmed": confirmed,
		}
		// Pass through requestingAgentId / companyId if the MCP client
		// supplies them at the top level — useful for multi-agent setups
		// where the dispatcher attributes the call.
		var agentID string
		for _, k := range []string{"requestingAgentId", "companyId"} {
			if v, ok := args[k]; ok {
				envelope[k] = v
				if k == "requestingAgentId" {
					agentID, _ = v.(string)
				}
			}
		}

		// Record this MCP call as an action so the dashboard activity
		// stream shows MCP-driven calls alongside dashboard-driven ones.
		// Action type prefix "mcp:" marks origin so a dashboard filter
		// can surface "what did the agent do via MCP" if useful.
		log.Printf("[mcp] tool=%s agent=%q confirmed=%v", t.Name, agentID, confirmed)
		actionID := bh.RecordActionStart("mcp:"+t.Name, agentID)
		start := time.Now()

		result := bh.Dispatch("hyperclaw-tool-call", envelope)
		body, err := json.Marshal(result)
		if err != nil {
			bh.RecordActionComplete(actionID, "error", nil, err.Error(), time.Since(start).Milliseconds())
			return mcp.NewToolResultErrorFromErr("failed to marshal hyperclaw response", err), nil
		}

		// Per-call status determines whether the action row is "completed"
		// or "error", and whether we broadcast a refresh hint to the
		// dashboard. Only on success do we publish — failed calls don't
		// need to invalidate dashboard caches.
		isErr := false
		errMsg := ""
		if m, ok := result.(map[string]interface{}); ok {
			if success, ok := m["success"].(bool); ok && !success {
				isErr = true
				errMsg, _ = m["error"].(string)
			}
		}
		duration := time.Since(start).Milliseconds()
		if isErr {
			log.Printf("[mcp] tool=%s ERROR (%dms): %s", t.Name, duration, errMsg)
			bh.RecordActionComplete(actionID, "error", result, errMsg, duration)
			if errMsg == "" {
				errMsg = string(body)
			}
			return mcp.NewToolResultError(errMsg), nil
		}
		log.Printf("[mcp] tool=%s OK (%dms)", t.Name, duration)
		bh.RecordActionComplete(actionID, "completed", result, "", duration)

		// Live-update broadcast: tell the dashboard which tool fired so
		// it can invalidate the right query. The frontend already
		// subscribes to gateway events; "hyperclaw.mcp.activity" is the
		// new channel it filters for. Best-effort — if the hub channel
		// is full we just drop, since the action row is the durable
		// record and a missed event only delays UI by one polling tick.
		bh.BroadcastEvent("hyperclaw.mcp.activity", map[string]interface{}{
			"tool":     t.Name,
			"agentId":  agentID,
			"duration": duration,
		})
		// Trigger the existing agents-changed refresh path when the call
		// touched agent identity. Other tool families have their own
		// dashboard subscriptions; we only need to signal the surface
		// most likely to be open.
		if t.Name == "hyperclaw.agents.create" || t.Name == "hyperclaw.agents.delete" {
			bh.BroadcastEvent("agents.changed", map[string]interface{}{"source": "mcp"})
		}
		return mcp.NewToolResultText(string(body)), nil
	}
}

func boolField(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case bool:
			return t
		case string:
			return t == "true" || t == "yes" || t == "1"
		}
	}
	return false
}
