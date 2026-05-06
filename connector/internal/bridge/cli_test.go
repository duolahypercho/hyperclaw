package bridge

import (
	"fmt"
	"strings"
	"testing"
)

func TestOpenClawCommandFailureMessagePrefersTimeout(t *testing.T) {
	err := fmt.Errorf("%w after 15m0s", errOpenClawCommandTimedOut)
	got := openClawCommandFailureMessage(
		"[plugins] staging bundled runtime deps",
		"[plugins] plugins.allow is empty",
		err,
	)

	if !strings.Contains(got, "command timed out after 15m0s") {
		t.Fatalf("expected timeout to be preserved, got %q", got)
	}
	if !strings.Contains(got, "plugins.allow is empty") {
		t.Fatalf("expected stderr context to be preserved, got %q", got)
	}
}

func TestOpenClawCommandFailureMessageUsesStderrForExitStatus(t *testing.T) {
	got := openClawCommandFailureMessage("stdout text", "Config invalid", fmt.Errorf("exit status 1"))
	if got != "Config invalid" {
		t.Fatalf("got %q, want stderr", got)
	}
}

func TestOpenClawCommandFailureMessageUsesStdoutWhenStderrEmpty(t *testing.T) {
	got := openClawCommandFailureMessage("stdout text", "", fmt.Errorf("exit status 1"))
	if got != "stdout text" {
		t.Fatalf("got %q, want stdout", got)
	}
}
