import { describe, expect, it } from "vitest";
import { DEFAULT_FILE_TABS, getAgentProfileFileTabs } from "$/components/ensemble/views/agent-profile-files";

describe("agent profile runtime file tabs", () => {
  it("keeps identity.md out of raw file tabs for every runtime", () => {
    const runtimes = ["openclaw", "claude-code", "codex", "hermes"];

    for (const runtime of runtimes) {
      expect(getAgentProfileFileTabs(runtime).some((tab) => tab.key === "identity")).toBe(false);
    }
  });

  it("keeps OpenClaw bootstrap.md out of the raw file editor", () => {
    const tabs = getAgentProfileFileTabs("openclaw");

    expect(tabs.map((tab) => tab.label)).toEqual([
      "soul.md",
      "user.md",
      "agents.md",
      "heartbeat.md",
      "tools.md",
    ]);
    expect(tabs.some((tab) => tab.key === "bootstrap")).toBe(false);
  });

  it("shows Claude Code SOUL.md separately from compiled CLAUDE.md", () => {
    const tabs = getAgentProfileFileTabs("claude-code");

    expect(tabs.map((tab) => tab.label)).toEqual([
      "SOUL.md",
      "CLAUDE.md",
      "user.md",
    ]);
    expect(tabs.find((tab) => tab.key === "soul")?.fileKey).toBe("SOUL");
    expect(tabs.find((tab) => tab.key === "claude")?.runtimeDocFileName).toBe("CLAUDE.md");
  });

  it("shows Codex and Hermes runtime file tabs without identity.md", () => {
    expect(getAgentProfileFileTabs("codex").map((tab) => tab.label)).toEqual([
      "AGENTS.md",
      "soul.md",
      "user.md",
    ]);

    expect(getAgentProfileFileTabs("hermes").map((tab) => tab.label)).toEqual([
      "soul.md",
      "user.md",
    ]);
  });

  it("falls back to OpenClaw tabs for unknown or missing runtimes", () => {
    expect(getAgentProfileFileTabs("unknown-runtime")).toEqual(DEFAULT_FILE_TABS);
    expect(getAgentProfileFileTabs(undefined)).toEqual(DEFAULT_FILE_TABS);
  });
});
