package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestInjectOnboardingBlockIsIdempotent is the regression test for the bug
// that grew SOUL.md to 2 GiB by prepending the personality block on every
// call. Calling InjectPersonalityIntoExisting many times must not grow the
// file past the size of a single wrapped block plus any preserved tail.
func TestInjectOnboardingBlockIsIdempotent(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	personality := AgentPersonality{
		Soul: "## Doraemon\n\nDoraemon is a blue robo cat.",
	}

	// First call seeds the file.
	if err := InjectPersonalityIntoExisting(dir, personality); err != nil {
		t.Fatalf("first inject: %v", err)
	}
	soulPath := filepath.Join(dir, "SOUL.md")
	after1, err := os.ReadFile(soulPath)
	if err != nil {
		t.Fatalf("read after first inject: %v", err)
	}

	// Call many times. File must stabilize — this is the bug we're pinning.
	for i := 0; i < 50; i++ {
		if err := InjectPersonalityIntoExisting(dir, personality); err != nil {
			t.Fatalf("inject iteration %d: %v", i, err)
		}
	}
	after50, err := os.ReadFile(soulPath)
	if err != nil {
		t.Fatalf("read after 50 injects: %v", err)
	}

	if len(after50) != len(after1) {
		t.Fatalf("SOUL.md grew across repeated injects: %d -> %d bytes (should be stable)",
			len(after1), len(after50))
	}

	// Sanity: the markers we rely on for idempotency must be present.
	if !strings.Contains(string(after1), onboardingMarkerStart) {
		t.Fatalf("expected %s in SOUL.md; without it the next call will prepend instead of replace", onboardingMarkerStart)
	}
	if !strings.Contains(string(after1), onboardingMarkerEnd) {
		t.Fatalf("expected %s in SOUL.md; without it the next call will prepend instead of replace", onboardingMarkerEnd)
	}
}

// TestInjectOnboardingBlockPreservesUserContent ensures that content outside
// the marker block (things the user wrote themselves) is kept across injects.
func TestInjectOnboardingBlockPreservesUserContent(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	soulPath := filepath.Join(dir, "SOUL.md")

	// Seed with onboarding via first call.
	first := AgentPersonality{Soul: "## Doraemon\n\nDoraemon is a blue robo cat."}
	if err := InjectPersonalityIntoExisting(dir, first); err != nil {
		t.Fatalf("first inject: %v", err)
	}

	// Simulate the user appending their own section after onboarding.
	existing, err := os.ReadFile(soulPath)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	userTail := "\n\n## My Own Section\n\nHand-written content the user cares about.\n"
	if err := os.WriteFile(soulPath, append(existing, []byte(userTail)...), 0600); err != nil {
		t.Fatalf("write user tail: %v", err)
	}

	// Re-inject with updated onboarding content — user tail must survive.
	second := AgentPersonality{Soul: "## Doraemon v2\n\nUpgraded personality."}
	if err := InjectPersonalityIntoExisting(dir, second); err != nil {
		t.Fatalf("second inject: %v", err)
	}
	final, err := os.ReadFile(soulPath)
	if err != nil {
		t.Fatalf("read final: %v", err)
	}
	if !strings.Contains(string(final), "My Own Section") {
		t.Fatalf("user content was eaten by re-inject:\n%s", string(final))
	}
	if !strings.Contains(string(final), "Doraemon v2") {
		t.Fatalf("new onboarding content missing from final:\n%s", string(final))
	}
	if strings.Contains(string(final), "Doraemon is a blue robo cat") {
		t.Fatalf("old onboarding content should have been replaced, not retained:\n%s", string(final))
	}
}

// TestLoadAgentPersonalitySkipsOversizedFiles ensures a runaway-write file on
// disk cannot blow up memory the way SOUL.md once did (2 GiB × concatenation
// in BuildSystemPrompt = ~4 GiB allocated per get-agent-personality call).
func TestLoadAgentPersonalitySkipsOversizedFiles(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	soulPath := filepath.Join(dir, "SOUL.md")

	// Create a SOUL.md that exceeds the cap (cap is 1 MiB; write a bit over).
	oversized := make([]byte, maxPersonalityFileBytes+1)
	for i := range oversized {
		oversized[i] = 'x'
	}
	if err := os.WriteFile(soulPath, oversized, 0600); err != nil {
		t.Fatalf("write oversized: %v", err)
	}

	p := LoadAgentPersonality(dir, "test-agent")
	if p.Soul != "" {
		t.Fatalf("oversized SOUL.md should be skipped; got %d bytes loaded", len(p.Soul))
	}
}

// TestLoadAgentPersonalityCachesByStatSignature pins the cache behavior: a
// second call with no file changes must not re-read disk. Without the cache
// the dashboard's ~1 Hz polling re-reads and re-allocates SOUL.md every tick.
func TestLoadAgentPersonalityCachesByStatSignature(t *testing.T) {
	// NOTE: not parallel — we mutate the shared cache.
	dir := t.TempDir()
	soulPath := filepath.Join(dir, "SOUL.md")
	if err := os.WriteFile(soulPath, []byte("## Original\n"), 0600); err != nil {
		t.Fatalf("seed: %v", err)
	}

	first := LoadAgentPersonality(dir, "agent-1")
	if first.Soul == "" {
		t.Fatalf("expected SOUL loaded on first call")
	}

	// Overwrite the file on disk but keep the cache entry intact. A second
	// call should still see the cached bytes because file size and mtime
	// haven't changed relative to when we cached (same size string, different
	// bytes — the cache key is size+mtime so mtime bump will invalidate).
	// To test the cache hit path, we call again without touching the file.
	second := LoadAgentPersonality(dir, "agent-1")
	if second.Soul != first.Soul {
		t.Fatalf("cache hit should return identical value; got %q vs %q", second.Soul, first.Soul)
	}

	// Now mutate the file and confirm the cache picks up the change via the
	// stat signature. Sleep briefly so mtime advances on coarse filesystems.
	time.Sleep(10 * time.Millisecond)
	if err := os.WriteFile(soulPath, []byte("## Updated\n"), 0600); err != nil {
		t.Fatalf("update: %v", err)
	}
	third := LoadAgentPersonality(dir, "agent-1")
	if !strings.Contains(third.Soul, "Updated") {
		t.Fatalf("expected cache to invalidate on file change; got %q", third.Soul)
	}
}

// TestLoadAgentPersonalityCacheInvalidatedOnWrite ensures the write paths
// (InjectPersonalityIntoExisting, SaveAgentPersonality) drop stale cache
// entries so a read after a write never returns pre-write bytes.
func TestLoadAgentPersonalityCacheInvalidatedOnWrite(t *testing.T) {
	// NOTE: not parallel — we mutate the shared cache.
	dir := t.TempDir()

	// Seed the cache.
	_ = LoadAgentPersonality(dir, "agent-1")

	// Inject new personality and read back. Must see the new content.
	if err := InjectPersonalityIntoExisting(dir, AgentPersonality{Soul: "## Fresh\n"}); err != nil {
		t.Fatalf("inject: %v", err)
	}
	after := LoadAgentPersonality(dir, "agent-1")
	if !strings.Contains(after.Soul, "Fresh") {
		t.Fatalf("expected fresh soul after inject; got %q", after.Soul)
	}
}
