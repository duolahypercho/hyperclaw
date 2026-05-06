import type { BackendTab } from "./GatewayChatHeader";

let lastNewChatTimestamp = 0;

export function createAgentPrimarySessionKey(agentId: string): string {
  return `agent:${agentId}:hyperclaw`;
}

export function createEnsembleDmSessionKey(agentId: string): string {
  return `ensemble:dm:${agentId}`;
}

function newChatSessionSuffix(): string {
  // Hermes treats `chat-<timestamp>` as a placeholder that should create a
  // fresh runtime session instead of trying to resume an existing session ID.
  const now = Date.now();
  lastNewChatTimestamp = now <= lastNewChatTimestamp ? lastNewChatTimestamp + 1 : now;
  return `chat-${lastNewChatTimestamp}`;
}

export function createNewChatSessionKey(agentId: string, backendTab: BackendTab): string {
  const suffix = newChatSessionSuffix();

  if (backendTab === "claude-code") {
    return `claude:${suffix}`;
  }

  if (backendTab === "codex") {
    return `codex:${suffix}`;
  }

  return `agent:${agentId}:${suffix}`;
}
