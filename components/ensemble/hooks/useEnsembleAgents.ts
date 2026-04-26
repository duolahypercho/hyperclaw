"use client";

import { useMemo } from "react";
import { useHyperclawContext, type HyperclawAgent } from "$/Providers/HyperclawProv";
import { normalizeRuntimeKind, type RuntimeKind } from "../agents";

export interface EnsembleAgentView {
  id: string;
  name: string;
  emoji: string;
  title: string;
  department: string;
  identity: string;
  kind: RuntimeKind;
  runtimeLabel: string;
  avatarData?: string;
  status?: string;
  real: boolean;
}

function runtimeLabel(kind: RuntimeKind): string {
  switch (kind) {
    case "claude-code": return "Claude Code";
    case "codex": return "Codex";
    case "hermes": return "Hermes";
    case "code": return "Paperclip";
    default: return "OpenClaw";
  }
}

function firstCharUpper(s: string | undefined): string {
  if (!s) return "?";
  const c = s.trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

/**
 * Returns live HyperClaw agents from the connector registry as EnsembleAgentView[].
 * Returns [] when no real agents are configured yet.
 */
export function useEnsembleAgents(): EnsembleAgentView[] {
  const { agents } = useHyperclawContext();

  return useMemo<EnsembleAgentView[]>(() => {
    if (!agents || agents.length === 0) {
      return [];
    }

    return agents.map((raw: HyperclawAgent) => {
      const kind = normalizeRuntimeKind(raw.runtime);
      return {
        id: raw.id,
        name: raw.name || raw.id,
        emoji: raw.emoji || firstCharUpper(raw.name || raw.id),
        title: raw.role || runtimeLabel(kind),
        department: "Team",
        identity: raw.description || "",
        kind,
        runtimeLabel: runtimeLabel(kind),
        avatarData: raw.avatarData,
        status: raw.status,
        real: true,
      };
    });
  }, [agents]);
}

/** Look up a single agent view by id. */
export function findEnsembleAgent(
  agents: EnsembleAgentView[],
  id: string | undefined
): EnsembleAgentView | undefined {
  if (!id) return undefined;
  return agents.find((a) => a.id === id);
}
