"use client";

import { useMemo } from "react";
import { usePixelOffice } from "../provider/pixelOfficeProvider";
import type { EmployeeCronJob, EmployeePreviousTask } from "../provider/pixelOfficeProvider";
import type { OfficeAgent } from "./core/types";
import type { OfficeDeskMonitor } from "./externalTypes";
import { useAgentIdentities, resolveAvatarUrl } from "$/hooks/useAgentIdentity";

export interface AgentInfo {
  id: string;
  name: string;
  status: string;
  currentTask?: string;
  currentWorkingJobs?: { id: string; name: string; schedule: string; agentId?: string }[];
  previousTasks?: EmployeePreviousTask[];
  nextComingCrons?: EmployeeCronJob[];
}

/**
 * Bright distinguishable palette — cycles through for each agent.
 */
const AGENT_COLORS = [
  "#4a90d9", "#e6a832", "#7b61ff", "#2ecc71", "#e74c3c", "#1abc9c",
  "#f39c12", "#9b59b6", "#3498db", "#e67e22", "#16a085", "#8e44ad",
];

/**
 * Adapter hook: converts Hyperclaw bridge agent data into the Claw3D
 * OfficeAgent[] format and derives all animation/hold state from bridge data.
 */
export function useClaw3DAgents() {
  const {
    agents: bridgeAgents,
    statuses: bridgeStatuses,
    currentTasks: bridgeCurrentTasks,
    officeName,
    currentWorkingJobsByAgent,
    previousTasksByAgent,
    nextComingCronsByAgent,
  } = usePixelOffice();

  // Fetch agent identities (avatar, emoji) from OpenClaw IDENTITY.md
  const agentIds = useMemo(() => bridgeAgents.map((a) => a.id), [bridgeAgents]);
  const identities = useAgentIdentities(agentIds);

  const officeAgents: OfficeAgent[] = useMemo(() => {
    return bridgeAgents.map((agent, idx) => {
      const identity = identities.get(agent.id);
      return {
        id: agent.id,
        name: agent.name || agent.id,
        status: (bridgeStatuses[agent.id] ?? "idle") as "working" | "idle" | "error",
        color: AGENT_COLORS[idx % AGENT_COLORS.length],
        item: bridgeCurrentTasks[agent.id] ?? "",
        avatarUrl: resolveAvatarUrl(identity?.avatar),
        avatarEmoji: identity?.emoji,
      };
    });
  }, [bridgeAgents, bridgeStatuses, bridgeCurrentTasks, identities]);

  /** Working agents should be held at their desks. */
  const deskHoldByAgentId = useMemo(() => {
    const holds: Record<string, boolean> = {};
    for (const agent of bridgeAgents) {
      if (bridgeStatuses[agent.id] === "working") {
        holds[agent.id] = true;
      }
    }
    return holds;
  }, [bridgeAgents, bridgeStatuses]);

  /** Build desk monitor data from bridge current tasks. */
  const monitorByAgentId = useMemo(() => {
    const monitors: Record<string, OfficeDeskMonitor> = {};
    for (const agent of bridgeAgents) {
      const status = bridgeStatuses[agent.id] ?? "idle";
      const task = bridgeCurrentTasks[agent.id] ?? "";
      const jobs = currentWorkingJobsByAgent[agent.id] ?? [];
      const isWorking = status === "working";
      monitors[agent.id] = {
        agentId: agent.id,
        agentName: agent.name || agent.id,
        mode: isWorking ? "coding" : "idle",
        title: isWorking ? (task || "Working...") : "Idle",
        subtitle: jobs.length > 0 ? jobs.map((j) => j.name).join(", ") : "",
        browserUrl: null,
        updatedAt: Date.now(),
        live: isWorking,
        entries: isWorking && task
          ? [{ kind: "assistant" as const, text: task, live: true }]
          : [],
        editor: null,
      };
    }
    return monitors;
  }, [bridgeAgents, bridgeStatuses, bridgeCurrentTasks, currentWorkingJobsByAgent]);

  /** Count of currently-working jobs per agent. */
  const runCountByAgentId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const agent of bridgeAgents) {
      const jobs = currentWorkingJobsByAgent[agent.id] ?? [];
      counts[agent.id] = jobs.length;
    }
    return counts;
  }, [bridgeAgents, currentWorkingJobsByAgent]);

  /** Last-seen timestamps: use current time for working agents, 0 for idle. */
  const lastSeenByAgentId = useMemo(() => {
    const seen: Record<string, number> = {};
    const now = Date.now();
    for (const agent of bridgeAgents) {
      seen[agent.id] = bridgeStatuses[agent.id] === "working" ? now : 0;
    }
    return seen;
  }, [bridgeAgents, bridgeStatuses]);

  const getAgentInfo = useMemo(() => {
    return (agentId: string) => {
      const agent = bridgeAgents.find((a) => a.id === agentId);
      if (!agent) return null;
      return {
        id: agent.id,
        name: agent.name || agent.id,
        status: bridgeStatuses[agent.id] ?? "idle",
        currentTask: bridgeCurrentTasks[agent.id],
        currentWorkingJobs: currentWorkingJobsByAgent[agent.id],
        previousTasks: previousTasksByAgent[agent.id],
        nextComingCrons: nextComingCronsByAgent[agent.id],
      };
    };
  }, [
    bridgeAgents,
    bridgeStatuses,
    bridgeCurrentTasks,
    currentWorkingJobsByAgent,
    previousTasksByAgent,
    nextComingCronsByAgent,
  ]);

  return {
    officeAgents,
    officeName,
    getAgentInfo,
    deskHoldByAgentId,
    monitorByAgentId,
    runCountByAgentId,
    lastSeenByAgentId,
  };
}
