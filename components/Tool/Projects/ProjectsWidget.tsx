"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Users, Trash2, UserMinus, Crown, Wrench, Eye, Loader2, FolderOpen, ChevronRight, Brain, GitBranch, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjects, type Project, type ProjectMember, ProjectsProvider } from "./provider/projectsProvider";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { AgentGlyph } from "$/components/ensemble";
import { resolveProjectAgentDisplay } from "$/components/ensemble/views/project-agent-display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ── Helpers ──────────────────────────────────────────── */

const ROLE_ICONS = {
  lead: Crown,
  builder: Wrench,
  reviewer: Eye,
  researcher: Brain,
  ops: GitBranch,
  viewer: Eye,
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-400",
  completed: "bg-blue-400",
  archived: "bg-white/20",
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Project List Item ────────────────────────────────── */

function ProjectListItem({
  project,
  selected,
  onClick,
}: {
  project: Project;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all group ${
        selected
          ? "bg-blue-500/20 ring-1 ring-blue-400/30"
          : "hover:bg-white/5"
      }`}
    >
      <span className="text-xl shrink-0">{project.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{project.name}</span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[project.status] ?? "bg-white/20"}`} />
        </div>
        {project.description && (
          <p className="text-xs text-white/40 truncate mt-0.5">{project.description}</p>
        )}
      </div>
      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-opacity ${selected ? "text-blue-400 opacity-100" : "text-white/20 opacity-0 group-hover:opacity-100"}`} />
    </button>
  );
}

/* ── Member Row ───────────────────────────────────────── */

function MemberRow({
  member,
  onRemove,
  onRoleChange,
}: {
  member: ProjectMember;
  onRemove: () => void;
  onRoleChange: (role: string) => void;
}) {
  const { agents } = useHyperclawContext();
  const agent = agents.find((a) => a.id === member.agentId && a.status !== "deleting");
  if (!agent) return null;
  const display = resolveProjectAgentDisplay(agent, member.agentId);
  const RoleIcon = ROLE_ICONS[member.role] ?? Wrench;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 group">
      <AgentGlyph agent={display} size={28} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{agent.name}</p>
        <p className="text-xs text-white/40 capitalize">{agent.runtime ?? "unknown"}</p>
      </div>
      <Select value={member.role} onValueChange={onRoleChange}>
        <SelectTrigger className="h-7 w-28 bg-white/5 border-white/10 text-white/60 text-xs focus:ring-0">
          <div className="flex items-center gap-1.5">
            <RoleIcon className="h-3 w-3" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-[hsl(225,36%,16%)] border-white/10 text-white text-xs">
          <SelectItem value="lead">Lead</SelectItem>
          <SelectItem value="builder">Builder</SelectItem>
          <SelectItem value="reviewer">Reviewer</SelectItem>
          <SelectItem value="researcher">Researcher</SelectItem>
          <SelectItem value="ops">Ops</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectContent>
      </Select>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
      >
        <UserMinus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── Add Agent Dropdown ───────────────────────────────── */

function AddAgentDropdown({
  projectId,
  existingAgentIds,
}: {
  projectId: string;
  existingAgentIds: string[];
}) {
  const { agents } = useHyperclawContext();
  const { addMember } = useProjects();
  const available = agents.filter((a) => a.status !== "deleting" && !existingAgentIds.includes(a.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-white/60 hover:text-white hover:bg-white/10 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add agent
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-[hsl(225,36%,16%)] border-white/10 text-white max-h-60 overflow-y-auto w-52"
      >
        {available.length === 0 ? (
          <div className="px-3 py-2 text-xs text-white/40">No more agents to add</div>
        ) : (
          available.map((a) => (
            <DropdownMenuItem
              key={a.id}
              onClick={() => void addMember(projectId, a.id)}
              className="gap-2 cursor-pointer hover:bg-white/10 focus:bg-white/10"
            >
              <AgentGlyph agent={resolveProjectAgentDisplay(a)} size={22} />
              <div className="min-w-0">
                <p className="text-sm truncate">{a.name}</p>
                <p className="text-xs text-white/40 capitalize">{a.runtime}</p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Project Detail Panel ─────────────────────────────── */

function ProjectDetail({ project }: { project: Project }) {
  const {
    removeMember,
    addMember,
    deleteProject,
    updateProject,
    listWorkflowTemplates,
    createWorkflowTemplateFromPrompt,
    listWorkflowRuns,
    startWorkflowRun,
  } = useProjects();
  const [deleting, setDeleting] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState(project.workflowTemplates ?? []);
  const [workflowRuns, setWorkflowRuns] = useState(project.workflowRuns ?? []);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const { agents } = useHyperclawContext();
  const activeAgentIds = new Set(agents.filter((agent) => agent.status !== "deleting").map((agent) => agent.id));
  const members = (project.members ?? []).filter((member) => activeAgentIds.has(member.agentId));
  const leadMember = members.find((member) => member.role === "lead") ?? (project.leadAgentId ? members.find((member) => member.agentId === project.leadAgentId) : undefined);

  const handleRemoveMember = useCallback(
    (agentId: string) => {
      void removeMember(project.id, agentId);
    },
    [project.id, removeMember]
  );

  const handleRoleChange = useCallback(
    (agentId: string, role: string) => {
      void addMember(project.id, agentId, role);
    },
    [project.id, addMember]
  );

  const handleDelete = async () => {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteProject(project.id);
    setDeleting(false);
  };

  const handleStatusCycle = async () => {
    const next: Record<string, "active" | "completed" | "archived"> = {
      active: "completed",
      completed: "archived",
      archived: "active",
    };
    await updateProject(project.id, { status: next[project.status] ?? "active" });
  };

  const refreshWorkflows = useCallback(async () => {
    const [templates, runs] = await Promise.all([
      listWorkflowTemplates(project.id),
      listWorkflowRuns(project.id),
    ]);
    setWorkflowTemplates(templates);
    setWorkflowRuns(runs);
  }, [listWorkflowRuns, listWorkflowTemplates, project.id]);

  const handleCreateWorkflow = useCallback(async () => {
    const prompt = window.prompt("Describe the workflow you want this project to use.");
    if (!prompt?.trim()) return;
    setCreatingWorkflow(true);
    try {
      const template = await createWorkflowTemplateFromPrompt(project.id, prompt.trim(), `${project.name} workflow`);
      if (template) {
        if (!project.defaultWorkflowTemplateId) {
          await updateProject(project.id, { defaultWorkflowTemplateId: template.id });
        }
        await refreshWorkflows();
      }
    } finally {
      setCreatingWorkflow(false);
    }
  }, [createWorkflowTemplateFromPrompt, project.defaultWorkflowTemplateId, project.id, project.name, refreshWorkflows, updateProject]);

  const handleRunWorkflow = useCallback(async (templateId: string) => {
    await startWorkflowRun(templateId, "dashboard", undefined, project.id);
    await refreshWorkflows();
  }, [project.id, refreshWorkflows, startWorkflowRun]);

  useEffect(() => {
    void refreshWorkflows();
  }, [refreshWorkflows]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-start gap-3">
          <span className="text-3xl">{project.emoji}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">{project.name}</h2>
            {project.description && (
              <p className="text-xs text-white/50 mt-0.5">{project.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => void handleStatusCycle()}
                className={`px-2 py-0.5 rounded text-xs font-medium capitalize transition-colors ${
                  project.status === "active"
                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                    : project.status === "completed"
                    ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                    : "bg-white/10 text-white/40 hover:bg-white/15"
                }`}
              >
                {project.status}
              </button>
              <span className="text-xs text-white/30">Created {fmtDate(project.createdAt)}</span>
              {project.teamModeEnabled !== false && (
                <Badge variant="secondary" className="bg-blue-500/15 text-blue-200 border-blue-400/20">
                  Team Mode
                </Badge>
              )}
            </div>
            {leadMember && (
              <p className="text-xs text-white/40 mt-2">Lead: {leadMember.agentId}</p>
            )}
          </div>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="text-white/20 hover:text-red-400 transition-colors mt-0.5"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-3 mb-2">
          <div className="flex items-center gap-2 text-white/40">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs uppercase tracking-wider">Members ({members.length})</span>
          </div>
          <AddAgentDropdown
            projectId={project.id}
            existingAgentIds={members.map((m) => m.agentId)}
          />
        </div>

        {members.length === 0 ? (
          <div className="px-3 py-6 text-center text-white/30 text-sm">
            No agents yet — add one above
          </div>
        ) : (
          <div className="space-y-0.5">
            {members.map((m) => (
              <MemberRow
                key={m.agentId}
                member={m}
                onRemove={() => handleRemoveMember(m.agentId)}
                onRoleChange={(role) => handleRoleChange(m.agentId, role)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 px-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-white/40">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs uppercase tracking-wider">Workflow Templates ({workflowTemplates.length})</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void handleCreateWorkflow()} disabled={creatingWorkflow} className="h-7 px-2 text-white/60 hover:text-white hover:bg-white/10 gap-1.5">
              {creatingWorkflow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </div>
          {workflowTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-white/35">
              Describe a workflow in plain English and HyperClaw will save it as a reusable template.
            </div>
          ) : (
            <div className="space-y-2">
              {workflowTemplates.map((template) => (
                <div key={template.id} className="rounded-lg border border-white/8 px-3 py-3 bg-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{template.name}</p>
                      <p className="text-xs text-white/40 line-clamp-2">{template.description || "Reusable workflow template"}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void handleRunWorkflow(template.id)} className="h-7 px-2 text-white/60 hover:text-white hover:bg-white/10 gap-1.5">
                      <Play className="h-3.5 w-3.5" />
                      Run
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 px-3">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="text-xs uppercase tracking-wider">Workflow Runs ({workflowRuns.length})</span>
          </div>
          {workflowRuns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-white/35">
              No workflow runs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {workflowRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-white/8 px-3 py-3 bg-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{run.id}</p>
                      <p className="text-xs text-white/40 capitalize">{run.status.replaceAll("_", " ")}</p>
                    </div>
                    <Badge variant="secondary" className="bg-white/10 text-white/70 border-white/10 capitalize">
                      {run.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Empty State ──────────────────────────────────────── */

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
        <FolderOpen className="h-6 w-6 text-blue-400/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-white/60">No project selected</p>
        <p className="text-xs text-white/30 mt-1">Select a project or create a new one</p>
      </div>
      <Button
        size="sm"
        onClick={onNew}
        className="bg-blue-500 hover:bg-blue-400 text-white gap-1.5 mt-1"
      >
        <Plus className="h-3.5 w-3.5" />
        New Project
      </Button>
    </div>
  );
}

/* ── Main Widget ──────────────────────────────────────── */

function ProjectsWidgetInner() {
  const { projects, loading, selectedProject, selectProject } = useProjects();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full bg-[hsl(225,36%,13%)] rounded-xl overflow-hidden">
      {/* Left: Project list */}
      <div className="w-56 shrink-0 border-r border-white/8 flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/8 shrink-0">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Projects</span>
          <button
            onClick={() => setCreateOpen(true)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 text-white/30 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-white/30">No projects yet</p>
            </div>
          ) : (
            projects.map((p) => (
              <ProjectListItem
                key={p.id}
                project={p}
                selected={selectedProject?.id === p.id}
                onClick={() => selectProject(p.id)}
              />
            ))
          )}
        </div>

        <div className="p-2 border-t border-white/8 shrink-0">
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-400/20 gap-1.5 text-xs h-8"
          >
            <Plus className="h-3 w-3" />
            New Project
          </Button>
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 min-w-0">
        {selectedProject ? (
          <ProjectDetail key={selectedProject.id} project={selectedProject} />
        ) : (
          <EmptyState onNew={() => setCreateOpen(true)} />
        )}
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => selectProject(id)}
      />
    </div>
  );
}

export function ProjectsWidget() {
  return (
    <ProjectsProvider>
      <ProjectsWidgetInner />
    </ProjectsProvider>
  );
}
