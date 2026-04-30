package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func testHyperclawToolsBridge(t *testing.T) (*BridgeHandler, func()) {
	t.Helper()
	home := t.TempDir()
	paths := Paths{
		Home:      home,
		OpenClaw:  filepath.Join(home, ".openclaw"),
		HyperClaw: filepath.Join(home, ".hyperclaw"),
		Hermes:    filepath.Join(home, ".hermes"),
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatalf("ensure dirs: %v", err)
	}
	s, err := store.New(filepath.Join(home, "connector.db"))
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	b := &BridgeHandler{
		paths:      paths,
		store:      s,
		shutdownCh: make(chan struct{}),
	}
	return b, func() { _ = s.Close() }
}

func toolData(t *testing.T, result actionResult) map[string]interface{} {
	t.Helper()
	if result.err != nil {
		t.Fatalf("tool call returned error: %v", result.err)
	}
	data, ok := result.data.(map[string]interface{})
	if !ok {
		t.Fatalf("result data type = %T, want map", result.data)
	}
	if data["success"] != true {
		t.Fatalf("tool call failed: %+v", data)
	}
	return data
}

func TestHyperclawToolRegistryDefinesCuratedSurface(t *testing.T) {
	registry := hyperclawToolRegistry()
	for _, name := range []string{
		"hyperclaw.agents.list",
		"hyperclaw.agents.create",
		"hyperclaw.agents.delete",
		"hyperclaw.knowledge.write",
		"hyperclaw.projects.add_member",
		"hyperclaw.workflows.start_run",
	} {
		tool, ok := registry[name]
		if !ok {
			t.Fatalf("expected tool %s in registry", name)
		}
		if tool.Description == "" || len(tool.InputSchema) == 0 {
			t.Fatalf("tool %s should include a description and input schema: %+v", name, tool)
		}
		if tool.Action == "" {
			t.Fatalf("tool %s should map to a bridge action", name)
		}
	}
	if registry["hyperclaw.agents.delete"].Permission != hyperclawToolPermissionDestructive {
		t.Fatalf("agent delete should be destructive")
	}
}

func TestHyperclawToolCallRejectsUnknownAndUnconfirmedDestructive(t *testing.T) {
	b, cleanup := testHyperclawToolsBridge(t)
	defer cleanup()

	unknownRaw := b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.nope",
	})
	unknown, ok := unknownRaw.data.(map[string]interface{})
	if !ok {
		t.Fatalf("unknown tool result data type = %T", unknownRaw.data)
	}
	if okv, _ := unknown["ok"].(bool); okv {
		t.Fatalf("unknown tool should produce ok:false, got %+v", unknown)
	}
	failure, _ := unknown["failure"].(map[string]interface{})
	if failure == nil || failure["kind"] != "unknown_tool" || failure["nextAction"] != "fix_input_and_retry" {
		t.Fatalf("unknown tool failure envelope wrong: %+v", unknown)
	}

	destructiveRaw := b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.agents.delete",
		"arguments": map[string]interface{}{
			"agentId": "missing",
		},
	})
	destructive, ok := destructiveRaw.data.(map[string]interface{})
	if !ok {
		t.Fatalf("destructive result data type = %T", destructiveRaw.data)
	}
	if okv, _ := destructive["ok"].(bool); okv {
		t.Fatalf("unconfirmed destructive call should produce ok:false, got %+v", destructive)
	}
	dFailure, _ := destructive["failure"].(map[string]interface{})
	if dFailure == nil || dFailure["kind"] != "confirmation_required" || dFailure["nextAction"] != "confirm_and_retry" {
		t.Fatalf("unconfirmed destructive failure envelope wrong: %+v", destructive)
	}
	if humanSummary, _ := destructive["humanSummary"].(string); humanSummary == "" {
		t.Fatalf("expected non-empty humanSummary, got %+v", destructive)
	}
}

// Pin the success-envelope contract. Agents read `ok`, `humanSummary`, and
// `result`; the dashboard reads `success` and the spread domain fields. If
// any of those drop out, the integration breaks silently — which is exactly
// the failure mode this envelope was introduced to prevent.
func TestHyperclawToolCallSuccessEnvelopeShape(t *testing.T) {
	b, cleanup := testHyperclawToolsBridge(t)
	defer cleanup()

	raw := b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.agents.list",
	})
	resp, ok := raw.data.(map[string]interface{})
	if !ok {
		t.Fatalf("result data type = %T", raw.data)
	}

	// Agent-facing contract.
	if okv, _ := resp["ok"].(bool); !okv {
		t.Fatalf("expected ok:true, got %+v", resp)
	}
	if _, hasSummary := resp["humanSummary"].(string); !hasSummary {
		t.Fatalf("expected humanSummary on success, got %+v", resp)
	}
	if _, hasResult := resp["result"].(map[string]interface{}); !hasResult {
		t.Fatalf("expected structured `result` block, got %+v", resp)
	}

	// Dashboard back-compat.
	if successv, _ := resp["success"].(bool); !successv {
		t.Fatalf("expected success:true (back-compat), got %+v", resp)
	}
	if resp["toolName"] != "hyperclaw.agents.list" {
		t.Fatalf("expected toolName back-compat, got %+v", resp["toolName"])
	}

	// `failure` block must NOT appear on success (otherwise agents ambiguously
	// see both result and failure shapes).
	if _, leaked := resp["failure"]; leaked {
		t.Fatalf("success envelope should not include `failure`, got %+v", resp)
	}
}

func TestInferNextActionFromError(t *testing.T) {
	cases := map[string]string{
		"agent not found":                  nextActionGiveUp,
		"agent already exists":             nextActionGiveUp,
		"openclaw command timed out":       nextActionRetry,
		"connection refused":               nextActionRetry,
		"permission denied":                nextActionEscalate,
		"agentId is required":              nextActionFixInputAndRetry,
		"some unrecognized failure string": nextActionRetry,
	}
	for input, want := range cases {
		if got := inferNextActionFromError(input); got != want {
			t.Errorf("inferNextActionFromError(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestHyperclawToolCallCreatesAgentAndListsIdentity(t *testing.T) {
	b, cleanup := testHyperclawToolsBridge(t)
	defer cleanup()

	create := toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName":          "hyperclaw.agents.create",
		"requestingAgentId": "orchestrator",
		"arguments": map[string]interface{}{
			"agentId":     "planner",
			"runtime":     "codex",
			"name":        "Planner",
			"description": "Plans and breaks down work for the orchestrator team.",
			"emoji":       "🧭",
		},
	}))
	if create["toolName"] != "hyperclaw.agents.create" {
		t.Fatalf("expected toolName to round-trip, got %+v", create)
	}

	identity, err := b.store.GetAgentIdentity("planner")
	if err != nil {
		t.Fatalf("GetAgentIdentity: %v", err)
	}
	if identity == nil || identity.Name != "Planner" || identity.Runtime != "codex" {
		t.Fatalf("identity not persisted correctly: %+v", identity)
	}

	target := filepath.Join(b.paths.AgentDir("codex", "planner"), "AGENTS.md")
	raw, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("expected adapter-managed AGENTS.md at %s: %v", target, err)
	}
	if !containsAll(string(raw), []string{"Hyperclaw tools", "hyperclaw.agents.create"}) {
		t.Fatalf("AGENTS.md should include built-in tools catalog, got:\n%s", raw)
	}

	list := toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.agents.list",
	}))
	if list["toolName"] != "hyperclaw.agents.list" || list["data"] == nil {
		t.Fatalf("agent list should return wrapped data, got %+v", list)
	}
}

func TestHyperclawToolCallKnowledgeWriteAndRead(t *testing.T) {
	b, cleanup := testHyperclawToolsBridge(t)
	defer cleanup()

	toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.knowledge.create_collection",
		"arguments": map[string]interface{}{
			"companyId": "acme",
			"name":      "Research",
		},
	}))
	toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.knowledge.write",
		"arguments": map[string]interface{}{
			"companyId":    "acme",
			"relativePath": "research/market.md",
			"content":      "# Market\n\nAI agents for operators.",
		},
	}))
	read := toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.knowledge.read",
		"arguments": map[string]interface{}{
			"companyId":    "acme",
			"relativePath": "research/market.md",
		},
	}))
	if read["content"] != "# Market\n\nAI agents for operators." {
		t.Fatalf("knowledge content did not round-trip: %+v", read)
	}
}

func TestHyperclawToolCallProjectAndWorkflowFlow(t *testing.T) {
	b, cleanup := testHyperclawToolsBridge(t)
	defer cleanup()
	if err := b.store.UpsertAgentIdentity(store.AgentIdentity{ID: "lead", Name: "Lead", Runtime: "codex"}); err != nil {
		t.Fatalf("UpsertAgentIdentity: %v", err)
	}

	project := toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.projects.create",
		"arguments": map[string]interface{}{
			"name":        "Launch",
			"description": "Ship the first workflow",
			"emoji":       "🚀",
			"leadAgentId": "lead",
		},
	}))
	projectData, ok := project["data"].(*store.Project)
	if !ok {
		t.Fatalf("project data type = %T, want *store.Project", project["data"])
	}
	if projectData.Name != "Launch" || projectData.LeadAgentID != "lead" {
		t.Fatalf("project not created correctly: %+v", projectData)
	}

	toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.projects.add_member",
		"arguments": map[string]interface{}{
			"projectId": projectData.ID,
			"agentId":   "lead",
			"role":      "lead",
		},
	}))

	template := toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.workflows.create_from_prompt",
		"arguments": map[string]interface{}{
			"projectId": projectData.ID,
			"name":      "Launch checklist",
			"prompt":    "Research, build, review, ship.",
			"createdBy": "lead",
		},
	}))
	templateData, ok := template["data"].(*store.WorkflowTemplate)
	if !ok {
		t.Fatalf("template data type = %T, want *store.WorkflowTemplate", template["data"])
	}
	if templateData.ProjectID != projectData.ID || templateData.Name != "Launch checklist" {
		t.Fatalf("template not created correctly: %+v", templateData)
	}

	run := toolData(t, b.hyperclawToolCall(map[string]interface{}{
		"toolName": "hyperclaw.workflows.start_run",
		"arguments": map[string]interface{}{
			"templateId":   templateData.ID,
			"startedBy":    "lead",
			"inputPayload": map[string]interface{}{"goal": "ship"},
		},
	}))
	if run["data"] == nil {
		t.Fatalf("workflow run should return data, got %+v", run)
	}
}

func containsAll(value string, needles []string) bool {
	for _, needle := range needles {
		if !strings.Contains(value, needle) {
			return false
		}
	}
	return true
}
