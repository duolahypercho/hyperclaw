package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/hypercho/hyperclaw-connector/internal/bridge"
	"github.com/hypercho/hyperclaw-connector/internal/config"
	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/runtimeworker"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

type bridgeRuntimeWorkerHandler struct {
	handler *bridge.BridgeHandler
}

func runRuntimeWorker() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg := config.Parse()
	handler := bridge.NewBridgeHandler()
	if dataStore, err := store.New(cfg.DataDir); err == nil {
		handler.SetStore(dataStore)
		defer dataStore.Close()
	} else {
		log.Printf("runtime worker continuing without store: %v", err)
	}

	err := runtimeworker.RunStdio(ctx, os.Stdin, os.Stdout, bridgeRuntimeWorkerHandler{handler: handler})
	if err != nil && ctx.Err() == nil {
		log.Printf("runtime worker stopped: %v", err)
	}
}

func (h bridgeRuntimeWorkerHandler) HandleRuntimeWorkerJob(action string, params map[string]interface{}, requestID string, toHub chan<- []byte) {
	switch action {
	case "claude-code-send", "codex-send", "hermes-chat":
		h.handler.RunStreamingAction(action, params, requestID, toHub)
	default:
		result := h.handler.Dispatch(action, params)
		if result == nil {
			result = map[string]interface{}{"success": true}
		}
		data, ok := result.(map[string]interface{})
		if !ok {
			raw, _ := json.Marshal(result)
			_ = json.Unmarshal(raw, &data)
		}
		resp := protocol.NewResponse(requestID, protocol.StatusOk, data)
		raw, _ := json.Marshal(resp)
		toHub <- raw
	}
}
