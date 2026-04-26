export type AgentSkillsRuntime =
  | "openclaw"
  | "hermes"
  | "claude-code"
  | "codex"
  | "unsupported";

export function normalizeAgentSkillsRuntime(runtime?: string): AgentSkillsRuntime {
  if (!runtime?.trim()) return "openclaw";

  const key = runtime
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");

  if (key === "openclaw" || key === "open-claw") return "openclaw";
  if (key === "hermes" || key === "hermes-agent") return "hermes";
  if (key === "claude" || key === "claude-code") return "claude-code";
  if (key === "codex") return "codex";
  return "unsupported";
}
