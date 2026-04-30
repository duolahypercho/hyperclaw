"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SkillStatusEntry } from "./types";
import { skillStatusClass } from "./skill-helpers";

const SOURCE_BADGE_STYLES: Record<string, string> = {
  "openclaw-workspace": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  "openclaw-bundled": "border-violet-500/20 bg-violet-500/10 text-violet-400",
  "openclaw-managed": "border-blue-500/20 bg-blue-500/10 text-blue-400",
  "openclaw-extra": "border-amber-500/20 bg-amber-500/10 text-amber-400",
};

const SOURCE_LABELS: Record<string, string> = {
  "openclaw-workspace": "workspace",
  "openclaw-bundled": "built-in",
  "openclaw-managed": "installed",
  "openclaw-extra": "extra",
  "agents-skills-personal": "personal",
  "agents-skills-project": "project",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-1.5 h-1.5 rounded-full shrink-0",
        status === "ok" && "bg-emerald-400",
        status === "warn" && "bg-amber-400",
        status === "muted" && "bg-muted-foreground/30",
      )}
    />
  );
}

export function OpenClawSkillCard({
  skill,
  busy,
  onToggle,
  onClick,
}: {
  skill: SkillStatusEntry;
  busy?: boolean;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onClick: (skillKey: string) => void;
}) {
  const status = skillStatusClass(skill);
  const sourceLabel = SOURCE_LABELS[skill.source] ?? skill.source;
  const badgeStyle =
    SOURCE_BADGE_STYLES[skill.source] ??
    "border-border/60 bg-muted/40 text-muted-foreground";

  return (
    <div
      onClick={() => onClick(skill.skillKey)}
      className={cn(
        "group flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-solid px-3 py-2.5 transition-all duration-200",
        !skill.disabled
          ? "border-border/70 bg-card/70 shadow-sm hover:border-primary/30"
          : "border-border/50 bg-muted/20 opacity-70 hover:opacity-90",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-solid transition-colors",
          !skill.disabled
            ? "border-primary/10 bg-primary/10"
            : "border-border/40 bg-muted/30",
        )}
      >
        {skill.emoji ? (
          <span className="text-sm">{skill.emoji}</span>
        ) : (
          <BookOpen
            className={cn(
              "h-3.5 w-3.5",
              !skill.disabled ? "text-primary" : "text-muted-foreground",
            )}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <StatusDot status={status} />
          <p className="min-w-0 truncate text-xs font-medium leading-tight text-foreground">
            {skill.name}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full border border-solid px-1.5 py-px text-[9px] font-medium",
              badgeStyle,
            )}
          >
            {sourceLabel}
          </span>
        </div>
        {skill.description && (
          <p className="mt-1 line-clamp-2 min-w-0 max-w-full pl-3 text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
            {skill.description}
          </p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Switch
          checked={!skill.disabled}
          disabled={busy}
          onCheckedChange={(checked) => onToggle(skill.skillKey, checked)}
          aria-label={`${skill.disabled ? "Enable" : "Disable"} ${skill.name}`}
          className="scale-75"
        />
      </div>
    </div>
  );
}
