"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  X,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SkillStatusEntry } from "./types";
import {
  computeSkillMissing,
  computeSkillReasons,
  skillStatusClass,
} from "./skill-helpers";

export function SkillDetailDialog({
  skill,
  busy,
  onToggle,
  onClose,
}: {
  skill: SkillStatusEntry;
  busy?: boolean;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onClose: () => void;
}) {
  const status = skillStatusClass(skill);
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);
  const showBundledBadge = Boolean(
    skill.bundled && skill.source !== "openclaw-bundled",
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${skill.name} skill details`}
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-solid border-border/60 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-solid border-border/50 bg-background/40 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                status === "ok" && "bg-emerald-400",
                status === "warn" && "bg-amber-400",
                status === "muted" && "bg-muted-foreground/30",
              )}
            />
            {skill.emoji && (
              <span className="text-lg shrink-0">{skill.emoji}</span>
            )}
            <h3 className="text-sm font-semibold truncate">{skill.name}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="customScrollbar2 flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {skill.description}
          </p>

          {/* Status chips */}
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-solid border-border/60 bg-muted/40 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
              {skill.source}
            </span>
            {showBundledBadge && (
              <span className="rounded-full border border-solid border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-medium text-violet-400">
                bundled
              </span>
            )}
            <span
              className={cn(
                "rounded-full border border-solid px-2 py-0.5 text-[9px] font-medium",
                skill.eligible
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-400",
              )}
            >
              {skill.eligible ? "eligible" : "blocked"}
            </span>
            {skill.disabled && (
              <span className="rounded-full border border-solid border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-400">
                disabled
              </span>
            )}
          </div>

          {/* Missing requirements */}
          {missing.length > 0 && (
            <div className="rounded-lg border border-solid border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-400">
                  Missing requirements
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {missing.map((m) => (
                  <code
                    key={m}
                    className="text-[9px] font-mono bg-amber-500/10 text-amber-300 px-1.5 py-px rounded"
                  >
                    {m}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Reasons */}
          {reasons.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Reason: {reasons.join(", ")}
            </p>
          )}

          {/* Toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={!skill.disabled}
              disabled={busy}
              onCheckedChange={(checked) => onToggle(skill.skillKey, checked)}
              aria-label={`${skill.disabled ? "Enable" : "Disable"} ${skill.name}`}
            />
            <span className="text-xs font-medium">
              {skill.disabled ? "Disabled" : "Enabled"}
            </span>
          </div>

          {/* Metadata */}
          <div className="flex flex-col gap-1.5 border-t border-solid border-border/40 pt-3 text-[10px] text-muted-foreground/70">
            <div>
              <span className="font-semibold text-muted-foreground/90">
                Source:
              </span>{" "}
              {skill.source}
            </div>
            <div className="font-mono break-all">{skill.filePath}</div>
            {skill.homepage && (
              <a
                href={skill.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary/70 hover:text-primary"
              >
                <ExternalLink className="w-3 h-3" />
                {skill.homepage}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
