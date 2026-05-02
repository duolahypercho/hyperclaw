package bridge

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// MergePersonalityContent computes the on-disk content for a personality
// file (SOUL.md, IDENTITY.md, USER.md, etc.) when a caller writes new
// content. The invariant: user-authored content outside the managed
// block is NEVER touched. New content always lands inside the
// HYPERCLAW AGENTIC STACK (managed) markers, so users can author their
// own SOUL.md content alongside whatever the bridge wrote and re-runs
// only swap the managed section.
//
//   - existing == "":                   write content as a fresh managed block
//   - existing has managed block:       replace just the block, preserve outside
//   - existing has no managed block:    append managed block after user content
//
// Returns the full file content the caller should persist.
func MergePersonalityContent(existing, newContent string) string {
	if hasAgenticStackBlock(newContent) {
		newContent = normalizeAgenticStackFileContent(newContent)
		if strings.TrimSpace(existing) == "" {
			return newContent
		}
		if before, body, after, ok := splitAgenticStackContent(newContent); ok {
			block := wrapAgenticStackBlock(body)
			if updated, replaced := replaceAgenticStackBlock(existing, block); replaced {
				updated = mergeOutsideAgenticStackContent(updated, before, after)
				if stripped, ok := stripRedundantAgenticStackBlock(updated); ok {
					return stripped
				}
				return updated
			}
			if isRedundantManagedPayload(existing, body) {
				return strings.TrimRight(existing, "\n") + "\n"
			}
			return appendAgenticStackBlock(existing, block)
		}
		return strings.TrimRight(newContent, "\n") + "\n"
	}
	block := wrapAgenticStackBlock(newContent)
	if strings.TrimSpace(existing) == "" {
		return block
	}
	if updated, replaced := replaceAgenticStackBlock(existing, block); replaced {
		if stripped, ok := stripRedundantAgenticStackBlock(updated); ok {
			return stripped
		}
		return updated
	}
	if isRedundantManagedPayload(existing, newContent) {
		return strings.TrimRight(existing, "\n") + "\n"
	}
	return appendAgenticStackBlock(existing, block)
}

// StripPersonalityManagedBlock removes the managed block from a
// personality file's content, returning the user-authored content alone.
// Used by uninstall paths so we leave the user's SOUL.md exactly as
// they wrote it. ok=false means there was no block to strip — the
// content is returned unchanged.
func StripPersonalityManagedBlock(existing string) (string, bool) {
	return stripAgenticStackBlock(existing)
}

// AgentPersonality holds the concatenated personality files for an agent.
type AgentPersonality struct {
	AgentID   string
	Soul      string // SOUL.md
	Identity  string // IDENTITY.md
	Agents    string // AGENTS.md
	Tools     string // TOOLS.md
	User      string // USER.md
	Heartbeat string // HEARTBEAT.md
	Memory    string // MEMORY.md
	Company   string // COMPANY.md
}

// personalityFiles lists the files to load, in order.
var personalityFiles = []struct {
	field string
	name  string
}{
	{"Soul", "SOUL.md"},
	{"Identity", "IDENTITY.md"},
	{"Agents", "AGENTS.md"},
	{"Tools", "TOOLS.md"},
	{"User", "USER.md"},
	{"Heartbeat", "HEARTBEAT.md"},
	{"Memory", "MEMORY.md"},
	{"Company", "COMPANY.md"},
}

// AgentsDir returns the base directory for agent personality storage.
// ~/.hyperclaw/agents/
func (p Paths) AgentsDir() string {
	return filepath.Join(p.HyperClaw, "agents")
}

// AgentDir returns the directory for a specific agent's personality files
// and runtime workspace. Namespaced by runtime so two agents named "main"
// under different runtimes (e.g. OpenClaw and Claude Code) don't collide.
//
// ~/.hyperclaw/agents/{runtime}-{agentId}/
//
// When runtime is empty, falls back to the legacy un-namespaced layout
// for backwards compatibility with pre-0.5.6 on-disk data.
func (p Paths) AgentDir(runtime, agentId string) string {
	runtime = strings.TrimSpace(runtime)
	agentId = strings.TrimSpace(agentId)
	if runtime == "" {
		return filepath.Join(p.AgentsDir(), agentId)
	}
	return filepath.Join(p.AgentsDir(), runtime+"-"+agentId)
}

// LegacyAgentDir returns the pre-0.5.6 un-namespaced path for an agent.
// Used by the migration helper and as a fallback for reads.
// ~/.hyperclaw/agents/{agentId}/
func (p Paths) LegacyAgentDir(agentId string) string {
	return filepath.Join(p.AgentsDir(), agentId)
}

// maxPersonalityFileBytes caps the size of any single personality file we
// will load into memory. A healthy file is a few KB; anything over 1 MB is
// almost certainly a runaway-write bug (we once shipped one that grew SOUL.md
// to 2 GiB and pinned the connector at 25 GB RSS). Refuse to load so a bad
// file on disk can't exhaust memory even when get-agent-personality is
// polled aggressively.
const maxPersonalityFileBytes = 1 << 20 // 1 MiB

// maxPersonalityWriteBytes caps the size of any single personality file we
// will write. Matches the read cap so we can't be the source of a runaway
// write ourselves. Callers that try to write more get an error back; the
// file on disk stays untouched.
const maxPersonalityWriteBytes = 1 << 20 // 1 MiB

// guardPersonalityWrite rejects writes that are obviously pathological:
// oversized payloads or self-concatenation (the existing content appears
// in the new payload TWICE AND the payload is ~doubled — the signature of
// `new = existing + sep + existing` echo loops that caused the 3 GB SOUL.md
// leak). Returns nil when the write is safe to perform.
//
// Single containment (e.g. prepending an onboarding block on top of a
// seeded template, or appending a new section) is legitimate and allowed.
func guardPersonalityWrite(path string, existing, next []byte) error {
	if len(next) > maxPersonalityWriteBytes {
		return fmt.Errorf(
			"refusing to write %s: %d bytes exceeds %d cap (runaway-write guard)",
			path, len(next), maxPersonalityWriteBytes)
	}
	// Echo loop signature: new size is at least ~2× old AND old appears in
	// new more than once. The -64 tolerance accommodates a small separator
	// between the two copies. Ignore tiny files where a coincidental double
	// match is plausible.
	if len(existing) >= 512 && len(next) >= 2*len(existing)-64 {
		count := strings.Count(string(next), string(existing))
		if count >= 2 {
			return fmt.Errorf(
				"refusing to write %s: existing %d-byte content appears %d times in new %d-byte payload — self-concat echo loop blocked",
				path, len(existing), count, len(next))
		}
	}
	return nil
}

// bytesContains is a local helper that avoids pulling in "bytes" just for this.
func bytesContains(haystack, needle []byte) bool {
	if len(needle) == 0 {
		return true
	}
	if len(needle) > len(haystack) {
		return false
	}
	return strings.Contains(string(haystack), string(needle))
}

// personalityCacheEntry memoizes a loaded personality keyed by the aggregate
// size+mtime signature of the files in agentDir. The dashboard polls
// get-agent-personality at ~1-2 Hz; without caching that is O(8) file reads
// and O(MB) allocations per tick even when nothing on disk changed.
type personalityCacheEntry struct {
	sig string
	p   AgentPersonality
}

var (
	personalityCacheMu sync.Mutex
	personalityCache   = make(map[string]personalityCacheEntry, 32)
)

// personalitySignature builds a cheap signature from the stat metadata of all
// tracked personality files. Any write (or a size cap breach for a pre-existing
// oversized file) flips the signature, invalidating the cache.
func personalitySignature(agentDir string) string {
	var sb strings.Builder
	sb.Grow(len(personalityFiles) * 48)
	for _, f := range personalityFiles {
		info, err := os.Stat(filepath.Join(agentDir, f.name))
		if err != nil {
			sb.WriteString(f.field)
			sb.WriteString(":-|")
			continue
		}
		fmt.Fprintf(&sb, "%s:%d:%d|", f.field, info.Size(), info.ModTime().UnixNano())
	}
	return sb.String()
}

// LoadAgentPersonality reads all personality files for an agent from disk.
// Results are cached by (agentDir, stat-signature); unchanged files return the
// cached value with no disk reads.
func LoadAgentPersonality(agentDir string, agentId string) AgentPersonality {
	sig := personalitySignature(agentDir)

	personalityCacheMu.Lock()
	if cached, ok := personalityCache[agentDir]; ok && cached.sig == sig {
		// AgentID may differ across callers (e.g. legacy fallbacks); copy and
		// overwrite before returning so callers always see the id they asked for.
		p := cached.p
		p.AgentID = agentId
		personalityCacheMu.Unlock()
		return p
	}
	personalityCacheMu.Unlock()

	p := AgentPersonality{AgentID: agentId}

	for _, f := range personalityFiles {
		path := filepath.Join(agentDir, f.name)
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if info.Size() > maxPersonalityFileBytes {
			fmt.Fprintf(os.Stderr,
				"[agent-personality] skipping oversized %s (%d bytes > %d cap) for agent %s\n",
				f.name, info.Size(), maxPersonalityFileBytes, agentId)
			continue
		}
		content, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		text := strings.TrimSpace(string(content))
		if text == "" {
			continue
		}
		switch f.field {
		case "Soul":
			p.Soul = text
		case "Identity":
			p.Identity = text
		case "Agents":
			p.Agents = text
		case "Tools":
			p.Tools = text
		case "User":
			p.User = text
		case "Heartbeat":
			p.Heartbeat = text
		case "Memory":
			p.Memory = text
		case "Company":
			p.Company = text
		}
	}

	personalityCacheMu.Lock()
	personalityCache[agentDir] = personalityCacheEntry{sig: sig, p: p}
	// Bound the cache. A single user has O(10) agents; 256 is slack.
	if len(personalityCache) > 256 {
		for k := range personalityCache {
			delete(personalityCache, k)
			if len(personalityCache) <= 192 {
				break
			}
		}
	}
	personalityCacheMu.Unlock()

	return p
}

// invalidatePersonalityCache drops the cached personality for the given
// agentDir. Call this after any writer that mutates files in the dir so the
// next LoadAgentPersonality picks up fresh content immediately instead of
// waiting on a stat-signature change that stat caching might miss by a tick.
func invalidatePersonalityCache(agentDir string) {
	personalityCacheMu.Lock()
	delete(personalityCache, agentDir)
	personalityCacheMu.Unlock()
}

// BuildSystemPrompt concatenates all personality files into a single system
// prompt string, following the same pattern as OpenClaw and Hermes:
// each file wrapped with a ## header, joined by double newlines.
// The runtime parameter is used to generate runtime-specific self-awareness.
func (p AgentPersonality) BuildSystemPrompt(runtime string) string {
	var parts []string

	if p.Soul != "" {
		parts = append(parts, "## SOUL.md\n\n"+p.Soul)
	}
	if p.Identity != "" {
		parts = append(parts, "## IDENTITY.md\n\n"+p.Identity)
	}
	if p.Agents != "" {
		parts = append(parts, "## AGENTS.md\n\n"+p.Agents)
	}
	if p.Tools != "" {
		parts = append(parts, "## TOOLS.md\n\n"+p.Tools)
	}
	if p.User != "" {
		parts = append(parts, "## USER.md\n\n"+p.User)
	}
	if p.Heartbeat != "" {
		parts = append(parts, "## HEARTBEAT.md\n\n"+p.Heartbeat)
	}
	if p.Memory != "" {
		parts = append(parts, "## MEMORY.md\n\n"+p.Memory)
	}
	if p.Company != "" {
		parts = append(parts, "## COMPANY.md\n\n"+p.Company)
	}

	// Always append self-awareness so the agent knows its own identity files.
	parts = append(parts, p.SelfAwareness(runtime))

	return strings.Join(parts, "\n\n")
}

// AssembleClaudeMd builds a rich CLAUDE.md from all personality files.
// Each non-empty section gets a labeled heading so Claude Code has structured
// context about the agent's personality, identity, tools, memory, etc.
func AssembleClaudeMd(p AgentPersonality) string {
	type section struct {
		heading string
		content string
	}
	sections := []section{
		{"## Agent Personality (SOUL)", p.Soul},
		{"## Identity", p.Identity},
		{"## Company Context", p.Company},
		{"## User Context", p.User},
		{"## Team (AGENTS)", p.Agents},
		{"## Tools & MCP Servers", p.Tools},
		{"## Heartbeat & Schedule", p.Heartbeat},
		{"## Memory", p.Memory},
	}
	var sb strings.Builder
	first := true
	for _, s := range sections {
		if s.content == "" {
			continue
		}
		if !first {
			sb.WriteString("\n\n---\n\n")
		}
		first = false
		sb.WriteString(s.heading)
		sb.WriteString("\n\n")
		sb.WriteString(s.content)
	}

	// Always append self-awareness for Claude Code agents.
	sb.WriteString("\n\n---\n\n")
	sb.WriteString(p.SelfAwareness("claude-code"))

	return sb.String()
}

// IsEmpty returns true if no personality files were loaded.
func (p AgentPersonality) IsEmpty() bool {
	return p.Soul == "" && p.Identity == "" && p.Agents == "" &&
		p.Tools == "" && p.User == "" && p.Heartbeat == "" && p.Memory == "" && p.Company == ""
}

// SelfAwareness returns a block that tells the agent about its own identity
// files, their locations, and that it can read or edit them. This is appended
// to every system prompt so the agent always knows where its personality lives.
func (p AgentPersonality) SelfAwareness(runtime string) string {
	agentDir := "~/.hyperclaw/agents/" + p.AgentID + "/"

	lines := []string{
		"# Self-Awareness",
		"",
		"You have identity files that define who you are. You should be aware of these files and may read or edit them when asked.",
		"",
		"| File | Purpose |",
		"|------|---------|",
		"| SOUL.md | Your personality and tone |",
		"| IDENTITY.md | Your name, emoji, and runtime |",
		"| COMPANY.md | Company context and background |",
		"| USER.md | What you know about the user |",
		"| MEMORY.md | Your persistent memories |",
		"| AGENTS.md | Your team and peer context |",
		"| TOOLS.md | Your available tools and MCP servers |",
		"| HEARTBEAT.md | Your schedule and status |",
		"",
		"**Canonical location:** `" + agentDir + "`",
	}

	switch runtime {
	case "hermes":
		lines = append(lines,
			"**Runtime location:** `~/.hermes/profiles/"+p.AgentID+"/`",
			"",
			"To edit your personality, use the write_file tool on your SOUL.md.",
			"To update user knowledge, use the memory tool.",
		)
	case "claude-code":
		lines = append(lines,
			"",
			"To edit your personality, modify SOUL.md in your agent directory.",
			"To update user knowledge, modify USER.md in your agent directory.",
		)
	case "codex":
		lines = append(lines,
			"",
			"To edit your personality, modify SOUL.md in your agent directory.",
		)
	default:
		lines = append(lines,
			"",
			"To edit your personality, modify SOUL.md in your agent directory.",
		)
	}

	return strings.Join(lines, "\n")
}

// InjectPersonalityIntoExisting merges onboarding personality content into
// existing workspace files WITHOUT overwriting them. For each file:
//   - If the file doesn't exist yet, write the full content.
//   - If the file exists, inject/replace only the onboarding section
//     (delimited by <!-- hyperclaw-onboarding --> markers) and preserve
//     everything else.
//
// Use this for default/main agents whose workspace already has content.
// Use SaveAgentPersonality for brand-new agents where no files exist yet.
func InjectPersonalityIntoExisting(agentDir string, p AgentPersonality) error {
	if err := os.MkdirAll(agentDir, 0700); err != nil {
		return fmt.Errorf("failed to create agent dir: %w", err)
	}
	defer invalidatePersonalityCache(agentDir)

	// SOUL.md: inject onboarding block while preserving existing content
	// (Core Truths, Boundaries, Vibe sections from the default template).
	if p.Soul != "" {
		soulPath := filepath.Join(agentDir, "SOUL.md")
		// Guard: if the file on disk is already pathologically large, don't
		// even read it — a 3 GiB ReadFile call is how we pinned 25 GB RSS
		// last time. Skip the inject; operator has to truncate manually.
		if info, statErr := os.Stat(soulPath); statErr == nil && info.Size() > maxPersonalityFileBytes {
			fmt.Fprintf(os.Stderr,
				"[agent-personality] skipping SOUL.md inject: on-disk file is %d bytes (> %d cap); truncate before re-provisioning\n",
				info.Size(), maxPersonalityFileBytes)
		} else {
			existing, err := os.ReadFile(soulPath)
			if err != nil {
				// File doesn't exist — write the full content wrapped in markers
				// so subsequent calls find and replace the block instead of
				// prepending a fresh copy every time.
				seed := []byte(injectOnboardingBlock("", p.Soul))
				if gErr := guardPersonalityWrite(soulPath, nil, seed); gErr != nil {
					return gErr
				}
				if err := os.WriteFile(soulPath, seed, 0600); err != nil {
					return fmt.Errorf("failed to write SOUL.md: %w", err)
				}
			} else {
				// File exists — inject the onboarding block at top, preserve the rest.
				updated := []byte(injectOnboardingBlock(string(existing), p.Soul))
				// Skip the disk write when nothing would change. Prevents log spam
				// and avoids needlessly bumping mtime when the dashboard re-polls.
				if string(updated) == string(existing) {
					// no-op
				} else {
					if gErr := guardPersonalityWrite(soulPath, existing, updated); gErr != nil {
						return gErr
					}
					if err := os.WriteFile(soulPath, updated, 0600); err != nil {
						return fmt.Errorf("failed to update SOUL.md: %w", err)
					}
				}
			}
		}
	}

	// IDENTITY.md: full replacement. The default template is just placeholders
	// ("pick something you like"), so we replace the entire file with filled-in values.
	if p.Identity != "" {
		identityPath := filepath.Join(agentDir, "IDENTITY.md")
		if err := os.WriteFile(identityPath, []byte(p.Identity), 0600); err != nil {
			return fmt.Errorf("failed to write IDENTITY.md: %w", err)
		}
	}

	// USER.md: only seed if it doesn't exist yet. Never overwrite user-edited content.
	if p.User != "" {
		userPath := filepath.Join(agentDir, "USER.md")
		if _, err := os.Stat(userPath); os.IsNotExist(err) {
			if err := os.WriteFile(userPath, []byte(p.User), 0600); err != nil {
				return fmt.Errorf("failed to write USER.md: %w", err)
			}
		}
	}

	return nil
}

const onboardingMarkerStart = "<!-- hyperclaw-onboarding:start -->"
const onboardingMarkerEnd = "<!-- hyperclaw-onboarding:end -->"

// defaultSoulBoilerplateRe matches the default Hermes/OpenClaw SOUL.md template
// header and HTML comment that ships with a fresh install. Once real personality
// is injected, this placeholder wastes tokens and should be stripped.
var defaultSoulBoilerplateRe = regexp.MustCompile(
	`(?s)#\s*(?:Hermes|OpenClaw)\s+Agent\s+Persona\s*\n\s*<!--.*?-->\s*`,
)

// injectOnboardingBlock inserts or replaces a marked onboarding section at the
// top of an existing file. Everything outside the markers is preserved.
// Also strips the default template boilerplate (header + HTML comment) since
// it's just a placeholder that wastes tokens once real personality exists.
//
// The content is always wrapped in onboardingMarkerStart/End markers so that
// subsequent calls detect and replace the block in-place instead of prepending
// a fresh copy each time. Missing markers were the cause of a bug that grew
// SOUL.md by ~1.5 KB per call until it hit a 2 GiB cap.
func injectOnboardingBlock(existing, newContent string) string {
	content := strings.TrimSpace(newContent)
	wrapped := onboardingMarkerStart + "\n" + content + "\n" + onboardingMarkerEnd

	// If the file has markers from a previous provision, replace that block.
	startIdx := strings.Index(existing, onboardingMarkerStart)
	endIdx := strings.Index(existing, onboardingMarkerEnd)

	var result string
	if startIdx >= 0 && endIdx > startIdx {
		// Replace the existing onboarding block (markers and all).
		after := existing[endIdx+len(onboardingMarkerEnd):]
		result = existing[:startIdx] + wrapped + after
	} else {
		// No existing block — prepend the wrapped content before existing content.
		// On the next call, the markers will be found and the if branch takes over,
		// so we never prepend twice.
		sep := "\n\n"
		if strings.TrimSpace(existing) == "" {
			sep = "\n"
		}
		result = wrapped + sep + existing
	}

	// Strip the default template boilerplate that ships with fresh installs.
	result = defaultSoulBoilerplateRe.ReplaceAllString(result, "")
	result = strings.TrimRight(result, "\n") + "\n"
	return result
}

// baselinePersonalityFiles are workspace files that every new agent should
// start with if available. Copied from the OpenClaw main workspace as a
// template so new agents (Claude Code, Codex, extra OpenClaw/Hermes) get
// the same starter kit.
var baselinePersonalityFiles = []string{
	"USER.md", "BOOTSTRAP.md", "HEARTBEAT.md", "TOOLS.md", "MEMORY.md", "AGENTS.md",
}

// SeedBaselineFiles copies baseline workspace files from the OpenClaw main
// workspace (~/.openclaw/workspace/) into the target agent directory. Only
// copies files that don't already exist in the target, so it never overwrites
// content that was already customized.
func SeedBaselineFiles(paths Paths, targetDir string) {
	sourceDir := filepath.Join(paths.OpenClaw, "workspace")
	if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
		return
	}
	_ = os.MkdirAll(targetDir, 0700)

	for _, name := range baselinePersonalityFiles {
		targetPath := filepath.Join(targetDir, name)
		if _, err := os.Stat(targetPath); err == nil {
			continue // already exists, don't overwrite
		}
		sourcePath := filepath.Join(sourceDir, name)
		data, err := os.ReadFile(sourcePath)
		if err != nil {
			continue // source doesn't exist
		}
		_ = os.WriteFile(targetPath, data, 0600)
	}
}

// SaveAgentPersonality writes personality files to the agent's directory.
// Creates the directory if it doesn't exist. Only writes non-empty fields.
func SaveAgentPersonality(agentDir string, p AgentPersonality) error {
	if err := os.MkdirAll(agentDir, 0700); err != nil {
		return fmt.Errorf("failed to create agent dir: %w", err)
	}
	defer invalidatePersonalityCache(agentDir)

	writes := map[string]string{
		"SOUL.md":      p.Soul,
		"IDENTITY.md":  p.Identity,
		"AGENTS.md":    p.Agents,
		"TOOLS.md":     p.Tools,
		"USER.md":      p.User,
		"HEARTBEAT.md": p.Heartbeat,
		"MEMORY.md":    p.Memory,
		"COMPANY.md":   p.Company,
	}

	for name, content := range writes {
		if content == "" {
			continue
		}
		path := filepath.Join(agentDir, name)
		// Append-only invariant: user-authored content outside our
		// managed block is preserved across every save. Same logic
		// as the SyncEngine path in saveAgentPersonality so the two
		// fallback branches stay behaviourally identical.
		existing, _ := os.ReadFile(path)
		merged := MergePersonalityContent(string(existing), content)
		next := []byte(merged)
		if gErr := guardPersonalityWrite(path, existing, next); gErr != nil {
			return gErr
		}
		if err := os.WriteFile(path, next, 0600); err != nil {
			return fmt.Errorf("failed to write %s: %w", name, err)
		}
	}
	return nil
}
