"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AgentMonogram } from "./agent-monogram";

type ClusterSize = "xs" | "sm" | "md";

const sizeClass: Record<ClusterSize, string> = {
  xs: "h-5 w-5 text-[8px]",
  sm: "h-6 w-6 text-[9px]",
  md: "h-8 w-8 text-[10px]",
};

interface ProjectMemberClusterProps {
  /** Stable agent ids to render — usually `project.agents`. */
  agentIds: string[];
  /** When set, the lead is rendered first so they anchor the cluster — no visual highlight. */
  leadAgentId?: string;
  /** Maximum tiles before collapsing into a "+N" overflow chip. */
  max?: number;
  size?: ClusterSize;
  className?: string;
}

/**
 * ProjectMemberCluster — overlapping crew avatars for a project card.
 *
 * Resolves each id through the live Hyperclaw roster and renders the real
 * uploaded avatar when available. Falls back to the agent's emoji, then to
 * mock-data glyphs (clio / orin / pax …) so the seeded preview state still
 * looks intentional.
 *
 * The lead is surfaced *structurally* — they're hoisted to the leading edge
 * of the cluster — but no longer visually highlighted with an accent ring.
 * On the project card we already announce the lead in the lead row above
 * the cluster, so a second ring just doubled the signal and made the card
 * feel busier than it needs to be.
 */
export function ProjectMemberCluster({
  agentIds,
  leadAgentId,
  max = 5,
  size = "sm",
  className,
}: ProjectMemberClusterProps) {
  // Lead ordering stays — it gives the cluster a stable visual anchor across
  // re-renders even though we no longer ring the lead avatar.
  const ordered = React.useMemo(() => {
    if (!leadAgentId || !agentIds.includes(leadAgentId)) return agentIds;
    return [leadAgentId, ...agentIds.filter((id) => id !== leadAgentId)];
  }, [agentIds, leadAgentId]);

  if (agentIds.length === 0) {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        no crew
      </span>
    );
  }

  const visible = ordered.slice(0, max);
  const overflow = ordered.length - visible.length;

  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      {visible.map((id) => (
        <AgentMonogram
          key={id}
          agentId={id}
          size={size}
          // Same overlap ring for every avatar. The ring only exists to
          // separate the stacked tiles against the card surface — it
          // shouldn't carry semantic weight.
          className="ring-2 ring-secondary"
          ringClassName="bg-secondary"
        />
      ))}
      {overflow > 0 && (
        <span
          title={`${overflow} more agents`}
          aria-label={`${overflow} more agents`}
          className={cn(
            "inline-flex items-center justify-center rounded-md",
            "border border-border bg-background text-muted-foreground",
            "ring-2 ring-secondary font-medium",
            sizeClass[size]
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
