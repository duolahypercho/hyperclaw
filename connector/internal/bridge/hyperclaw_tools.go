package bridge

import (
	"fmt"
	"log"
	"sort"
	"strings"
)

type hyperclawToolPermission string

const (
	hyperclawToolPermissionRead        hyperclawToolPermission = "read"
	hyperclawToolPermissionWrite       hyperclawToolPermission = "write"
	hyperclawToolPermissionDestructive hyperclawToolPermission = "destructive"
)

type hyperclawToolDefinition struct {
	Name        string                  `json:"name"`
	Description string                  `json:"description"`
	Permission  hyperclawToolPermission `json:"permission"`
	Action      string                  `json:"-"`
	InputSchema map[string]interface{}  `json:"inputSchema"`
}

var hyperclawBuiltinTools = map[string]hyperclawToolDefinition{
	"hyperclaw.agents.list": {
		Name:        "hyperclaw.agents.list",
		Description: "List Hyperclaw agents across runtimes with identity, runtime, role, and status metadata.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "list-agent-identities",
		InputSchema: hyperclawToolSchema(nil, nil),
	},
	"hyperclaw.agents.get": {
		Name:        "hyperclaw.agents.get",
		Description: "Fetch one agent's public identity and runtime metadata.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "get-agent-identity",
		InputSchema: hyperclawToolSchema([]string{"agentId"}, map[string]string{"agentId": "string"}),
	},
	"hyperclaw.agents.create": {
		Name:        "hyperclaw.agents.create",
		Description: "Hire a new Hyperclaw agent end-to-end (same path the dashboard's \"Hire agent\" button uses): provisions the runtime, writes personality + USER docs, registers the agent, repairs invalid OpenClaw config when needed, and retries on transient mutation conflicts.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "onboarding-provision-agent",
		InputSchema: hyperclawToolSchema(
			[]string{"agentId", "runtime", "name", "description"},
			map[string]string{
				"agentId":            "string",
				"runtime":            "string",
				"name":               "string",
				"description":        "string",
				"role":               "string",
				"emoji":              "string",
				"avatarData":         "string",
				"avatarDataUri":      "string",
				"mainModel":          "string",
				"companyName":        "string",
				"companyDescription": "string",
				"userName":           "string",
				"userEmail":          "string",
				"userAboutMe":        "string",
			},
		),
	},
	"hyperclaw.agents.delete": {
		Name:        "hyperclaw.agents.delete",
		Description: "Delete an agent from Hyperclaw. Requires explicit confirmation.",
		Permission:  hyperclawToolPermissionDestructive,
		Action:      "delete-agent",
		InputSchema: hyperclawToolSchema([]string{"agentId"}, map[string]string{"agentId": "string"}),
	},
	"hyperclaw.agents.send": {
		Name:        "hyperclaw.agents.send",
		Description: "Send a message to another agent and receive its reply synchronously. The recipient's runtime is auto-detected — pass the agentId of any registered agent. Conversations between the same two agents carry HISTORY across calls: the connector keeps a per-pair session and resumes it on each message, so follow-ups read like a real thread. The response includes `sessionId` and `threadKey` for transparency; pass `sessionId` explicitly to force a different thread (e.g. fan-out). Session continuity is wired for OpenClaw and Claude Code today; Codex and Hermes start fresh each call (their resume APIs are not yet wired).",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "agent-send-message",
		InputSchema: hyperclawToolSchema(
			[]string{"toAgentId", "message"},
			map[string]string{
				"toAgentId":   "string",
				"message":     "string",
				"fromAgentId": "string",
				"sessionId":   "string",
			},
		),
	},
	"hyperclaw.knowledge.list": {
		Name:        "hyperclaw.knowledge.list",
		Description: "List knowledge collections and markdown documents for a company workspace.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "knowledge-list",
		InputSchema: hyperclawToolSchema(nil, map[string]string{"companyId": "string"}),
	},
	"hyperclaw.knowledge.read": {
		Name:        "hyperclaw.knowledge.read",
		Description: "Read one markdown document from the Hyperclaw knowledge base.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "knowledge-get-doc",
		InputSchema: hyperclawToolSchema([]string{"relativePath"}, map[string]string{"companyId": "string", "relativePath": "string"}),
	},
	"hyperclaw.knowledge.write": {
		Name:        "hyperclaw.knowledge.write",
		Description: "Create or update a markdown document in the Hyperclaw knowledge base.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "knowledge-write-doc",
		InputSchema: hyperclawToolSchema([]string{"relativePath", "content"}, map[string]string{"companyId": "string", "relativePath": "string", "content": "string"}),
	},
	"hyperclaw.knowledge.create_collection": {
		Name:        "hyperclaw.knowledge.create_collection",
		Description: "Create a new knowledge collection folder.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "knowledge-create-collection",
		InputSchema: hyperclawToolSchema([]string{"name"}, map[string]string{"companyId": "string", "name": "string"}),
	},
	"hyperclaw.projects.list": {
		Name:        "hyperclaw.projects.list",
		Description: "List Hyperclaw projects, optionally filtered by status.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "project-list",
		InputSchema: hyperclawToolSchema(nil, map[string]string{"status": "string"}),
	},
	"hyperclaw.projects.get": {
		Name:        "hyperclaw.projects.get",
		Description: "Fetch a project with its current members.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "project-get",
		InputSchema: hyperclawToolSchema([]string{"id"}, map[string]string{"id": "string"}),
	},
	"hyperclaw.projects.create": {
		Name:        "hyperclaw.projects.create",
		Description: "Create a project and optionally assign a lead agent.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "project-create",
		InputSchema: hyperclawToolSchema([]string{"name"}, map[string]string{"name": "string", "description": "string", "emoji": "string", "leadAgentId": "string"}),
	},
	"hyperclaw.projects.update": {
		Name:        "hyperclaw.projects.update",
		Description: "Update project status, details, lead agent, or default workflow.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "project-update",
		InputSchema: hyperclawToolSchema(
			[]string{"id"},
			map[string]string{
				"id":                        "string",
				"name":                      "string",
				"description":               "string",
				"emoji":                     "string",
				"status":                    "string",
				"leadAgentId":               "string",
				"teamModeEnabled":           "boolean",
				"defaultWorkflowTemplateId": "string",
			},
		),
	},
	"hyperclaw.projects.add_member": {
		Name:        "hyperclaw.projects.add_member",
		Description: "Add an agent to a project with a role.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "project-add-member",
		InputSchema: hyperclawToolSchema([]string{"projectId", "agentId"}, map[string]string{"projectId": "string", "agentId": "string", "role": "string"}),
	},
	"hyperclaw.projects.remove_member": {
		Name:        "hyperclaw.projects.remove_member",
		Description: "Remove an agent from a project. Requires explicit confirmation.",
		Permission:  hyperclawToolPermissionDestructive,
		Action:      "project-remove-member",
		InputSchema: hyperclawToolSchema([]string{"projectId", "agentId"}, map[string]string{"projectId": "string", "agentId": "string"}),
	},
	"hyperclaw.workflows.list_templates": {
		Name:        "hyperclaw.workflows.list_templates",
		Description: "List workflow templates, optionally scoped to a project.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "workflow-template-list",
		InputSchema: hyperclawToolSchema(nil, map[string]string{"projectId": "string"}),
	},
	"hyperclaw.workflows.get_template": {
		Name:        "hyperclaw.workflows.get_template",
		Description: "Fetch a workflow template and its steps.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "workflow-template-get",
		InputSchema: hyperclawToolSchema([]string{"id"}, map[string]string{"id": "string"}),
	},
	"hyperclaw.workflows.create_template": {
		Name:        "hyperclaw.workflows.create_template",
		Description: "Create a workflow template from structured step data.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "workflow-template-create",
		InputSchema: hyperclawToolSchema([]string{"projectId", "name"}, map[string]string{"projectId": "string", "name": "string", "description": "string", "triggerExamples": "array", "steps": "array", "createdBy": "string"}),
	},
	"hyperclaw.workflows.create_from_prompt": {
		Name:        "hyperclaw.workflows.create_from_prompt",
		Description: "Create a workflow template from a plain-language prompt.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "workflow-template-create-from-prompt",
		InputSchema: hyperclawToolSchema([]string{"projectId", "prompt"}, map[string]string{"projectId": "string", "name": "string", "prompt": "string", "createdBy": "string"}),
	},
	"hyperclaw.workflows.start_run": {
		Name:        "hyperclaw.workflows.start_run",
		Description: "Start a workflow run from a template.",
		Permission:  hyperclawToolPermissionWrite,
		Action:      "workflow-run-start",
		InputSchema: hyperclawToolSchema([]string{"templateId"}, map[string]string{"templateId": "string", "startedBy": "string", "inputPayload": "object"}),
	},
	"hyperclaw.workflows.list_runs": {
		Name:        "hyperclaw.workflows.list_runs",
		Description: "List workflow runs, optionally scoped to a project.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "workflow-run-list",
		InputSchema: hyperclawToolSchema(nil, map[string]string{"projectId": "string", "limit": "number"}),
	},
	"hyperclaw.workflows.get_run": {
		Name:        "hyperclaw.workflows.get_run",
		Description: "Fetch a workflow run with reports.",
		Permission:  hyperclawToolPermissionRead,
		Action:      "workflow-run-get",
		InputSchema: hyperclawToolSchema([]string{"id"}, map[string]string{"id": "string"}),
	},
	"hyperclaw.workflows.cancel_run": {
		Name:        "hyperclaw.workflows.cancel_run",
		Description: "Cancel an active workflow run. Requires explicit confirmation.",
		Permission:  hyperclawToolPermissionDestructive,
		Action:      "workflow-run-cancel",
		InputSchema: hyperclawToolSchema([]string{"id"}, map[string]string{"id": "string"}),
	},
}

// ToolMeta is the public projection of a curated Hyperclaw tool, exposed to
// callers outside the bridge package (e.g. the MCP server). The bridge stays
// the source of truth for what's safe to expose; ToolMeta only carries the
// fields needed to register an MCP tool. New fields here must come from
// hyperclawBuiltinTools — never invent capability outside this gate.
type ToolMeta struct {
	Name          string
	Description   string
	InputSchema   map[string]interface{}
	IsDestructive bool
}

// PublicTools returns the curated, agent-facing tool catalog as a
// platform-neutral slice. Used by the MCP server in internal/mcp to mirror
// the same surface that the dashboard's hyperclaw-tool-call dispatcher
// already exposes.
func PublicTools() []ToolMeta {
	defs := hyperclawToolDefinitions()
	out := make([]ToolMeta, 0, len(defs))
	for _, t := range defs {
		out = append(out, ToolMeta{
			Name:          t.Name,
			Description:   t.Description,
			InputSchema:   t.InputSchema,
			IsDestructive: t.Permission == hyperclawToolPermissionDestructive,
		})
	}
	return out
}

func hyperclawToolSchema(required []string, properties map[string]string) map[string]interface{} {
	props := map[string]interface{}{}
	for name, typ := range properties {
		props[name] = map[string]interface{}{"type": typ}
	}
	schema := map[string]interface{}{
		"type":       "object",
		"properties": props,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func hyperclawToolRegistry() map[string]hyperclawToolDefinition {
	out := make(map[string]hyperclawToolDefinition, len(hyperclawBuiltinTools))
	for name, tool := range hyperclawBuiltinTools {
		out[name] = tool
	}
	return out
}

func hyperclawToolDefinitions() []hyperclawToolDefinition {
	tools := make([]hyperclawToolDefinition, 0, len(hyperclawBuiltinTools))
	for _, tool := range hyperclawBuiltinTools {
		tools = append(tools, tool)
	}
	sort.Slice(tools, func(i, j int) bool {
		return tools[i].Name < tools[j].Name
	})
	return tools
}

func hyperclawToolsCatalogMarkdown() string {
	var b strings.Builder
	b.WriteString("## Hyperclaw tools (live MCP)\n\n")
	b.WriteString("This workspace is wired to the Hyperclaw connector's MCP server. The tools listed below are callable directly from your runtime — Claude Code, Codex, OpenClaw, or any MCP-speaking host. Do not write your own scripts to manage Hyperclaw; call these tools.\n\n")
	b.WriteString("**Use these tools whenever the user asks you to manage Hyperclaw — agents, knowledge bases, projects, workflows, todos, devices, approvals — instead of editing files or guessing.** The dashboard reads from the same store, so your calls show up live in the UI.\n\n")
	b.WriteString("Endpoint: `" + hyperclawMCPURL() + "` (Streamable HTTP). Your runtime's MCP config has already been generated to point at this URL — you don't need to configure it.\n\n")
	b.WriteString("Fallback for runtimes without MCP: POST JSON to `" + hyperclawMCPURL() + "/call` with `{\"name\":\"hyperclaw.projects.list\",\"arguments\":{}}`.\n\n")
	b.WriteString("Destructive tools require `confirmed: true` in the arguments. Never edit SOUL.md, personality files, or workshop content through tools — those stay as direct file edits.\n\n")
	b.WriteString("### Response contract\n\n")
	b.WriteString("Every tool returns the same envelope. Read `ok` first.\n\n")
	b.WriteString("**On success** — `{ ok: true, tool, humanSummary, result: { …domain fields… } }`. Treat `result` as the source of truth. Domain fields are also spread at the top level for legacy callers; prefer `result`.\n\n")
	b.WriteString("**On failure** — `{ ok: false, tool, humanSummary, failure: { kind, message, nextAction, details } }`.\n\n")
	b.WriteString("- `failure.kind` ∈ `unknown_tool` | `bad_arguments` | `confirmation_required` | `execution_error` | `internal_error`\n")
	b.WriteString("- `failure.nextAction` ∈ `retry` | `confirm_and_retry` | `fix_input_and_retry` | `give_up` | `escalate`\n\n")
	b.WriteString("**How to behave on failure** — surface `humanSummary` to the user verbatim, then take exactly the action named in `failure.nextAction`. Do not theorize about causes the response did not state. Do not invent infrastructure explanations (\"the hub is the master\", \"the gate didn't pass through\", etc.) — if the connector knew that, it would be in `humanSummary`. If `nextAction = retry` and you've already retried once, escalate; do not loop.\n\n")
	b.WriteString("### Catalog\n\n")
	for _, tool := range hyperclawToolDefinitions() {
		b.WriteString("- `")
		b.WriteString(tool.Name)
		b.WriteString("` (")
		b.WriteString(string(tool.Permission))
		b.WriteString("): ")
		b.WriteString(tool.Description)
		if req := hyperclawToolRequiredFields(tool); len(req) > 0 {
			b.WriteString(" Required: ")
			b.WriteString(strings.Join(req, ", "))
			b.WriteString(".")
		}
		b.WriteString("\n")
	}
	return b.String()
}

func hyperclawToolRequiredFields(tool hyperclawToolDefinition) []string {
	raw, ok := tool.InputSchema["required"]
	if !ok {
		return nil
	}
	fields, ok := raw.([]string)
	if !ok {
		return nil
	}
	return append([]string(nil), fields...)
}

func (b *BridgeHandler) hyperclawToolList(params map[string]interface{}) actionResult {
	return okResult(map[string]interface{}{
		"success": true,
		"tools":   hyperclawToolDefinitions(),
	})
}

// Failure kinds — closed enum. Callers pattern-match on these to decide
// what to do without parsing free-form error strings.
const (
	failureKindUnknownTool          = "unknown_tool"
	failureKindBadArguments         = "bad_arguments"
	failureKindConfirmationRequired = "confirmation_required"
	failureKindExecutionError       = "execution_error"
	failureKindInternalError        = "internal_error"
)

// Next-action hints — what the caller should do about this failure.
// These are CALLER-side actions, not infrastructure diagnostics. Agents
// must follow these mechanically; they should not theorize alternatives.
const (
	nextActionRetry            = "retry"               // transient — safe to retry as-is
	nextActionConfirmAndRetry  = "confirm_and_retry"   // re-call with confirmed: true
	nextActionFixInputAndRetry = "fix_input_and_retry" // arguments are wrong; fix and re-call
	nextActionGiveUp           = "give_up"             // won't succeed without out-of-band action
	nextActionEscalate         = "escalate"            // surface to a human operator
)

// hyperclawToolSuccess builds the canonical success envelope. The shape is
// stable — agents read top-level `ok` and the `result` block; the dashboard
// continues to read `success` and the spread domain fields.
func hyperclawToolSuccess(toolName string, payload map[string]interface{}) map[string]interface{} {
	payload = compactHyperclawToolPayload(toolName, payload)
	resp := map[string]interface{}{
		"ok":           true,
		"success":      true, // dashboard back-compat
		"tool":         toolName,
		"toolName":     toolName, // back-compat alias; older callers (dashboard, tests) read `toolName`.
		"humanSummary": fmt.Sprintf("%s succeeded.", toolName),
	}
	resultBlock := map[string]interface{}{}
	for key, value := range payload {
		if key == "success" {
			continue
		}
		// Spread domain fields at the top level for dashboard back-compat...
		resp[key] = value
		// ...AND collect them under `result` for agents that read structured.
		resultBlock[key] = value
	}
	resp["result"] = resultBlock
	return resp
}

func compactHyperclawToolPayload(toolName string, payload map[string]interface{}) map[string]interface{} {
	if toolName != "hyperclaw.agents.list" && toolName != "hyperclaw.agents.get" {
		return payload
	}
	out := cloneMap(payload)
	if data, ok := out["data"]; ok {
		out["data"] = compactAgentToolData(data)
	}
	return out
}

func compactAgentToolData(data interface{}) interface{} {
	switch v := data.(type) {
	case []map[string]interface{}:
		out := make([]map[string]interface{}, 0, len(v))
		for _, row := range v {
			out = append(out, compactAgentToolRow(row))
		}
		return out
	case []interface{}:
		out := make([]interface{}, 0, len(v))
		for _, row := range v {
			if m, ok := row.(map[string]interface{}); ok {
				out = append(out, compactAgentToolRow(m))
			} else {
				out = append(out, row)
			}
		}
		return out
	case map[string]interface{}:
		return compactAgentToolRow(v)
	default:
		return data
	}
}

func compactAgentToolRow(row map[string]interface{}) map[string]interface{} {
	out := cloneMap(row)
	delete(out, "config")
	raw, ok := out["avatarData"].(string)
	if !ok || raw == "" {
		return out
	}
	delete(out, "avatarData")
	out["avatar"] = map[string]interface{}{
		"present": true,
		"bytes":   len(raw),
		"kind":    avatarDataKind(raw),
	}
	return out
}

func avatarDataKind(raw string) string {
	if strings.HasPrefix(raw, "data:") {
		if semi := strings.Index(raw, ";"); semi > len("data:") {
			return raw[len("data:"):semi]
		}
		return "data-uri"
	}
	return "raw"
}

func cloneMap(in map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// hyperclawToolFailure builds the canonical failure envelope. Agents should
// read `humanSummary` (safe to surface verbatim to the user), `failure.kind`,
// and `failure.nextAction`. They MUST NOT speculate beyond what those fields
// say. The dashboard reads `success` and `error`.
func hyperclawToolFailure(toolName, kind, message, nextAction string, details map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{
		"ok":           false,
		"success":      false, // dashboard back-compat
		"tool":         toolName,
		"toolName":     toolName, // back-compat alias
		"error":        message,  // dashboard / legacy back-compat
		"humanSummary": message,
		"failure": map[string]interface{}{
			"kind":       kind,
			"message":    message,
			"nextAction": nextAction,
			"details":    details,
		},
	}
}

// classifyByStatus turns an action handler's HTTP status into a (kind,
// nextAction) pair. Status is the authoritative signal — handlers set it
// deliberately. Falls back to message-based inference for status=0 (handlers
// that didn't set one) and treats unknown 5xx as internal_error/escalate.
func classifyByStatus(status int, errMsg string) (string, string) {
	switch status {
	case 400, 422:
		return failureKindBadArguments, nextActionFixInputAndRetry
	case 403:
		return failureKindConfirmationRequired, nextActionConfirmAndRetry
	case 404, 409, 410:
		return failureKindExecutionError, nextActionGiveUp
	case 408, 429, 502, 503, 504:
		return failureKindExecutionError, nextActionRetry
	case 0:
		next := inferNextActionFromError(errMsg)
		if next == nextActionRetry {
			return failureKindInternalError, nextActionEscalate
		}
		return failureKindExecutionError, next
	default:
		if status >= 500 {
			return failureKindInternalError, nextActionEscalate
		}
		return failureKindExecutionError, inferNextActionFromError(errMsg)
	}
}

// inferNextActionFromError makes a best-effort guess at what the caller
// should do next based on common error-message patterns from underlying
// CLIs and stores. The default is `retry` for unknown patterns — it's the
// least harmful suggestion when we don't know better.
func inferNextActionFromError(msg string) string {
	low := strings.ToLower(msg)
	switch {
	case strings.Contains(low, "not found"),
		strings.Contains(low, "no longer exists"),
		strings.Contains(low, "does not exist"):
		return nextActionGiveUp
	case strings.Contains(low, "already exists"),
		strings.Contains(low, "duplicate"):
		return nextActionGiveUp
	case strings.Contains(low, "timeout"),
		strings.Contains(low, "timed out"),
		strings.Contains(low, "connection refused"),
		strings.Contains(low, "temporarily unavailable"):
		return nextActionRetry
	case strings.Contains(low, "permission denied"),
		strings.Contains(low, "unauthorized"),
		strings.Contains(low, "forbidden"):
		return nextActionEscalate
	case strings.Contains(low, "invalid"),
		strings.Contains(low, "required"),
		strings.Contains(low, "must be"):
		return nextActionFixInputAndRetry
	default:
		return nextActionRetry
	}
}

func (b *BridgeHandler) hyperclawToolCall(params map[string]interface{}) actionResult {
	toolName, _ := params["toolName"].(string)
	toolName = strings.TrimSpace(toolName)
	if toolName == "" {
		return okResult(hyperclawToolFailure("", failureKindBadArguments,
			"toolName is required", nextActionFixInputAndRetry, nil))
	}
	tool, ok := hyperclawBuiltinTools[toolName]
	if !ok {
		return okResult(hyperclawToolFailure(toolName, failureKindUnknownTool,
			fmt.Sprintf("unknown Hyperclaw tool: %s", toolName),
			nextActionFixInputAndRetry, nil))
	}
	args, err := hyperclawToolArguments(params["arguments"])
	if err != nil {
		return okResult(hyperclawToolFailure(toolName, failureKindBadArguments,
			err.Error(), nextActionFixInputAndRetry, nil))
	}
	if err := validateHyperclawToolArguments(tool, args); err != nil {
		return okResult(hyperclawToolFailure(toolName, failureKindBadArguments,
			err.Error(), nextActionFixInputAndRetry, nil))
	}
	if tool.Permission == hyperclawToolPermissionDestructive && !hyperclawToolConfirmed(params, args) {
		return okResult(hyperclawToolFailure(toolName, failureKindConfirmationRequired,
			fmt.Sprintf("%s is destructive. Re-call with `confirmed: true` to authorize.", toolName),
			nextActionConfirmAndRetry, nil))
	}

	// Forward caller-context fields into the inner args so action handlers
	// can use them (e.g. agent-send-message reads requestingAgentId to know
	// who's calling). Doing this here keeps action handlers from needing to
	// know about the outer envelope shape.
	for _, k := range []string{"requestingAgentId", "companyId"} {
		if v, ok := params[k]; ok {
			if _, exists := args[k]; !exists {
				args[k] = v
			}
		}
	}

	result := b.dispatchHyperclawTool(tool, args)
	if result.err != nil {
		// Bridge-layer error. The action handler's HTTP status is the
		// authoritative signal for what category of failure this is —
		// far more reliable than parsing the error string. Fall back to
		// pattern-matching only when status is 0 (handler didn't set one).
		errMsg := result.err.Error()
		kind, next := classifyByStatus(result.status, errMsg)
		return okResult(hyperclawToolFailure(toolName, kind, errMsg, next, nil))
	}
	wrapped, ok := result.data.(map[string]interface{})
	if !ok {
		wrapped = map[string]interface{}{"data": result.data}
	}
	if success, ok := wrapped["success"].(bool); ok && !success {
		errMsg, _ := wrapped["error"].(string)
		if errMsg == "" {
			errMsg = "tool reported failure without an explanation"
		}
		details := map[string]interface{}{}
		for key, value := range wrapped {
			if key == "success" || key == "error" {
				continue
			}
			details[key] = value
		}
		if len(details) == 0 {
			details = nil
		}
		return okResult(hyperclawToolFailure(toolName, failureKindExecutionError,
			errMsg, inferNextActionFromError(errMsg), details))
	}
	return okResult(hyperclawToolSuccess(tool.Name, wrapped))
}

func (b *BridgeHandler) dispatchHyperclawTool(tool hyperclawToolDefinition, args map[string]interface{}) actionResult {
	if tool.Name == "hyperclaw.agents.create" {
		return b.dispatchHireAgent(args)
	}
	return b.dispatch(tool.Action, args)
}

// dispatchHireAgent runs the full "Hire agent" pipeline that the dashboard's
// AddAgentDialog uses, plus the auto-repair + retry layer that
// provisionAgentWithConfigConflictRetry implements client-side. Putting that
// layer in the connector means MCP callers get the same robustness as the
// dashboard without having to re-implement it themselves.
//
// The flow:
//
//  1. normalize args (the MCP schema accepts a small surface; onboarding-provision
//     wants a richer payload — we fill defaults so name/description/runtime are enough).
//  2. dispatch onboarding-provision-agent
//  3. on "Config invalid + run openclaw doctor --fix" → run openclaw-doctor-fix once and retry
//  4. on "config mutation conflict" → retry with backoff up to 3 attempts
//  5. on success → run ensureAgenticStackForCreatedAgent so the workspace block
//     is installed (idempotent — same as the dashboard's fire-and-forget call).
func (b *BridgeHandler) dispatchHireAgent(args map[string]interface{}) actionResult {
	payload := normalizeHireAgentPayload(args)

	const maxAttempts = 3
	repairedInvalidConfig := false
	var lastResult actionResult

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result := b.dispatch("onboarding-provision-agent", payload)
		lastResult = result
		if result.err != nil {
			return result
		}
		data, _ := result.data.(map[string]interface{})
		if success, _ := data["success"].(bool); success {
			ensure := b.ensureAgenticStackForCreatedAgent(args)
			if ensure.err != nil {
				return ensure
			}
			if ensureData, ok := ensure.data.(map[string]interface{}); ok {
				if ok2, _ := ensureData["success"].(bool); !ok2 {
					agentID, _ := payload["agentId"].(string)
					return okResult(map[string]interface{}{
						"success":        false,
						"partialSuccess": true,
						"agentId":        agentID,
						"error":          fmt.Sprintf("agent was hired, but agentic-stack setup failed: %v", ensureData["error"]),
					})
				}
			}
			return result
		}

		errMsg := hireAgentErrorMessage(data)

		if !repairedInvalidConfig && isOpenClawRecoverableConfigInvalid(errMsg) {
			log.Printf("[hire-agent] openclaw config invalid; running openclaw-doctor-fix and retrying (attempt %d)", attempt)
			repair := b.dispatch("openclaw-doctor-fix", map[string]interface{}{})
			repairedInvalidConfig = true
			if repair.err != nil {
				return okResult(map[string]interface{}{
					"success": false,
					"error":   fmt.Sprintf("OpenClaw config repair failed while hiring agent: %v", repair.err),
				})
			}
			if repairData, ok := repair.data.(map[string]interface{}); ok {
				if ok2, _ := repairData["success"].(bool); !ok2 {
					return okResult(map[string]interface{}{
						"success": false,
						"error":   fmt.Sprintf("OpenClaw config repair could not finish: %v", repairData["error"]),
					})
				}
			}
			continue
		}

		if attempt < maxAttempts && isOpenClawConfigMutationConflict(errMsg) {
			log.Printf("[hire-agent] config mutation conflict on attempt %d/%d; retrying", attempt, maxAttempts)
			continue
		}

		return result
	}

	return lastResult
}

// normalizeHireAgentPayload fills in sensible defaults so MCP callers can hire
// an agent with just {agentId, runtime, name, description} while the dashboard
// can supply the richer payload. Everything not provided is treated as "leave
// it empty"; onboarding-provision-agent already tolerates blank optional fields.
func normalizeHireAgentPayload(args map[string]interface{}) map[string]interface{} {
	avatarDataURI := strFromArgs(args, "avatarDataUri")
	if avatarDataURI == "" {
		avatarDataURI = strFromArgs(args, "avatarData")
	}
	payload := map[string]interface{}{
		"agentId":            strFromArgs(args, "agentId"),
		"runtime":            strFromArgs(args, "runtime"),
		"name":               strFromArgs(args, "name"),
		"description":        strFromArgs(args, "description"),
		"role":               strFromArgs(args, "role"),
		"emoji":              strFromArgs(args, "emoji"),
		"emojiEnabled":       strFromArgs(args, "emoji") != "",
		"avatarDataUri":      avatarDataURI,
		"mainModel":          strFromArgs(args, "mainModel"),
		"companyName":        strFromArgs(args, "companyName"),
		"companyDescription": strFromArgs(args, "companyDescription"),
		"userName":           strFromArgs(args, "userName"),
		"userEmail":          strFromArgs(args, "userEmail"),
		"userAboutMe":        strFromArgs(args, "userAboutMe"),
	}
	// onboarding-provision-agent ignores unknown keys, but we forward channel
	// configs verbatim if the caller supplied them so OpenClaw/Hermes channel
	// binding still happens through the same code path.
	if v, ok := args["runtimeChannelConfigs"]; ok {
		payload["runtimeChannelConfigs"] = v
	}
	if v, ok := args["agentChannelConfigs"]; ok {
		payload["agentChannelConfigs"] = v
	}
	return payload
}

func strFromArgs(args map[string]interface{}, key string) string {
	v, _ := args[key].(string)
	return strings.TrimSpace(v)
}

func hireAgentErrorMessage(data map[string]interface{}) string {
	if data == nil {
		return ""
	}
	parts := []string{}
	for _, k := range []string{"error", "message", "stderr", "stdout", "detail"} {
		if s, ok := data[k].(string); ok && strings.TrimSpace(s) != "" {
			parts = append(parts, strings.TrimSpace(s))
		}
	}
	return strings.Join(parts, " ")
}

// isOpenClawRecoverableConfigInvalid mirrors the TS predicate of the same
// name in components/Tool/Agents/add-agent-provisioning.ts: the error tells us
// openclaw.json is invalid AND that running `openclaw doctor --fix` should
// repair it. Anything else (e.g. a hand-edited typo we can't safely auto-fix)
// is left to the caller.
func isOpenClawRecoverableConfigInvalid(msg string) bool {
	low := strings.ToLower(msg)
	return strings.Contains(low, "config invalid") &&
		strings.Contains(low, "unknown channel id") &&
		strings.Contains(low, "openclaw doctor --fix")
}

func isOpenClawConfigMutationConflict(msg string) bool {
	low := strings.ToLower(msg)
	return strings.Contains(low, "configmutationconflicterror") ||
		strings.Contains(low, "config changed since last load")
}

func (b *BridgeHandler) ensureAgenticStackForCreatedAgent(args map[string]interface{}) actionResult {
	agentID, _ := args["agentId"].(string)
	runtimeName, _ := args["runtime"].(string)
	if runtimeName == "" {
		runtimeName = "openclaw"
	}
	adapterName := runtimeName
	if _, ok := agenticStackBuiltinAdapters[adapterName]; !ok {
		return okResult(map[string]interface{}{"success": true, "skipped": true})
	}
	return b.agenticStackAdapterAdd(map[string]interface{}{
		"agentId": agentID,
		"runtime": runtimeName,
		"adapter": adapterName,
	})
}

func hyperclawToolArguments(raw interface{}) (map[string]interface{}, error) {
	if raw == nil {
		return map[string]interface{}{}, nil
	}
	args, ok := raw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("arguments must be an object")
	}
	return args, nil
}

func validateHyperclawToolArguments(tool hyperclawToolDefinition, args map[string]interface{}) error {
	for _, field := range hyperclawToolRequiredFields(tool) {
		value, ok := args[field]
		if !ok || value == nil {
			return fmt.Errorf("%s requires argument %q", tool.Name, field)
		}
		if s, ok := value.(string); ok && strings.TrimSpace(s) == "" {
			return fmt.Errorf("%s requires non-empty argument %q", tool.Name, field)
		}
	}
	props, _ := tool.InputSchema["properties"].(map[string]interface{})
	for name, rawSpec := range props {
		value, ok := args[name]
		if !ok || value == nil {
			continue
		}
		spec, _ := rawSpec.(map[string]interface{})
		typ, _ := spec["type"].(string)
		if typ == "" {
			continue
		}
		if !hyperclawToolValueMatchesType(value, typ) {
			return fmt.Errorf("%s argument %q must be %s", tool.Name, name, typ)
		}
	}
	return nil
}

func hyperclawToolValueMatchesType(value interface{}, typ string) bool {
	switch typ {
	case "string":
		_, ok := value.(string)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "number":
		switch value.(type) {
		case int, int64, float64:
			return true
		default:
			return false
		}
	case "array":
		switch value.(type) {
		case []interface{}, []string:
			return true
		default:
			return false
		}
	case "object":
		_, ok := value.(map[string]interface{})
		return ok
	default:
		return true
	}
}

func hyperclawToolConfirmed(params, args map[string]interface{}) bool {
	for _, key := range []string{"confirmed", "confirm", "confirmDestructive"} {
		if v, ok := params[key].(bool); ok && v {
			return true
		}
		if v, ok := args[key].(bool); ok && v {
			delete(args, key)
			return true
		}
	}
	return false
}
