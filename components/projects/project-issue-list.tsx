"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "./task-types";
import { AgentMonogram } from "./agent-monogram";
import { LabelPill, PriorityChip } from "./project-issue-board";
import {
  PROJECT_ISSUE_COLUMNS,
  type ProjectIssueColumn,
  formatDueLabel,
  formatIssueKey,
  getIssueLabels,
  getIssuePriorityMeta,
  getIssueProgress,
  groupIssuesByStatus,
} from "./project-issue-utils";

interface ProjectIssueListProps {
  issues: Task[];
  issuePrefix: string;
  onOpenIssue: (issueId: string) => void;
  resolveIssueIndex: (issue: Task) => number;
}

/**
 * List view — collapsible groups by status (Open / In progress / Blocked /
 * Done) with a single dense row per issue. Mirrors the reference design's
 * editorial-feeling table: no chrome, just a thin separator between rows.
 */
export function ProjectIssueList({
  issues,
  issuePrefix,
  onOpenIssue,
  resolveIssueIndex,
}: ProjectIssueListProps) {
  const grouped = React.useMemo(() => groupIssuesByStatus(issues), [issues]);

  // Collapsed state per column. Default: all open.
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggle = React.useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-12 text-center">
        <h3 className="text-sm font-medium text-foreground">No issues yet.</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Create the first issue and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {PROJECT_ISSUE_COLUMNS.map((column) => {
        const columnIssues = grouped[column.id] ?? [];
        if (columnIssues.length === 0) return null;
        const isCollapsed = !!collapsed[column.id];

        return (
          <section key={column.id}>
            <ListGroupHeader
              column={column}
              count={columnIssues.length}
              collapsed={isCollapsed}
              onToggle={() => toggle(column.id)}
            />
            {!isCollapsed ? (
              <ul className="divide-y divide-border/60 border-b border-border/60">
                {columnIssues.map((issue) => (
                  <ListIssueRow
                    key={issue._id}
                    issue={issue}
                    issuePrefix={issuePrefix}
                    issueIndex={resolveIssueIndex(issue)}
                    onOpenIssue={onOpenIssue}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ListGroupHeader({
  column,
  count,
  collapsed,
  onToggle,
}: {
  column: ProjectIssueColumn;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = column.icon;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-2 border-b border-border/60 py-2 text-left transition-colors hover:bg-muted/30"
    >
      <Chevron className="h-3 w-3 text-muted-foreground/70" />
      <Icon className={cn("h-3.5 w-3.5", column.iconClass)} />
      <span className="text-[12.5px] font-medium text-foreground">
        {column.title}
      </span>
      <span className="text-[11px] font-normal text-muted-foreground/80">
        {count}
      </span>
    </button>
  );
}

function ListIssueRow({
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
    <li>
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
        className="grid cursor-pointer grid-cols-[88px_44px_1fr_auto] items-center gap-3 px-1 py-2 transition-colors hover:bg-muted/30"
      >
        {/* Issue key */}
        <span
          className="truncate text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          {issueKey}
        </span>

        {/* Priority chip (just the dot + rank) */}
        <PriorityChip rank={priority.rank} dotClass={priority.dotClass} />

        {/* Title */}
        <span className="truncate text-[13px] font-medium text-foreground">
          {issue.title || "Untitled issue"}
        </span>

        {/* Right-side cluster: labels · due/progress · monogram */}
        <div className="flex items-center gap-3 justify-self-end">
          {labels.length > 0 ? (
            <div className="hidden items-center gap-1 md:flex">
              {labels.map((label) => (
                <LabelPill key={label} label={label} />
              ))}
            </div>
          ) : null}

          <span
            className="hidden whitespace-nowrap text-[11px] text-muted-foreground sm:inline"
            style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {due && progress.label
              ? `${due} ${progress.label}`
              : due || progress.label || ""}
          </span>

          <AgentMonogram task={issue} size="sm" />
        </div>
      </div>
    </li>
  );
}
