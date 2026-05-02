package bridge

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNormalizeCronRuntimeFilter(t *testing.T) {
	tests := []struct {
		name    string
		runtime string
		want    string
		valid   bool
	}{
		{name: "empty", runtime: "", want: "", valid: true},
		{name: "all", runtime: "all", want: "", valid: true},
		{name: "openclaw", runtime: "OpenClaw", want: "openclaw", valid: true},
		{name: "hermes agent", runtime: "hermes-agent", want: "hermes", valid: true},
		{name: "claude label", runtime: "Claude Code", want: "claude-code", valid: true},
		{name: "legacy claw code", runtime: "claw-code", want: "claude-code", valid: true},
		{name: "codex provider", runtime: "openai-codex", want: "codex", valid: true},
		{name: "unknown is invalid", runtime: " paperclip ", want: "", valid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, valid := normalizeCronRuntimeFilter(tt.runtime)
			if got != tt.want || valid != tt.valid {
				t.Fatalf("normalizeCronRuntimeFilter(%q) = (%q, %v), want (%q, %v)", tt.runtime, got, valid, tt.want, tt.valid)
			}
		})
	}
}

func TestEnrichOpenClawCronJobRawJSONUsesLatestRunFile(t *testing.T) {
	openClawDir := t.TempDir()
	runsDir := filepath.Join(openClawDir, "cron", "runs")
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	jobID := "77a11b42-0d5f-40bb-bf9c-b1c3b6ab131e"
	nextRunAtMs := time.Now().Add(time.Hour).UnixMilli()
	runs := fmt.Sprintf(`{"jobId":"77a11b42-0d5f-40bb-bf9c-b1c3b6ab131e","runAtMs":1000,"status":"error","nextRunAtMs":2000}
{"jobId":"77a11b42-0d5f-40bb-bf9c-b1c3b6ab131e","runAtMs":3000,"status":"ok","nextRunAtMs":%d}
`, nextRunAtMs)
	if err := os.WriteFile(filepath.Join(runsDir, jobID+".jsonl"), []byte(runs), 0o644); err != nil {
		t.Fatal(err)
	}

	rawJSON := `{"id":"77a11b42-0d5f-40bb-bf9c-b1c3b6ab131e","name":"OpenClaw job","state":{"lastStatus":""}}`
	got := enrichOpenClawCronJobRawJSON(Paths{OpenClaw: openClawDir}, jobID, rawJSON)

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(got), &raw); err != nil {
		t.Fatal(err)
	}
	state, ok := raw["state"].(map[string]interface{})
	if !ok {
		t.Fatalf("state missing from enriched raw JSON: %s", got)
	}
	if state["lastRunAtMs"] != float64(3000) {
		t.Fatalf("lastRunAtMs = %v, want 3000", state["lastRunAtMs"])
	}
	if state["nextRunAtMs"] != float64(nextRunAtMs) {
		t.Fatalf("nextRunAtMs = %v, want %d", state["nextRunAtMs"], nextRunAtMs)
	}
	if state["lastStatus"] != "ok" {
		t.Fatalf("lastStatus = %v, want ok", state["lastStatus"])
	}
}

func TestGetCronsFromJSONIncludesNextRunFromRunFile(t *testing.T) {
	openClawDir := t.TempDir()
	cronDir := filepath.Join(openClawDir, "cron")
	runsDir := filepath.Join(cronDir, "runs")
	if err := os.MkdirAll(runsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	jobID := "cf173898-7d9d-455f-ab61-6d499e51ac88"
	jobsJSON := `{"version":1,"jobs":[{"id":"cf173898-7d9d-455f-ab61-6d499e51ac88","agentId":"ada","name":"Instagram","enabled":true,"schedule":{"kind":"cron","expr":"30 * * * *"},"state":{}}]}`
	if err := os.WriteFile(filepath.Join(cronDir, "jobs.json"), []byte(jobsJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	nextRunAtMs := time.Now().Add(time.Hour).UnixMilli()
	runs := fmt.Sprintf(`{"jobId":"cf173898-7d9d-455f-ab61-6d499e51ac88","runAtMs":3000,"status":"ok","nextRunAtMs":%d}
`, nextRunAtMs)
	if err := os.WriteFile(filepath.Join(runsDir, jobID+".jsonl"), []byte(runs), 0o644); err != nil {
		t.Fatal(err)
	}

	jobs := getCronsFromJSON(Paths{OpenClaw: openClawDir})
	if len(jobs) != 1 {
		t.Fatalf("len(jobs) = %d, want 1", len(jobs))
	}
	if jobs[0].LastRunAtMs == nil || *jobs[0].LastRunAtMs != 3000 {
		t.Fatalf("LastRunAtMs = %v, want 3000", jobs[0].LastRunAtMs)
	}
	if jobs[0].NextRun == nil || *jobs[0].NextRun != nextRunAtMs {
		t.Fatalf("NextRun = %v, want %d", jobs[0].NextRun, nextRunAtMs)
	}
	if jobs[0].LastStatus != "ok" {
		t.Fatalf("LastStatus = %q, want ok", jobs[0].LastStatus)
	}
}
