package bridge

import (
	"strings"
	"testing"
)

func TestGuardPersonalityWrite(t *testing.T) {
	// Simulated real template content (1747 bytes like SOUL.md default)
	template := "# SOUL.md - Who You Are\n\n" + strings.Repeat("Core truth. ", 150)
	if len(template) < 1500 {
		t.Fatalf("template too small: %d", len(template))
	}

	tests := []struct {
		name      string
		existing  []byte
		next      []byte
		wantBlock bool
	}{
		{
			name:      "fresh seed (no existing)",
			existing:  nil,
			next:      []byte(template),
			wantBlock: false,
		},
		{
			name:      "prepend onboarding block to template",
			existing:  []byte(template),
			next:      []byte("## Onboarding block\nNew content.\n" + template),
			wantBlock: false,
		},
		{
			name:      "append new section to template",
			existing:  []byte(template),
			next:      []byte(template + "\n## New section\nExtra content."),
			wantBlock: false,
		},
		{
			name:      "self-concat echo loop (doubled with separator)",
			existing:  []byte(template),
			next:      []byte(template + "\n" + template),
			wantBlock: true,
		},
		{
			name:      "oversized write",
			existing:  []byte(template),
			next:      make([]byte, maxPersonalityWriteBytes+1),
			wantBlock: true,
		},
		{
			name:      "tiny file (below 512B threshold) — ignored",
			existing:  []byte("hi"),
			next:      []byte("hi\nhi"),
			wantBlock: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := guardPersonalityWrite("SOUL.md", tt.existing, tt.next)
			if (err != nil) != tt.wantBlock {
				t.Errorf("wantBlock=%v, got err=%v", tt.wantBlock, err)
			}
		})
	}
}
