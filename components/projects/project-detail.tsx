"use client";

import * as React from "react";
import { useRouter } from "next/router";
import { Columns3, LayoutList, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { AgentMonogram } from "./agent-monogram";
import { AGENTS, getAgent, getProject as getMockProject } from "./data";
import {
  useProjectAgentRoster,
  type ProjectRosterAgent,
} from "./use-agent-roster";
import { ProjectIssueBoard } from "./project-issue-board";
import {
  ProjectIssueDetail,
  type ProjectIssueSubtaskAssignment,
} from "./project-issue-detail";
import {
  ProjectIssueFilters,
  type ProjectIssueFiltersValue,
} from "./project-issue-filters";
import { ProjectIssueList } from "./project-issue-list";
import { EditProjectDrawer } from "./edit-project-drawer";
import {
  collectAssignees,
  collectLabels,
  formatDueLabel,
  getIssueLabels,
  getIssuePriorityRank,
  getProjectIssuePrefix,
  isProjectIssue,
  matchesIssueQuery,
  type ProjectIssueStatus,
} from "./project-issue-utils";
import type { Task } from "./task-types";
import { useProjectLeadHeartbeat } from "./use-project-lead-heartbeat";
import { useProjectTasks } from "./use-project-tasks";

interface ProjectIssueWorkspaceProps {
  projectId: string;
}

type WorkspaceView = "board" | "list";

/** Custom event the page → workspace bridge uses. Mirrors the constant in
 *  pages/Tool/Projects/[id].tsx so a header-level "+ New issue" can still
 *  pop the inline editor if/when we move the affordance back upstream. */
const NEW_ISSUE_EVENT = "project:new-issue";

const DEFAULT_FILTERS: ProjectIssueFiltersValue = {
  query: "",
  assignee: "Any",
  priority: "Any",
  label: "Any",
};

export function ProjectIssueWorkspace({ projectId }: ProjectIssueWorkspaceProps) {
  const router = useRouter();
  const {
    tasks,
    handleAddTask,
    handleAddNextStep,
    handleEditTask,
    handleStatusChange,
    refresh: refreshTasks,
  } = useProjectTasks();
  const {
    projects,
    selectedProject,
    selectProject,
    loading,
    refresh: refreshProjects,
    updateProject,
    addMember,
  } = useProjects();
  const { agents: rosterAgents, byId: rosterById } = useProjectAgentRoster();

  const [filters, setFilters] = React.useState<ProjectIssueFiltersValue>(DEFAULT_FILTERS);
  const [isCreating, setIsCreating] = React.useState(false);
  const [pendingCreateStatus, setPendingCreateStatus] =
    React.useState<ProjectIssueStatus>("pending");
  const [editingProjectId, setEditingProjectId] = React.useState<string | null>(null);
  const [leadDialogDismissedFor, setLeadDialogDismissedFor] = React.useState<string | null>(null);
  const [assigningLeadId, setAssigningLeadId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (projectId) void selectProject(projectId);
  }, [projectId, selectProject]);

  const view = React.useMemo<WorkspaceView>(
    () => (router.query.view === "list" ? "list" : "board"),
    [router.query.view]
  );

  const selectedIssueId =
    typeof router.query.issue === "string" ? router.query.issue : "";

  const mockProject = React.useMemo(() => getMockProject(projectId), [projectId]);
  const realProject = selectedProject ?? projects.find((p) => p.id === projectId);

  // Unified project view-model (live > mock > stub) so the rest of the
  // component doesn't have to care which source is authoritative.
  const project = React.useMemo(() => {
    if (realProject) {
      return {
        id: realProject.id,
        name: realProject.name,
        description: realProject.description,
        leadAgentId: realProject.leadAgentId ?? null,
        owner: "Project lead",
        status: realProject.status,
        agents: realProject.members?.map((m) => m.agentId) ?? [],
        emoji: realProject.emoji as string | undefined,
        workflowName:
          realProject.workflowTemplates?.find(
            (t) => t.id === realProject.defaultWorkflowTemplateId
          )?.name ?? null,
      };
    }
    if (mockProject) {
      return {
        id: mockProject.id,
        name: mockProject.name,
        description: mockProject.description,
        leadAgentId: null as string | null,
        owner: mockProject.owner,
        status: mockProject.status,
        agents: mockProject.agents,
        emoji: undefined as string | undefined,
        workflowName: null as string | null,
      };
    }
    return {
      id: projectId,
      name: projectId,
      description: "Project issue workspace",
      leadAgentId: null as string | null,
      owner: "Project lead",
      status: "active" as const,
      agents: [] as string[],
      emoji: undefined as string | undefined,
      workflowName: null as string | null,
    };
  }, [mockProject, projectId, realProject]);

  // Lead resolution prefers the real database roster (HyperclawProvider) and
  // falls back to the mock AGENTS table from data.ts only when the lead id
  // doesn't exist there yet — useful while we're still seeding agents into
  // the database.
  const leadRosterAgent = project.leadAgentId
    ? rosterById.get(project.leadAgentId)
    : undefined;
  const leadMockAgent = !realProject && project.leadAgentId ? getAgent(project.leadAgentId) : undefined;
  const activeLeadAgentId = leadRosterAgent ? project.leadAgentId : null;
  const leadName =
    leadRosterAgent?.name || leadMockAgent?.name || "Unassigned";
  // Display-only adapter so existing code that read leadAgent.emoji keeps working.
  const leadAgent = leadRosterAgent
    ? { name: leadRosterAgent.name, emoji: leadRosterAgent.emoji ?? leadRosterAgent.initials }
    : leadMockAgent;
  const projectRosterAgents = React.useMemo(() => {
    const projectAgentIds = new Set(project.agents);
    return rosterAgents.filter((agent) => projectAgentIds.has(agent.id));
  }, [project.agents, rosterAgents]);
  const shouldShowLeadDialog =
    Boolean(realProject && realProject.id === projectId)
    && !activeLeadAgentId
    && projectRosterAgents.length > 0
    && leadDialogDismissedFor !== projectId;

  const issuePrefix = React.useMemo(() => getProjectIssuePrefix(project), [project]);

  const projectIssues = React.useMemo(
    () => tasks.filter((task) => isProjectIssue(task, projectId)),
    [projectId, tasks]
  );

  // Stable index → "EAR-1", "EAR-2"… The board / list / detail all share
  // the same issue-key series, so we resolve indexes from the canonical
  // project-wide list rather than the post-filter slice.
  const indexById = React.useMemo(() => {
    const map = new Map<string, number>();
    projectIssues.forEach((task, index) => map.set(task._id, index));
    return map;
  }, [projectIssues]);

  const resolveIssueIndex = React.useCallback(
    (task: Task) => indexById.get(task._id) ?? 0,
    [indexById]
  );

  const visibleIssues = React.useMemo(() => {
    return projectIssues.filter((task) => {
      if (!matchesIssueQuery(task, filters.query)) return false;
      if (filters.assignee !== "Any") {
        const name = task.assignedAgent || task.assignedAgentId;
        if (name !== filters.assignee) return false;
      }
      if (filters.priority !== "Any") {
        if (getIssuePriorityRank(task) !== filters.priority) return false;
      }
      if (filters.label !== "Any") {
        // Strict membership test on the derived label set, separate from the
        // freeform query so empty-label issues drop out cleanly.
        if (!getIssueLabels(task).includes(filters.label)) return false;
      }
      return true;
    });
  }, [filters, projectIssues]);

  const assigneeOptions = React.useMemo(
    () => collectAssignees(projectIssues),
    [projectIssues]
  );
  const labelOptions = React.useMemo(
    () => collectLabels(projectIssues),
    [projectIssues]
  );

  const selectedIssue = React.useMemo(
    () => projectIssues.find((task) => task._id === selectedIssueId) ?? null,
    [projectIssues, selectedIssueId]
  );

  React.useEffect(() => {
    if (selectedIssue) setEditingProjectId(null);
  }, [selectedIssue]);

  const updateRouteQuery = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      const nextQuery = { ...router.query };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) {
          delete nextQuery[key];
        } else {
          nextQuery[key] = value;
        }
      }
      void router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  const handleOpenIssue = React.useCallback(
    (issueId: string) => updateRouteQuery({ issue: issueId }),
    [updateRouteQuery]
  );

  const handleCloseIssue = React.useCallback(
    () => updateRouteQuery({ issue: undefined }),
    [updateRouteQuery]
  );

  const handleViewChange = React.useCallback(
    (next: WorkspaceView) =>
      updateRouteQuery({ view: next === "list" ? "list" : undefined }),
    [updateRouteQuery]
  );

  const handleIssueStatusChange = React.useCallback(
    (issueId: string, status: ProjectIssueStatus) => {
      handleStatusChange(issueId, status);
    },
    [handleStatusChange]
  );

  const openCreateInline = React.useCallback((status: ProjectIssueStatus = "pending") => {
    setIsCreating(true);
    setPendingCreateStatus(status);
  }, []);

  // Payload-based create. Returns a typed result so the inline composer can
  // surface its own error chip without bouncing the value through parent
  // state. Falls back to the project lead when the composer doesn't pass
  // an explicit assignee, and prepends the legacy `Project: <name>` line so
  // any older consumer that grepped descriptions keeps working.
  const createIssue = React.useCallback(
    async (
      input: ComposerSubmitPayload,
    ): Promise<ComposerSubmitResult> => {
      const title = input.title.trim();
      if (!title) return { ok: false, error: "Title is required." };

      try {
        const leadFallback = activeLeadAgentId ?? undefined;
        const assignedAgentId = input.assignedAgentId ?? leadFallback;
        const assignedAgentName = assignedAgentId
          ? rosterById.get(assignedAgentId)?.name
            ?? getAgent(assignedAgentId)?.name
            ?? assignedAgentId
          : undefined;

        const description = composeIssueDescription({
          projectName: project.name,
          body: input.description,
          workflowName: input.workflowTemplateName,
        });

        const created = await handleAddTask({
          title,
          description,
          projectId,
          status: pendingCreateStatus,
          starred: Boolean(input.starred),
          ...(assignedAgentId
            ? { assignedAgentId, assignedAgent: assignedAgentName }
            : {}),
        });

        setIsCreating(false);
        if (created?._id) handleOpenIssue(created._id);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Issue creation failed.",
        };
      }
    },
    [
      handleAddTask,
      handleOpenIssue,
      pendingCreateStatus,
      activeLeadAgentId,
      project.name,
      projectId,
      rosterById,
    ],
  );

  // Reassign callback for the detail-page sidebar. Persists both the
  // assignedAgentId (canonical id used for routing) and the assignedAgent
  // (display name used by the issue list/board until rosters are loaded).
  const handleReassign = React.useCallback(
    (issueId: string, agentId: string) => {
      const agent = rosterById.get(agentId);
      void handleEditTask(issueId, {
        assignedAgentId: agentId,
        assignedAgent: agent?.name ?? agentId,
      });
    },
    [handleEditTask, rosterById],
  );

  const handleAddIssueSubtask = React.useCallback(
    async (
      issueId: string,
      title: string,
      assignment?: ProjectIssueSubtaskAssignment,
    ) => {
      await handleAddNextStep(
        issueId,
        title,
        undefined,
        assignment?.type === "agent"
          ? {
              assignedAgentId: assignment.agentId,
              assignedAgent: assignment.agentName,
            }
          : undefined,
      );
    },
    [handleAddNextStep],
  );

  // Bridge: in case anything (e.g. SiteHeader) still dispatches the legacy
  // window event, we keep the listener so a "+ New issue" elsewhere can
  // still pop the inline editor.
  React.useEffect(() => {
    const onNewIssue = () => openCreateInline("pending");
    window.addEventListener(NEW_ISSUE_EVENT, onNewIssue);
    return () => window.removeEventListener(NEW_ISSUE_EVENT, onNewIssue);
  }, [openCreateInline]);

  // Project meta values for the meta row
  const openCount = projectIssues.filter(
    (issue) => issue.status !== "completed" && issue.status !== "cancelled"
  ).length;
  const doneCount = projectIssues.filter(
    (issue) => issue.status === "completed"
  ).length;
  const blockedCount = projectIssues.filter(
    (issue) => issue.status === "blocked"
  ).length;
  // Earliest open due date — what the "due in 4d" line at the top echoes.
  const nextDue = React.useMemo(() => {
    const dates = projectIssues
      .filter((task) => task.status !== "completed" && task.status !== "cancelled")
      .map((task) => task.dueDate)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return dates[0];
  }, [projectIssues]);
  const nextDueLabel = formatDueLabel(nextDue);

  const totalIssues = projectIssues.length;
  const agentCount = projectRosterAgents.length || (!realProject ? AGENTS.length : 0);
  const refreshProjectState = React.useCallback(async () => {
    await Promise.all([
      refreshTasks(),
      refreshProjects(),
      selectProject(projectId),
    ]);
  }, [projectId, refreshProjects, refreshTasks, selectProject]);
  const handleSettingsOpenChange = React.useCallback((open: boolean) => {
    if (!open) setEditingProjectId(null);
  }, []);
  const handleSettingsSaved = React.useCallback(() => {
    void refreshProjectState();
  }, [refreshProjectState]);
  const assignProjectLead = React.useCallback(async (agentId: string) => {
    setAssigningLeadId(agentId);
    try {
      await updateProject(projectId, { leadAgentId: agentId, teamModeEnabled: true });
      await addMember(projectId, agentId, "lead");
      setLeadDialogDismissedFor(projectId);
      await refreshProjectState();
    } finally {
      setAssigningLeadId(null);
    }
  }, [addMember, projectId, refreshProjectState, updateProject]);
  const heartbeat = useProjectLeadHeartbeat({
    projectId,
    enabled: Boolean(realProject && realProject.id === projectId),
    onAfterHeartbeat: refreshProjectState,
  });
  const heartbeatAssignments = heartbeat.lastResult?.assignments?.length ?? 0;
  const heartbeatDispatches = heartbeat.lastResult?.dispatches?.length ?? 0;
  const heartbeatBlockers =
    heartbeat.lastResult?.dispatches?.filter((dispatch) => dispatch.taskStatus === "blocked").length ?? 0;
  const heartbeatTimestamp = heartbeat.lastResult?.heartbeatAt
    ? new Date(heartbeat.lastResult.heartbeatAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  /* ── Detail mode: render the full-page issue view in place ── */
  if (selectedIssue) {
    return (
      <div className="ensemble-root flex h-full min-h-0 overflow-auto">
        <ProjectIssueDetail
          issue={selectedIssue}
          issueIndex={resolveIssueIndex(selectedIssue)}
          issuePrefix={issuePrefix}
          projectName={project.name}
          projectDescription={project.description}
          workflowName={project.workflowName ?? undefined}
          reporterName={leadName}
          onClose={handleCloseIssue}
          onStatusChange={handleIssueStatusChange}
          onAddSubtask={handleAddIssueSubtask}
          rosterAgents={rosterAgents}
          onReassign={handleReassign}
        />
      </div>
    );
  }

  /* ── Workspace mode: header + filter bar + board / list ── */
  return (
    <div className="ensemble-root flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-col">
        {/* Workspace header */}
        <header className="mx-4 py-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-[26px] font-medium leading-tight tracking-tight text-foreground lg:text-[28px]">
              {project.emoji ? (
                <span aria-hidden="true" className="text-[24px] leading-none">
                  {project.emoji}
                </span>
              ) : null}
              <span className="truncate">{project.name}</span>
            </h1>
            <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
              {project.description ||
                "Track issues, agent work, and workflow follow-through for this project."}
            </p>

            {/* Meta row: lead · open · done · due · workflow */}
            <div
              className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground"
              style={{
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                {activeLeadAgentId ? (
                  <AgentMonogram
                    agentId={activeLeadAgentId}
                    name={leadName}
                    initials={leadAgent?.emoji}
                    runtime={leadRosterAgent?.runtime}
                    status={leadRosterAgent?.status}
                    avatarData={leadRosterAgent?.avatarData}
                    size="xs"
                  />
                ) : (
                  <AgentMonogram name={leadName} size="xs" />
                )}
                <span className="text-muted-foreground/70">lead</span>
                <span className="text-foreground">{leadName}</span>
              </span>
              <MetaDot />
              <MetaItem label={`${openCount} open`} />
              <MetaDot />
              <MetaItem label={`${doneCount} done`} />
              {blockedCount > 0 ? (
                <>
                  <MetaDot />
                  <MetaItem label={`${blockedCount} blocked`} accent />
                </>
              ) : null}
              {nextDueLabel ? (
                <>
                  <MetaDot />
                  <MetaItem label={`due ${nextDueLabel}`} />
                </>
              ) : null}
              {project.workflowName ? (
                <>
                  <MetaDot />
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground/70">workflow →</span>
                    <span className="text-foreground">{project.workflowName}</span>
                  </span>
                </>
              ) : null}
              {loading ? (
                <>
                  <MetaDot />
                  <span className="animate-pulse text-muted-foreground/70">
                    syncing
                  </span>
                </>
              ) : null}
              <MetaDot />
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">heartbeat</span>
                <span className={cn("text-foreground", heartbeat.running && "animate-pulse")}>
                  {heartbeat.running
                    ? "running"
                    : heartbeatTimestamp
                      ? `${heartbeatTimestamp} · ${heartbeatAssignments} assigned · ${heartbeatDispatches} dispatched${heartbeatBlockers ? ` · ${heartbeatBlockers} blocked` : ""}`
                      : "watching"}
                </span>
              </span>
              {heartbeat.lastError ? (
                <>
                  <MetaDot />
                  <MetaItem label="heartbeat blocked" accent />
                </>
              ) : null}
            </div>
          </div>

          {/* In-page view toggles + new issue (mirrors the reference) */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <ViewToggleGroup value={view} onChange={handleViewChange} />
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Project settings"
              onClick={() => setEditingProjectId(projectId)}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 px-3 text-[12.5px]"
              onClick={() => openCreateInline("pending")}
            >
              <Plus className="h-3.5 w-3.5" />
              New issue
            </Button>
          </div>
        </header>

        <Dialog
          open={shouldShowLeadDialog}
          onOpenChange={(open) => {
            if (!open) setLeadDialogDismissedFor(projectId);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign a project lead?</DialogTitle>
              <DialogDescription>
                This project does not have an active lead. Choose one of this project&apos;s agents to route new issues and heartbeat assignments.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {projectRosterAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  disabled={assigningLeadId !== null}
                  onClick={() => void assignProjectLead(agent.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  <AgentMonogram
                    agentId={agent.id}
                    name={agent.name}
                    initials={agent.emoji ?? agent.initials}
                    runtime={agent.runtime}
                    status={agent.status}
                    avatarData={agent.avatarData}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {agent.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.subtitle}
                    </span>
                  </span>
                  {assigningLeadId === agent.id ? (
                    <span className="text-xs text-muted-foreground">Assigning...</span>
                  ) : null}
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setLeadDialogDismissedFor(projectId)}
                disabled={assigningLeadId !== null}
              >
                Not now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <EditProjectDrawer
          projectId={editingProjectId}
          onOpenChange={handleSettingsOpenChange}
          onSaved={handleSettingsSaved}
        />

        {/* Inline create — three-tab composer surfaced when "+ New issue" or
         *  a column "+" is clicked. The composer owns its own draft state so
         *  switching tabs preserves what the user has typed. */}
        {isCreating ? (
          <InlineIssueComposer
            issuePrefix={issuePrefix}
            status={pendingCreateStatus}
            defaultAssigneeId={activeLeadAgentId ?? undefined}
            defaultWorkflowTemplateId={
              realProject?.defaultWorkflowTemplateId ?? null
            }
            agents={rosterAgents}
            workflowTemplates={
              realProject?.workflowTemplates?.map((tpl) => ({
                id: tpl.id,
                name: tpl.name,
              })) ?? []
            }
            onCancel={() => setIsCreating(false)}
            onSubmit={createIssue}
          />
        ) : null}

        {/* Filters */}
        <div className="px-4 py-1 border-b-1 border-t-1 border-l-0 border-r-0 border-solid border-border bg-secondary">
          <ProjectIssueFilters
            value={filters}
            onChange={setFilters}
            assignees={assigneeOptions}
            labels={labelOptions}
            shownCount={visibleIssues.length}
            totalCount={totalIssues}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-0 py-0 customScrollbar2">
        {/* Body */}
        {totalIssues === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-12 text-center">
            <h3 className="text-sm font-medium text-foreground">
              No issues in this project yet.
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Click <b className="font-medium text-foreground">+ New issue</b> to add the first one.
            </p>
          </div>
        ) : view === "list" ? (
          <ProjectIssueList
            issues={visibleIssues}
            issuePrefix={issuePrefix}
            onOpenIssue={handleOpenIssue}
            resolveIssueIndex={resolveIssueIndex}
          />
        ) : (
          <div className={cn("h-full min-h-[560px] py-3 px-2")}>
            <ProjectIssueBoard
              issues={visibleIssues}
              issuePrefix={issuePrefix}
              onOpenIssue={handleOpenIssue}
              onCreateInColumn={openCreateInline}
              resolveIssueIndex={resolveIssueIndex}
            />
          </div>
        )}
        </div>

        <SrOnlyAgentInfo agentCount={agentCount} owner={project.owner} />
      </div>
    </div>
  );
}

/* ────────────────────────────── helpers ────────────────────────────── */

function MetaDot() {
  return (
    <span
      className="inline-block h-0.5 w-0.5 rounded-full bg-muted-foreground/60"
      aria-hidden
    />
  );
}

function MetaItem({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={cn(
        "lowercase",
        accent ? "text-amber-600 dark:text-amber-400" : "text-foreground/90"
      )}
    >
      {label}
    </span>
  );
}

function ViewToggleGroup({
  value,
  onChange,
}: {
  value: WorkspaceView;
  onChange: (next: WorkspaceView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Project view"
      className="inline-flex items-center rounded-md border border-border border-solid bg-secondary p-0.5"
    >
      <ToggleButton
        active={value === "board"}
        onClick={() => onChange("board")}
        icon={<Columns3 className="h-3.5 w-3.5" />}
        label="Board"
      />
      <ToggleButton
        active={value === "list"}
        onClick={() => onChange("list")}
        icon={<LayoutList className="h-3.5 w-3.5" />}
        label="List"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Tiny, off-screen note that keeps a11y readers aware of crew context
 *  without taking up visual space (the meta row above already shows
 *  enough for sighted users). */
function SrOnlyAgentInfo({
  agentCount,
  owner,
}: {
  agentCount: number;
  owner: string;
}) {
  return (
    <p className="sr-only">
      Crew of {agentCount} {agentCount === 1 ? "agent" : "agents"} owned by {owner}.
    </p>
  );
}

/* ───────────────────── Inline issue composer ──────────────────────
 * A three-tab inline form that replaces the old single-line title input.
 *
 *   Quick         — title-only fast capture (Linear-style).
 *   Tell an agent — natural language brief that gets parsed into
 *                   {assignee, priority, title}; ideal for voice notes.
 *   Full form     — title + description + assignee/priority/workflow.
 *
 * The composer owns its own draft state so the user can hop between tabs
 * mid-thought without losing what they typed. The parent only owns the
 * `isCreating` flag and the column hint (`pendingCreateStatus`). All three
 * modes funnel into the same `onSubmit` payload.
 * ────────────────────────────────────────────────────────────────── */

type ComposerMode = "quick" | "agent" | "full";
type Priority = "P0" | "P1" | "P2" | "P3";

interface ComposerSubmitPayload {
  title: string;
  description?: string;
  assignedAgentId?: string;
  /** P0/P1 issues are starred — see getIssuePriorityRank() for the read side. */
  starred?: boolean;
  workflowTemplateId?: string | null;
  /** Display name persisted into the description body so the issue detail
   *  view can render it before per-issue workflow links exist. */
  workflowTemplateName?: string | null;
}

type ComposerSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

interface InlineIssueComposerProps {
  issuePrefix: string;
  status: ProjectIssueStatus;
  defaultAssigneeId?: string | null;
  defaultWorkflowTemplateId?: string | null;
  agents: ProjectRosterAgent[];
  workflowTemplates: { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (payload: ComposerSubmitPayload) => Promise<ComposerSubmitResult>;
}

const PRIORITY_OPTIONS: { value: Priority; hint: string }[] = [
  { value: "P0", hint: "Urgent" },
  { value: "P1", hint: "High" },
  { value: "P2", hint: "Medium" },
  { value: "P3", hint: "Low" },
];

/** Best-effort natural-language parser for the "Tell an agent" tab.
 *
 *  Recognized patterns (intentionally narrow so false positives stay rare):
 *   - Leading mention: `Orin, …` or `@orin …`  → assigneeId
 *   - Trailing tag:    `… P1` / `…, P0`        → priority
 *
 *  Anything else is left in the title verbatim — no date NLP yet. */
function parseAgentBrief(
  raw: string,
  agents: ProjectRosterAgent[],
): { title: string; assigneeId?: string; priority?: Priority } {
  const trimmed = raw.trim();
  if (!trimmed) return { title: "" };

  let working = trimmed;
  let assigneeId: string | undefined;
  let priority: Priority | undefined;

  const lead = working.match(/^@?([A-Za-z][A-Za-z0-9._-]{1,20})\s*[,:]\s+/);
  if (lead) {
    const candidate = lead[1].toLowerCase();
    const match = agents.find((agent) => {
      if (agent.id.toLowerCase() === candidate) return true;
      const firstName = (agent.name || agent.id).split(/\s+/)[0]?.toLowerCase();
      return firstName === candidate;
    });
    if (match) {
      assigneeId = match.id;
      working = working.slice(lead[0].length);
    }
  }

  const prio = working.match(/[\s,]+P([0-3])\b\.?$/i);
  if (prio && typeof prio.index === "number") {
    priority = ("P" + prio[1]) as Priority;
    working = working.slice(0, prio.index).replace(/[\s,]+$/, "");
  }

  return {
    title: working || trimmed,
    assigneeId,
    priority,
  };
}

/** Description shape kept stable: legacy parsers grep for `Project: <name>`
 *  as the first line, so we always emit that, then optionally the user's
 *  body, then a workflow note for the issue detail page. */
function composeIssueDescription({
  projectName,
  body,
  workflowName,
}: {
  projectName: string;
  body?: string;
  workflowName?: string | null;
}): string {
  const parts: string[] = [`Project: ${projectName}`];
  const trimmedBody = body?.trim();
  if (trimmedBody) parts.push("", trimmedBody);
  if (workflowName) parts.push("", `Workflow: ${workflowName}`);
  return parts.join("\n");
}

function InlineIssueComposer({
  issuePrefix,
  defaultAssigneeId,
  defaultWorkflowTemplateId,
  agents,
  workflowTemplates,
  onCancel,
  onSubmit,
}: InlineIssueComposerProps) {
  const [mode, setMode] = React.useState<ComposerMode>("quick");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [agentText, setAgentText] = React.useState("");
  const [agentParsed, setAgentParsed] = React.useState<
    ReturnType<typeof parseAgentBrief> | null
  >(null);
  const [assigneeId, setAssigneeId] = React.useState<string | null>(
    defaultAssigneeId ?? null,
  );
  const [priority, setPriority] = React.useState<Priority>("P2");
  const [workflowTemplateId, setWorkflowTemplateId] = React.useState<string | null>(
    defaultWorkflowTemplateId ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Re-seed defaults when the parent project context changes mid-create.
  React.useEffect(() => {
    setAssigneeId(defaultAssigneeId ?? null);
  }, [defaultAssigneeId]);
  React.useEffect(() => {
    setWorkflowTemplateId(defaultWorkflowTemplateId ?? null);
  }, [defaultWorkflowTemplateId]);

  const handleSubmit = React.useCallback(async () => {
    let composedTitle = "";
    let composedDescription: string | undefined;
    let composedAssigneeId: string | undefined = assigneeId ?? undefined;
    let composedStarred = priority === "P0" || priority === "P1";
    const composedWorkflowId = workflowTemplateId;

    if (mode === "quick") {
      composedTitle = title.trim();
    } else if (mode === "agent") {
      const parsed = agentParsed ?? parseAgentBrief(agentText, agents);
      composedTitle = parsed.title.trim();
      if (parsed.assigneeId) composedAssigneeId = parsed.assigneeId;
      if (parsed.priority) {
        composedStarred = parsed.priority === "P0" || parsed.priority === "P1";
      }
    } else {
      composedTitle = title.trim();
      composedDescription = description.trim() || undefined;
    }

    if (!composedTitle) {
      setError("Title is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const workflow = workflowTemplates.find(
      (tpl) => tpl.id === composedWorkflowId,
    );
    const result = await onSubmit({
      title: composedTitle,
      description: composedDescription,
      assignedAgentId: composedAssigneeId,
      starred: composedStarred,
      workflowTemplateId: composedWorkflowId,
      workflowTemplateName: workflow?.name ?? null,
    });

    setSubmitting(false);
    if (result.ok) {
      // Local cleanup — usually a no-op since the parent unmounts the
      // composer on success, but keeps state tidy if that ever changes.
      setTitle("");
      setDescription("");
      setAgentText("");
      setAgentParsed(null);
    } else {
      setError(result.error);
    }
  }, [
    agentParsed,
    agentText,
    agents,
    assigneeId,
    description,
    mode,
    onSubmit,
    priority,
    title,
    workflowTemplateId,
    workflowTemplates,
  ]);

  // Container-level shortcuts: Esc cancels everywhere; ⌘/Ctrl+Enter submits
  // anywhere even when focus is inside a textarea.
  const handleKey: React.KeyboardEventHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const assignee = assigneeId
    ? agents.find((agent) => agent.id === assigneeId) ?? null
    : null;
  const workflow = workflowTemplateId
    ? workflowTemplates.find((tpl) => tpl.id === workflowTemplateId) ?? null
    : null;

  const canSubmit = !submitting
    && (mode === "agent" ? agentText.trim().length > 0 : title.trim().length > 0);

  return (
    <div
      className="border border-solid border-border border-t border-b-0 border-l-0 border-r-0 bg-secondary px-4 py-3"
      onKeyDown={handleKey}
    >
      {/* Shared header: NEW ISSUE · <prefix>   [tabs]   Cancel */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          New issue · {issuePrefix}
        </span>
        <ComposerTabs value={mode} onChange={setMode} />
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3">
        {mode === "quick" ? (
          <QuickTab
            value={title}
            onChange={setTitle}
            onSubmit={() => void handleSubmit()}
            canSubmit={canSubmit}
            submitting={submitting}
          />
        ) : null}
        {mode === "agent" ? (
          <AgentTab
            value={agentText}
            onChange={(next) => {
              setAgentText(next);
              setAgentParsed(null);
            }}
            parsed={agentParsed}
            onParse={() => setAgentParsed(parseAgentBrief(agentText, agents))}
            onSubmit={() => void handleSubmit()}
            canSubmit={canSubmit}
            submitting={submitting}
            agents={agents}
          />
        ) : null}
        {mode === "full" ? (
          <FullTab
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            assignee={assignee}
            onAssigneeChange={setAssigneeId}
            priority={priority}
            onPriorityChange={setPriority}
            workflow={workflow}
            workflowOptions={workflowTemplates}
            onWorkflowChange={setWorkflowTemplateId}
            agents={agents}
            onSubmit={() => void handleSubmit()}
            canSubmit={canSubmit}
            submitting={submitting}
          />
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function ComposerTabs({
  value,
  onChange,
}: {
  value: ComposerMode;
  onChange: (next: ComposerMode) => void;
}) {
  const tabs: { id: ComposerMode; label: string }[] = [
    { id: "quick", label: "Quick" },
    { id: "agent", label: "Tell an agent" },
    { id: "full", label: "Full form" },
  ];
  return (
    <div
      role="tablist"
      aria-label="New issue mode"
      className="inline-flex items-center rounded-md border border-border border-solid bg-background p-0.5"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded px-2.5 py-1 text-[12px] transition-colors",
            value === tab.id
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function QuickTab({
  value,
  onChange,
  onSubmit,
  canSubmit,
  submitting,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder="Quick add — title, then ↵"
          className="h-9 flex-1 border-border/70 bg-background/70 text-[13px]"
        />
        <Button
          size="sm"
          className="h-9 px-3.5 text-[12.5px]"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? "Creating…" : "Create"}
        </Button>
      </div>
      <p
        className="text-[11px] text-muted-foreground"
        style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
      >
        Tip — try “Tell an agent” mode for natural language:{" "}
        <span className="italic text-muted-foreground/80">
          “Rell, send the brief to board@ at 8am Friday.”
        </span>
      </p>
    </div>
  );
}

function AgentTab({
  value,
  onChange,
  parsed,
  onParse,
  onSubmit,
  canSubmit,
  submitting,
  agents,
}: {
  value: string;
  onChange: (next: string) => void;
  parsed: { title: string; assigneeId?: string; priority?: Priority } | null;
  onParse: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
  agents: ProjectRosterAgent[];
}) {
  const previewAgent = parsed?.assigneeId
    ? agents.find((agent) => agent.id === parsed.assigneeId) ?? null
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <Textarea
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder='Tell an agent what to do — e.g. "Orin, pull Q1 retail comps for the Outlook section by Friday, P1"'
          className="min-h-[68px] flex-1 border-border/70 bg-background/70 text-[13px] leading-relaxed"
          rows={3}
        />
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-md px-3 text-[12.5px]"
            onClick={onParse}
            disabled={!value.trim() || submitting}
          >
            Parse
          </Button>
          <Button
            size="sm"
            className="h-9 px-3 text-[12.5px]"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
      {parsed ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="text-muted-foreground/70">Parsed:</span>
          <span className="rounded border border-border/70 bg-background/70 px-2 py-0.5 text-foreground">
            {parsed.title || "(no title)"}
          </span>
          {previewAgent ? (
            <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background/70 px-1.5 py-0.5">
              <AgentMonogram
                agentId={previewAgent.id}
                name={previewAgent.name}
                initials={previewAgent.initials}
                runtime={previewAgent.runtime}
                status={previewAgent.status}
                avatarData={previewAgent.avatarData}
                size="xs"
              />
              <span className="text-foreground">{previewAgent.name}</span>
            </span>
          ) : null}
          {parsed.priority ? (
            <span className="rounded border border-border/70 bg-background/70 px-2 py-0.5 text-foreground">
              {parsed.priority}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FullTab({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  assignee,
  onAssigneeChange,
  priority,
  onPriorityChange,
  workflow,
  workflowOptions,
  onWorkflowChange,
  agents,
  onSubmit,
  canSubmit,
  submitting,
}: {
  title: string;
  onTitleChange: (next: string) => void;
  description: string;
  onDescriptionChange: (next: string) => void;
  assignee: ProjectRosterAgent | null;
  onAssigneeChange: (next: string | null) => void;
  priority: Priority;
  onPriorityChange: (next: Priority) => void;
  workflow: { id: string; name: string } | null;
  workflowOptions: { id: string; name: string }[];
  onWorkflowChange: (next: string | null) => void;
  agents: ProjectRosterAgent[];
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="space-y-2">
        <Input
          autoFocus
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Title"
          className="h-9 border-border/70 bg-background/70 text-[13px]"
        />
        <Textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Description — markdown OK"
          className="min-h-[112px] border-border/70 bg-background/70 text-[13px] leading-relaxed"
          rows={5}
        />
      </div>
      <div className="space-y-1.5">
        <AssigneeMetaPopover
          value={assignee}
          agents={agents}
          onChange={onAssigneeChange}
        />
        <PriorityMetaPopover value={priority} onChange={onPriorityChange} />
        <WorkflowMetaPopover
          value={workflow}
          options={workflowOptions}
          onChange={onWorkflowChange}
        />
        <Button
          size="sm"
          className="mt-1 h-9 w-full text-[12.5px]"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? "Creating…" : "Create issue"}
        </Button>
      </div>
    </div>
  );
}

/** Shared trigger styling for the right-column meta fields. The label sits in
 *  monospace small caps on the left, the value reads like a typed answer on
 *  the right — same visual rhythm as the meta row at the top of the page. */
function metaTriggerClass(open: boolean): string {
  return cn(
    "flex w-full items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-1.5 text-left transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    open && "border-ring",
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="w-[58px] flex-shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
      style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
    >
      {children}
    </span>
  );
}

function AssigneeMetaPopover({
  value,
  agents,
  onChange,
}: {
  value: ProjectRosterAgent | null;
  agents: ProjectRosterAgent[];
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={metaTriggerClass(open)}>
          <MetaLabel>Assignee</MetaLabel>
          <span className="flex-1 truncate text-[12.5px] text-foreground">
            {value ? value.name : <span className="text-muted-foreground">Unassigned</span>}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search agent…" className="h-8 text-[12.5px]" />
          <CommandList>
            <CommandEmpty className="px-2 py-1.5 text-[12px] text-muted-foreground">
              No agents.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__unassigned__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="gap-2 text-[12.5px]"
              >
                <span className="inline-block h-5 w-5 rounded-full border border-dashed border-border" />
                <span className="flex-1 truncate text-muted-foreground">
                  Unassigned
                </span>
              </CommandItem>
              {agents.map((agent) => (
                <CommandItem
                  key={agent.id}
                  // value drives the cmdk filter — include id + name so the
                  // user can search by either.
                  value={`${agent.name} ${agent.id}`}
                  onSelect={() => {
                    onChange(agent.id);
                    setOpen(false);
                  }}
                  className="gap-2 text-[12.5px]"
                >
                  <AgentMonogram
                    agentId={agent.id}
                    name={agent.name}
                    initials={agent.initials}
                    runtime={agent.runtime}
                    status={agent.status}
                    avatarData={agent.avatarData}
                    size="xs"
                  />
                  <span className="flex-1 truncate">{agent.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PriorityMetaPopover({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (next: Priority) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={metaTriggerClass(open)}>
          <MetaLabel>Priority</MetaLabel>
          <span className="flex-1 truncate text-[12.5px] text-foreground">
            {value}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
        {PRIORITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent/40",
              value === option.value && "bg-accent/30",
            )}
          >
            <span className="font-medium text-foreground">{option.value}</span>
            <span className="text-muted-foreground">{option.hint}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function WorkflowMetaPopover({
  value,
  options,
  onChange,
}: {
  value: { id: string; name: string } | null;
  options: { id: string; name: string }[];
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={metaTriggerClass(open)}>
          <MetaLabel>Workflow</MetaLabel>
          <span className="flex-1 truncate text-[12.5px] text-foreground">
            {value ? value.name : <span className="text-muted-foreground">None</span>}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-56 p-1">
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent/40",
            value === null && "bg-accent/30",
          )}
        >
          <span className="text-muted-foreground">None</span>
        </button>
        {options.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => {
              onChange(tpl.id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent/40",
              value?.id === tpl.id && "bg-accent/30",
            )}
          >
            <span className="flex-1 truncate text-foreground">{tpl.name}</span>
          </button>
        ))}
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-[11.5px] text-muted-foreground">
            No workflow templates yet — attach one from the project settings.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
