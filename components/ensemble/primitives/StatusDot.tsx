"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/* ─────────────────────────────────────────────────────────────────────────────
   Canonical agent status primitive.

   One component. Seven states. Three sizes. Used by navbar, AgentCard,
   EnsembleChat, RoomChatView, dashboard TeamRow, AgentProfile, StatusWidget.

   States:
     idle     — agent reachable and ready to chat (green)
     running  — agent actively in a session (green, same as idle)
     working  — agent is generating right now (amber + pulse) ← live streaming
     hiring   — agent setup is in flight (red + pulse)
     error    — agent hit an error (red)
     offline  — agent/gateway unreachable (gray)

   Sizes:
     xs (6px)  — inline dot beside text
     sm (5px inside 9px ring) — avatar-corner dot
     md (8px inside 12px ring) — header chip

   Rendering modes:
     default        — bare dot
     label          — Badge with dot + state text
     corner         — absolute-positioned on parent (e.g. avatar)
───────────────────────────────────────────────────────────────────────────── */

export type AgentState = "idle" | "running" | "working" | "hiring" | "error" | "offline" | "deleting";

interface StateMeta {
  cls: string;
  label: string;
  pulse: boolean;
}

const STATE_META: Record<AgentState, StateMeta> = {
  idle:     { cls: "bg-emerald-500",         label: "online",     pulse: false },
  running:  { cls: "bg-emerald-500",         label: "running",    pulse: false },
  working:  { cls: "bg-amber-400",           label: "generating", pulse: true  },
  hiring:   { cls: "bg-red-500",             label: "hiring",     pulse: true  },
  error:    { cls: "bg-red-500",             label: "error",      pulse: false },
  offline:  { cls: "bg-muted-foreground/40", label: "offline",    pulse: false },
  deleting: { cls: "bg-red-500",             label: "firing",     pulse: true  },
};

export type StatusDotSize = "xs" | "sm" | "md";

interface SizeMeta {
  inner: string;
  ring: string; // outer ring dimensions used in corner mode
  glow?: string;
}

const SIZE_META: Record<StatusDotSize, SizeMeta> = {
  xs: { inner: "w-1.5 h-1.5",     ring: "w-[8px] h-[8px]"  },
  sm: { inner: "w-[5px] h-[5px]", ring: "w-[9px] h-[9px]"  },
  md: { inner: "w-2 h-2",         ring: "w-3 h-3"          },
};

interface StatusDotProps {
  state: AgentState;
  /** Render a Badge with dot + state label instead of a bare dot. */
  label?: boolean;
  /** Dot size preset. Default "xs". */
  size?: StatusDotSize;
  /**
   * Absolute-position on a parent (e.g. avatar corner) with a card-colored
   * ring. Parent must be `position: relative`.
   */
  corner?: boolean;
  /** Optional background color for the corner ring (defaults to bg-card). */
  ringClassName?: string;
  className?: string;
}

export function StatusDot({
  state,
  label = false,
  size = "xs",
  corner = false,
  ringClassName,
  className,
}: StatusDotProps) {
  // Defensive: if a caller passes a stale/unknown state string (e.g. an old
  // "active" or "online" that slipped through the type system at runtime),
  // fall back to the canonical "idle" rather than crashing the render tree.
  const meta = STATE_META[state] ?? STATE_META[normalizeAgentState(state as unknown as string)];
  const sizes = SIZE_META[size] ?? SIZE_META.xs;

  const dot = (
    <span
      className={cn(
        "inline-block rounded-full",
        sizes.inner,
        meta.cls,
        meta.pulse && "animate-pulse",
      )}
      aria-label={meta.label}
    />
  );

  if (label) {
    return (
      <Badge variant="secondary" className={cn("rounded-full", className)}>
        <span className="mr-1 inline-flex">{dot}</span>
        <span className="text-foreground capitalize">{meta.label}</span>
      </Badge>
    );
  }

  if (corner) {
    return (
      <span
        className={cn(
          "absolute -bottom-[2px] -right-[2px] flex items-center justify-center rounded-full",
          ringClassName ?? "bg-card",
          sizes.ring,
          className,
        )}
        aria-label={meta.label}
      >
        {dot}
      </span>
    );
  }

  return <span className={className} aria-label={meta.label}>{dot}</span>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   String normalizer — accepts any raw connector status and maps to canonical.
   Callers that already have a resolved AgentState should NOT go through this.
───────────────────────────────────────────────────────────────────────────── */

const RUNNING_SET  = new Set(["running", "active"]);
const WORKING_SET  = new Set(["working", "generating", "in-progress", "busy", "progress", "processing"]);
const HIRING_SET   = new Set(["hiring", "pending-hire", "setting-up", "setup"]);
const ERROR_SET    = new Set(["error", "failed", "crashed", "dead"]);
const OFFLINE_SET  = new Set(["offline", "disconnected", "unreachable", "down"]);
const DELETING_SET = new Set(["deleting", "firing", "removing", "pending-delete"]);

export function normalizeAgentState(raw?: string): AgentState {
  const s = (raw ?? "").toLowerCase().trim();
  // Default = idle (online, ready to chat). Gateway-reachable agents land here.
  if (!s) return "idle";
  if (DELETING_SET.has(s)) return "deleting";
  if (HIRING_SET.has(s))   return "hiring";
  if (RUNNING_SET.has(s))  return "running";
  if (WORKING_SET.has(s))  return "working";
  if (ERROR_SET.has(s))    return "error";
  if (OFFLINE_SET.has(s))  return "offline";
  // Unknown string from the connector — treat as reachable rather than gray out.
  return "idle";
}
