package bridge

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	_ "modernc.org/sqlite"
)

// activeHermesStreams tracks in-flight hermesChatStream goroutines so the
// dashboard can abort them via the "hermes-abort" bridge action. Keyed by
// sessionKey (same pattern as activeClaudeProcs in claude.go).
type hermesStream struct {
	cancel context.CancelFunc
	cmd    *exec.Cmd // set when the stream is a CLI subprocess; nil for API streams
}

var (
	activeHermesStreams   = make(map[string]*hermesStream)
	activeHermesStreamsMu sync.Mutex
)

// hermesSessionIDLine matches the dedicated "session_id:<id>" marker printed by
// the Hermes CLI. Current Hermes IDs look like "20260426_010517_51f08c"; older
// API paths may use UUIDs, so accept both explicit formats while keeping the
// marker anchored to avoid matching assistant prose.
var hermesSessionIDLine = regexp.MustCompile(`^session_id:\s*((?:\d{8}_\d{6}_[0-9a-fA-F]{4,})|(?:[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}))\s*$`)

// extractHermesSessionID returns the UUID portion if the trimmed line matches
// the expected session_id marker, otherwise an empty string.
func extractHermesSessionID(trimmed string) string {
	m := hermesSessionIDLine.FindStringSubmatch(trimmed)
	if len(m) == 2 {
		return m[1]
	}
	return ""
}

func hermesStateDBPath(agentId string) string {
	home, _ := os.UserHomeDir()
	agentId = normalizeHermesAgentId(agentId)
	if agentId != "" && !isHermesMainAgent(agentId) {
		return filepath.Join(home, ".hermes", "profiles", agentId, "state.db")
	}
	return filepath.Join(home, ".hermes", "state.db")
}

func hermesCLISessionExists(agentId, sessionID string) bool {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return false
	}
	dbPath := hermesStateDBPath(agentId)
	if _, err := os.Stat(dbPath); err != nil {
		return false
	}
	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return false
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	var found int
	err = db.QueryRow("SELECT 1 FROM sessions WHERE id = ? LIMIT 1", sessionID).Scan(&found)
	return err == nil
}

func hermesRequiredProviderEnvKeys(provider string) []string {
	provider = hermesProviderID(provider)
	switch provider {
	case "custom":
		return []string{"OPENAI_API_KEY"}
	case "kimi-coding":
		return []string{"KIMI_API_KEY"}
	default:
		return hermesProviderEnvKeys[provider]
	}
}

func hermesEnvValueIsSet(value string) bool {
	value = strings.Trim(strings.TrimSpace(value), `"'`)
	if value == "" {
		return false
	}
	switch strings.ToLower(value) {
	case "none", "null", "undefined":
		return false
	default:
		return true
	}
}

func readHermesDotEnv(path string) map[string]string {
	values := map[string]string{}
	data, err := os.ReadFile(path)
	if err != nil {
		return values
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		values[strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	return values
}

func hermesHomeDirForAgent(agentId string) string {
	home, _ := os.UserHomeDir()
	agentId = normalizeHermesAgentId(agentId)
	if agentId == "" || isHermesMainAgent(agentId) {
		return filepath.Join(home, ".hermes")
	}
	return filepath.Join(home, ".hermes", "profiles", agentId)
}

func hermesProfileCredentialError(agentId string) string {
	agentId = normalizeHermesAgentId(agentId)
	hermesHome := hermesHomeDirForAgent(agentId)
	configData, err := os.ReadFile(filepath.Join(hermesHome, "config.yaml"))
	if err != nil {
		return ""
	}
	cfg := parseHermesModelConfig(string(configData))
	envKeys := hermesRequiredProviderEnvKeys(cfg.Provider)
	if len(envKeys) == 0 {
		return ""
	}

	envValues := readHermesDotEnv(filepath.Join(hermesHome, ".env"))
	for _, envKey := range envKeys {
		if hermesEnvValueIsSet(os.Getenv(envKey)) || hermesEnvValueIsSet(envValues[envKey]) {
			return ""
		}
	}

	profileLabel := agentId
	envPath := filepath.Join("~", ".hermes", ".env")
	if profileLabel == "" || isHermesMainAgent(profileLabel) {
		profileLabel = "main"
	} else {
		envPath = filepath.Join("~", ".hermes", "profiles", profileLabel, ".env")
	}
	return fmt.Sprintf(
		"Hermes profile %q is configured for provider %q, but %s is not available to the connector. Add it to %s or re-run Hermes onboarding, then retry.",
		profileLabel,
		cfg.Provider,
		strings.Join(envKeys, " or "),
		envPath,
	)
}

func latestHermesCLISessionID(agentId, userMessage string, notBefore time.Time) string {
	dbPath := hermesStateDBPath(agentId)
	if _, err := os.Stat(dbPath); err != nil {
		return ""
	}
	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return ""
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	startedAfter := float64(notBefore.Add(-2*time.Second).UnixNano()) / float64(time.Second)
	var sessionID string
	err = db.QueryRow(`
		SELECT s.id
		FROM sessions s
		WHERE s.started_at >= ?
		  AND EXISTS (
		    SELECT 1
		    FROM messages m
		    WHERE m.session_id = s.id
		      AND m.role = 'user'
		      AND m.content = ?
		    LIMIT 1
		  )
		ORDER BY s.started_at DESC
		LIMIT 1
	`, startedAfter, userMessage).Scan(&sessionID)
	if err == nil {
		return sessionID
	}

	// Fallback for older Hermes DBs or message normalization differences. This
	// only runs after the CLI exits and is bounded to sessions created during
	// this request, so it avoids persisting the connector's synthetic UUID.
	sessionID = ""
	err = db.QueryRow(`
		SELECT s.id
		FROM sessions s
		WHERE s.started_at >= ?
		ORDER BY s.started_at DESC
		LIMIT 1
	`, startedAfter).Scan(&sessionID)
	if err == nil {
		return sessionID
	}
	return ""
}

func appendHermesCLIResumeArg(args []string, agentId string, params map[string]interface{}) []string {
	sessionID, _ := params["sessionId"].(string)
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return args
	}
	exists := hermesCLISessionExists(agentId, sessionID)
	if exists {
		return append(args, "--resume", sessionID)
	}
	log.Printf("[hermes] skipping CLI resume for unknown session %q (agent=%q)", sessionID, agentId)
	return args
}

func shouldSuppressHermesCLILine(trimmed string) bool {
	if strings.HasPrefix(trimmed, "↻ Resumed session") {
		return true
	}
	return strings.HasPrefix(trimmed, "⚠️ Normalized model ") ||
		strings.HasPrefix(trimmed, "Normalized model ")
}

func registerHermesStream(sessionKey string, s *hermesStream) {
	if sessionKey == "" {
		return
	}
	activeHermesStreamsMu.Lock()
	// If a prior stream is still registered (shouldn't normally happen, but
	// guards against leaked state), cancel it before replacing.
	if prev, ok := activeHermesStreams[sessionKey]; ok && prev != nil {
		prev.cancel()
	}
	activeHermesStreams[sessionKey] = s
	activeHermesStreamsMu.Unlock()
}

func unregisterHermesStream(sessionKey string) {
	if sessionKey == "" {
		return
	}
	activeHermesStreamsMu.Lock()
	delete(activeHermesStreams, sessionKey)
	activeHermesStreamsMu.Unlock()
}

// hermesAPIURL returns the hermes API base URL.
// Reads from HERMES_API_URL env var, defaults to http://127.0.0.1:8642.
func hermesAPIURL() string {
	if url := os.Getenv("HERMES_API_URL"); url != "" {
		return url
	}
	return "http://127.0.0.1:8642"
}

func hermesAPIKey() string {
	if key := strings.TrimSpace(os.Getenv("API_SERVER_KEY")); key != "" {
		return key
	}
	home, _ := os.UserHomeDir()
	data, err := os.ReadFile(filepath.Join(home, ".hermes", ".env"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(k) != "API_SERVER_KEY" {
			continue
		}
		return strings.Trim(strings.TrimSpace(v), `"'`)
	}
	return ""
}

func addHermesAPIAuth(req *http.Request) {
	if key := hermesAPIKey(); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
}

// findHermesBinary locates the hermes CLI binary.
func findHermesBinary() string {
	// Check PATH for both "hermes" and "hermes-agent" names
	if p, err := exec.LookPath("hermes"); err == nil {
		return p
	}
	if p, err := exec.LookPath("hermes-agent"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".hermes/hermes-agent/venv/bin/hermes"),
		filepath.Join(home, ".hermes/hermes-agent/venv/bin/hermes-agent"),
		filepath.Join(home, ".local/bin/hermes"),
		filepath.Join(home, ".local/bin/hermes-agent"),
		"/opt/homebrew/bin/hermes",
		"/opt/homebrew/bin/hermes-agent",
		"/usr/local/bin/hermes",
		"/usr/local/bin/hermes-agent",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// hermesAPIAvailable checks if the hermes HTTP API is usable with the current
// API_SERVER_KEY. /health is intentionally unauthenticated, so it can return 200
// while API calls still fail with 401 after a key rotation.
func hermesAPIAvailable() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	client := &http.Client{}
	req, err := http.NewRequestWithContext(ctx, "GET", hermesAPIURL()+"/v1/models", nil)
	if err != nil {
		return false
	}
	addHermesAPIAuth(req)
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	return resp.StatusCode == 200
}

// ensureHermesAPIEnabled checks if api_server is enabled in hermes config.
// If not, adds it and restarts the gateway so the HTTP API becomes available.
// Returns true if the API is (or becomes) available after this call.
func ensureHermesAPIEnabled() bool {
	home, _ := os.UserHomeDir()
	hermesDir := filepath.Join(home, ".hermes")
	if err := os.MkdirAll(hermesDir, 0700); err != nil {
		log.Printf("[hermes] cannot create %s: %v", hermesDir, err)
		return false
	}

	envPath := filepath.Join(hermesDir, ".env")
	key := hermesAPIKey()
	if key == "" {
		key = "hc_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	}
	if err := writeHermesEnvFile(envPath, map[string]string{
		"API_SERVER_ENABLED": "true",
		"API_SERVER_KEY":     key,
		"API_SERVER_HOST":    "127.0.0.1",
		"API_SERVER_PORT":    "8642",
	}); err != nil {
		log.Printf("[hermes] failed to write api_server env: %v", err)
		return false
	}
	log.Println("[hermes] ensured API_SERVER_ENABLED=true in ~/.hermes/.env")

	if hermesAPIAvailable() {
		return true
	}

	restartHermesGateway()
	return waitForHermesAPI(10 * time.Second)
}

// restartHermesGateway restarts the hermes gateway to pick up config changes.
func restartHermesGateway() {
	bin := findHermesBinary()
	if bin == "" {
		return
	}
	log.Println("[hermes] restarting gateway to enable api_server...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "gateway", "restart")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil && ctx.Err() != context.DeadlineExceeded {
		log.Printf("[hermes] gateway restart warning: %v", err)
	}
}

// waitForHermesAPI polls the health endpoint until it responds or timeout.
func waitForHermesAPI(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if hermesAPIAvailable() {
			log.Println("[hermes] api_server is now available")
			return true
		}
		time.Sleep(500 * time.Millisecond)
	}
	log.Println("[hermes] api_server did not become available within timeout")
	return false
}

// hermesHealth checks if hermes is available, auto-enabling the API if possible.
func (b *BridgeHandler) hermesHealth() actionResult {
	bin := findHermesBinary()
	if bin == "" {
		return okResult(map[string]interface{}{"available": false})
	}

	// Try to ensure the API is available
	apiReady := ensureHermesAPIEnabled()

	if apiReady {
		return okResult(map[string]interface{}{
			"available": true,
			"status":    "ok",
			"mode":      "api",
		})
	}

	// API not available but binary exists — CLI fallback
	return okResult(map[string]interface{}{
		"available": true,
		"status":    "ok",
		"mode":      "cli",
	})
}

// hermesChat sends a message to Hermes. The shared HTTP API runs with the main
// Hermes home, so non-main profiles use the CLI with HERMES_HOME scoped to the
// profile that onboarding configured.
func (b *BridgeHandler) hermesChat(params map[string]interface{}) actionResult {
	query := extractQuery(params)
	if query == "" {
		return errResultStatus("No query or user message provided", 400)
	}

	agentIdRaw, _ := params["agentId"].(string)
	agentId := normalizeHermesAgentId(agentIdRaw)
	conversation, _ := params["conversation"].(string)
	sessionKey, _ := params["sessionKey"].(string)

	if agentId != "" && !isHermesMainAgent(agentId) {
		return b.hermesChatViaCLI(query, params)
	}

	if hermesAPIAvailable() {
		sessionID, _ := params["sessionId"].(string)
		if sessionID == "" {
			sessionID = uuid.NewString()
		}
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		apiResult, err := hermesChatViaResponses(ctx, query, agentId, conversation, sessionKey, sessionID)
		if err != nil {
			log.Printf("[hermes] Responses API failed, falling back to CLI: %v", err)
			return b.hermesChatViaCLI(query, params)
		}
		cleanContent, mediaPaths := parseMediaTags(apiResult.Content)
		resp := map[string]interface{}{
			"content":    cleanContent,
			"mode":       "api",
			"sessionId":  sessionID,
			"responseId": apiResult.ResponseID,
		}
		if atts := readAttachmentsFromPaths(mediaPaths); len(atts) > 0 {
			resp["attachments"] = atts
		}
		return okResult(resp)
	}

	return b.hermesChatViaCLI(query, params)
}

// extractQuery gets the user message from params.
func extractQuery(params map[string]interface{}) string {
	if query, _ := params["query"].(string); query != "" {
		return query
	}
	if messages, ok := params["messages"].([]interface{}); ok {
		for i := len(messages) - 1; i >= 0; i-- {
			if msg, ok := messages[i].(map[string]interface{}); ok {
				if role, _ := msg["role"].(string); role == "user" {
					if content, _ := msg["content"].(string); content != "" {
						return content
					}
				}
			}
		}
	}
	return ""
}

// hermesChatViaAPI uses /v1/chat/completions with streaming.
func (b *BridgeHandler) hermesChatViaAPI(query, conversation, sessionID string) actionResult {
	// Build messages array — for multi-turn, the conversation name handles history
	messages := []map[string]interface{}{
		{"role": "user", "content": query},
	}

	body := map[string]interface{}{
		"model":      "hermes-agent",
		"messages":   messages,
		"stream":     false, // bridge is request/response, collect full result
		"session_id": sessionID,
	}

	payload, _ := json.Marshal(body)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", hermesAPIURL()+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return errResult(fmt.Sprintf("failed to create request: %v", err))
	}
	req.Header.Set("Content-Type", "application/json")
	addHermesAPIAuth(req)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[hermes] API request failed: %v", err)
		return errResult(fmt.Sprintf("hermes API error: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return errResult(fmt.Sprintf("hermes API returned %d: %s", resp.StatusCode, string(bodyBytes)))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return errResult(fmt.Sprintf("failed to parse hermes response: %v", err))
	}

	// Extract content from OpenAI chat completions format
	content := extractChatCompletionContent(result)

	cleanContent, mediaPaths := parseMediaTags(content)
	apiResp := map[string]interface{}{
		"content":   cleanContent,
		"mode":      "api",
		"sessionId": sessionID,
	}
	if atts := readAttachmentsFromPaths(mediaPaths); len(atts) > 0 {
		apiResp["attachments"] = atts
	}
	return okResult(apiResp)
}

// extractChatCompletionContent pulls the assistant text from a /v1/chat/completions response.
func extractChatCompletionContent(result map[string]interface{}) string {
	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return ""
	}
	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return ""
	}
	message, ok := choice["message"].(map[string]interface{})
	if !ok {
		return ""
	}
	content, _ := message["content"].(string)
	return content
}

func buildHermesChatCompletionMessages(params map[string]interface{}, query, agentId string) []map[string]interface{} {
	messages := make([]map[string]interface{}, 0, 8)
	if instructions := readHermesProfileInstructions(agentId); instructions != "" {
		messages = append(messages, map[string]interface{}{"role": "system", "content": instructions})
	}
	if rawMessages, ok := params["messages"].([]interface{}); ok {
		for _, raw := range rawMessages {
			msg, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			role, _ := msg["role"].(string)
			content, _ := msg["content"].(string)
			role = strings.TrimSpace(role)
			if role != "user" && role != "assistant" && role != "system" {
				continue
			}
			if strings.TrimSpace(content) == "" {
				continue
			}
			messages = append(messages, map[string]interface{}{"role": role, "content": content})
		}
	}
	if len(messages) == 0 || messages[len(messages)-1]["role"] != "user" {
		messages = append(messages, map[string]interface{}{"role": "user", "content": query})
	}
	return messages
}

func extractChatCompletionDeltaContent(result map[string]interface{}) string {
	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return ""
	}
	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return ""
	}
	delta, ok := choice["delta"].(map[string]interface{})
	if !ok {
		return ""
	}
	content, _ := delta["content"].(string)
	return content
}

// hermesChatViaCLI runs hermes chat -q with --resume for multi-turn.
// When params["agentId"] is set, overrides HERMES_HOME to the profile
// directory (~/.hermes/profiles/<agentId>) so the correct soul, memory,
// and sessions are loaded. Profiles in hermes are isolated purely via
// HERMES_HOME — there is no -p CLI flag.
func (b *BridgeHandler) hermesChatViaCLI(query string, params map[string]interface{}) actionResult {
	bin := findHermesBinary()
	if bin == "" {
		return errResultStatus("Hermes binary not found", 503)
	}

	agentIdRaw, _ := params["agentId"].(string)
	agentId := normalizeHermesAgentId(agentIdRaw)
	if credentialErr := hermesProfileCredentialError(agentId); credentialErr != "" {
		return errResultStatus(credentialErr, 400)
	}

	args := []string{"chat", "-q", query, "-Q"}
	args = appendHermesCLIResumeArg(args, agentId, params)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, args...)

	env := append(os.Environ(), "PYTHONUNBUFFERED=1")
	if agentId != "" && !isHermesMainAgent(agentId) {
		profileHome, err := hermesProfileDir(agentId)
		if err != nil {
			return errResult(fmt.Sprintf("hermes profile dir: %v", err))
		}
		// Replace any existing HERMES_HOME in the environment
		filtered := make([]string, 0, len(env))
		for _, e := range env {
			if !strings.HasPrefix(e, "HERMES_HOME=") {
				filtered = append(filtered, e)
			}
		}
		env = append(filtered, "HERMES_HOME="+profileHome)
	}
	cmd.Env = env

	home, _ := os.UserHomeDir()
	cmd.Dir = home

	startedAt := time.Now()
	out, err := cmd.Output()
	if err != nil {
		stderr := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
		return errResult(fmt.Sprintf("hermes error: %v — %s", err, stderr))
	}

	lines := strings.Split(string(out), "\n")
	var cleaned []string
	var returnSessionId string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if id := extractHermesSessionID(trimmed); id != "" {
			// Last match wins if multiple session_id lines somehow leak through.
			returnSessionId = id
			continue
		}
		if shouldSuppressHermesCLILine(trimmed) {
			continue
		}
		cleaned = append(cleaned, line)
	}
	rawResponse := strings.TrimSpace(strings.Join(cleaned, "\n"))
	cleanResponse, mediaPaths := parseMediaTags(rawResponse)

	if returnSessionId == "" {
		returnSessionId = latestHermesCLISessionID(agentId, query, startedAt)
	}
	if returnSessionId == "" {
		sessionID, _ := params["sessionId"].(string)
		if hermesCLISessionExists(agentId, sessionID) {
			returnSessionId = strings.TrimSpace(sessionID)
		}
	}

	cliResp := map[string]interface{}{
		"content":   cleanResponse,
		"sessionId": returnSessionId,
		"mode":      "cli",
	}
	if atts := readAttachmentsFromPaths(mediaPaths); len(atts) > 0 {
		cliResp["attachments"] = atts
	}
	return okResult(cliResp)
}

// hermesChatStreamViaCLI runs the hermes CLI and streams stdout line-by-line
// as "delta" events, emitting a final success response once the subprocess
// exits. Used for non-main profiles (HERMES_HOME scoped) and as API fallback.
func (b *BridgeHandler) hermesChatStreamViaCLI(
	ctx context.Context,
	stream *hermesStream,
	query string,
	params map[string]interface{},
	requestID, sessionKey, sessionID, clientRequestID string,
	toHub chan<- []byte,
) {
	bin := findHermesBinary()
	if bin == "" {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "Hermes binary not found",
		}, toHub)
		return
	}

	agentIdRaw, _ := params["agentId"].(string)
	agentId := normalizeHermesAgentId(agentIdRaw)
	if credentialErr := hermesProfileCredentialError(agentId); credentialErr != "" {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     credentialErr,
			"sessionId": sessionID,
			"mode":      "cli",
		}, toHub)
		return
	}

	args := []string{"chat", "-q", query, "-Q"}
	args = appendHermesCLIResumeArg(args, agentId, params)

	cmd := exec.CommandContext(ctx, bin, args...)

	env := append(os.Environ(), "PYTHONUNBUFFERED=1")
	if agentId != "" && !isHermesMainAgent(agentId) {
		profileHome, err := hermesProfileDir(agentId)
		if err != nil {
			sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
				"error": fmt.Sprintf("hermes profile dir: %v", err),
			}, toHub)
			return
		}
		filtered := make([]string, 0, len(env))
		for _, e := range env {
			if !strings.HasPrefix(e, "HERMES_HOME=") {
				filtered = append(filtered, e)
			}
		}
		env = append(filtered, "HERMES_HOME="+profileHome)
	}
	cmd.Env = env

	home, _ := os.UserHomeDir()
	cmd.Dir = home

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("stdout pipe: %v", err),
		}, toHub)
		return
	}
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("hermes CLI start: %v", err),
		}, toHub)
		return
	}
	startedAt := time.Now()

	// Expose the running process so hermes-abort can SIGKILL it.
	activeHermesStreamsMu.Lock()
	stream.cmd = cmd
	activeHermesStreamsMu.Unlock()

	if sessionID != "" {
		sendHermesStreamEvent(requestID, sessionKey, map[string]interface{}{
			"type":            "session",
			"sessionId":       sessionID,
			"mode":            "cli",
			"clientRequestId": clientRequestID,
		}, toHub)
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	var contentBuilder strings.Builder
	var returnSessionID string
	// Track whether we observed any structured JSONL event from the CLI. When
	// true, we trust the inner deltas as the canonical response stream and
	// suppress legacy line-as-delta dispatch (which would otherwise emit the
	// raw JSON envelopes as visible chat content).
	sawStructuredStream := false

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		// JSONL event protocol (preferred): hermes-agent quiet mode emits one
		// JSON object per line — {"type":"hermes_delta","delta":"..."} for
		// each token, plus {"type":"hermes_final","session_id":"..."} once at
		// the end. Parse these incrementally and dispatch the inner delta to
		// the dashboard so the user sees streaming output token by token.
		if strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}") {
			var event struct {
				Type      string `json:"type"`
				Delta     string `json:"delta"`
				SessionID string `json:"session_id"`
			}
			if err := json.Unmarshal([]byte(trimmed), &event); err == nil && event.Type != "" {
				switch event.Type {
				case "hermes_delta":
					sawStructuredStream = true
					if event.Delta == "" {
						continue
					}
					contentBuilder.WriteString(event.Delta)
					sendHermesStreamEvent(requestID, sessionKey, map[string]interface{}{
						"type":            "delta",
						"delta":           event.Delta,
						"clientRequestId": clientRequestID,
					}, toHub)
					continue
				case "hermes_final":
					sawStructuredStream = true
					if event.SessionID != "" {
						returnSessionID = event.SessionID
					}
					continue
				}
			}
		}

		if id := extractHermesSessionID(trimmed); id != "" {
			returnSessionID = id
			continue
		}
		if shouldSuppressHermesCLILine(trimmed) {
			continue
		}
		// Legacy line-based delta dispatch (older Hermes CLI versions that do
		// not emit JSONL events). Only used when no structured event has been
		// seen yet, to avoid duplicating output.
		if sawStructuredStream {
			continue
		}
		// Preserve newline in accumulated content so parseMediaTags matches the
		// non-streaming CLI output exactly.
		if contentBuilder.Len() > 0 {
			contentBuilder.WriteByte('\n')
		}
		contentBuilder.WriteString(line)
		sendHermesStreamEvent(requestID, sessionKey, map[string]interface{}{
			"type":            "delta",
			"delta":           line + "\n",
			"clientRequestId": clientRequestID,
		}, toHub)
	}
	scanErr := scanner.Err()

	waitErr := cmd.Wait()

	if ctx.Err() != nil {
		errText := "aborted"
		if ctx.Err() == context.DeadlineExceeded {
			errText = "timeout (120s)"
		}
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     errText,
			"sessionId": sessionID,
			"mode":      "cli",
		}, toHub)
		return
	}
	if waitErr != nil {
		stderr := strings.TrimSpace(stderrBuf.String())
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     fmt.Sprintf("hermes CLI error: %v — %s", waitErr, stderr),
			"sessionId": sessionID,
			"mode":      "cli",
		}, toHub)
		return
	}
	if scanErr != nil {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     fmt.Sprintf("hermes CLI scan: %v", scanErr),
			"sessionId": sessionID,
			"mode":      "cli",
		}, toHub)
		return
	}

	rawResponse := strings.TrimSpace(contentBuilder.String())
	cleanResponse, mediaPaths := parseMediaTags(rawResponse)
	resolvedSession := returnSessionID
	if resolvedSession == "" {
		resolvedSession = latestHermesCLISessionID(agentId, query, startedAt)
	}
	if resolvedSession == "" && hermesCLISessionExists(agentId, sessionID) {
		resolvedSession = sessionID
	}
	if resolvedSession != "" && resolvedSession != sessionID {
		sendHermesStreamEvent(requestID, sessionKey, map[string]interface{}{
			"type":            "session",
			"sessionId":       resolvedSession,
			"mode":            "cli",
			"clientRequestId": clientRequestID,
		}, toHub)
	}
	resp := map[string]interface{}{
		"success":   true,
		"content":   cleanResponse,
		"sessionId": resolvedSession,
		"mode":      "cli",
	}
	if atts := readAttachmentsFromPaths(mediaPaths); len(atts) > 0 {
		resp["attachments"] = atts
	}
	sendHermesStreamResponse(requestID, protocol.StatusOk, resp, toHub)
}

func (b *BridgeHandler) hermesChatStreamViaAPI(
	ctx context.Context,
	query string,
	params map[string]interface{},
	requestID, sessionKey, sessionID, clientRequestID string,
	toHub chan<- []byte,
) {
	agentIdRaw, _ := params["agentId"].(string)
	agentId := normalizeHermesAgentId(agentIdRaw)
	body := map[string]interface{}{
		"model":      "hermes-agent",
		"messages":   buildHermesChatCompletionMessages(params, query, agentId),
		"stream":     true,
		"session_id": sessionID,
	}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", hermesAPIURL()+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     fmt.Sprintf("failed to create hermes stream request: %v", err),
			"sessionId": sessionID,
			"mode":      "api",
		}, toHub)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	addHermesAPIAuth(req)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     fmt.Sprintf("hermes API stream error: %v", err),
			"sessionId": sessionID,
			"mode":      "api",
		}, toHub)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     fmt.Sprintf("hermes API returned %d: %s", resp.StatusCode, string(bodyBytes)),
			"sessionId": sessionID,
			"mode":      "api",
		}, toHub)
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	var contentBuilder strings.Builder
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		delta := extractChatCompletionDeltaContent(chunk)
		if delta == "" {
			continue
		}
		contentBuilder.WriteString(delta)
		sendHermesStreamEvent(requestID, sessionKey, map[string]interface{}{
			"type":            "delta",
			"delta":           delta,
			"sessionId":       sessionID,
			"mode":            "api",
			"clientRequestId": clientRequestID,
		}, toHub)
	}
	if ctx.Err() != nil {
		errText := "aborted"
		if ctx.Err() == context.DeadlineExceeded {
			errText = "timeout (120s)"
		}
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     errText,
			"sessionId": sessionID,
			"mode":      "api",
		}, toHub)
		return
	}
	if err := scanner.Err(); err != nil {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error":     fmt.Sprintf("hermes API stream scan: %v", err),
			"sessionId": sessionID,
			"mode":      "api",
		}, toHub)
		return
	}

	cleanContent, mediaPaths := parseMediaTags(strings.TrimSpace(contentBuilder.String()))
	respData := map[string]interface{}{
		"success":   true,
		"content":   cleanContent,
		"sessionId": sessionID,
		"mode":      "api",
	}
	if atts := readAttachmentsFromPaths(mediaPaths); len(atts) > 0 {
		respData["attachments"] = atts
	}
	sendHermesStreamResponse(requestID, protocol.StatusOk, respData, toHub)
}

// hermesAbort cancels the in-flight hermesChatStream for a sessionKey.
// Mirrors claudeCodeAbort.
func (b *BridgeHandler) hermesAbort(params map[string]interface{}) actionResult {
	sessionKey, _ := params["sessionKey"].(string)
	if sessionKey == "" {
		return errResultStatus("sessionKey is required", 400)
	}

	activeHermesStreamsMu.Lock()
	stream, ok := activeHermesStreams[sessionKey]
	if ok {
		delete(activeHermesStreams, sessionKey)
	}
	activeHermesStreamsMu.Unlock()

	if !ok {
		return okResult(map[string]interface{}{"success": true, "message": "no active stream"})
	}

	stream.cancel()
	if stream.cmd != nil && stream.cmd.Process != nil {
		_ = stream.cmd.Process.Kill()
	}
	return okResult(map[string]interface{}{"success": true})
}

type hermesAPIResponse struct {
	Content    string
	ResponseID string
}

func hermesConversationName(agentId, conversation, sessionKey, sessionID string) string {
	agentId = normalizeHermesAgentId(agentId)
	if agentId == "" {
		agentId = "main"
	}
	key := conversation
	if key == "" {
		key = sessionKey
	}
	if key == "" {
		key = sessionID
	}
	return "hyperclaw:" + agentId + ":" + key
}

func readHermesProfileInstructions(agentId string) string {
	agentId = normalizeHermesAgentId(agentId)
	if agentId == "" {
		agentId = "main"
	}
	dir, err := hermesProfileDir(agentId)
	if err != nil {
		return ""
	}
	var parts []string
	for _, name := range []string{"SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md", "TOOLS.md", "MEMORY.md"} {
		path := filepath.Join(dir, name)
		info, err := os.Stat(path)
		if err != nil || info.IsDir() || info.Size() > maxPersonalityFileBytes {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil || len(bytes.TrimSpace(data)) == 0 {
			continue
		}
		parts = append(parts, "## "+name+"\n\n"+string(data))
	}
	return strings.Join(parts, "\n\n")
}

func extractResponsesContent(result map[string]interface{}) (string, string) {
	responseID, _ := result["id"].(string)
	output, _ := result["output"].([]interface{})
	var parts []string
	for _, itemRaw := range output {
		item, _ := itemRaw.(map[string]interface{})
		if item == nil || item["type"] != "message" {
			continue
		}
		content, _ := item["content"].([]interface{})
		for _, cRaw := range content {
			c, _ := cRaw.(map[string]interface{})
			if c == nil {
				continue
			}
			if text, _ := c["text"].(string); text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n"), responseID
}

// hermesChatViaResponses uses Hermes' stateful OpenAI Responses-compatible API.
// The API server has one process-level HERMES_HOME, so Hyperclaw isolates
// multiple agents by conversation name and by layering the selected agent's
// personality files as per-request instructions.
func hermesChatViaResponses(ctx context.Context, query, agentId, conversation, sessionKey, sessionID string) (hermesAPIResponse, error) {
	body := map[string]interface{}{
		"model":        "hermes-agent",
		"input":        query,
		"conversation": hermesConversationName(agentId, conversation, sessionKey, sessionID),
		"store":        true,
		"truncation":   "auto",
	}
	if instructions := readHermesProfileInstructions(agentId); instructions != "" {
		body["instructions"] = instructions
	}

	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", hermesAPIURL()+"/v1/responses", bytes.NewReader(payload))
	if err != nil {
		return hermesAPIResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	addHermesAPIAuth(req)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return hermesAPIResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return hermesAPIResponse{}, fmt.Errorf("hermes API returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return hermesAPIResponse{}, fmt.Errorf("failed to parse hermes response: %w", err)
	}
	content, responseID := extractResponsesContent(result)
	if content == "" {
		content, _ = result["error"].(string)
	}
	return hermesAPIResponse{Content: content, ResponseID: responseID}, nil
}

func sendHermesStreamEvent(requestID, sessionKey string, event map[string]interface{}, toHub chan<- []byte) {
	msg := protocol.NewEvent("hermes-stream", map[string]interface{}{
		"requestId":  requestID,
		"sessionKey": sessionKey,
		"event":      event,
	})
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[hermes] failed to marshal stream event: %v", err)
		return
	}
	trySendOptionalToHub("hermes", toHub, data)
}

func sendHermesStreamResponse(requestID, status string, respData map[string]interface{}, toHub chan<- []byte) {
	resp := protocol.NewResponse(requestID, status, respData)
	data, err := json.Marshal(resp)
	if err != nil {
		log.Printf("[hermes] failed to marshal response: %v", err)
		return
	}
	// Final response MUST reach the hub — if we drop this, the dashboard hangs
	// until its WS timeout fires. Block up to 30s (well under hub 6-min timeout).
	trySendRequiredToHub("hermes", requestID, toHub, data)
}

// hermesChatStream streams Hermes output when possible. Non-main profiles use
// the CLI because their config, env, sessions, and memory live under their own
// HERMES_HOME.
func (b *BridgeHandler) hermesChatStream(params map[string]interface{}, requestID string, toHub chan<- []byte) {
	query := extractQuery(params)
	if query == "" {
		sendHermesStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "No query or user message provided",
		}, toHub)
		return
	}

	agentIdRaw, _ := params["agentId"].(string)
	agentId := normalizeHermesAgentId(agentIdRaw)
	sessionID, _ := params["sessionId"].(string)
	sessionID = strings.TrimSpace(sessionID)
	sessionKey, _ := params["sessionKey"].(string)
	clientRequestID, _ := params["clientRequestId"].(string)

	// Cancellable context — "hermes-abort" bridge action cancels this to kill
	// the in-flight HTTP request or CLI subprocess.
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	stream := &hermesStream{cancel: cancel}
	registerHermesStream(sessionKey, stream)
	defer unregisterHermesStream(sessionKey)

	if agentId != "" && !isHermesMainAgent(agentId) {
		b.hermesChatStreamViaCLI(ctx, stream, query, params, requestID, sessionKey, sessionID, clientRequestID, toHub)
		return
	}

	if !hermesAPIAvailable() {
		b.hermesChatStreamViaCLI(ctx, stream, query, params, requestID, sessionKey, sessionID, clientRequestID, toHub)
		return
	}

	if sessionID == "" {
		sessionID = uuid.NewString()
	}

	sendHermesStreamEvent(requestID, sessionKey, map[string]interface{}{
		"type":            "session",
		"sessionId":       sessionID,
		"mode":            "api",
		"clientRequestId": clientRequestID,
	}, toHub)

	b.hermesChatStreamViaAPI(ctx, query, params, requestID, sessionKey, sessionID, clientRequestID, toHub)
}

// listHermesProfiles returns all Hermes agent entries from SQLite.
// This reads from the agent_identity table (populated by SyncEngine) rather
// than scanning the filesystem, making it consistent with how all other
// runtimes are discovered.
func (b *BridgeHandler) listHermesProfiles() actionResult {
	if b.store == nil {
		return errResult("store not available")
	}

	all, err := b.store.ListAgentIdentities()
	if err != nil {
		return errResult("failed to list agents: " + err.Error())
	}

	var profiles []map[string]interface{}
	for _, id := range all {
		if id.Runtime != "hermes" {
			continue
		}
		profiles = append(profiles, map[string]interface{}{
			"id":      id.ID,
			"name":    id.Name,
			"runtime": "hermes",
			"status":  "idle",
			"isMain":  isHermesMainAgent(id.ID),
		})
	}
	if profiles == nil {
		profiles = []map[string]interface{}{}
	}

	return okResult(map[string]interface{}{
		"success":  true,
		"data":     map[string]interface{}{"profiles": profiles},
		"_version": "v3-sqlite",
	})
}

// hermesSessions lists recent hermes sessions from a Hermes state.db.
// Params:
//   - agentId (string): agent identifier — reads from ~/.hermes/profiles/{id}/state.db
//   - limit (float64): max sessions to return (default 20)
//   - source (string): filter by source (e.g., "cli", "telegram")
func (b *BridgeHandler) hermesSessions(params map[string]interface{}) actionResult {
	home, _ := os.UserHomeDir()

	// If an agentId is provided (and is not the main agent), use the per-profile state.db.
	// "main" and empty agentId both fall back to the root ~/.hermes/state.db.
	var dbPath string
	agentIdRaw, _ := params["agentId"].(string)
	agentIdNorm := normalizeHermesAgentId(agentIdRaw)
	if agentIdNorm != "" && !isHermesMainAgent(agentIdNorm) {
		dbPath = filepath.Join(home, ".hermes", "profiles", agentIdNorm, "state.db")
	} else {
		dbPath = filepath.Join(home, ".hermes", "state.db")
	}

	if _, err := os.Stat(dbPath); err != nil {
		return okResult(map[string]interface{}{"sessions": []interface{}{}})
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return errResult(fmt.Sprintf("failed to open hermes state.db: %v", err))
	}
	defer db.Close()

	limit := 20
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	query := `
		SELECT s.id, s.title, s.source, s.started_at, s.message_count,
		       s.model, s.estimated_cost_usd,
		       (SELECT m.content FROM messages m
		        WHERE m.session_id = s.id AND m.role = 'user'
		        ORDER BY m.timestamp ASC LIMIT 1) AS first_message
		FROM sessions s
		WHERE 1=1
	`
	args := []interface{}{}

	if source, ok := params["source"].(string); ok && source != "" {
		query += " AND s.source = ?"
		args = append(args, source)
	}

	query += " ORDER BY s.started_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return errResult(fmt.Sprintf("failed to query sessions: %v", err))
	}
	defer rows.Close()

	var sessions []map[string]interface{}
	for rows.Next() {
		var id, source string
		var title, model, firstMessage sql.NullString
		var startedAt float64
		var messageCount int
		var cost sql.NullFloat64

		if err := rows.Scan(&id, &title, &source, &startedAt, &messageCount, &model, &cost, &firstMessage); err != nil {
			continue
		}

		// Build a label: use title if set, otherwise first user message preview
		label := ""
		if title.Valid && title.String != "" {
			label = title.String
		} else if firstMessage.Valid && firstMessage.String != "" {
			label = firstMessage.String
			if len(label) > 80 {
				label = label[:80] + "..."
			}
		}

		sess := map[string]interface{}{
			"key":          id,
			"label":        label,
			"source":       source,
			"updatedAt":    int64(startedAt * 1000), // convert to ms
			"messageCount": messageCount,
		}
		if model.Valid {
			sess["model"] = model.String
		}
		if cost.Valid {
			sess["cost"] = cost.Float64
		}
		sessions = append(sessions, sess)
	}

	if sessions == nil {
		sessions = []map[string]interface{}{}
	}

	return okResult(map[string]interface{}{"sessions": sessions})
}

// hermesLoadHistory loads messages for a specific Hermes session from state.db.
// Params:
//   - sessionId (string): the Hermes session ID to load
//   - agentId (string): profile name — reads from ~/.hermes/profiles/{id}/state.db
//   - limit (number): max messages to return, newest first (default 200; 0 = all)
func (b *BridgeHandler) hermesLoadHistory(params map[string]interface{}) actionResult {
	sessionId, _ := params["sessionId"].(string)
	if sessionId == "" {
		return errResultStatus("sessionId is required", 400)
	}

	limit := 200
	if v, ok := params["limit"]; ok {
		switch n := v.(type) {
		case float64:
			limit = int(n)
		case int:
			limit = n
		}
	}

	home, _ := os.UserHomeDir()
	var dbPath string
	agentIdHistRaw, _ := params["agentId"].(string)
	agentIdHistNorm := normalizeHermesAgentId(agentIdHistRaw)
	if agentIdHistNorm != "" && !isHermesMainAgent(agentIdHistNorm) {
		dbPath = filepath.Join(home, ".hermes", "profiles", agentIdHistNorm, "state.db")
	} else {
		dbPath = filepath.Join(home, ".hermes", "state.db")
	}

	if _, err := os.Stat(dbPath); err != nil {
		return okResult(map[string]interface{}{"messages": []interface{}{}})
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return errResult(fmt.Sprintf("failed to open hermes state.db: %v", err))
	}
	defer db.Close()

	// Wrap in a subquery so we get the last `limit` messages in chronological order.
	// Without LIMIT, a long Hermes session loads the full transcript into RAM on
	// every call — including the 800ms polling during streaming.
	var (
		rows *sql.Rows
		qErr error
	)
	if limit > 0 {
		rows, qErr = db.Query(`
			SELECT id, role, content, tool_call_id, tool_calls, tool_name, timestamp, reasoning
			FROM (
				SELECT id, role, content, tool_call_id, tool_calls, tool_name, timestamp, reasoning
				FROM messages
				WHERE session_id = ?
				ORDER BY timestamp DESC
				LIMIT ?
			)
			ORDER BY timestamp ASC
		`, sessionId, limit)
	} else {
		rows, qErr = db.Query(`
			SELECT id, role, content, tool_call_id, tool_calls, tool_name, timestamp, reasoning
			FROM messages
			WHERE session_id = ?
			ORDER BY timestamp ASC
		`, sessionId)
	}
	err = qErr
	if err != nil {
		return errResult(fmt.Sprintf("failed to query messages: %v", err))
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var id int64
		var role string
		var content, toolCallId, toolCalls, toolName, reasoning sql.NullString
		var timestamp float64

		if err := rows.Scan(&id, &role, &content, &toolCallId, &toolCalls, &toolName, &timestamp, &reasoning); err != nil {
			continue
		}

		msg := map[string]interface{}{
			"id":        fmt.Sprintf("%d", id),
			"role":      role,
			"content":   content.String,
			"timestamp": int64(timestamp * 1000),
		}
		if role == "tool" {
			toolCallID := toolCallId.String
			toolLabel := toolName.String
			if toolLabel == "" {
				toolLabel = "unknown"
			}
			msg["role"] = "toolResult"
			msg["toolResults"] = []map[string]interface{}{{
				"toolCallId": toolCallID,
				"toolName":   toolLabel,
				"content":    content.String,
				"isError":    false,
			}}
			msg["toolCallId"] = toolCallID
			msg["tool_call_id"] = toolCallID
			if toolLabel != "" {
				msg["toolName"] = toolLabel
			}
			messages = append(messages, msg)
			continue
		}
		if toolCalls.Valid && toolCalls.String != "" {
			var parsed interface{}
			if err := json.Unmarshal([]byte(toolCalls.String), &parsed); err == nil {
				msg["tool_calls"] = parsed
			} else {
				msg["toolCallsRaw"] = toolCalls.String
			}
		}
		if toolCallId.Valid && toolCallId.String != "" {
			msg["toolCallId"] = toolCallId.String
			msg["tool_call_id"] = toolCallId.String
		}
		if toolName.Valid && toolName.String != "" {
			msg["toolName"] = toolName.String
		}
		if reasoning.Valid && reasoning.String != "" {
			msg["thinking"] = reasoning.String
		}
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []map[string]interface{}{}
	}

	return okResult(map[string]interface{}{"messages": messages})
}

// ── Per-profile helpers ──────────────────────────────────────────────────────

// normalizeHermesAgentId strips the "hermes:" frontend prefix if present.
// The frontend stores agents as "hermes:{id}" but the connector expects bare IDs.
func normalizeHermesAgentId(agentId string) string {
	if strings.HasPrefix(agentId, "hermes:") {
		return agentId[len("hermes:"):]
	}
	return agentId
}

// isHermesMainAgent checks whether an agentId refers to the default Hermes agent.
// Accepts both "main" (new convention) and "__main__" (legacy sync engine ID).
func isHermesMainAgent(agentId string) bool {
	return agentId == "main" || agentId == "__main__"
}

// hermesProfileDir returns the profile directory for the given agentId.
// "main" / "__main__" (or empty after normalization) maps to ~/.hermes/ (the root hermes home).
// All other IDs map to ~/.hermes/profiles/{id}/.
func hermesProfileDir(agentId string) (string, error) {
	agentId = normalizeHermesAgentId(agentId)
	if agentId == "" {
		return "", fmt.Errorf("agentId required")
	}
	home, _ := os.UserHomeDir()
	if isHermesMainAgent(agentId) {
		return filepath.Join(home, ".hermes"), nil
	}
	return filepath.Join(home, ".hermes", "profiles", agentId), nil
}

// hermesGetSoul reads SOUL.md from a profile directory.
// Params: agentId (string)
func (b *BridgeHandler) hermesGetSoul(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	dir, err := hermesProfileDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	soulPath := filepath.Join(dir, "SOUL.md")
	// Guard against runaway-write victims. A 3 GiB ReadFile pins the
	// connector at ~25 GB RSS under polling; return an explicit error
	// instead so the dashboard surfaces it.
	if info, statErr := os.Stat(soulPath); statErr == nil && info.Size() > maxPersonalityFileBytes {
		return errResult(fmt.Sprintf(
			"SOUL.md is %d bytes (> %d cap); truncate before reading",
			info.Size(), maxPersonalityFileBytes))
	}
	data, err := os.ReadFile(soulPath)
	if err != nil {
		if os.IsNotExist(err) {
			return okResult(map[string]interface{}{"content": ""})
		}
		return errResult(fmt.Sprintf("failed to read SOUL.md: %v", err))
	}
	return okResult(map[string]interface{}{"content": string(data)})
}

// hermesUpdateSoul writes SOUL.md for a profile directory.
// Params: agentId (string), content (string)
func (b *BridgeHandler) hermesUpdateSoul(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	content, _ := params["content"].(string)
	dir, err := hermesProfileDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return errResult(fmt.Sprintf("failed to create profile dir: %v", err))
	}
	soulPath := filepath.Join(dir, "SOUL.md")
	next := []byte(content)
	existing, _ := os.ReadFile(soulPath)
	if gErr := guardPersonalityWrite(soulPath, existing, next); gErr != nil {
		return errResult(gErr.Error())
	}
	if err := os.WriteFile(soulPath, next, 0644); err != nil {
		return errResult(fmt.Sprintf("failed to write SOUL.md: %v", err))
	}
	return okResult(map[string]interface{}{"success": true})
}

// hermesGetProfileConfig reads config.yaml from a profile directory.
// Returns the raw YAML as a string so the app can display/edit it.
// Params: agentId (string)
func (b *BridgeHandler) hermesGetProfileConfig(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	dir, err := hermesProfileDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	data, err := os.ReadFile(filepath.Join(dir, "config.yaml"))
	if err != nil {
		if os.IsNotExist(err) {
			return okResult(map[string]interface{}{"content": ""})
		}
		return errResult(fmt.Sprintf("failed to read config.yaml: %v", err))
	}
	return okResult(map[string]interface{}{"content": string(data)})
}

// hermesUpdateProfileConfig writes config.yaml for a profile directory.
// Params: agentId (string), content (string) — raw YAML
func (b *BridgeHandler) hermesUpdateProfileConfig(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	content, _ := params["content"].(string)
	dir, err := hermesProfileDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return errResult(fmt.Sprintf("failed to create profile dir: %v", err))
	}
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(content), 0644); err != nil {
		return errResult(fmt.Sprintf("failed to write config.yaml: %v", err))
	}
	return okResult(map[string]interface{}{"success": true})
}

// hermesListSkills returns all individual skills installed in ~/.hermes/skills/.
// Skills are stored two levels deep: skills/{category}/{skill-name}/SKILL.md.
// For profile-scoped agents the skills dir is ~/.hermes/profiles/{id}/skills/,
// but falls back to the global ~/.hermes/skills/ when the profile dir is empty.
// Params: agentId (string)
func (b *BridgeHandler) hermesListSkills(params map[string]interface{}) actionResult {
	paths := ResolvePaths()

	// Always read from the global ~/.hermes/skills/ (shared skill library).
	skillsDir := filepath.Join(paths.Hermes, "skills")

	catEntries, err := os.ReadDir(skillsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return okResult(map[string]interface{}{"skills": []interface{}{}})
		}
		return errResult(fmt.Sprintf("failed to read hermes skills dir: %v", err))
	}

	var skills []map[string]interface{}
	for _, catEntry := range catEntries {
		if !catEntry.IsDir() {
			continue
		}
		category := catEntry.Name()
		catDir := filepath.Join(skillsDir, category)
		skillEntries, _ := os.ReadDir(catDir)
		for _, skillEntry := range skillEntries {
			if !skillEntry.IsDir() {
				continue
			}
			skillKey := skillEntry.Name()
			skillMdPath := filepath.Join(catDir, skillKey, "SKILL.md")
			name, description := parseSkillMd(skillMdPath)
			if name == "" {
				name = skillKey
			}
			skills = append(skills, map[string]interface{}{
				"id":          category + "/" + skillKey,
				"name":        name,
				"skillKey":    skillKey,
				"description": description,
				"category":    category,
			})
		}
	}
	if skills == nil {
		skills = []map[string]interface{}{}
	}
	return okResult(map[string]interface{}{"skills": skills})
}

// hermesGetProfileLogs reads recent log lines from a profile's logs/ directory.
// Reads errors.log (and any other .log files) up to the last N lines.
// Params: agentId (string), limit (float64, default 200)
func (b *BridgeHandler) hermesGetProfileLogs(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	dir, err := hermesProfileDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	logsDir := filepath.Join(dir, "logs")

	limit := 200
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	entries, err := os.ReadDir(logsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return okResult(map[string]interface{}{"logs": []interface{}{}})
		}
		return errResult(fmt.Sprintf("failed to read logs dir: %v", err))
	}

	type logLine struct {
		File    string `json:"file"`
		Content string `json:"content"`
	}

	var allLines []logLine
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		data, rerr := os.ReadFile(filepath.Join(logsDir, e.Name()))
		if rerr != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				allLines = append(allLines, logLine{File: e.Name(), Content: line})
			}
		}
	}

	// Return last `limit` lines
	if len(allLines) > limit {
		allLines = allLines[len(allLines)-limit:]
	}

	result := make([]interface{}, len(allLines))
	for i, l := range allLines {
		result[i] = map[string]interface{}{"file": l.File, "content": l.Content}
	}
	return okResult(map[string]interface{}{"logs": result})
}
