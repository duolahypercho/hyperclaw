package bridge

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

const maxSafePathTokenLen = 128

var safePathTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_-]*$`)

// ValidateAgentID rejects untrusted agent identifiers before they are used in
// filesystem paths.
func ValidateAgentID(agentID string) error {
	_, err := normalizeSafePathToken("agentId", agentID)
	return err
}

func normalizeSafePathToken(label, value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	if len(value) > maxSafePathTokenLen {
		return "", fmt.Errorf("%s is too long", label)
	}
	if filepath.IsAbs(value) || strings.ContainsAny(value, `/\`) {
		return "", fmt.Errorf("%s must be a safe basename", label)
	}
	if value == "." || value == ".." || strings.Contains(value, "..") {
		return "", fmt.Errorf("%s must not contain path traversal", label)
	}
	if !safePathTokenPattern.MatchString(value) {
		return "", fmt.Errorf("%s contains unsupported characters", label)
	}
	return value, nil
}

// SafeAgentDir returns the canonical agent directory after validating every
// caller-controlled path segment.
func (p Paths) SafeAgentDir(runtime, agentID string) (string, error) {
	agentID, err := normalizeSafePathToken("agentId", agentID)
	if err != nil {
		return "", err
	}
	runtime = strings.TrimSpace(runtime)
	if runtime == "" {
		return p.LegacyAgentDir(agentID), nil
	}
	runtime, err = normalizeSafePathToken("runtime", runtime)
	if err != nil {
		return "", err
	}
	return p.AgentDir(runtime, agentID), nil
}

// SafeLegacyAgentDir returns the legacy un-namespaced agent directory after
// validating the agent ID.
func (p Paths) SafeLegacyAgentDir(agentID string) (string, error) {
	agentID, err := normalizeSafePathToken("agentId", agentID)
	if err != nil {
		return "", err
	}
	return p.LegacyAgentDir(agentID), nil
}

func ensurePathWithinBase(base, target string) error {
	absBase, err := filepath.Abs(base)
	if err != nil {
		return err
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(absBase, absTarget)
	if err != nil {
		return err
	}
	if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return fmt.Errorf("path escapes agent directory")
	}
	return nil
}

func safeAgentFileTarget(agentDir, fileKey string) (string, string, error) {
	normalizedKey, fileName, err := normalizeAgentFileKey(fileKey)
	if err != nil {
		return "", "", err
	}
	path := filepath.Join(agentDir, fileName)
	if err := ensurePathWithinBase(agentDir, path); err != nil {
		return "", "", err
	}
	return normalizedKey, path, nil
}

func normalizeAgentFileKey(fileKey string) (string, string, error) {
	fileKey = strings.TrimSpace(fileKey)
	if fileKey == "" {
		return "", "", fmt.Errorf("fileKey is required")
	}
	if filepath.IsAbs(fileKey) || strings.ContainsAny(fileKey, `/\`) {
		return "", "", fmt.Errorf("fileKey must be a safe basename")
	}
	upper := strings.ToUpper(fileKey)
	if strings.HasSuffix(upper, ".MD") {
		upper = strings.TrimSuffix(upper, ".MD")
	}
	known := map[string]string{
		"SOUL":      "SOUL.md",
		"IDENTITY":  "IDENTITY.md",
		"AGENTS":    "AGENTS.md",
		"TOOLS":     "TOOLS.md",
		"USER":      "USER.md",
		"HEARTBEAT": "HEARTBEAT.md",
		"MEMORY":    "MEMORY.md",
		"COMPANY":   "COMPANY.md",
	}
	if fileName, ok := known[upper]; ok {
		return upper, fileName, nil
	}

	key, err := normalizeSafePathToken("fileKey", fileKey)
	if err != nil {
		return "", "", err
	}
	return key, key + ".md", nil
}
