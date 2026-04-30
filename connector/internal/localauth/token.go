// Package localauth manages the per-machine bearer token used to gate
// the connector's local HTTP listener (/bridge, /mcp, /mcp/call).
//
// One token per machine, rotated only on explicit user request. We do
// NOT rotate on every connector restart — every configured MCP client
// (Claude Code's .mcp.json, Codex's config.toml, OpenClaw's mcp.json)
// would silently fail to authenticate after each restart. Stable token
// + a `rotate` CLI verb is the operational compromise that matches what
// real users tolerate.
//
// The token file lives at ~/.hyperclaw/connector.token with mode 0600
// so other users on the box can't read it. The MCP config writers in
// agentic_stack.go inject the same value into runtime configs at install
// time so the wiring is self-contained.
package localauth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	tokenFileName    = "connector.token"
	tokenByteLength  = 32 // 256-bit secret, ample headroom for HMAC-equivalence
	tokenFileMode    = 0o600
	tokenDirFileMode = 0o700
)

// ErrMissingToken is returned when an inbound request has no Authorization
// header at all. Distinct from a wrong token so callers can degrade
// behaviour during the rollout window.
var ErrMissingToken = errors.New("missing bearer token")

// ErrInvalidToken is returned when the bearer token doesn't match. The
// HTTP middleware always responds 401 regardless of which sentinel
// fires — distinguishing them in error messages would help an attacker.
var ErrInvalidToken = errors.New("invalid bearer token")

// Manager loads, generates, and validates the connector token. Safe for
// concurrent use; the in-memory token is read under RLock and overwritten
// under Lock when rotated.
type Manager struct {
	path string

	mu    sync.RWMutex
	token string
}

// New constructs a Manager rooted at the given hyperclaw home directory
// (typically ~/.hyperclaw). It does not read or write the filesystem
// until LoadOrCreate is called.
func New(home string) *Manager {
	return &Manager{
		path: filepath.Join(home, tokenFileName),
	}
}

// Path returns the on-disk location of the token file. Callers writing
// runtime MCP configs read the file at this path so the wiring stays
// in lockstep with the live token.
func (m *Manager) Path() string {
	return m.path
}

// LoadOrCreate reads the existing token file if present, generating and
// persisting a fresh one if not. The file mode is enforced on every
// load — if a previous version of the connector wrote 0644, this call
// silently tightens to 0600.
func (m *Manager) LoadOrCreate() (string, error) {
	if err := os.MkdirAll(filepath.Dir(m.path), tokenDirFileMode); err != nil {
		return "", fmt.Errorf("ensure token dir: %w", err)
	}
	if data, err := os.ReadFile(m.path); err == nil {
		token := strings.TrimSpace(string(data))
		if token != "" {
			_ = os.Chmod(m.path, tokenFileMode)
			m.set(token)
			return token, nil
		}
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("read token: %w", err)
	}
	return m.Rotate()
}

// Rotate generates a fresh token, persists it with 0600, and returns
// the new value. Callers must restart MCP clients (or rewrite their
// configs) to pick up the new token — that's an explicit user action,
// not something the connector should hide.
func (m *Manager) Rotate() (string, error) {
	buf := make([]byte, tokenByteLength)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	if err := os.WriteFile(m.path, []byte(token), tokenFileMode); err != nil {
		return "", fmt.Errorf("write token: %w", err)
	}
	_ = os.Chmod(m.path, tokenFileMode)
	m.set(token)
	return token, nil
}

// Token returns the current token. Returns "" if LoadOrCreate hasn't
// been called yet — callers should treat that as a configuration error.
func (m *Manager) Token() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.token
}

// Verify checks an Authorization header value against the current token.
// Accepts both "Bearer <token>" and the bare token (some test scripts
// don't bother with the prefix). Constant-time compare to avoid a timing
// channel — even on localhost the discipline is cheap.
func (m *Manager) Verify(authHeader string) error {
	if authHeader == "" {
		return ErrMissingToken
	}
	value := strings.TrimSpace(authHeader)
	if value == "" {
		return ErrMissingToken
	}
	// "Bearer", "bearer ", "BEARER\t" — split on whitespace and treat
	// the first piece as the scheme. Everything after is the token. If
	// only the scheme came in, the token is missing.
	fields := strings.Fields(value)
	if len(fields) > 1 && strings.EqualFold(fields[0], "Bearer") {
		value = strings.TrimSpace(strings.Join(fields[1:], " "))
		if value == "" {
			return ErrMissingToken
		}
	} else if len(fields) == 1 && strings.EqualFold(fields[0], "Bearer") {
		return ErrMissingToken
	}
	m.mu.RLock()
	expected := m.token
	m.mu.RUnlock()
	if expected == "" {
		return ErrInvalidToken
	}
	if !constantTimeStringEqual(value, expected) {
		return ErrInvalidToken
	}
	return nil
}

func (m *Manager) set(token string) {
	m.mu.Lock()
	m.token = token
	m.mu.Unlock()
}

// constantTimeStringEqual avoids importing crypto/subtle into the package
// surface; the inline byte loop is short and readable.
func constantTimeStringEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}
