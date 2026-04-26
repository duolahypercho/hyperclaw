"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Clock3 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Task } from "$/components/Tool/TodoList/types";
import {
  PROJECT_ISSUE_COLUMNS,
  type ProjectIssueStatus,
  formatIssueDate,
  formatIssueKey,
  formatRelativeIssueTime,
  getIssueAssignee,
  getIssueLabels,
  getIssuePriority,
  getIssueProgress,
} from "./project-issue-utils";

interface ProjectIssueListProps {
  issues: Task[];
  issuePrefix: string;
  onOpenIssue: (issueId: string) => void;
}

const STATUS_META: Record<ProjectIssueStatus, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  pending: { label: "Open", icon: Circle, className: "text-sky-300" },
  in_progress: { label: "In progress", icon: CircleDashed, className: "text-violet-300" },
  blocked: { label: "Blocked", icon: AlertTriangle, className: "text-amber-300" },
  completed: { label: "Done", icon: CheckCircle2, className: "text-emerald-300" },
};

export function ProjectIssueList({ issues, issuePrefix, onOpenIssue }: ProjectIssueListProps) {
  const sortedIssues = React.useMemo(
    () =>
      [...issues].sort((a, b) => {
        const aStatusIndex = PROJECT_ISSUE_COLUMNS.findIndex((column) => column.id === a.status);
        const bStatusIndex = PROJECT_ISSUE_COLUMNS.findIndex((column) => column.id === b.status);
        if (aStatusIndex !== bStatusIndex) return aStatusIndex - bStatusIndex;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [issues]
  );

  if (sortedIssues.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 p-12 text-center">
        <h3 className="text-base font-semibold text-foreground">No issues in this project yet.</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Create the first issue from the toolbar and it will appear in both board and list views.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-solid border-border/70 bg-card/60">
      <Table>
        <TableHeader>
          <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
            <TableHead className="h-10 w-[120px] text-xs">Issue</TableHead>
            <TableHead className="h-10 text-xs">Title</TableHead>
            <TableHead className="h-10 w-[150px] text-xs">Status</TableHead>
            <TableHead className="h-10 w-[120px] text-xs">Priority</TableHead>
            <TableHead className="h-10 w-[160px] text-xs">Assignee</TableHead>
            <TableHead className="h-10 w-[140px] text-xs">Due</TableHead>
            <TableHead className="h-10 w-[130px] text-xs">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedIssues.map((issue, index) => {
            const status = STATUS_META[issue.status as ProjectIssueStatus] ?? STATUS_META.pending;
            const StatusIcon = status.icon;
            const assignee = getIssueAssignee(issue);
            const labels = getIssueLabels(issue);

            return (
              <TableRow
                key={issue._id}
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
                className="cursor-pointer border-border/60 hover:bg-muted/30"
              >
                <TableCell className="py-3 text-xs font-medium text-muted-foreground">
                  {formatIssueKey(issue, index, issuePrefix)}
                </TableCell>
                <TableCell className="py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {issue.title || "Untitled issue"}
                      </span>
                      {labels.map((label) => (
                        <Badge key={label} variant="secondary" className="hidden bg-muted/50 text-[10px] text-muted-foreground md:inline-flex">
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {getIssueProgress(issue)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusIcon className={cn("h-3.5 w-3.5", status.className)} />
                    {status.label}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant={getIssuePriority(issue) === "Urgent" ? "destructive" : "outline"}
                    className="text-[10px]"
                  >
                    {getIssuePriority(issue)}
                  </Badge>
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-6 w-6 rounded-full">
                      <AvatarFallback className="rounded-full bg-primary/15 text-[10px] text-primary">
                        {assignee.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-xs text-muted-foreground">{assignee}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-xs text-muted-foreground">
                  {formatIssueDate(issue.dueDate)}
                </TableCell>
                <TableCell className="py-3 text-xs text-muted-foreground">
                  {formatRelativeIssueTime(issue.updatedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
