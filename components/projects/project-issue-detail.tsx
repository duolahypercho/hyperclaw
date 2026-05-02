"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckSquare,
  ChevronDown,
  Link2,
  Paperclip,
  Play,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { Task } from "./task-types";
import { AgentMonogram } from "./agent-monogram";
import { LabelPill, PriorityChip } from "./project-issue-board";
import { getAgent } from "./data";
import type { ProjectRosterAgent } from "./use-agent-roster";
import {
  PROJECT_ISSUE_COLUMNS,
  type ProjectIssueStatus,
  formatDueLabel,
  formatIssueDateAbsolute,
  formatIssueKey,
  formatRelativeIssueTime,
  getIssueAssignee,
  getIssueLabels,
  getIssuePriorityMeta,
  getStatusMeta,
} from "./project-issue-utils";

export type ProjectIssueSubtaskAssignment =
  | { type: "agent"; agentId: string; agentName: string }
  | { type: "none" };

interface ProjectIssueDetailProps {
  issue: Task;
  issueIndex: number;
  issuePrefix: string;
  projectName: string;
  projectDescription?: string;
  workflowName?: string;
  reporterName?: string;
  onClose: () => void;
  onStatusChange: (issueId: string, status: ProjectIssueStatus) => void;
  /** Adds a new checklist item/subtask to the issue. */
  onAddSubtask?: (
    issueId: string,
    title: string,
    assignment?: ProjectIssueSubtaskAssignment
  ) => Promise<void> | void;
  /** Database-backed agents available for the assignee picker. */
  rosterAgents?: ProjectRosterAgent[];
  /** Persists the new assignee for this issue. */
  onReassign?: (issueId: string, agentId: string) => void;
}

/**
 * Full-page issue detail. Two-column editorial layout:
 *  - Left: header (key, status pill, priority chip, labels, title), opener
 *    line, description, subtasks, activity feed, comment composer
 *  - Right: a stack of small, alignment-locked metadata rows (status,
 *    priority, assignee, reporter, due date, project, workflow, labels) and
 *    a "Run a workflow" callout card
 *
 * The component is intentionally framework-light — no Sheet, no Dialog. The
 * workspace renders this in place when ?issue= is set in the URL, and the
 * top-of-content breadcrumb provides the back affordance.
 */
export function ProjectIssueDetail({
  issue,
  issueIndex,
  issuePrefix,
  projectName,
  projectDescription,
  workflowName,
  reporterName = "Hyperclaw",
  onClose,
  onStatusChange,
  onAddSubtask,
  rosterAgents = [],
  onReassign,
}: ProjectIssueDetailProps) {
  const [comment, setComment] = React.useState("");
  const [isPosting, setIsPosting] = React.useState(false);
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [isAddingSubtask, setIsAddingSubtask] = React.useState(false);
  const [isSubmittingSubtask, setIsSubmittingSubtask] = React.useState(false);
  const [subtaskTitle, setSubtaskTitle] = React.useState("");
  const [subtaskAgentId, setSubtaskAgentId] = React.useState<string | null>(null);
  const [subtaskAssigneeTouched, setSubtaskAssigneeTouched] = React.useState(false);
  const [subtaskError, setSubtaskError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setComment("");
    setCommentError(null);
    setIsAddingSubtask(false);
    setIsSubmittingSubtask(false);
    setSubtaskTitle("");
    setSubtaskAgentId(null);
    setSubtaskAssigneeTouched(false);
    setSubtaskError(null);
  }, [issue._id]);

  const issueKey = formatIssueKey(issue, issueIndex, issuePrefix);
  const status = getStatusMeta(issue.status);
  const priority = getIssuePriorityMeta(issue);
  const labels = getIssueLabels(issue);
  // Prefer the database-backed roster name when we have an id match;
  // fall back to the mock data table, then to whatever the task carries.
  const rosterAgent = React.useMemo(
    () =>
      issue.assignedAgentId
        ? rosterAgents.find((agent) => agent.id === issue.assignedAgentId)
        : undefined,
    [issue.assignedAgentId, rosterAgents],
  );
  const mockAssigneeAgent = issue.assignedAgentId ? getAgent(issue.assignedAgentId) : undefined;
  const hasDeletedAssignee = Boolean(
    issue.assignedAgentId && !rosterAgent && !mockAssigneeAgent,
  );
  const deletedAssigneeName = hasDeletedAssignee
    ? issue.assignedAgent || issue.assignedAgentId || "Deleted agent"
    : null;
  const hasActiveAssignee = Boolean(
    rosterAgent || mockAssigneeAgent || (!issue.assignedAgentId && issue.assignedAgent),
  );
  const assignee = hasActiveAssignee
    ? rosterAgent?.name ?? getIssueAssignee(issue)
    : "Unassigned";
  const assigneeSubtitle = hasActiveAssignee
    ? rosterAgent?.subtitle ?? mockAssigneeAgent?.title
    : undefined;
  const totalSteps = issue.steps.completed + issue.steps.uncompleted;
  const dueLabel = formatDueLabel(issue.dueDate);
  const StatusIcon = status.icon;

  const postComment = React.useCallback(async () => {
    if (!comment.trim()) return;
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
  }, [comment, issue._id]);

  const startAddingSubtask = React.useCallback(() => {
    setIsAddingSubtask(true);
    setSubtaskError(null);
  }, []);

  const cancelAddingSubtask = React.useCallback(() => {
    setIsAddingSubtask(false);
    setSubtaskTitle("");
    setSubtaskAgentId(null);
    setSubtaskAssigneeTouched(false);
    setSubtaskError(null);
  }, []);

  const selectSubtaskAgent = React.useCallback((agentId: string | null) => {
    setSubtaskAgentId(agentId);
    setSubtaskAssigneeTouched(true);
  }, []);

  const submitSubtask = React.useCallback(async () => {
    const title = subtaskTitle.trim();
    if (!title || !onAddSubtask || isSubmittingSubtask) return;
    const selectedAgent = subtaskAgentId
      ? rosterAgents.find((agent) => agent.id === subtaskAgentId)
      : undefined;
    const assignment: ProjectIssueSubtaskAssignment | undefined = subtaskAssigneeTouched
      ? selectedAgent
        ? { type: "agent", agentId: selectedAgent.id, agentName: selectedAgent.name }
        : { type: "none" }
      : undefined;

    try {
      setIsSubmittingSubtask(true);
      setSubtaskError(null);
      await onAddSubtask(issue._id, title, assignment);
      setSubtaskTitle("");
      setSubtaskAgentId(null);
      setSubtaskAssigneeTouched(false);
      setIsAddingSubtask(false);
    } catch (error) {
      setSubtaskError(error instanceof Error ? error.message : "Subtask failed to add.");
    } finally {
      setIsSubmittingSubtask(false);
    }
  }, [
    isSubmittingSubtask,
    issue._id,
    onAddSubtask,
    rosterAgents,
    subtaskAgentId,
    subtaskAssigneeTouched,
    subtaskTitle,
  ]);

  return (
      <div className="grid min-h-full w-full grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* === MAIN === */}
        <main className="min-w-0 px-10 py-6">
          {/* Breadcrumb / back */}
          <button
            type="button"
            onClick={onClose}
            className="group mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
            <span>{projectName}</span>
            <span className="text-muted-foreground/50">/</span>
            <span
              className="uppercase tracking-[0.08em] text-muted-foreground/70"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              {issueKey}
            </span>
          </button>

          {/* Top tag row */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="rounded border border-border border-solid px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              {issueKey}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded border border-border border-solid px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <StatusIcon className={cn("h-3 w-3", status.iconClass)} />
              {status.title}
            </span>
            <PriorityChip rank={priority.rank} dotClass={priority.dotClass} />
            {labels.map((label) => (
              <LabelPill key={label} label={label} />
            ))}
          </div>

          {/* Title */}
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground lg:text-[30px]">
            {issue.title || "Untitled issue"}
          </h1>

          {/* Opener line */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            <AgentMonogram name={reporterName} size="xs" />
            <span className="text-foreground">{reporterName}</span>
            <span className="text-muted-foreground/70">opened</span>
            <span className="text-muted-foreground/50">·</span>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
              {formatIssueDateAbsolute(issue.createdAt)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>updated {formatRelativeIssueTime(issue.updatedAt)}</span>
          </div>

          {/* Description */}
          <Section label="Description">
            {issue.description ? (
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground">
                {issue.description}
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No description yet. Add context from Todo or attach a workflow run.
              </p>
            )}
          </Section>

          {/* Subtasks */}
          <Section
            label="Subtasks"
            counter={totalSteps > 0 ? `${issue.steps.completed}/${totalSteps}` : undefined}
            actionLabel={onAddSubtask ? "+ Add" : undefined}
            onAction={startAddingSubtask}
          >
            {isAddingSubtask ? (
              <div className="mb-3 rounded-lg border border-border/70 bg-card/60 p-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    autoFocus
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submitSubtask();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelAddingSubtask();
                      }
                    }}
                    placeholder="Describe the next subtask..."
                    className="h-8 min-w-0 border-border/70 bg-background/60 text-[12.5px] sm:flex-1"
                  />
                  <SubtaskAgentPicker
                    agents={rosterAgents}
                    selectedAgentId={subtaskAgentId}
                    disabled={isSubmittingSubtask}
                    onSelect={selectSubtaskAgent}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3 text-[12px]"
                    loading={isSubmittingSubtask}
                    disabled={!subtaskTitle.trim() || !onAddSubtask || isSubmittingSubtask}
                    onClick={() => void submitSubtask()}
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-[12px]"
                    disabled={isSubmittingSubtask}
                    onClick={cancelAddingSubtask}
                  >
                    Cancel
                  </Button>
                </div>
                {subtaskError ? (
                  <p className="mt-2 text-[11px] text-destructive">{subtaskError}</p>
                ) : null}
              </div>
            ) : null}
            {totalSteps === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No subtasks have been created for this issue.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 border-y border-border/60">
                {/* The Task model collapses subtasks into completed/uncompleted
                 *  counts; until we wire individual step records we render two
                 *  summary rows that match the visual rhythm of the reference. */}
                {issue.steps.completed > 0 ? (
                  <SubtaskRow
                    done
                    label={
                      issue.steps.completed === 1
                        ? "1 completed step"
                        : `${issue.steps.completed} completed steps`
                    }
                    monogramTask={issue}
                  />
                ) : null}
                {issue.steps.uncompleted > 0 ? (
                  <SubtaskRow
                    label={
                      issue.steps.uncompleted === 1
                        ? "1 step remaining"
                        : `${issue.steps.uncompleted} steps remaining`
                    }
                    monogramTask={issue}
                  />
                ) : null}
              </ul>
            )}
          </Section>

          {/* Linked doc */}
          {issue.linkedDocumentUrl ? (
            <Section label="Attachments">
              <a
                href={issue.linkedDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded border border-border/70 bg-muted/30 px-2.5 py-1.5 text-[12.5px] text-foreground transition-colors hover:border-foreground/40"
              >
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                Linked document
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </a>
            </Section>
          ) : null}

          {/* Activity */}
          <Section label="Activity">
            <ul className="space-y-4">
              {hasActiveAssignee && issue.assignedAgent ? (
                <ActivityItem
                  who={assignee}
                  monogramTask={issue}
                  kind="comment"
                  timeLabel={formatRelativeIssueTime(issue.updatedAt)}
                  body="Working through this — will post a draft for review shortly."
                />
              ) : null}
              {deletedAssigneeName ? (
                <ActivityItem
                  who={deletedAssigneeName}
                  kind="comment"
                  timeLabel={formatRelativeIssueTime(issue.updatedAt)}
                  body="Previously assigned here, but this agent has since been deleted."
                  avatarName={deletedAssigneeName}
                  deletedAgent
                />
              ) : null}
              <ActivityItem
                who={reporterName}
                kind="created"
                timeLabel={formatRelativeIssueTime(issue.createdAt)}
                body="Created issue."
              />
            </ul>

            {/* Comment composer */}
            <div className="mt-6 rounded-lg border border-border border-solid">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Reply, or @mention an agent to hand off..."
                className="min-h-[68px] resize-none bg-transparent text-[13px] focus-visible:ring-0 border-0"
              />
              <div className="flex items-center justify-between gap-2 border-t border-l-0 border-r-0 border-b-0 border-dashed border-border px-2 py-1.5">
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    @mention
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Cite
                  </button>
                </div>
                <Button
                  size="sm"
                  className="h-7 px-3 text-[12px]"
                  onClick={() => void postComment()}
                  loading={isPosting}
                  disabled={!comment.trim() || isPosting}
                >
                  Comment
                </Button>
              </div>
              {commentError ? (
                <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-destructive">
                  {commentError}
                </p>
              ) : null}
            </div>
          </Section>
        </main>

        {/* === SIDEBAR === */}
        <aside className="min-h-full w-full px-4 py-4 bg-secondary space-y-6 lg:sticky lg:top-6 lg:self-start lg:w-[320px] border-l border-r-0 border-t-0 border-b-0 border-solid border-border/60">
          {/* Status */}
          <SidebarRow label="Status">
            <StatusDropdown
              status={issue.status as ProjectIssueStatus}
              onChange={(next) => onStatusChange(issue._id, next)}
            />
          </SidebarRow>

          {/* Priority */}
          <SidebarRow label="Priority">
            <PriorityChip rank={priority.rank} dotClass={priority.dotClass} />
          </SidebarRow>

          {/* Assignee */}
          <SidebarRow label="Assignee">
            <ReassignPicker
              issue={issue}
              assigneeName={assignee}
              assigneeSubtitle={assigneeSubtitle}
              hasActiveAssignee={hasActiveAssignee}
              rosterAgents={rosterAgents}
              onReassign={onReassign}
            />
          </SidebarRow>

          {/* Reporter */}
          <SidebarRow label="Reporter">
            <div className="flex items-center gap-2 text-[12.5px] text-foreground">
              <AgentMonogram name={reporterName} size="sm" />
              <span>{reporterName}</span>
            </div>
          </SidebarRow>

          {/* Due date */}
          <SidebarRow label="Due date">
            <span className="text-[12.5px] text-foreground">
              <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
                {formatIssueDateAbsolute(issue.dueDate)}
              </span>
              {dueLabel ? (
                <span className="ml-2 text-muted-foreground">· {dueLabel}</span>
              ) : null}
            </span>
          </SidebarRow>

          {/* Project */}
          <SidebarRow label="Project">
            <span className="text-[12.5px] text-foreground">{projectName}</span>
          </SidebarRow>

          {/* Workflow */}
          <SidebarRow label="Workflow">
            <span className="text-[12.5px] text-foreground">
              {workflowName ?? projectDescription ?? "Not linked"}
            </span>
          </SidebarRow>

          {/* Labels */}
          <SidebarRow label="Labels">
            {labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {labels.map((label) => (
                  <LabelPill key={label} label={label} />
                ))}
              </div>
            ) : (
              <span className="text-[12.5px] text-muted-foreground">No labels</span>
            )}
          </SidebarRow>

          {/* Run a workflow card */}
          <div className="rounded-lg border border-solid border-border/70 bg-card/60 p-3">
            <div
              className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              Run a workflow
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
              {workflowName
                ? `${workflowName} can run on this issue automatically.`
                : "Link a workflow to this project to auto-run on issues."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-center gap-1.5 text-[12px]"
              disabled={!workflowName}
            >
              <Play className="h-3 w-3" />
              {workflowName ? "Run workflow" : "Workflow coming soon"}
            </Button>
          </div>
        </aside>
      </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function SubtaskAgentPicker({
  agents,
  selectedAgentId,
  disabled,
  onSelect,
}: {
  agents: ProjectRosterAgent[];
  selectedAgentId: string | null;
  disabled?: boolean;
  onSelect: (agentId: string | null) => void;
}) {
  const selectedAgent = selectedAgentId
    ? agents.find((agent) => agent.id === selectedAgentId)
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-8 w-full min-w-[138px] items-center justify-between gap-2 rounded-md border border-border/70 bg-background/60 px-2 text-[12px] text-foreground sm:w-auto",
            "transition-colors hover:border-foreground/30 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {selectedAgent ? (
              <AgentMonogram agentId={selectedAgent.id} size="xs" />
            ) : (
              <span
                aria-hidden
                className="h-4 w-4 rounded-[5px] border border-dashed border-border bg-muted/40"
              />
            )}
            <span className="truncate">{selectedAgent?.name ?? "No agent"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          Assign subtask
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12px]"
          onSelect={() => onSelect(null)}
        >
          <span
            aria-hidden
            className="h-5 w-5 rounded-[5px] border border-dashed border-border bg-muted/40"
          />
          <span>No agent</span>
        </DropdownMenuItem>
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            className="cursor-pointer gap-2 text-[12px]"
            onSelect={() => onSelect(agent.id)}
          >
            <AgentMonogram agentId={agent.id} size="xs" />
            <span className="min-w-0">
              <span className="block truncate">{agent.name}</span>
              <span className="block truncate text-[10.5px] text-muted-foreground">
                {agent.subtitle}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Section({
  label,
  counter,
  actionLabel,
  onAction,
  children,
}: {
  label: string;
  counter?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h2
            className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
            style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {label}
          </h2>
          {counter ? (
            <span
              className="text-[11px] text-muted-foreground/80"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              · {counter}
            </span>
          ) : null}
        </div>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
            style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SubtaskRow({
  label,
  done = false,
  monogramTask,
}: {
  label: string;
  done?: boolean;
  monogramTask?: Task;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="flex-shrink-0">
        {done ? (
          <CheckSquare className="h-4 w-4 text-foreground" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground/60" />
        )}
      </span>
      <span
        className={cn(
          "flex-1 text-[13px]",
          done ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {label}
      </span>
      {monogramTask ? <AgentMonogram task={monogramTask} size="sm" /> : null}
    </li>
  );
}

function ActivityItem({
  who,
  kind,
  timeLabel,
  body,
  monogramTask,
  avatarName,
  deletedAgent = false,
}: {
  who: string;
  kind: "comment" | "created";
  timeLabel: string;
  body: string;
  monogramTask?: Task;
  avatarName?: string;
  deletedAgent?: boolean;
}) {
  return (
    <li className="flex gap-3">
      {monogramTask ? (
        <AgentMonogram task={monogramTask} size="sm" className="mt-0.5" />
      ) : avatarName ? (
        <AgentMonogram
          name={avatarName}
          initials="?"
          status={deletedAgent ? "deleting" : undefined}
          title={deletedAgent ? `${avatarName} (deleted agent)` : avatarName}
          size="sm"
          className="mt-0.5 opacity-70 grayscale"
        />
      ) : (
        <AgentMonogram name={who} size="sm" className="mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div
          className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          <span className="text-foreground/80">{who}</span>
          <span>· {kind}</span>
          <span>· {timeLabel}</span>
          {deletedAgent ? (
            <span className="rounded border border-border px-1 py-px text-[9px] tracking-wide text-muted-foreground">
              deleted agent
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/80">{body}</p>
      </div>
    </li>
  );
}

function SidebarRow({
  label,
  actionLabel,
  onAction,
  children,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div
          className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          {label}
        </div>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Inline assignee card + reassign popover.
 *
 * The whole card is the dropdown trigger so the affordance is obvious,
 * which sidesteps the "where do I click to reassign?" UX of the prior
 * Reassign-link implementation. When no roster is wired (e.g. while the
 * provider is loading) the trigger gracefully degrades to a static card.
 */
function ReassignPicker({
  issue,
  assigneeName,
  assigneeSubtitle,
  hasActiveAssignee,
  rosterAgents,
  onReassign,
}: {
  issue: Task;
  assigneeName: string;
  assigneeSubtitle?: string;
  hasActiveAssignee: boolean;
  rosterAgents: ProjectRosterAgent[];
  onReassign?: (issueId: string, agentId: string) => void;
}) {
  const canReassign = !!onReassign && rosterAgents.length > 0;

  const card = (
    <div
      className={cn(
        "flex w-full items-center gap-2.5 rounded border border-solid border-border/70 bg-card/60 px-2.5 py-2",
        canReassign && "transition-colors hover:bg-card/80",
      )}
    >
      {hasActiveAssignee ? (
        <AgentMonogram task={issue} size="md" />
      ) : (
        <span
          aria-hidden
          className="h-6 w-6 rounded-[5px] border border-dashed border-border bg-muted/40"
        />
      )}
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-[12.5px] font-medium text-foreground">
          {assigneeName}
        </div>
        {assigneeSubtitle ? (
          <div className="truncate text-[10.5px] text-muted-foreground">
            agent · {assigneeSubtitle}
          </div>
        ) : null}
      </div>
      {canReassign ? (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
      )}
    </div>
  );

  if (!canReassign) return card;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="block w-full">
          {card}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          Reassign to
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rosterAgents.map((agent) => {
          const isCurrent = agent.id === issue.assignedAgentId;
          return (
            <DropdownMenuItem
              key={agent.id}
              onSelect={() => {
                if (isCurrent) return;
                onReassign?.(issue._id, agent.id);
              }}
              className="flex items-start gap-2.5"
              aria-current={isCurrent || undefined}
            >
              <AgentMonogram
                agentId={agent.id}
                name={agent.name}
                initials={agent.initials}
                runtime={agent.runtime}
                status={agent.status}
                avatarData={agent.avatarData}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-foreground">
                  {agent.name}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {agent.subtitle}
                </div>
              </div>
              {isCurrent ? (
                <span
                  className="mt-1 rounded border border-border px-1 py-px text-[9.5px] uppercase tracking-wide text-muted-foreground"
                  aria-hidden
                >
                  Current
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusDropdown({
  status,
  onChange,
}: {
  status: ProjectIssueStatus;
  onChange: (next: ProjectIssueStatus) => void;
}) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded border border-solid border-border/70 bg-card/60 px-2 py-1 text-[12px] uppercase tracking-[0.08em] text-foreground transition-colors hover:border-foreground/40"
        >
          <Icon className={cn("h-3 w-3", meta.iconClass)} />
          {meta.title}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PROJECT_ISSUE_COLUMNS.map((column) => {
          const ColumnIcon = column.icon;
          return (
            <DropdownMenuItem
              key={column.id}
              onSelect={() => onChange(column.id)}
              className="gap-2 text-[12.5px]"
            >
              <ColumnIcon className={cn("h-3.5 w-3.5", column.iconClass)} />
              {column.title}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
