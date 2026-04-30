"use client";

import * as React from "react";
import { useHyperclawContext, type HyperclawAgent } from "$/Providers/HyperclawProv";

/**
 * Picker-friendly projection of a single Hyperclaw agent for the Projects
 * surface. Always carries an `initials` string and a stable `name` so the
 * monogram + lead/assignee dropdowns can render without re-deriving fallbacks.
 */
export interface ProjectRosterAgent {
  id: string;
  name: string;
  /** Short label or persona/role line used as the row subtitle in pickers. */
  subtitle: string;
  emoji?: string;
  avatarData?: string;
  runtime?: string;
  status?: string;
  /** 1–2 letter monogram (e.g. "CL", "OR", "PA"). */
  initials: string;
}

function deriveInitials(name: string, fallback: string): string {
  const cleaned = (name || fallback || "?").replace(/[^\w\s-]/g, " ").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function projectAgent(agent: HyperclawAgent): ProjectRosterAgent {
  const subtitle = agent.role?.trim() || agent.runtime || "agent";
  return {
    id: agent.id,
    name: agent.name || agent.id,
    subtitle,
    emoji: agent.emoji,
    avatarData: agent.avatarData,
    runtime: agent.runtime,
    status: agent.status,
    initials: deriveInitials(agent.name || agent.id, agent.id),
  };
}

/**
 * Read-only roster of every database-backed agent the user has hired,
 * normalized for use in project pickers (lead, members, reassign). The
 * raw list comes from `useHyperclawContext().agents`, which already merges
 * SQLite + optimistic + identity patches.
 */
export function useProjectAgentRoster(): {
  agents: ProjectRosterAgent[];
  hasAgents: boolean;
  byId: Map<string, ProjectRosterAgent>;
} {
  const { agents } = useHyperclawContext();

  const projected = React.useMemo(
    () =>
      agents
        // Drop agents that are mid-delete so they don't show up as candidates.
        .filter((agent) => agent.status !== "deleting")
        .map(projectAgent),
    [agents],
  );

  const byId = React.useMemo(
    () => new Map(projected.map((agent) => [agent.id, agent])),
    [projected],
  );

  return {
    agents: projected,
    hasAgents: projected.length > 0,
    byId,
  };
}

/** Convenience accessor when only an id-keyed lookup is needed. */
export function useProjectAgentLookup(): Map<string, ProjectRosterAgent> {
  return useProjectAgentRoster().byId;
}
