"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import type { ProjectStatus } from "./types";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: "Live",
  paused: "Paused",
  needs: "Needs input",
  idle: "Idle",
};

const STATUS_DOT: Record<ProjectStatus, string> = {
  live: "bg-[var(--ok)] animate-pulse",
  paused: "bg-[var(--warn)]",
  needs: "bg-[var(--accent)]",
  idle: "bg-[var(--pending)]",
};

interface StatusPillProps {
  status: ProjectStatus;
  className?: string;
  showDot?: boolean;
}

/** Status pill for projects — uses Badge variants under the hood. */
export function StatusPill({ status, className, showDot = true }: StatusPillProps) {
  return (
    <Badge variant={status} className={cn("uppercase tracking-wider", className)}>
      {showDot && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])}
        />
      )}
      <span className="text-[10px]" style={{ fontFamily: "var(--mono)" }}>
        {STATUS_LABEL[status]}
      </span>
    </Badge>
  );
}
