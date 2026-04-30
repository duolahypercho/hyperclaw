package runtimeworker

import "encoding/json"

const (
	MessageTypeJob        = "job"
	MessageTypeAbort      = "abort"
	MessageTypeHealth     = "health"
	MessageTypeHubMessage = "hub_message"
	MessageTypeDone       = "done"
	MessageTypeError      = "error"
	MessageTypeReady      = "ready"
)

const (
	DeploymentModeLocal  = "local"
	DeploymentModeRemote = "remote"
)

const (
	HubMessageKindEvent    = "event"
	HubMessageKindResponse = "response"
)

type JobRequest struct {
	Type      string                 `json:"type"`
	JobID     string                 `json:"jobId"`
	Action    string                 `json:"action"`
	RequestID string                 `json:"requestId"`
	Params    map[string]interface{} `json:"params"`
	Mode      string                 `json:"mode"`
}

type AbortRequest struct {
	Type  string `json:"type"`
	JobID string `json:"jobId"`
}

type HealthRequest struct {
	Type string `json:"type"`
}

type HubMessage struct {
	Type  string          `json:"type"`
	JobID string          `json:"jobId"`
	Kind  string          `json:"kind"`
	Data  json.RawMessage `json:"data"`
}

func (m HubMessage) IsFinalResponse() bool {
	return m.Kind == HubMessageKindResponse
}

type DoneMessage struct {
	Type  string `json:"type"`
	JobID string `json:"jobId"`
}

type ErrorMessage struct {
	Type    string `json:"type"`
	JobID   string `json:"jobId,omitempty"`
	Message string `json:"message"`
}

type ReadyMessage struct {
	Type string `json:"type"`
}
