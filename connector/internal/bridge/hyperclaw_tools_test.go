package bridge

import "testing"

func TestHyperclawAgentListToolCompactsAvatarData(t *testing.T) {
	avatar := "data:image/png;base64,abcdef"
	payload := map[string]interface{}{
		"success": true,
		"data": []map[string]interface{}{
			{"id": "ada", "name": "Ada", "avatarData": avatar, "config": map[string]interface{}{"channels": []interface{}{}}},
			{"id": "tom", "name": "Tom"},
		},
	}

	got := hyperclawToolSuccess("hyperclaw.agents.list", payload)
	data, ok := got["data"].([]map[string]interface{})
	if !ok {
		t.Fatalf("data type = %T, want []map[string]interface{}", got["data"])
	}
	if len(data) != 2 {
		t.Fatalf("agent count = %d, want 2", len(data))
	}
	if _, ok := data[0]["avatarData"]; ok {
		t.Fatal("avatarData should be omitted from agent tool response")
	}
	if _, ok := data[0]["config"]; ok {
		t.Fatal("config should be omitted from agent tool response")
	}
	avatarMeta, ok := data[0]["avatar"].(map[string]interface{})
	if !ok {
		t.Fatalf("avatar metadata type = %T, want map[string]interface{}", data[0]["avatar"])
	}
	if avatarMeta["present"] != true {
		t.Fatalf("avatar.present = %v, want true", avatarMeta["present"])
	}
	if avatarMeta["bytes"] != len(avatar) {
		t.Fatalf("avatar.bytes = %v, want %d", avatarMeta["bytes"], len(avatar))
	}
	if avatarMeta["kind"] != "image/png" {
		t.Fatalf("avatar.kind = %v, want image/png", avatarMeta["kind"])
	}
	result, ok := got["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("result type = %T, want map[string]interface{}", got["result"])
	}
	resultData, ok := result["data"].([]map[string]interface{})
	if !ok || len(resultData) != 2 {
		t.Fatalf("result.data = %#v, want two compact agents", result["data"])
	}
	if _, ok := resultData[0]["avatarData"]; ok {
		t.Fatal("result.data avatarData should also be omitted")
	}
}

func TestHyperclawNonAgentToolKeepsPayloadUntouched(t *testing.T) {
	payload := map[string]interface{}{
		"data": map[string]interface{}{"avatarData": "data:image/png;base64,abcdef"},
	}

	got := hyperclawToolSuccess("hyperclaw.projects.list", payload)
	data, ok := got["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("data type = %T, want map[string]interface{}", got["data"])
	}
	if data["avatarData"] == "" {
		t.Fatal("non-agent tools should not compact avatarData")
	}
}
