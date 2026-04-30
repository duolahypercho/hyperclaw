package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// openclawGatewayURL returns the base URL of the local OpenClaw gateway.
func openclawGatewayURL() string {
	if url := os.Getenv("OPENCLAW_GATEWAY_URL"); url != "" {
		return url
	}
	return "http://127.0.0.1:18789"
}

// openclawSkillsUpdate proxies a skills.update request to the local OpenClaw
// gateway via its JSON-RPC HTTP endpoint. This lets the dashboard toggle skill
// enabled/disabled state, which persists to openclaw.json on the customer machine.
func (b *BridgeHandler) openclawSkillsUpdate(params map[string]interface{}) actionResult {
	skillKey, _ := params["skillKey"].(string)
	if skillKey == "" {
		return errResult("missing required param: skillKey")
	}

	// Build the skills.update RPC payload.
	rpcParams := map[string]interface{}{
		"skillKey": skillKey,
	}
	if enabled, ok := params["enabled"].(bool); ok {
		rpcParams["enabled"] = enabled
	}

	body := map[string]interface{}{
		"method": "skills.update",
		"params": rpcParams,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return errResult(fmt.Sprintf("failed to marshal request: %v", err))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	gwURL := openclawGatewayURL()
	req, err := http.NewRequestWithContext(ctx, "POST", gwURL+"/rpc", bytes.NewReader(payload))
	if err != nil {
		return errResult(fmt.Sprintf("failed to create request: %v", err))
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return errResult(fmt.Sprintf("gateway request failed: %v", err))
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return errResult(fmt.Sprintf("failed to decode gateway response: %v", err))
	}

	if resp.StatusCode != 200 {
		errMsg := "unknown error"
		if e, ok := result["error"].(map[string]interface{}); ok {
			if msg, ok := e["message"].(string); ok {
				errMsg = msg
			}
		}
		return errResult(fmt.Sprintf("gateway returned %d: %s", resp.StatusCode, errMsg))
	}

	// Return the gateway's result directly.
	if r, ok := result["result"]; ok {
		return okResult(r)
	}
	return okResult(result)
}
