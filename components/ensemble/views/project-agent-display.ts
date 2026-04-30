import type { HyperclawAgent } from "$/Providers/HyperclawProv";
import type { EnsembleAgent, RuntimeKind } from "$/components/ensemble";
import { normalizeRealAgentEmoji } from "../primitives/agent-avatar-utils";

type ProjectAgentInput = Partial<HyperclawAgent> & Partial<Pick<EnsembleAgent, "kind">>;

const RUNTIME_KIND_BY_ID: Record<string, RuntimeKind> = {
  "claude-code": "claude-code",
  openclaw: "openclaw",
  code: "code",
  codex: "codex",
  hermes: "hermes",
};

export function resolveProjectAgentDisplay(agent: ProjectAgentInput | undefined, fallbackId?: string) {
  const id = agent?.id || fallbackId || "agent";
  const name = agent?.name || id;
  const kind = agent?.kind ?? (agent?.runtime ? RUNTIME_KIND_BY_ID[agent.runtime] : undefined);

  return {
    id,
    name,
    emoji: agent ? normalizeRealAgentEmoji(agent.emoji, name) : "🤖",
    kind,
    real: Boolean(agent),
  };
}
