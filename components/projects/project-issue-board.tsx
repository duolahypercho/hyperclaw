"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, Circle, CircleDashed, LockKeyhole, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Task } from "$/components/Tool/TodoList/types";
import {
  PROJECT_ISSUE_COLUMNS,
  type ProjectIssueStatus,
  formatIssueDate,
  formatIssueKey,
  getIssueAssignee,
  getIssueLabels,
  getIssuePriority,
  getIssueProgress,
  groupIssuesByStatus,
} from "./project-issue-utils";

interface ProjectIssueBoardProps {
  issues: Task[];
  issuePrefix: string;
  onOpenIssue: (issueId: string) => void;
  onStatusChange: (issueId: string, status: ProjectIssueStatus) => void;
}

const STATUS_ICONS: Record<ProjectIssueStatus, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  in_progress: CircleDashed,
  blocked: LockKeyhole,
  completed: CheckCircle2,
};

export function ProjectIssueBoard({
  issues,
  issuePrefix,
  onOpenIssue,
  onStatusChange,
}: ProjectIssueBoardProps) {
  const grouped = React.useMemo(() => groupIssuesByStatus(issues), [issues]);

  return (
    <div className="grid min-h-[560px] gap-3 overflow-x-auto pb-2 lg:grid-cols-4">
      {PROJECT_ISSUE_COLUMNS.map((column) => {
        const columnIssues = grouped[column.id] ?? [];
        const Icon = STATUS_ICONS[column.id];

        return (
          <section
            key={column.id}
            className="min-w-[280px] rounded-2xl border border-solid border-border/70 bg-card/55 p-3 shadow-[0_18px_50px_-36px_rgba(0,0,0,0.8)]"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full border border-solid p-1", column.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-sm font-semibold text-foreground">{column.title}</h2>
                  <Badge variant="outline" className="border-border/80 bg-background/40 px-1.5 text-[10px]">
                    {columnIssues.length}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {column.helper}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {columnIssues.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-background/30 p-4 text-center text-xs text-muted-foreground">
                  No issues here yet.
                </div>
              ) : (
                columnIssues.map((issue, index) => (
                  <IssueCard
                    key={issue._id}
                    issue={issue}
                    index={index}
                    issuePrefix={issuePrefix}
                    onOpenIssue={onOpenIssue}
                    onStatusChange={onStatusChange}
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
  index,
  issuePrefix,
  onOpenIssue,
  onStatusChange,
}: {
  issue: Task;
  index: number;
  issuePrefix: string;
  onOpenIssue: (issueId: string) => void;
  onStatusChange: (issueId: string, status: ProjectIssueStatus) => void;
}) {
  const labels = getIssueLabels(issue);
  const priority = getIssuePriority(issue);
  const assignee = getIssueAssignee(issue);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open issue ${formatIssueKey(issue, index, issuePrefix)}: ${issue.title || "Untitled issue"}`}
      onClick={() => onOpenIssue(issue._id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenIssue(issue._id);
        }
      }}
      className="group w-full rounded-xl border border-solid border-border/70 bg-background/80 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-[0_16px_36px_-30px_rgba(190,220,255,0.45)]"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {formatIssueKey(issue, index, issuePrefix)}
          </div>
          <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {issue.title || "Untitled issue"}
          </h3>
        </div>
        <Badge variant={priority === "Urgent" ? "destructive" : "outline"} className="shrink-0 text-[10px]">
          {priority}
        </Badge>
      </div>

      {issue.description ? (
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {issue.description}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1">
        {labels.length === 0 ? (
          <Badge variant="secondary" className="bg-muted/50 text-[10px] text-muted-foreground">
            project
          </Badge>
        ) : (
          labels.map((label) => (
            <Badge key={label} variant="secondary" className="bg-muted/50 text-[10px] text-muted-foreground">
              {label}
            </Badge>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="h-6 w-6 rounded-full">
            <AvatarFallback className="rounded-full bg-primary/15 text-[10px] text-primary">
              {assignee.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{assignee}</span>
        </div>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          {issue.dueDate ? formatIssueDate(issue.dueDate) : getIssueProgress(issue)}
        </span>
      </div>

      <div
        className="mt-3"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Select
          value={issue.status}
          onValueChange={(value) => onStatusChange(issue._id, value as ProjectIssueStatus)}
        >
          <SelectTrigger className="h-7 border-border/70 bg-card/70 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_ISSUE_COLUMNS.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
