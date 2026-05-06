package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func writeOpenClawSessionIndex(t *testing.T, openClawDir, agentID string, records string) {
	t.Helper()
	sessionsDir := filepath.Join(openClawDir, "agents", agentID, "sessions")
	if err := os.MkdirAll(sessionsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionsDir, "sessions.json"), []byte(records), 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeOpenClawSessionFile(t *testing.T, openClawDir, agentID, filename string) {
	t.Helper()
	path := filepath.Join(openClawDir, "agents", agentID, "sessions", filename)
	if err := os.WriteFile(path, []byte(`{"role":"user","content":"hi"}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestOpenClawLocalSessionsOmitArchivedAndDeletedRecords(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "ada", `{
		"agent:ada:active": {"sessionId":"active","updatedAt":3000,"status":"completed","sessionFile":"active.jsonl"},
		"agent:ada:archived": {"sessionId":"archived","updatedAt":2000,"status":"archived","sessionFile":"archived.jsonl"},
		"agent:ada:deleted": {"sessionId":"deleted","updatedAt":1000,"status":"deleted","sessionFile":"deleted.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "ada", "active.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	items, err := b.readOpenClawLocalSessions("ada")
	if err != nil {
		t.Fatalf("readOpenClawLocalSessions: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1: %#v", len(items), items)
	}
	if items[0].Key != "agent:ada:active" {
		t.Fatalf("items[0].Key = %q, want active session", items[0].Key)
	}
}

func TestOpenClawLocalSessionsEmptyAgentIDScansAllAgents(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "ada", `{
		"agent:ada:chat-1": {"sessionId":"chat-1","updatedAt":2000,"status":"completed","sessionFile":"chat-1.jsonl"}
	}`)
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:chat-1": {"sessionId":"chat-1","updatedAt":3000,"status":"completed","sessionFile":"chat-1.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "ada", "chat-1.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "chat-1.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	items, err := b.readOpenClawLocalSessions("")
	if err != nil {
		t.Fatalf("readOpenClawLocalSessions all agents: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, want 2: %#v", len(items), items)
	}
	if items[0].Key != "agent:main:chat-1" || items[1].Key != "agent:ada:chat-1" {
		t.Fatalf("items not sorted across agents by updatedAt: %#v", items)
	}
}

func TestOpenClawLocalSessionsOmitRecordsWithMissingTranscript(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:exists": {"sessionId":"exists","updatedAt":3000,"status":"completed","sessionFile":"exists.jsonl"},
		"agent:main:missing-explicit": {"sessionId":"missing-explicit","updatedAt":2000,"status":"completed","sessionFile":"missing-explicit.jsonl"},
		"agent:main:missing-inferred": {"sessionId":"missing-inferred","updatedAt":1000}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "exists.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	items, err := b.readOpenClawLocalSessions("main")
	if err != nil {
		t.Fatalf("readOpenClawLocalSessions: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1: %#v", len(items), items)
	}
	if items[0].Key != "agent:main:exists" {
		t.Fatalf("items[0].Key = %q, want existing transcript", items[0].Key)
	}
}

func TestOpenClawLocalSessionsFiltersCronJobsBeforeLimit(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "ada", `{
		"agent:ada:hyperclaw": {"sessionId":"hyperclaw","updatedAt":5000,"status":"completed","sessionFile":"hyperclaw.jsonl"},
		"agent:ada:cron:job-20": {"sessionId":"job-20","updatedAt":4000,"status":"completed","sessionFile":"job-20.jsonl"},
		"agent:ada:cron:job-2:run-b": {"sessionId":"job-2-run-b","updatedAt":3000,"status":"completed","sessionFile":"job-2-run-b.jsonl"},
		"agent:ada:cron:job-2": {"sessionId":"job-2","updatedAt":2000,"status":"completed","sessionFile":"job-2.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "ada", "hyperclaw.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "ada", "job-20.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "ada", "job-2-run-b.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "ada", "job-2.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalSessions(map[string]interface{}{
		"agentId":    "ada",
		"cronJobIds": []interface{}{"job-2"},
		"limit":      1,
	})
	if res.err != nil {
		t.Fatalf("openclawLocalSessions: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	items, ok := data["sessions"].([]openClawLocalSessionItem)
	if !ok {
		t.Fatalf("sessions has type %T, want []openClawLocalSessionItem", data["sessions"])
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1: %#v", len(items), items)
	}
	if items[0].Key != "agent:ada:cron:job-2:run-b" {
		t.Fatalf("items[0].Key = %q, want newest job-2 cron session", items[0].Key)
	}
}

func TestOpenClawLocalSessionsFiltersCronJobsNoMatch(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "ada", `{
		"agent:ada:hyperclaw": {"sessionId":"hyperclaw","updatedAt":5000,"status":"completed","sessionFile":"hyperclaw.jsonl"},
		"agent:ada:cron:job-99": {"sessionId":"job-99","updatedAt":4000,"status":"completed","sessionFile":"job-99.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "ada", "hyperclaw.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "ada", "job-99.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalSessions(map[string]interface{}{
		"agentId":    "ada",
		"cronJobIds": []interface{}{"job-1"},
		"limit":      10,
	})
	if res.err != nil {
		t.Fatalf("openclawLocalSessions: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	items, ok := data["sessions"].([]openClawLocalSessionItem)
	if !ok {
		t.Fatalf("sessions has type %T, want []openClawLocalSessionItem", data["sessions"])
	}
	if len(items) != 0 {
		t.Fatalf("len(items) = %d, want 0: %#v", len(items), items)
	}
}

func TestOpenClawLocalHistoryMissingTranscriptReturnsEmptyMessages(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:ensemble:dm:ada": {"sessionId":"missing-transcript","updatedAt":3000}
	}`)

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:ensemble:dm:ada",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	messages, ok := data["messages"].([]json.RawMessage)
	if !ok {
		t.Fatalf("messages has type %T, want []json.RawMessage", data["messages"])
	}
	if len(messages) != 0 {
		t.Fatalf("len(messages) = %d, want empty history", len(messages))
	}
	if data["missingTranscript"] != true {
		t.Fatalf("missingTranscript = %#v, want true", data["missingTranscript"])
	}
}

func TestOpenClawLocalHistoryFallbackSkipsMissingTranscript(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:missing": {"sessionId":"missing","updatedAt":3000},
		"agent:main:exists": {"sessionId":"exists","updatedAt":2000,"sessionFile":"exists.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "exists.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:not-in-index",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:exists" {
		t.Fatalf("sessionKey = %#v, want fallback to existing transcript", data["sessionKey"])
	}
	if data["missingTranscript"] == true {
		t.Fatalf("missingTranscript = true, want existing transcript fallback")
	}
}

func TestOpenClawLocalHistoryMissingCronSessionReturnsEmptyHistory(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:hyperclaw": {"sessionId":"hyperclaw","updatedAt":3000,"sessionFile":"hyperclaw.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "hyperclaw.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	messages, ok := data["messages"].([]json.RawMessage)
	if !ok {
		t.Fatalf("messages has type %T, want []json.RawMessage", data["messages"])
	}
	if len(messages) != 0 {
		t.Fatalf("len(messages) = %d, want empty history", len(messages))
	}
	if data["sessionKey"] != "agent:main:cron:job-1" {
		t.Fatalf("sessionKey = %#v, want requested cron session", data["sessionKey"])
	}
	if data["missingSession"] != true {
		t.Fatalf("missingSession = %#v, want true", data["missingSession"])
	}
}

func TestOpenClawLocalHistoryMissingEmptyCronSessionDoesNotFallback(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:hyperclaw": {"sessionId":"hyperclaw","updatedAt":3000,"sessionFile":"hyperclaw.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "hyperclaw.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:",
	})
	if res.err == nil {
		t.Fatalf("openclawLocalHistory unexpectedly fell back for empty cron key: %#v", res.data)
	}
}

func TestOpenClawLocalHistoryMissingRunSpecificCronSessionReturnsEmptyHistory(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-1:run-existing": {"sessionId":"job-1-run-existing","updatedAt":3000,"sessionFile":"job-1-run-existing.jsonl"},
		"agent:main:hyperclaw": {"sessionId":"hyperclaw","updatedAt":2000,"sessionFile":"hyperclaw.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-run-existing.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "hyperclaw.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1:run-missing",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:cron:job-1:run-missing" {
		t.Fatalf("sessionKey = %#v, want requested missing run-specific cron session", data["sessionKey"])
	}
	if data["missingSession"] != true {
		t.Fatalf("missingSession = %#v, want true", data["missingSession"])
	}
}

func TestOpenClawLocalHistoryExistingCronSessionLoadsTranscript(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-1": {"sessionId":"job-1","updatedAt":3000,"sessionFile":"job-1.jsonl"},
		"agent:main:hyperclaw": {"sessionId":"hyperclaw","updatedAt":2000,"sessionFile":"hyperclaw.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "hyperclaw.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:cron:job-1" {
		t.Fatalf("sessionKey = %#v, want exact cron session", data["sessionKey"])
	}
}

func TestOpenClawLocalHistoryExistingCronSessionMissingTranscriptReturnsEmptyMessages(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-1": {"sessionId":"job-1","updatedAt":3000,"sessionFile":"job-1.jsonl"}
	}`)

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	messages, ok := data["messages"].([]json.RawMessage)
	if !ok {
		t.Fatalf("messages has type %T, want []json.RawMessage", data["messages"])
	}
	if len(messages) != 0 {
		t.Fatalf("len(messages) = %d, want empty history", len(messages))
	}
	if data["missingTranscript"] != true {
		t.Fatalf("missingTranscript = %#v, want true", data["missingTranscript"])
	}
}

func TestOpenClawLocalHistoryBaseCronSessionLoadsLatestMatchingRun(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-20": {"sessionId":"job-20","updatedAt":5000,"sessionFile":"job-20.jsonl"},
		"agent:main:cron:job-1:run-old": {"sessionId":"job-1-run-old","updatedAt":2000,"sessionFile":"job-1-run-old.jsonl"},
		"agent:main:cron:job-1:run-new": {"sessionId":"job-1-run-new","updatedAt":4000,"sessionFile":"job-1-run-new.jsonl"},
		"agent:main:hyperclaw": {"sessionId":"hyperclaw","updatedAt":3000,"sessionFile":"hyperclaw.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "job-20.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-run-old.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-run-new.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "hyperclaw.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:cron:job-1:run-new" {
		t.Fatalf("sessionKey = %#v, want newest matching cron run", data["sessionKey"])
	}
}

func TestOpenClawLocalHistoryArchivedBaseCronSessionFallsThroughToActiveRun(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-1": {"sessionId":"job-1-base","updatedAt":5000,"status":"archived","sessionFile":"job-1-base.jsonl"},
		"agent:main:cron:job-1:active": {"sessionId":"job-1-active","updatedAt":3000,"status":"completed","sessionFile":"job-1-active.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-base.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-active.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:cron:job-1:active" {
		t.Fatalf("sessionKey = %#v, want active cron run", data["sessionKey"])
	}
}

func TestOpenClawLocalHistoryBaseCronSessionSkipsArchivedRuns(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-1:archived": {"sessionId":"job-1-archived","updatedAt":5000,"status":"archived","sessionFile":"job-1-archived.jsonl"},
		"agent:main:cron:job-1:active": {"sessionId":"job-1-active","updatedAt":3000,"status":"completed","sessionFile":"job-1-active.jsonl"}
	}`)
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-archived.jsonl")
	writeOpenClawSessionFile(t, openClawDir, "main", "job-1-active.jsonl")

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:cron:job-1:active" {
		t.Fatalf("sessionKey = %#v, want active cron run", data["sessionKey"])
	}
}

func TestOpenClawLocalHistoryBaseCronSessionWithOnlyStaleRunRecordsReturnsMissingSession(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "main", `{
		"agent:main:cron:job-1:run-old": {"sessionId":"job-1-run-old","updatedAt":2000,"sessionFile":"job-1-run-old.jsonl"},
		"agent:main:cron:job-1:run-new": {"sessionId":"job-1-run-new","updatedAt":4000,"sessionFile":"job-1-run-new.jsonl"}
	}`)

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalHistory(map[string]interface{}{
		"sessionKey": "agent:main:cron:job-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalHistory: %v", res.err)
	}
	data, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("data has type %T, want map[string]interface{}", res.data)
	}
	if data["sessionKey"] != "agent:main:cron:job-1" {
		t.Fatalf("sessionKey = %#v, want requested base cron session", data["sessionKey"])
	}
	if data["missingSession"] != true {
		t.Fatalf("missingSession = %#v, want true", data["missingSession"])
	}
}

func TestOpenClawLocalArchiveSessionMarksRecordAndKeepsTranscript(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "ada", `{
		"agent:ada:chat-1": {"sessionId":"chat-1","updatedAt":3000,"status":"completed","sessionFile":"chat-1.jsonl"}
	}`)
	transcriptPath := filepath.Join(openClawDir, "agents", "ada", "sessions", "chat-1.jsonl")
	if err := os.WriteFile(transcriptPath, []byte(`{"role":"user","content":"hi"}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalArchiveSession(map[string]interface{}{
		"sessionKey": "agent:ada:chat-1",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalArchiveSession: %v", res.err)
	}
	if _, err := os.Stat(transcriptPath); err != nil {
		t.Fatalf("expected transcript to remain: %v", err)
	}

	indexPath := filepath.Join(openClawDir, "agents", "ada", "sessions", "sessions.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatal(err)
	}
	var records map[string]map[string]interface{}
	if err := json.Unmarshal(data, &records); err != nil {
		t.Fatal(err)
	}
	record := records["agent:ada:chat-1"]
	if record["status"] != "archived" {
		t.Fatalf("status = %#v, want archived", record["status"])
	}
	if _, ok := record["archivedAt"]; !ok {
		t.Fatalf("archivedAt missing from archived record: %#v", record)
	}

	items, err := b.readOpenClawLocalSessions("ada")
	if err != nil {
		t.Fatalf("readOpenClawLocalSessions: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("archived session still listed: %#v", items)
	}
}

func TestOpenClawLocalArchiveSessionRejectsUnsafeSessionKey(t *testing.T) {
	b := &BridgeHandler{paths: Paths{OpenClaw: t.TempDir()}}
	res := b.openclawLocalArchiveSession(map[string]interface{}{
		"sessionKey": "agent:../../outside:chat-1",
	})
	if res.err == nil || res.status != 400 {
		t.Fatalf("openclawLocalArchiveSession result = err %v status %d, want status 400", res.err, res.status)
	}
}

func TestOpenClawLocalDeleteSessionSoftDeletesAndKeepsTranscript(t *testing.T) {
	openClawDir := t.TempDir()
	writeOpenClawSessionIndex(t, openClawDir, "ada", `{
		"agent:ada:chat-1": {"sessionId":"chat-1","updatedAt":3000,"status":"completed","sessionFile":"chat-1.jsonl"}
	}`)
	transcriptPath := filepath.Join(openClawDir, "agents", "ada", "sessions", "chat-1.jsonl")
	if err := os.WriteFile(transcriptPath, []byte(`{"role":"user","content":"hi"}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	b := &BridgeHandler{paths: Paths{OpenClaw: openClawDir}}
	res := b.openclawLocalArchiveSession(map[string]interface{}{
		"sessionKey": "agent:ada:chat-1",
		"mode":       "delete",
	})
	if res.err != nil {
		t.Fatalf("openclawLocalArchiveSession delete mode: %v", res.err)
	}
	if _, err := os.Stat(transcriptPath); err != nil {
		t.Fatalf("expected transcript to remain after soft delete: %v", err)
	}

	items, err := b.readOpenClawLocalSessions("ada")
	if err != nil {
		t.Fatalf("readOpenClawLocalSessions: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("deleted session still listed: %#v", items)
	}
}
