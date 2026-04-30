package bridge

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

type fakeRuntimeWorker struct {
	called bool
	action string
}

func (f *fakeRuntimeWorker) RunStreaming(ctx context.Context, action string, params map[string]interface{}, requestID string, toHub chan<- []byte) error {
	f.called = true
	f.action = action
	resp := protocol.NewResponse(requestID, protocol.StatusOk, map[string]interface{}{
		"worker": true,
	})
	data, _ := json.Marshal(resp)
	toHub <- data
	return nil
}

func (f *fakeRuntimeWorker) RunAction(ctx context.Context, action string, params map[string]interface{}) (map[string]interface{}, error) {
	f.called = true
	f.action = action
	return map[string]interface{}{"worker": true}, nil
}

func (f *fakeRuntimeWorker) Status() map[string]interface{} {
	return map[string]interface{}{"available": true}
}

func (f *fakeRuntimeWorker) Shutdown() error {
	return nil
}

func TestStreamingActionDelegatesToRuntimeWorker(t *testing.T) {
	worker := &fakeRuntimeWorker{}
	handler := NewBridgeHandler()
	handler.SetRuntimeWorker(worker)
	toHub := make(chan []byte, 1)

	handler.Handle(protocol.Message{
		Type: "req",
		Payload: map[string]interface{}{
			"requestId": "req-1",
			"params": map[string]interface{}{
				"action": "codex-send",
				"query":  "hello",
			},
		},
	}, toHub)

	if !worker.called {
		t.Fatal("expected runtime worker to handle streaming action")
	}
	if worker.action != "codex-send" {
		t.Fatalf("worker action = %q, want codex-send", worker.action)
	}
}

func TestRuntimeControlActionDelegatesToRuntimeWorker(t *testing.T) {
	worker := &fakeRuntimeWorker{}
	handler := NewBridgeHandler()
	handler.SetRuntimeWorker(worker)
	toHub := make(chan []byte, 1)

	handler.Handle(protocol.Message{
		Type: "req",
		Payload: map[string]interface{}{
			"requestId": "req-1",
			"params": map[string]interface{}{
				"action":     "codex-abort",
				"sessionKey": "session-1",
			},
		},
	}, toHub)

	if !worker.called {
		t.Fatal("expected runtime worker to handle runtime control action")
	}
	if worker.action != "codex-abort" {
		t.Fatalf("worker action = %q, want codex-abort", worker.action)
	}
}

func TestConnectorStabilityStatusIncludesWorkerAndHubSendStats(t *testing.T) {
	ResetHubSendStats()
	worker := &fakeRuntimeWorker{}
	handler := NewBridgeHandler()
	handler.SetRuntimeWorker(worker)
	var gwConnected atomic.Int32
	gwConnected.Store(1)
	handler.SetGatewayFlag(&gwConnected)
	result := handler.Dispatch("connector-stability-status", map[string]interface{}{})

	data, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("result type = %T, want map", result)
	}
	if _, ok := data["hubSend"]; !ok {
		t.Fatal("expected hubSend stats")
	}
	if _, ok := data["runtimeWorker"]; !ok {
		t.Fatal("expected runtimeWorker status")
	}
	if data["gatewayConnected"] != true {
		t.Fatalf("gatewayConnected = %v, want true", data["gatewayConnected"])
	}
}

func TestConnectorHealthReportsGatewayState(t *testing.T) {
	var gwConnected atomic.Int32
	handler := NewBridgeHandler()
	handler.SetGatewayFlag(&gwConnected)

	result := handler.Dispatch("connector-health", map[string]interface{}{})
	data, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("result type = %T, want map", result)
	}
	if data["connectorOnline"] != true {
		t.Fatalf("connectorOnline = %v, want true", data["connectorOnline"])
	}
	if data["gatewayConnected"] != false {
		t.Fatalf("gatewayConnected = %v, want false", data["gatewayConnected"])
	}
	if data["gatewayState"] != "disconnected" {
		t.Fatalf("gatewayState = %v, want disconnected", data["gatewayState"])
	}

	gwConnected.Store(1)
	result = handler.Dispatch("connector-health", map[string]interface{}{})
	data = result.(map[string]interface{})
	if data["gatewayConnected"] != true {
		t.Fatalf("gatewayConnected = %v, want true", data["gatewayConnected"])
	}
	if data["gatewayState"] != "connected" {
		t.Fatalf("gatewayState = %v, want connected", data["gatewayState"])
	}
}

func TestSessionReadCompletesWhileRuntimeWorkerStreams(t *testing.T) {
	worker := &fakeRuntimeWorker{}
	handler := NewBridgeHandler()
	handler.SetRuntimeWorker(worker)
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	defer dataStore.Close()
	handler.SetStore(dataStore)

	toHub := make(chan []byte, 256)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		handler.Handle(protocol.Message{
			Type: "req",
			Payload: map[string]interface{}{
				"requestId": "stream-1",
				"params": map[string]interface{}{
					"action": "codex-send",
					"query":  "hello",
				},
			},
		}, toHub)
	}()

	handler.Handle(protocol.Message{
		Type: "req",
		Payload: map[string]interface{}{
			"requestId": "sessions-1",
			"params": map[string]interface{}{
				"action": "get-all-sessions",
				"limit":  10,
			},
		},
	}, toHub)

	deadline := time.After(2 * time.Second)
	for {
		select {
		case raw := <-toHub:
			var msg protocol.Message
			if err := json.Unmarshal(raw, &msg); err == nil && msg.GetRequestID() == "sessions-1" {
				wg.Wait()
				return
			}
		case <-deadline:
			t.Fatal("session read did not respond while runtime worker stream was active")
		}
	}
}
