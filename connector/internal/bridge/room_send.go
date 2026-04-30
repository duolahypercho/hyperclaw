package bridge

// ── Room chat send — streaming, multi-runtime ─────────────────────────────────
//
// Bridge action: "room-send"
// Params:
//   roomId        string  (required)
//   targetAgentId string  (required)
//   message       string  (required)
//   contextLimit  number  (optional, default 20)
//
// Streaming events dispatched to dashboard: "room-agent-stream"
//   { requestId, roomId, agentId, agentName, runtime, chunk, done, messageId }
//
// Supported runtimes: "claude-code" | "claude" | "codex" | * (fallback to claude)

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func (b *BridgeHandler) roomSend(params map[string]interface{}, requestID string, toHub chan<- []byte) {
	roomID, _ := params["roomId"].(string)
	targetAgentID, _ := params["targetAgentId"].(string)
	message, _ := params["message"].(string)
	contextLimitF, _ := params["contextLimit"].(float64)
	contextLimit := int(contextLimitF)
	if contextLimit <= 0 {
		contextLimit = 20
	}

	if roomID == "" || targetAgentID == "" || message == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "roomId, targetAgentId and message required",
		}, toHub)
		return
	}
	if b.store == nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "store not available",
		}, toHub)
		return
	}

	// Look up target agent
	agent, err := b.store.GetAgent(targetAgentID)
	if err != nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("agent lookup failed: %v", err),
		}, toHub)
		return
	}
	if agent == nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "agent not found",
		}, toHub)
		return
	}

	// 1. Store user message
	if _, err := b.store.AddRoomMessage(store.RoomMessage{
		RoomID:  roomID,
		Role:    "user",
		Content: message,
	}); err != nil {
		log.Printf("[room-send] warn: could not store user message: %v", err)
	}

	// 2. Fetch conversation context (includes the message we just stored)
	history, err := b.store.ListRoomMessages(roomID, contextLimit)
	if err != nil {
		log.Printf("[room-send] warn: could not fetch history: %v", err)
		history = []store.RoomMessage{}
	}

	// 3. Build runtime-agnostic prompt
	prompt := buildRoomPrompt(history, agent)

	// 4. Dispatch to the right runtime
	runtime := strings.ToLower(agent.Runtime)
	switch runtime {
	case "codex":
		b.roomSendCodex(prompt, roomID, agent, requestID, toHub)
	default:
		// claude-code, claude, or unknown → use claude CLI
		b.roomSendClaude(prompt, roomID, agent, requestID, toHub)
	}
}

// buildRoomPrompt assembles the full text prompt the target agent will receive.
// It prepends a system context section followed by the conversation history,
// formatted so any LLM runtime can understand who said what.
func buildRoomPrompt(history []store.RoomMessage, target *store.Agent) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("You are %s. You are participating in a shared team room with other AI agents.\n", target.Name))
	sb.WriteString("Messages from teammates are labeled [Name · Runtime]. Only respond as yourself.\n")
	sb.WriteString("Build on what others have said where relevant.\n\n")

	if len(history) > 0 {
		sb.WriteString("--- Room conversation ---\n")
		for _, msg := range history {
			if msg.Role == "user" {
				sb.WriteString(fmt.Sprintf("[User]: %s\n", msg.Content))
			} else {
				label := msg.AgentName
				if msg.Runtime != "" {
					label = fmt.Sprintf("%s · %s", msg.AgentName, msg.Runtime)
				}
				sb.WriteString(fmt.Sprintf("[%s]: %s\n", label, msg.Content))
			}
		}
		sb.WriteString("--- End of conversation ---\n")
	}

	return sb.String()
}

// sendRoomStreamChunk sends one streaming chunk to the dashboard.
func sendRoomStreamChunk(requestID, roomID, agentID, agentName, runtime, chunk string, done bool, messageID string, toHub chan<- []byte) {
	payload := map[string]interface{}{
		"requestId": requestID,
		"roomId":    roomID,
		"agentId":   agentID,
		"agentName": agentName,
		"runtime":   runtime,
		"chunk":     chunk,
		"done":      done,
	}
	if messageID != "" {
		payload["messageId"] = messageID
	}
	msg := protocol.NewEvent("room-agent-stream", payload)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case toHub <- data:
	default:
		log.Printf("[room-send] toHub full, dropping stream chunk")
	}
}

// ── Claude runtime ────────────────────────────────────────────────────────────

func (b *BridgeHandler) roomSendClaude(prompt, roomID string, agent *store.Agent, requestID string, toHub chan<- []byte) {
	bin := findClaudeBinary()
	if bin == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "claude CLI not found",
		}, toHub)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	args := []string{"-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = claudeEnv()
	setProcGroup(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{"error": err.Error()}, toHub)
		return
	}
	if err := cmd.Start(); err != nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{"error": err.Error()}, toHub)
		return
	}

	var fullText strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 256*1024), 2*1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event map[string]interface{}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		// Extract partial text chunks
		if eventType, _ := event["type"].(string); eventType == "assistant" {
			if msg, ok := event["message"].(map[string]interface{}); ok {
				if content, ok := msg["content"].([]interface{}); ok {
					for _, block := range content {
						if bmap, ok := block.(map[string]interface{}); ok {
							if bmap["type"] == "text" {
								if text, ok := bmap["text"].(string); ok && text != "" {
									fullText.WriteString(text)
									sendRoomStreamChunk(requestID, roomID, agent.ID, agent.Name, agent.Runtime, text, false, "", toHub)
								}
							}
						}
					}
				}
			}
		}
		// Capture final result text
		if eventType, _ := event["type"].(string); eventType == "result" {
			if text, ok := event["result"].(string); ok && text != "" && fullText.Len() == 0 {
				fullText.WriteString(text)
			}
		}
	}

	cmd.Wait()

	finalContent := strings.TrimSpace(fullText.String())
	if finalContent == "" {
		finalContent = "(no response)"
	}

	// Store agent response
	saved, _ := b.store.AddRoomMessage(store.RoomMessage{
		RoomID:    roomID,
		Role:      "assistant",
		AgentID:   agent.ID,
		AgentName: agent.Name,
		Runtime:   agent.Runtime,
		Content:   finalContent,
	})

	messageID := ""
	if saved != nil {
		messageID = saved.ID
	}

	sendRoomStreamChunk(requestID, roomID, agent.ID, agent.Name, agent.Runtime, "", true, messageID, toHub)
	sendStreamResponse(requestID, protocol.StatusOk, map[string]interface{}{
		"success":   true,
		"roomId":    roomID,
		"agentId":   agent.ID,
		"messageId": messageID,
		"content":   finalContent,
	}, toHub)
}

// ── Codex runtime ─────────────────────────────────────────────────────────────

func (b *BridgeHandler) roomSendCodex(prompt, roomID string, agent *store.Agent, requestID string, toHub chan<- []byte) {
	bin := findCodexBinary()
	if bin == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "codex CLI not found",
		}, toHub)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	args := []string{"exec", prompt, "--json", "--color", "never", "-s", "read-only", "--skip-git-repo-check"}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = claudeEnv()
	setProcGroup(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{"error": err.Error()}, toHub)
		return
	}
	if err := cmd.Start(); err != nil {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{"error": err.Error()}, toHub)
		return
	}

	var fullText strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 256*1024), 2*1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event map[string]interface{}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		// Codex emits { type: "message", message: { role: "assistant", content: [...] } }
		if msgType, _ := event["type"].(string); msgType == "message" {
			if inner, ok := event["message"].(map[string]interface{}); ok {
				if role, _ := inner["role"].(string); role == "assistant" {
					if content, ok := inner["content"].([]interface{}); ok {
						for _, block := range content {
							if bmap, ok := block.(map[string]interface{}); ok {
								if bmap["type"] == "output_text" {
									if text, ok := bmap["text"].(string); ok && text != "" {
										fullText.WriteString(text)
										sendRoomStreamChunk(requestID, roomID, agent.ID, agent.Name, agent.Runtime, text, false, "", toHub)
									}
								}
							}
						}
					}
				}
			}
		}
	}

	cmd.Wait()

	finalContent := strings.TrimSpace(fullText.String())
	if finalContent == "" {
		finalContent = "(no response)"
	}

	saved, _ := b.store.AddRoomMessage(store.RoomMessage{
		RoomID:    roomID,
		Role:      "assistant",
		AgentID:   agent.ID,
		AgentName: agent.Name,
		Runtime:   agent.Runtime,
		Content:   finalContent,
	})

	messageID := ""
	if saved != nil {
		messageID = saved.ID
	}

	sendRoomStreamChunk(requestID, roomID, agent.ID, agent.Name, agent.Runtime, "", true, messageID, toHub)
	sendStreamResponse(requestID, protocol.StatusOk, map[string]interface{}{
		"success":   true,
		"roomId":    roomID,
		"agentId":   agent.ID,
		"messageId": messageID,
		"content":   finalContent,
	}, toHub)
}
