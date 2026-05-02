"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Task } from "./task-types";
import { AgentGlyph, StatusDot, normalizeAgentState } from "$/components/ensemble/primitives";
import { normalizeRuntimeKind } from "$/components/ensemble/agents";
import { getAgent } from "./data";
import { getIssueAssignee, getIssueAssigneeInitials } from "./project-issue-utils";
import { useProjectAgentLookup } from "./use-agent-roster";

type MonogramSize = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<MonogramSize, string> = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[9px]",
  md: "h-6 w-6 text-[10px]",
  lg: "h-8 w-8 text-[11px]",
};

const avatarSizePx: Record<MonogramSize, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
};

interface AgentMonogramProps {
  /** A task — initials are derived from `assignedAgent` (or fallback "?"). */
  task?: Task;
  /** Canonical agent id when rendering a project member or lead directly. */
  agentId?: string;
  /** Or pass an explicit name to render from. */
  name?: string;
  /** Or pass explicit initials directly. */
  initials?: string;
  runtime?: string;
  status?: string;
  avatarData?: string;
  size?: MonogramSize;
  className?: string;
  /** Tooltip override; defaults to the assignee name. */
  title?: string;
  ringClassName?: string;
}

/**
 * Project-facing agent avatar.
 *
 * This deliberately mirrors the expanded navbar's `AgentGlyph + StatusDot`
 * composition so project cards, issue rows, and detail sidebars all use the
 * same live agent identity language.
 */
export function AgentMonogram({
  task,
  agentId,
  name,
  initials,
  runtime,
  status,
  avatarData,
  size = "sm",
  className,
  title,
  ringClassName = "bg-secondary",
}: AgentMonogramProps) {
  const lookup = useProjectAgentLookup();
  const resolvedAgentId = agentId ?? task?.assignedAgentId;
  const rosterAgent = resolvedAgentId ? lookup.get(resolvedAgentId) : undefined;
  const mockAgent = resolvedAgentId ? getAgent(resolvedAgentId) : undefined;
  const isUnassignedName = name?.trim().toLowerCase() === "unassigned";

  if (task && !task.assignedAgentId && !task.assignedAgent) {
    return null;
  }

  if (!task && !agentId && isUnassignedName) {
    return null;
  }

  if (task?.assignedAgentId && !rosterAgent && !mockAgent) {
    return null;
  }

  const resolvedName =
    name ??
    rosterAgent?.name ??
    mockAgent?.name ??
    (task ? getIssueAssignee(task) : undefined) ??
    resolvedAgentId ??
    "Agent";
  const resolvedInitials =
    initials ??
    rosterAgent?.emoji ??
    rosterAgent?.initials ??
    mockAgent?.emoji ??
    deriveInitials({ task, name: resolvedName });
  const resolvedAvatar = avatarData ?? rosterAgent?.avatarData ?? resolvedInitials;
  const resolvedRuntime = runtime ?? rosterAgent?.runtime ?? mockAgent?.kind;
  const resolvedStatus = normalizeAgentState(status ?? rosterAgent?.status ?? mockAgent?.status);
  const tooltip = title ?? resolvedName;
  const pixelSize = avatarSizePx[size];

  return (
    <span
      title={tooltip}
      role="img"
      aria-label={tooltip}
      className={cn(
        "relative inline-flex shrink-0 rounded-[5px] bg-secondary",
        sizeClass[size],
        className
      )}
    >
      <AgentGlyph
        agent={{
          id: resolvedAgentId ?? resolvedName,
          name: resolvedName,
          kind: normalizeRuntimeKind(resolvedRuntime),
          emoji: resolvedInitials,
        }}
        size={pixelSize}
        avatar={resolvedAvatar}
      />
      <StatusDot
        state={resolvedStatus}
        size={size === "lg" ? "md" : size === "xs" ? "xs" : "sm"}
        corner
        ringClassName={ringClassName}
      />
    </span>
  );
}

function deriveInitials({ task, name }: { task?: Task; name?: string }): string {
  if (task) {
    // Prefer the canonical agent's emoji glyph when available (e.g. "CL" for Clio)
    const agent = task.assignedAgentId ? getAgent(task.assignedAgentId) : undefined;
    if (agent?.emoji && /^[A-Z0-9]{1,2}$/.test(agent.emoji)) {
      return agent.emoji.toUpperCase();
    }
    return getIssueAssigneeInitials(task);
  }
  if (name) {
    const words = name.replace(/[^\w\s-]/g, " ").split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return "?";
}
