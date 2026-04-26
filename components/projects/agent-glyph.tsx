"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AGENT_KINDS, getAgent } from "./data";
import type { AgentKindId } from "./types";

type GlyphSize = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<GlyphSize, string> = {
  xs: "h-5 w-5 text-[8px]",
  sm: "h-6 w-6 text-[9px]",
  md: "h-8 w-8 text-[10px]",
  lg: "h-10 w-10 text-[12px]",
};

interface AgentGlyphProps {
  /** Either an agent id (resolves the kind) or an explicit kind. */
  agentId?: string;
  kind?: AgentKindId;
  size?: GlyphSize;
  /** Override the rendered glyph (e.g. emoji). Defaults to kind glyph. */
  label?: string;
  className?: string;
  title?: string;
}

/**
 * AgentGlyph — a small monogram tile that represents an agent or agent kind.
 * Uses the `glyph-*` classes from ensemble.css for the grayscale ramp.
 */
export function AgentGlyph({
  agentId,
  kind,
  size = "sm",
  label,
  className,
  title,
}: AgentGlyphProps) {
  const agent = agentId ? getAgent(agentId) : undefined;
  const resolvedKind: AgentKindId = kind ?? agent?.kind ?? "claude";
  const meta = AGENT_KINDS[resolvedKind];
  const text = label ?? agent?.emoji ?? meta.glyph;
  const tooltip = title ?? agent?.name ?? meta.label;

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold",
        "text-white tracking-tight select-none ring-1 ring-black/5",
        meta.cls,
        sizeClass[size],
        className
      )}
      style={{ fontFamily: "var(--mono)" }}
    >
      {text}
    </span>
  );
}

interface AgentClusterProps {
  agentIds: string[];
  max?: number;
  size?: GlyphSize;
  className?: string;
}

/** A horizontal stack of overlapping agent glyphs ("crew avatars"). */
export function AgentCluster({
  agentIds,
  max = 5,
  size = "sm",
  className,
}: AgentClusterProps) {
  const visible = agentIds.slice(0, max);
  const overflow = agentIds.length - visible.length;

  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      {visible.map((id) => (
        <AgentGlyph
          key={id}
          agentId={id}
          size={size}
          className="ring-2 ring-[var(--paper-2)]"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md",
            "border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-3)]",
            "ring-2 ring-[var(--paper-2)] font-medium",
            sizeClass[size]
          )}
          style={{ fontFamily: "var(--mono)" }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
