package protocol

import "encoding/json"

const (
	StatusOk    = "ok"
	StatusError = "error"
)

// Message represents a WebSocket message in the hub protocol.
type Message struct {
	Type      string                 `json:"type"`
	Payload   map[string]interface{} `json:"payload,omitempty"`
	DeviceID  string                 `json:"deviceId,omitempty"`
	TenantID  string                 `json:"tenantId,omitempty"`
	Timestamp int64                  `json:"timestamp,omitempty"`
}

// GetRequestID extracts the requestId from the payload.
func (m *Message) GetRequestID() string {
	if m.Payload == nil {
		return ""
	}
	if id, ok := m.Payload["requestId"].(string); ok {
		return id
	}
	return ""
}

// GetRequestType extracts the requestType from the payload.
func (m *Message) GetRequestType() string {
	if m.Payload == nil {
		return ""
	}
	if t, ok := m.Payload["requestType"].(string); ok {
		return t
	}
	return ""
}

// NewResponse creates a response message for a given request.
func NewResponse(requestID, status string, data map[string]interface{}) Message {
	payload := map[string]interface{}{
		"requestId": requestID,
		"status":    status,
		"data":      data,
	}
	return Message{
		Type:    "res",
		Payload: payload,
	}
}

// NewEvent creates an event message.
func NewEvent(eventType string, data map[string]interface{}) Message {
	payload := map[string]interface{}{
		"event": eventType,
		"data":  data,
	}
	return Message{
		Type:    "event",
		Payload: payload,
	}
}

// MarshalJSON implements custom JSON marshaling.
func (m Message) MarshalJSON() ([]byte, error) {
	type Alias Message
	return json.Marshal((*Alias)(&m))
}
