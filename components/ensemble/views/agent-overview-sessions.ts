import type { OverviewSession } from "$/components/Home/widgets/AgentOverviewTab";
import type { RuntimeKind } from "$/components/ensemble/agents";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";

type LoadAgentOverviewSessionsParams = {
  agentId: string;
  runtime: RuntimeKind | "";
  projectPath?: string;
};

type RuntimeSession = {
  id?: string;
  key?: string;
  label?: string;
  createdAt?: number;
  updatedAt?: number;
  status?: string;
  preview?: string;
  model?: string;
  modelProvider?: string;
  thinkingLevel?: string;
};

export async function loadAgentOverviewSessions({
  agentId,
  runtime,
  projectPath,
}: LoadAgentOverviewSessionsParams): Promise<OverviewSession[]> {
  let result: OverviewSession[] = [];

  if (runtime === "openclaw") {
    const response = await gatewayConnection
      .listSessions(agentId, 50, { includeDefault: false })
      .catch(() => ({ sessions: [] }));

    result = (response?.sessions || []).map((session) => ({
      key: session.key || `agent:${agentId}:main`,
      label: session.label || session.key?.split(":").pop(),
      updatedAt: session.updatedAt,
      status: session.status,
      preview: session.preview,
    }));
  } else if (runtime === "claude-code") {
    const response = (await bridgeInvoke("claude-code-list-sessions", {
      agentId,
      limit: 50,
      ...(projectPath ? { projectPath } : {}),
    }).catch(() => ({ sessions: [] }))) as { sessions?: RuntimeSession[] };

    result = (response?.sessions || []).map((session) => ({
      key: session.key || `claude:${session.id}`,
      label: session.label || session.id?.slice(0, 8),
      updatedAt: session.updatedAt,
      status: session.status,
      preview: session.preview,
    }));
  } else if (runtime === "codex") {
    const response = (await bridgeInvoke("codex-list-sessions", {
      agentId,
      limit: 50,
      ...(projectPath ? { projectPath } : {}),
    }).catch(() => ({ sessions: [] }))) as { sessions?: RuntimeSession[] };

    result = (response?.sessions || []).map((session) => ({
      key: session.key || `codex:${session.id}`,
      label: session.label || session.id?.slice(0, 8),
      updatedAt: session.updatedAt,
      status: session.status,
      preview: session.preview,
    }));
  } else if (runtime === "hermes") {
    const hermesProfileId = agentId.startsWith("hermes:") ? agentId.slice(7) : agentId;
    const response = (await bridgeInvoke("hermes-sessions", {
      agentId: hermesProfileId,
    }).catch(() => ({ sessions: [] }))) as { sessions?: RuntimeSession[] };

    result = (response?.sessions || []).flatMap((session) => {
      const sessionRef = session.key || session.id;
      if (!sessionRef) return [];
      return [{
        key: `hermes:${sessionRef}`,
        label: session.label || sessionRef.slice(0, 16),
        updatedAt: session.updatedAt,
        status: session.status,
        preview: session.preview,
      }];
    });
  }

  return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
