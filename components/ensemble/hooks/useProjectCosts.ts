"use client";

import { useEffect, useMemo, useState } from "react";
import { loadUsageWs, type SessionsUsageResult } from "$/lib/openclaw-gateway-ws";
import type { Project } from "$/components/Tool/Projects/provider/projectsProvider";

/**
 * Real cost summary derived from OpenClaw gateway session usage data,
 * aggregated across the project's crew (lead + members).
 *
 * Sessions are not currently tagged with a `projectId` at the gateway, so we
 * attribute usage to a project via the agents on its crew. An agent shared
 * across multiple projects will count toward each — flag this as a known
 * limitation in the UI when surfacing per-project totals.
 */
export interface ProjectCostSummary {
  monthUsd: number;
  monthTokens: number;
  monthSessions: number;
  /** Average $/session this month — null when there are no sessions yet. */
  costPerSession: number | null;
  lastActivity: number | null;
}

export const EMPTY_PROJECT_COST: ProjectCostSummary = {
  monthUsd: 0,
  monthTokens: 0,
  monthSessions: 0,
  costPerSession: null,
  lastActivity: null,
};

const POLL_INTERVAL_MS = 30_000;

/** Format YYYY-MM-DD in the local timezone (matches gateway expectation). */
function toLocalDateStr(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface ProjectCostsState {
  costsByProjectId: Map<string, ProjectCostSummary>;
  loading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  /** True when the gateway returned a usable session usage payload at least once. */
  hasLiveData: boolean;
}

const EMPTY_STATE: ProjectCostsState = {
  costsByProjectId: new Map(),
  loading: false,
  error: null,
  lastSyncedAt: null,
  hasLiveData: false,
};

/**
 * Build a `Map<projectId, ProjectCostSummary>` from the gateway sessions.usage
 * payload by walking each project's crew and summing matching sessions.
 */
function aggregateByProject(
  projects: Project[],
  sessionsUsage: SessionsUsageResult | null
): Map<string, ProjectCostSummary> {
  const result = new Map<string, ProjectCostSummary>();
  const sessions = sessionsUsage?.sessions ?? [];

  // Index sessions by agentId for O(1) lookup per crew member.
  const sessionsByAgent = new Map<string, typeof sessions>();
  for (const session of sessions) {
    if (!session.agentId) continue;
    const bucket = sessionsByAgent.get(session.agentId);
    if (bucket) {
      bucket.push(session);
    } else {
      sessionsByAgent.set(session.agentId, [session]);
    }
  }

  for (const project of projects) {
    const crewIds = new Set<string>();
    if (project.leadAgentId) crewIds.add(project.leadAgentId);
    project.members?.forEach((member) => crewIds.add(member.agentId));

    let monthUsd = 0;
    let monthTokens = 0;
    let monthSessions = 0;
    let lastActivity: number | null = null;

    for (const agentId of crewIds) {
      const agentSessions = sessionsByAgent.get(agentId);
      if (!agentSessions) continue;
      for (const session of agentSessions) {
        const usage = session.usage;
        if (!usage) continue;
        monthUsd += usage.totalCost ?? 0;
        monthTokens += usage.totalTokens ?? 0;
        monthSessions += 1;
        if (usage.lastActivity && (!lastActivity || usage.lastActivity > lastActivity)) {
          lastActivity = usage.lastActivity;
        }
      }
    }

    result.set(project.id, {
      monthUsd,
      monthTokens,
      monthSessions,
      costPerSession: monthSessions > 0 ? monthUsd / monthSessions : null,
      lastActivity,
    });
  }

  return result;
}

/**
 * Fetch month-to-date OpenClaw gateway session usage and bucket per project
 * by crew membership. Polls every 30s in the background.
 */
export function useProjectCosts(projects: Project[]): ProjectCostsState {
  const [state, setState] = useState<ProjectCostsState>(EMPTY_STATE);

  // Stable membership key — only re-fetch / re-bucket when crew assignments
  // actually change. (Project renames or descriptions don't affect cost.)
  const membershipKey = useMemo(
    () =>
      projects
        .map((p) => {
          const ids = [p.leadAgentId ?? "", ...((p.members ?? []).map((m) => m.agentId))]
            .filter(Boolean)
            .sort()
            .join(",");
          return `${p.id}:${ids}`;
        })
        .sort()
        .join("|"),
    [projects]
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async (isBackground: boolean) => {
      if (!isBackground) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      }
      try {
        const now = new Date();
        const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
        const today = toLocalDateStr(now);
        const { sessionsUsage } = await loadUsageWs({
          startDate: monthStart,
          endDate: today,
          limit: 2000,
        });
        if (cancelled) return;
        const costsByProjectId = aggregateByProject(projects, sessionsUsage);
        setState({
          costsByProjectId,
          loading: false,
          error: null,
          lastSyncedAt: Date.now(),
          hasLiveData: sessionsUsage !== null,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load usage data",
        }));
      }
    };

    void fetchOnce(false);
    timer = setInterval(() => void fetchOnce(true), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipKey]);

  return state;
}
