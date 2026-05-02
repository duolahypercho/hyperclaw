"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "./task-types";
import { AgentMonogram } from "./agent-monogram";
import {
  PROJECT_ISSUE_COLUMNS,
  type ProjectIssueStatus,
  formatDueLabel,
  formatIssueKey,
  getIssueLabels,
  getIssuePriorityMeta,
  getIssueProgress,
  groupIssuesByStatus,
} from "./project-issue-utils";

interface ProjectIssueBoardProps {
  issues: Task[];
  issuePrefix: string;
  onOpenIssue: (issueId: string) => void;
  onCreateInColumn?: (status: ProjectIssueStatus) => void;
  /** Index resolver — keeps issue keys stable across the board even when a
   *  column is filtered down. The list and board both share the same id
   *  series ("EAR-1"…"EAR-N"), so we let the parent provide the canonical
   *  index from the project-wide issue list. */
  resolveIssueIndex: (issue: Task) => number;
}

/**
 * Board view — four narrow status columns of compact issue cards. Mirrors
 * the reference design: each column header has the status icon, title,
 * count, and a "+" affordance; cards are small (key, title, labels,
 * assignee, due/progress) with no inline status dropdown.
 */
export function ProjectIssueBoard({
  issues,
  issuePrefix,
  onOpenIssue,
  onCreateInColumn,
  resolveIssueIndex,
}: ProjectIssueBoardProps) {
  const grouped = React.useMemo(() => groupIssuesByStatus(issues), [issues]);

  return (
    <div className="grid h-full min-h-[560px] gap-4 overflow-x-auto pb-2 lg:grid-cols-4">
      {PROJECT_ISSUE_COLUMNS.map((column) => {
        const columnIssues = grouped[column.id] ?? [];
        const Icon = column.icon;

        return (
          <section
            key={column.id}
            className="bg-secondary flex min-w-[240px] flex-col rounded-xl border border-solid border-border/70 bg-card/40"
          >
            <header className="flex items-center justify-between border-b border-l-0 border-r-0 border-t-0 border-solid border-border px-3 py-2.5">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
                <Icon className={cn("h-3.5 w-3.5", column.iconClass)} />
                <span>{column.title}</span>
                <span className="text-[11px] font-normal text-muted-foreground/80">
                  {columnIssues.length}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Add issue to ${column.title}`}
                onClick={() => onCreateInColumn?.(column.id)}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="flex-1 space-y-2 p-2">
              {columnIssues.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onCreateInColumn?.(column.id)}
                  className="w-full rounded-lg border border-dashed border-border/70 bg-transparent px-3 py-6 text-center text-[11.5px] text-muted-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  + Add issue
                </button>
              ) : (
                columnIssues.map((issue) => (
                  <IssueCard
                    key={issue._id}
                    issue={issue}
                    issuePrefix={issuePrefix}
                    issueIndex={resolveIssueIndex(issue)}
                    onOpenIssue={onOpenIssue}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function IssueCard({
  issue,
  issuePrefix,
  issueIndex,
  onOpenIssue,
}: {
  issue: Task;
  issuePrefix: string;
  issueIndex: number;
  onOpenIssue: (issueId: string) => void;
}) {
  const labels = getIssueLabels(issue);
  const priority = getIssuePriorityMeta(issue);
  const due = formatDueLabel(issue.dueDate);
  const progress = getIssueProgress(issue);
  const issueKey = formatIssueKey(issue, issueIndex, issuePrefix);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open issue ${issueKey}: ${issue.title || "Untitled issue"}`}
      onClick={() => onOpenIssue(issue._id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenIssue(issue._id);
        }
      }}
      className="group w-full cursor-pointer rounded-lg border border-solid border-border/70 bg-background/95 p-3 text-left transition-colors hover:border-foreground/30"
    >
      {/* Top: issue key + priority dot */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span
          className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          {issueKey}
        </span>
        <PriorityChip rank={priority.rank} dotClass={priority.dotClass} />
      </div>

      {/* Title */}
      <h3 className="line-clamp-2 text-[13px] font-normal leading-snug tracking-tight text-foreground">
        {issue.title || "Untitled issue"}
      </h3>

      {/* Labels */}
      {labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <LabelPill key={label} label={label} />
          ))}
        </div>
      ) : null}

      {/* Bottom: assignee + due/progress.
          Unassigned issues render no avatar at all (the previous "?" glyph
          read as actionable on hover and added noise to a card that is
          otherwise quiet). The meta text is anchored with `ml-auto` so the
          right edge stays put even when the avatar slot is empty. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        {issue.assignedAgentId || issue.assignedAgent ? (
          <AgentMonogram task={issue} size="sm" />
        ) : null}
        <span
          className="ml-auto truncate text-[11px] text-muted-foreground"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          {progress.label && due
            ? `${progress.label} · ${due}`
            : progress.label || due || ""}
        </span>
      </div>
    </div>
  );
}

export function PriorityChip({
  rank,
  dotClass,
}: {
  rank: string;
  dotClass: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground border border-solid border-border rounded-sm px-1.5 py-0.5"
      style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden />
      {rank}
    </span>
  );
}

export function LabelPill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded border border-border border-solid px-1.5 py-0.5 text-[10px] text-muted-foreground"
      style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
    >
      {label}
    </span>
  );
}
