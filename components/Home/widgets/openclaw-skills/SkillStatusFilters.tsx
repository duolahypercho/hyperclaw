"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { SkillsStatusFilter } from "./types";

type StatusTabDef = {
  id: SkillsStatusFilter;
  label: string;
};

const STATUS_TABS: StatusTabDef[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "needs-setup", label: "Needs Setup" },
  { id: "disabled", label: "Disabled" },
];

export function SkillStatusFilters({
  active,
  counts,
  onChange,
}: {
  active: SkillsStatusFilter;
  counts: Record<SkillsStatusFilter, number>;
  onChange: (filter: SkillsStatusFilter) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-solid border-border/50 bg-muted/20 p-0.5 customScrollbar2">
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-pressed={active === tab.id}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all",
            active === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground/70",
          )}
        >
          {tab.label}
          <span
            className={cn(
              "rounded-full border border-solid px-1 py-px text-[9px] tabular-nums",
              active === tab.id
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-border/50 bg-muted/40 text-muted-foreground/60",
            )}
          >
            {counts[tab.id]}
          </span>
        </button>
      ))}
    </div>
  );
}
