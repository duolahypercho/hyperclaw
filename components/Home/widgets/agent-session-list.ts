import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";

export type AgentSessionListItem = {
  key: string;
  label?: string;
  updatedAt?: number;
  status?: string;
  trigger?: string;
  preview?: string;
};

type BridgeSession = {
  key?: string;
  id?: string;
  label?: string;
  updatedAt?: number;
  status?: string;
  kind?: string;
  trigger?: string;
  preview?: string;
  lastMessage?: string;
};

type BridgeSessionResponse = {
  sessions?: BridgeSession[];
};

export function isCronSessionKey(sessionKey: string): boolean {
  const parts = sessionKey.split(":");
  return parts.length >= 4 && parts[0] === "agent" && parts[2] === "cron" && Boolean(parts[3]);
}

export function filterDirectChatSessions(sessions: AgentSessionListItem[]): AgentSessionListItem[] {
  return sessions.filter((session) => !isCronSessionKey(session.key));
}

export async function fetchAgentSessions({
  agentId,
  backendTab,
  projectPath,
  includeDefault = true,
  limit = 100,
}: {
  agentId: string;
  backendTab: BackendTab;
  projectPath?: string;
  includeDefault?: boolean;
  limit?: number;
}): Promise<AgentSessionListItem[]> {
  const requestLimit = Math.max(limit, 50);
  let result: AgentSessionListItem[] = [];

  if (backendTab === "openclaw") {
    const response = await gatewayConnection
      .listSessions(agentId, requestLimit, { includeDefault })
      .catch(() => ({ sessions: [] as BridgeSession[] }));
    result = (response.sessions || []).map((session: BridgeSession) => ({
      ...session,
      key: session.key || session.id || "",
      label: session.label || session.key,
      trigger: session.kind || session.trigger,
      preview: session.preview || session.lastMessage,
    })).filter((session) => Boolean(session.key));
  } else if (backendTab === "claude-code") {
    const response = (await bridgeInvoke("claude-code-list-sessions", {
      agentId,
      limit: requestLimit,
      ...(projectPath ? { projectPath } : {}),
    }).catch(() => ({ sessions: [] }))) as BridgeSessionResponse;
    result = (response?.sessions || []).map((session) => ({
      key: session.key || `claude:${session.id}`,
      label: session.label || session.id?.slice(0, 8),
      updatedAt: session.updatedAt,
      status: session.status,
      trigger: session.kind || session.trigger,
      preview: session.preview,
    }));
  } else if (backendTab === "codex") {
    const response = (await bridgeInvoke("codex-list-sessions", {
      agentId,
      limit: requestLimit,
      ...(projectPath ? { projectPath } : {}),
    }).catch(() => ({ sessions: [] }))) as BridgeSessionResponse;
    result = (response?.sessions || []).map((session) => ({
      key: session.key || `codex:${session.id}`,
      label: session.label || session.id?.slice(0, 8),
      updatedAt: session.updatedAt,
      status: session.status,
      trigger: session.kind || session.trigger,
      preview: session.preview,
    }));
  } else if (backendTab === "hermes") {
    const hermesProfileId = agentId.startsWith("hermes:") ? agentId.slice(7) : agentId;
    const response = (await bridgeInvoke("hermes-sessions", {
      agentId: hermesProfileId,
    }).catch(() => ({ sessions: [] }))) as BridgeSessionResponse;
    result = (response?.sessions || []).map((session) => ({
      key: `hermes:${session.key || session.id}`,
      label: session.label || (session.key || session.id)?.slice(0, 16),
      updatedAt: session.updatedAt,
      status: session.status,
      trigger: session.kind || session.trigger,
      preview: session.preview,
    }));
  }

  return result
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit);
}
