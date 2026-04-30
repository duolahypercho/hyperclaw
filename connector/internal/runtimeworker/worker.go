package runtimeworker

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"sync"

	"github.com/hypercho/hyperclaw-connector/internal/protocol"
)

type JobHandler interface {
	HandleRuntimeWorkerJob(action string, params map[string]interface{}, requestID string, toHub chan<- []byte)
}

func RunStdio(ctx context.Context, in io.Reader, out io.Writer, handler JobHandler) error {
	dec := json.NewDecoder(in)
	enc := json.NewEncoder(out)
	var encMu sync.Mutex
	send := func(v interface{}) {
		encMu.Lock()
		defer encMu.Unlock()
		if err := enc.Encode(v); err != nil {
			log.Printf("runtime worker encode failed: %v", err)
		}
	}
	send(ReadyMessage{Type: MessageTypeReady})

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return err
		}
		var envelope struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			continue
		}
		switch envelope.Type {
		case MessageTypeJob:
			var req JobRequest
			if err := json.Unmarshal(raw, &req); err != nil {
				send(ErrorMessage{Type: MessageTypeError, Message: err.Error()})
				continue
			}
			go runJob(req, handler, send)
		case MessageTypeHealth:
			send(DoneMessage{Type: MessageTypeDone})
		case MessageTypeAbort:
			var req AbortRequest
			if err := json.Unmarshal(raw, &req); err == nil {
				send(ErrorMessage{Type: MessageTypeError, JobID: req.JobID, Message: "abort by job id is not supported; send runtime abort action"})
			}
		}
	}
}

func runJob(req JobRequest, handler JobHandler, send func(interface{})) {
	toHub := make(chan []byte, 256)
	done := make(chan struct{})
	go func() {
		for data := range toHub {
			send(HubMessage{
				Type:  MessageTypeHubMessage,
				JobID: req.JobID,
				Kind:  classifyHubMessage(data),
				Data:  json.RawMessage(data),
			})
		}
		close(done)
	}()
	handler.HandleRuntimeWorkerJob(req.Action, req.Params, req.RequestID, toHub)
	close(toHub)
	<-done
	send(DoneMessage{Type: MessageTypeDone, JobID: req.JobID})
}

func classifyHubMessage(data []byte) string {
	var msg protocol.Message
	if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "res" {
		return HubMessageKindResponse
	}
	return HubMessageKindEvent
}
