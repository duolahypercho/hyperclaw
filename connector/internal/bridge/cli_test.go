package bridge

import (
	"strings"
	"testing"
)

func TestAppendEnvOverridesReplacesExistingKeys(t *testing.T) {
	t.Parallel()

	got := appendEnvOverrides(
		[]string{
			"PATH=/usr/bin",
			"OPENCLAW_DISABLE_BUNDLED_PLUGINS=0",
			"OPENCLAW_CONFIG_PATH=/tmp/openclaw.json",
		},
		map[string]string{
			"OPENCLAW_DISABLE_BUNDLED_PLUGINS":   "1",
			"OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS": "0",
		},
	)

	seen := map[string]string{}
	for _, entry := range got {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			t.Fatalf("malformed env entry %q", entry)
		}
		if _, exists := seen[key]; exists {
			t.Fatalf("duplicate env key %q in %#v", key, got)
		}
		seen[key] = value
	}

	if seen["PATH"] != "/usr/bin" {
		t.Fatalf("PATH = %q", seen["PATH"])
	}
	if seen["OPENCLAW_CONFIG_PATH"] != "/tmp/openclaw.json" {
		t.Fatalf("OPENCLAW_CONFIG_PATH = %q", seen["OPENCLAW_CONFIG_PATH"])
	}
	if seen["OPENCLAW_DISABLE_BUNDLED_PLUGINS"] != "1" {
		t.Fatalf("OPENCLAW_DISABLE_BUNDLED_PLUGINS = %q", seen["OPENCLAW_DISABLE_BUNDLED_PLUGINS"])
	}
	if seen["OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS"] != "0" {
		t.Fatalf("OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS = %q", seen["OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS"])
	}
}
