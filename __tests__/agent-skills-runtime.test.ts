import { describe, expect, it } from "vitest";
import { normalizeAgentSkillsRuntime } from "$/components/Home/widgets/agent-skills-runtime";

describe("normalizeAgentSkillsRuntime", () => {
  it("accepts canonical runtime keys", () => {
    expect(normalizeAgentSkillsRuntime("openclaw")).toBe("openclaw");
    expect(normalizeAgentSkillsRuntime("hermes")).toBe("hermes");
    expect(normalizeAgentSkillsRuntime("claude-code")).toBe("claude-code");
    expect(normalizeAgentSkillsRuntime("codex")).toBe("codex");
  });

  it("defaults missing runtime input to OpenClaw", () => {
    expect(normalizeAgentSkillsRuntime()).toBe("openclaw");
    expect(normalizeAgentSkillsRuntime("")).toBe("openclaw");
    expect(normalizeAgentSkillsRuntime("   ")).toBe("openclaw");
  });

  it("normalizes display labels used by the agent profile page", () => {
    expect(normalizeAgentSkillsRuntime("OpenClaw")).toBe("openclaw");
    expect(normalizeAgentSkillsRuntime("Hermes Agent")).toBe("hermes");
    expect(normalizeAgentSkillsRuntime("Claude Code")).toBe("claude-code");
    expect(normalizeAgentSkillsRuntime("Codex")).toBe("codex");
  });

  it("normalizes runtime aliases from bridge and connector payloads", () => {
    expect(normalizeAgentSkillsRuntime("open-claw")).toBe("openclaw");
    expect(normalizeAgentSkillsRuntime("hermes-agent")).toBe("hermes");
    expect(normalizeAgentSkillsRuntime("claude")).toBe("claude-code");
  });

  it("does not treat unsupported runtimes as OpenClaw", () => {
    expect(normalizeAgentSkillsRuntime("Paperclip")).toBe("unsupported");
    expect(normalizeAgentSkillsRuntime("code")).toBe("unsupported");
  });
});
