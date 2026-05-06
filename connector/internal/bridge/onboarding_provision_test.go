package bridge

import "testing"

func TestShouldApplyProvisionChannelConfig(t *testing.T) {
	tests := []struct {
		name    string
		runtime string
		agentID string
		exists  bool
		want    bool
	}{
		{name: "new openclaw agent", runtime: "openclaw", agentID: "tom", exists: false, want: true},
		{name: "existing openclaw non-main", runtime: "openclaw", agentID: "tom", exists: true, want: false},
		{name: "existing openclaw main", runtime: "openclaw", agentID: "main", exists: true, want: true},
		{name: "new hermes agent", runtime: "hermes", agentID: "analyst", exists: false, want: true},
		{name: "existing hermes non-main", runtime: "hermes", agentID: "analyst", exists: true, want: false},
		{name: "existing hermes main", runtime: "hermes", agentID: "main", exists: true, want: true},
		{name: "existing non-channel runtime", runtime: "claude-code", agentID: "writer", exists: true, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldApplyProvisionChannelConfig(tt.runtime, tt.agentID, tt.exists)
			if got != tt.want {
				t.Fatalf("shouldApplyProvisionChannelConfig(%q, %q, %v) = %v, want %v", tt.runtime, tt.agentID, tt.exists, got, tt.want)
			}
		})
	}
}

func TestNormalizeHireAgentPayloadAcceptsAvatarDataAliases(t *testing.T) {
	const avatar = "data:image/png;base64,abc123"

	t.Run("avatarData maps into onboarding avatarDataUri", func(t *testing.T) {
		got := normalizeHireAgentPayload(map[string]interface{}{
			"agentId":    "designer",
			"runtime":    "claude-code",
			"name":       "Designer",
			"avatarData": avatar,
		})

		if got["avatarDataUri"] != avatar {
			t.Fatalf("avatarDataUri = %q, want %q", got["avatarDataUri"], avatar)
		}
	})

	t.Run("avatarDataUri wins when both aliases are supplied", func(t *testing.T) {
		got := normalizeHireAgentPayload(map[string]interface{}{
			"avatarData":    "data:image/png;base64,old",
			"avatarDataUri": avatar,
		})

		if got["avatarDataUri"] != avatar {
			t.Fatalf("avatarDataUri = %q, want %q", got["avatarDataUri"], avatar)
		}
	})
}

func TestHyperclawAgentsCreateSchemaExposesAvatarDataAlias(t *testing.T) {
	tool := hyperclawBuiltinTools["hyperclaw.agents.create"]
	props, ok := tool.InputSchema["properties"].(map[string]interface{})
	if !ok {
		t.Fatalf("schema properties missing or wrong type: %#v", tool.InputSchema["properties"])
	}

	if _, ok := props["avatarData"]; !ok {
		t.Fatal("hyperclaw.agents.create schema does not expose avatarData")
	}
	if _, ok := props["avatarDataUri"]; !ok {
		t.Fatal("hyperclaw.agents.create schema does not expose avatarDataUri")
	}
}
