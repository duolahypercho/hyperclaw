"use client";

import * as React from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDashed,
  FileText,
  Link2,
  LockKeyhole,
  MessageSquare,
  Play,
  UserRound,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
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

interface ProjectIssueDetailProps {
  issue: Task | null;
  issueIndex: number;
  issuePrefix: string;
  projectName: string;
  projectDescription?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (issueId: string, status: ProjectIssueStatus) => void;
}

const STATUS_ICON: Record<ProjectIssueStatus, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  in_progress: CircleDashed,
  blocked: LockKeyhole,
  completed: CheckCircle2,
};

export function ProjectIssueDetail({
  issue,
  issueIndex,
  issuePrefix,
  projectName,
  projectDescription,
  open,
  onOpenChange,
  onStatusChange,
}: ProjectIssueDetailProps) {
  const [comment, setComment] = React.useState("");
  const [isPosting, setIsPosting] = React.useState(false);
  const [commentError, setCommentError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setComment("");
    setCommentError(null);
  }, [issue?._id]);

  const postComment = React.useCallback(async () => {
    if (!issue || !comment.trim()) return;
    setIsPosting(true);
    setCommentError(null);
    try {
      await bridgeInvoke("task-log-append", {
        taskId: issue._id,
        type: "comment",
        content: comment.trim(),
        metadata: { source: "project-issue-detail" },
      });
      setComment("");
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "Comment failed to post.");
    } finally {
      setIsPosting(false);
    }
  }, [comment, issue]);

  if (!issue) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full border-border bg-background sm:max-w-xl" />
      </Sheet>
    );
  }

  const statusColumn = PROJECT_ISSUE_COLUMNS.find((column) => column.id === issue.status);
  const StatusIcon = STATUS_ICON[issue.status as ProjectIssueStatus] ?? Circle;
  const assignee = getIssueAssignee(issue);
  const labels = getIssueLabels(issue);
  const totalSteps = issue.steps.completed + issue.steps.uncompleted;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden border-border bg-background p-0 sm:max-w-5xl">
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-h-0 overflow-y-auto p-6 lg:p-8">
            <SheetHeader className="mb-6 text-left">
              <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
                <span>{projectName}</span>
                <span>/</span>
                <span>{formatIssueKey(issue, issueIndex, issuePrefix)}</span>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("border-solid", statusColumn?.tone)}>
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {statusColumn?.title ?? "Open"}
                </Badge>
                <Badge variant={getIssuePriority(issue) === "Urgent" ? "destructive" : "outline"}>
                  {getIssuePriority(issue)}
                </Badge>
                {labels.map((label) => (
                  <Badge key={label} variant="secondary" className="bg-muted/60 text-muted-foreground">
                    {label}
                  </Badge>
                ))}
              </div>
              <SheetTitle className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
                {issue.title || "Untitled issue"}
              </SheetTitle>
            </SheetHeader>

            <div className="mb-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <UserRound className="h-3.5 w-3.5" />
                Opened by Hyperclaw
              </span>
              <span>Updated {formatRelativeIssueTime(issue.updatedAt)}</span>
              <span>{getIssueProgress(issue)}</span>
            </div>

            <section className="rounded-2xl border border-solid border-border/70 bg-card/50 p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Description</h3>
              {issue.description ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {issue.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No description yet. Add context from Todo or attach a workflow run.
                </p>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-solid border-border/70 bg-card/50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Subtasks</h3>
                <Badge variant="outline" className="text-[10px]">
                  {issue.steps.completed}/{totalSteps || 0}
                </Badge>
              </div>
              {totalSteps === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subtasks have been created for this issue.
                </p>
              ) : (
                <div className="space-y-2">
                  <SubtaskRow done label={`${issue.steps.completed} completed steps`} />
                  <SubtaskRow label={`${issue.steps.uncompleted} remaining steps`} />
                </div>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-solid border-border/70 bg-card/50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              {issue.linkedDocumentUrl ? (
                <a
                  href={issue.linkedDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-solid border-border bg-background/70 px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/50"
                >
                  <Link2 className="h-4 w-4 text-primary" />
                  Linked document
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No attachments yet. Linked docs from Todo will appear here.
                </p>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-solid border-border/70 bg-card/50 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Activity</h3>
              </div>
              <div className="space-y-3">
                <ActivityRow
                  title="Issue synced from Todo"
                  detail={`Status is ${statusColumn?.title ?? issue.status}. Last update ${formatRelativeIssueTime(issue.updatedAt)}.`}
                />
                {issue.assignedAgent ? (
                  <ActivityRow title={`${issue.assignedAgent} assigned`} detail="Assignee came from the shared Todo task data." />
                ) : null}
              </div>
              <div className="mt-5 space-y-3">
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Leave a project update..."
                  className="min-h-[96px] resize-none border-border/70 bg-background/70"
                />
                {commentError ? (
                  <p className="text-xs text-destructive">{commentError}</p>
                ) : null}
                <div className="flex justify-end">
                  <Button size="sm" onClick={postComment} loading={isPosting} disabled={!comment.trim()}>
                    <MessageSquare className="h-4 w-4" />
                    Comment
                  </Button>
                </div>
              </div>
            </section>
          </main>

          <aside className="min-h-0 overflow-y-auto border-l border-solid border-border/70 bg-card/35 p-5">
            <div className="mb-5 rounded-2xl border border-solid border-border/70 bg-background/55 p-4">
              <div className="mb-3 flex items-center gap-3">
                <Avatar className="h-9 w-9 rounded-full">
                  <AvatarFallback className="rounded-full bg-primary/15 text-primary">
                    {assignee.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium text-foreground">{assignee}</div>
                  <div className="text-xs text-muted-foreground">Current assignee</div>
                </div>
              </div>
              <Select
                value={issue.status}
                onValueChange={(value) => onStatusChange(issue._id, value as ProjectIssueStatus)}
              >
                <SelectTrigger className="h-9 border-border/70 bg-card/70 text-xs">
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

            <div className="space-y-1">
              <MetaRow label="Status" value={statusColumn?.title ?? issue.status} />
              <MetaRow label="Priority" value={getIssuePriority(issue)} />
              <MetaRow label="Reporter" value="Hyperclaw" />
              <MetaRow label="Due date" value={formatIssueDate(issue.dueDate)} icon={CalendarDays} />
              <MetaRow label="Project" value={projectName} />
              <MetaRow label="Workflow" value={projectDescription ? "Project workflow" : "Not linked"} />
              <MetaRow label="Updated" value={formatRelativeIssueTime(issue.updatedAt)} />
            </div>

            <div className="mt-5 rounded-2xl border border-solid border-primary/20 bg-primary/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Play className="h-4 w-4 text-primary" />
                Run workflow
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Route this issue through the project crew when a default workflow is connected.
              </p>
              <Button className="mt-4 w-full" variant="outline" size="sm" disabled>
                Workflow coming soon
              </Button>
            </div>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SubtaskRow({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-solid border-border/60 bg-background/50 px-3 py-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function ActivityRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
      <div>
        <div className="text-sm text-foreground">{title}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </span>
      <span className="max-w-[150px] truncate text-right text-foreground">{value}</span>
    </div>
  );
}
