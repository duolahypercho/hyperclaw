package runtimeworker

import (
	"encoding/json"
	"testing"
)

func TestJobRequestRoundTripPreservesRoutingFields(t *testing.T) {
	req := JobRequest{
		Type:      MessageTypeJob,
		JobID:     "job-1",
		Action:    "codex-send",
		RequestID: "req-1",
		Params: map[string]interface{}{
			"action":     "codex-send",
			"sessionKey": "session-1",
		},
		Mode: DeploymentModeRemote,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal job request: %v", err)
	}
	var decoded JobRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal job request: %v", err)
	}

	if decoded.Action != "codex-send" {
		t.Fatalf("Action = %q, want codex-send", decoded.Action)
	}
	if decoded.RequestID != "req-1" {
		t.Fatalf("RequestID = %q, want req-1", decoded.RequestID)
	}
	if decoded.Mode != DeploymentModeRemote {
		t.Fatalf("Mode = %q, want remote", decoded.Mode)
	}
}

func TestHubMessageIdentifiesFinalResponse(t *testing.T) {
	msg := HubMessage{
		Type:  MessageTypeHubMessage,
		JobID: "job-1",
		Kind:  HubMessageKindResponse,
		Data:  json.RawMessage(`{"type":"res","payload":{"requestId":"req-1"}}`),
	}

	if !msg.IsFinalResponse() {
		t.Fatal("expected response hub message to be final")
	}
}
