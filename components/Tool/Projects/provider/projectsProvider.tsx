"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  getProjectSnapshot,
  getProjectKindHint,
  mergeProjectSnapshot,
  patchProjectSnapshot,
  rememberProjectKind,
  removeProjectSnapshot,
  replaceProjectKindHint,
  replaceProjectSnapshot,
  replaceProjectsFromFetch,
  subscribeProjectStore,
  upsertProjectSnapshot,
} from "../project-store";

/* ── Types ────────────────────────────────────────────── */

export interface ProjectMember {
  projectId: string;
  agentId: string;
  role: "lead" | "builder" | "reviewer" | "researcher" | "ops" | "viewer";
  addedAt: number;
}

export interface WorkflowTemplateStep {
  id: string;
  name: string;
  stepType: "agent_task" | "human_approval" | "notification";
  dependsOn?: string[];
  preferredAgentId?: string;
  preferredRole?: string;
}

export interface WorkflowTemplate {
  id: string;
  projectId: string;
  name: string;
  description: string;
  triggerExamples?: string[];
  status: string;
  createdAt: number;
  updatedAt: number;
  steps?: WorkflowTemplateStep[];
}

export interface WorkflowRun {
  id: string;
  templateId: string;
  projectId: string;
  status: string;
  startedBy?: string;
  currentGateStepId?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectKind = "project" | "workflow";

export interface Project {
  id: string;
  name: string;
  description: string;
  emoji: string;
  kind: ProjectKind;
  status: "active" | "archived" | "completed";
  leadAgentId?: string | null;
  teamModeEnabled?: boolean;
  defaultWorkflowTemplateId?: string | null;
  createdAt: number;
  updatedAt: number;
  members?: ProjectMember[];
  workflowTemplates?: WorkflowTemplate[];
  workflowRuns?: WorkflowRun[];
}

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  error: string | null;
  selectedProject: Project | null;
  selectProject: (id: string | null) => Promise<void>;
  createProject: (name: string, description: string, emoji: string, kind?: ProjectKind) => Promise<Project | null>;
  updateProject: (id: string, patch: Partial<Pick<Project, "name" | "description" | "emoji" | "status" | "leadAgentId" | "teamModeEnabled" | "defaultWorkflowTemplateId">>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  addMember: (projectId: string, agentId: string, role?: string) => Promise<boolean>;
  removeMember: (projectId: string, agentId: string) => Promise<boolean>;
  listWorkflowTemplates: (projectId: string) => Promise<WorkflowTemplate[]>;
  createWorkflowTemplateFromPrompt: (projectId: string, prompt: string, name?: string) => Promise<WorkflowTemplate | null>;
  listWorkflowRuns: (projectId: string) => Promise<WorkflowRun[]>;
  startWorkflowRun: (templateId: string, startedBy?: string, inputPayload?: Record<string, unknown>, projectId?: string) => Promise<WorkflowRun | null>;
  refresh: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

/* ── Bridge response normalization ───────────────────── */

type BridgeRecord = Record<string, unknown>;

const PROJECT_STATUSES = new Set<Project["status"]>(["active", "archived", "completed"]);
const PROJECT_KINDS = new Set<ProjectKind>(["project", "workflow"]);
const MEMBER_ROLES = new Set<ProjectMember["role"]>([
  "lead",
  "builder",
  "reviewer",
  "researcher",
  "ops",
  "viewer",
]);
const WORKFLOW_STEP_TYPES = new Set<WorkflowTemplateStep["stepType"]>([
  "agent_task",
  "human_approval",
  "notification",
]);

function isRecord(value: unknown): value is BridgeRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapBridgeData(result: unknown, objectKey?: string): unknown {
  if (Array.isArray(result)) return result;
  if (!isRecord(result)) return undefined;
  if (result.success === false) return undefined;
  if (objectKey && objectKey in result) return result[objectKey];
  if ("data" in result) return result.data;
  if ("result" in result) return result.result;
  return result;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function stringArrayValue(record: BridgeRecord, camelKey: string, snakeKey?: string) {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function stringValue(record: BridgeRecord, camelKey: string, snakeKey?: string, fallback = "") {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(record: BridgeRecord, camelKey: string, snakeKey?: string) {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(record: BridgeRecord, camelKey: string, snakeKey?: string, fallback = Date.now()) {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function booleanValue(record: BridgeRecord, camelKey: string, snakeKey?: string) {
  const value = record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
  return typeof value === "boolean" ? value : undefined;
}

function normalizeMember(value: unknown, projectId: string): ProjectMember | null {
  if (!isRecord(value)) return null;
  const agentId = stringValue(value, "agentId", "agent_id");
  if (!agentId) return null;
  const rawRole = stringValue(value, "role", undefined, "builder");
  const role = MEMBER_ROLES.has(rawRole as ProjectMember["role"])
    ? (rawRole as ProjectMember["role"])
    : "builder";

  return {
    projectId: stringValue(value, "projectId", "project_id", projectId),
    agentId,
    role,
    addedAt: numberValue(value, "addedAt", "added_at"),
  };
}

function normalizeWorkflowStep(value: unknown): WorkflowTemplateStep | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value, "id");
  if (!id) return null;
  const rawStepType = stringValue(value, "stepType", "step_type", "agent_task");
  const stepType = WORKFLOW_STEP_TYPES.has(rawStepType as WorkflowTemplateStep["stepType"])
    ? (rawStepType as WorkflowTemplateStep["stepType"])
    : "agent_task";

  return {
    id,
    name: stringValue(value, "name"),
    stepType,
    dependsOn: stringArrayValue(value, "dependsOn", "depends_on"),
    preferredAgentId: nullableStringValue(value, "preferredAgentId", "preferred_agent_id") ?? undefined,
    preferredRole: nullableStringValue(value, "preferredRole", "preferred_role") ?? undefined,
  };
}

function normalizeWorkflowTemplate(value: unknown, projectId: string): WorkflowTemplate | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value, "id");
  if (!id) return null;
  const steps = Array.isArray(value.steps)
    ? value.steps
        .map(normalizeWorkflowStep)
        .filter((step): step is WorkflowTemplateStep => Boolean(step?.id))
    : undefined;

  return {
    id,
    projectId: stringValue(value, "projectId", "project_id", projectId),
    name: stringValue(value, "name", undefined, "Workflow"),
    description: stringValue(value, "description"),
    triggerExamples: stringArrayValue(value, "triggerExamples", "trigger_examples"),
    status: stringValue(value, "status", undefined, "active"),
    createdAt: numberValue(value, "createdAt", "created_at"),
    updatedAt: numberValue(value, "updatedAt", "updated_at"),
    steps,
  };
}

function normalizeWorkflowRun(value: unknown, projectId: string): WorkflowRun | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value, "id");
  if (!id) return null;
  return {
    id,
    templateId: stringValue(value, "templateId", "template_id"),
    projectId: stringValue(value, "projectId", "project_id", projectId),
    status: stringValue(value, "status", undefined, "pending"),
    startedBy: nullableStringValue(value, "startedBy", "started_by") ?? undefined,
    currentGateStepId: nullableStringValue(value, "currentGateStepId", "current_gate_step_id") ?? undefined,
    createdAt: numberValue(value, "createdAt", "created_at"),
    updatedAt: numberValue(value, "updatedAt", "updated_at"),
  };
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value, "id");
  const name = stringValue(value, "name");
  if (!id || !name) return null;
  const timestampFallback = Date.now();

  const rawStatus = stringValue(value, "status", undefined, "active");
  const status = PROJECT_STATUSES.has(rawStatus as Project["status"])
    ? (rawStatus as Project["status"])
    : "active";
  const rawKind = stringValue(value, "kind", undefined, "");
  const kind = PROJECT_KINDS.has(rawKind as ProjectKind)
    ? (rawKind as ProjectKind)
    : getProjectKindHint(id) ?? "project";

  return {
    id,
    name,
    description: stringValue(value, "description"),
    emoji: stringValue(value, "emoji", undefined, "📦"),
    kind,
    status,
    leadAgentId: nullableStringValue(value, "leadAgentId", "lead_agent_id"),
    teamModeEnabled: booleanValue(value, "teamModeEnabled", "team_mode_enabled"),
    defaultWorkflowTemplateId: nullableStringValue(value, "defaultWorkflowTemplateId", "default_workflow_template_id"),
    createdAt: numberValue(value, "createdAt", "created_at", timestampFallback),
    updatedAt: numberValue(value, "updatedAt", "updated_at", timestampFallback),
    members: Array.isArray(value.members)
      ? value.members
          .map((member) => normalizeMember(member, id))
          .filter((member): member is ProjectMember => Boolean(member))
      : undefined,
    workflowTemplates: Array.isArray(value.workflowTemplates)
      ? value.workflowTemplates
          .map((template) => normalizeWorkflowTemplate(template, id))
          .filter((template): template is WorkflowTemplate => Boolean(template))
      : Array.isArray(value.workflow_templates)
      ? value.workflow_templates
          .map((template) => normalizeWorkflowTemplate(template, id))
          .filter((template): template is WorkflowTemplate => Boolean(template))
      : undefined,
    workflowRuns: Array.isArray(value.workflowRuns)
      ? value.workflowRuns
          .map((run) => normalizeWorkflowRun(run, id))
          .filter((run): run is WorkflowRun => Boolean(run))
      : Array.isArray(value.workflow_runs)
      ? value.workflow_runs
          .map((run) => normalizeWorkflowRun(run, id))
          .filter((run): run is WorkflowRun => Boolean(run))
      : undefined,
  };
}

function bridgeError(result: unknown, fallback: string): string | null {
  if (!isRecord(result) || result.success !== false) return null;
  return typeof result.error === "string" ? result.error : fallback;
}

function bridgeSucceeded(result: unknown): boolean {
  if (result === true) return true;
  if (!isRecord(result)) return false;
  return result.success !== false;
}

/* ── Provider ─────────────────────────────────────────── */

export function ProjectsProvider({
  children,
  kind = "project",
}: {
  children: React.ReactNode;
  kind?: ProjectKind;
}) {
  const [projects, setProjects] = useState<Project[]>(() =>
    (getProjectSnapshot() ?? [])
      .map(normalizeProject)
      .filter((project): project is Project => project !== null && project.kind === kind)
  );
  const [loading, setLoading] = useState(() => getProjectSnapshot() === null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(getProjectSnapshot() === null);
    setError(null);
    try {
      const res = await bridgeInvoke("project-list", { kind });
      const data = unwrapBridgeData(res, "projects");
      if (Array.isArray(data)) {
        replaceProjectsFromFetch(
          data
            .map(normalizeProject)
            .filter((project): project is Project => project !== null && project.kind === kind),
          Date.now(),
          kind
        );
        return;
      }
      setError(bridgeError(res, "Failed to load projects") ?? "Failed to load projects");
    } catch (e) {
      setError(errorMessage(e, "Failed to load projects"));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => subscribeProjectStore((next) => {
    setProjects(
      next
        .map(normalizeProject)
        .filter((project): project is Project => project !== null && project.kind === kind)
    );
    setLoading(false);
  }), [kind]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // When a project is selected, fetch its full detail (with members)
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedId) ?? null;
  }, [projects, selectedId]);

  const selectProject = useCallback(async (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    try {
      const res = await bridgeInvoke("project-get", { id });
      const project = normalizeProject(unwrapBridgeData(res, "project"));
      if (project) {
        const scopedProject = { ...project, kind };
        rememberProjectKind(scopedProject.id, kind);
        mergeProjectSnapshot(scopedProject);
      } else {
        setError(bridgeError(res, "Failed to load project") ?? "Failed to load project");
      }
    } catch (e) {
      setError(errorMessage(e, "Failed to load project"));
    }
  }, [kind]);

  const createProject = useCallback(async (name: string, description: string, emoji: string, overrideKind?: ProjectKind) => {
    const projectKind = overrideKind ?? kind;
    const now = Date.now();
    const optimisticProject: Project = {
      id: `optimistic-project-${now}`,
      name,
      description,
      emoji,
      kind: projectKind,
      status: "active",
      leadAgentId: null,
      teamModeEnabled: true,
      defaultWorkflowTemplateId: null,
      createdAt: now,
      updatedAt: now,
      members: [],
      workflowTemplates: [],
      workflowRuns: [],
    };
    rememberProjectKind(optimisticProject.id, projectKind);
    upsertProjectSnapshot(optimisticProject, now);

    try {
      setError(null);
      const res = await bridgeInvoke("project-create", { name, description, emoji, kind: projectKind });
      const project = normalizeProject(unwrapBridgeData(res, "project"));
      if (project) {
        const normalizedProject = { ...project, kind: projectKind };
        replaceProjectKindHint(optimisticProject.id, normalizedProject.id, projectKind);
        replaceProjectSnapshot(optimisticProject.id, normalizedProject);
        return normalizedProject;
      }
      removeProjectSnapshot(optimisticProject.id);
      setError(bridgeError(res, "Failed to create project") ?? "Failed to create project");
    } catch (e) {
      removeProjectSnapshot(optimisticProject.id);
      setError(errorMessage(e, "Failed to create project"));
    }
    return null;
  }, [kind]);

  const updateProject = useCallback(async (id: string, patch: Partial<Pick<Project, "name" | "description" | "emoji" | "status" | "leadAgentId" | "teamModeEnabled" | "defaultWorkflowTemplateId">>) => {
    try {
      setError(null);
      const res = await bridgeInvoke("project-update", { id, ...patch });
      const project = normalizeProject(unwrapBridgeData(res, "project"));
      if (project) {
        upsertProjectSnapshot(project);
        return project;
      }
      setError(bridgeError(res, "Failed to update project") ?? "Failed to update project");
    } catch (e) {
      setError(errorMessage(e, "Failed to update project"));
    }
    return null;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    try {
      setError(null);
      const res = await bridgeInvoke("project-delete", { id });
      if (bridgeSucceeded(res)) {
        removeProjectSnapshot(id);
        if (selectedId === id) setSelectedId(null);
        return true;
      }
      setError(bridgeError(res, "Failed to delete project") ?? "Failed to delete project");
    } catch (e) {
      setError(errorMessage(e, "Failed to delete project"));
    }
    return false;
  }, [selectedId]);

  const addMember = useCallback(async (projectId: string, agentId: string, role = "builder") => {
    try {
      setError(null);
      const res = await bridgeInvoke("project-add-member", { projectId, agentId, role });
      if (bridgeSucceeded(res)) {
        const memberRole = MEMBER_ROLES.has(role as ProjectMember["role"])
          ? (role as ProjectMember["role"])
          : "builder";
        patchProjectSnapshot(projectId, (project) => ({
          ...project,
          members: [
            ...(((project.members as ProjectMember[] | undefined) ?? []).filter((member) => member.agentId !== agentId)),
            {
              projectId,
              agentId,
              role: memberRole,
              addedAt: Date.now(),
            },
          ],
        }));
        return true;
      }
      setError(bridgeError(res, "Failed to add project member") ?? "Failed to add project member");
    } catch (e) {
      setError(errorMessage(e, "Failed to add project member"));
    }
    return false;
  }, []);

  const listWorkflowTemplates = useCallback(async (projectId: string) => {
    try {
      const res = await bridgeInvoke("workflow-template-list", { projectId });
      const data = unwrapBridgeData(res, "templates");
      return Array.isArray(data)
        ? data
            .map((template) => normalizeWorkflowTemplate(template, projectId))
            .filter((template): template is WorkflowTemplate => Boolean(template))
        : (() => {
            const err = bridgeError(res, "Failed to load workflow templates");
            if (err) setError(err);
            return [];
          })();
    } catch (e) {
      setError(errorMessage(e, "Failed to load workflow templates"));
    }
    return [];
  }, []);

  const createWorkflowTemplateFromPrompt = useCallback(async (projectId: string, prompt: string, name?: string) => {
    try {
      setError(null);
      const res = await bridgeInvoke("workflow-template-create-from-prompt", { projectId, prompt, name });
      const template = normalizeWorkflowTemplate(unwrapBridgeData(res, "template"), projectId);
      if (template) {
        return template;
      }
      setError(bridgeError(res, "Failed to create workflow template") ?? "Failed to create workflow template");
    } catch (e) {
      setError(errorMessage(e, "Failed to create workflow template"));
    }
    return null;
  }, []);

  const listWorkflowRuns = useCallback(async (projectId: string) => {
    try {
      const res = await bridgeInvoke("workflow-run-list", { projectId, limit: 20 });
      const data = unwrapBridgeData(res, "runs");
      return Array.isArray(data)
        ? data
            .map((run) => normalizeWorkflowRun(run, projectId))
            .filter((run): run is WorkflowRun => Boolean(run))
        : (() => {
            const err = bridgeError(res, "Failed to load workflow runs");
            if (err) setError(err);
            return [];
          })();
    } catch (e) {
      setError(errorMessage(e, "Failed to load workflow runs"));
    }
    return [];
  }, []);

  const startWorkflowRun = useCallback(async (templateId: string, startedBy?: string, inputPayload?: Record<string, unknown>, projectId?: string) => {
    try {
      setError(null);
      const res = await bridgeInvoke("workflow-run-start", {
        templateId,
        startedBy,
        inputPayload,
        ...(projectId ? { projectId } : {}),
      });
      const run = normalizeWorkflowRun(unwrapBridgeData(res, "run"), projectId ?? "");
      if (run) {
        return run;
      }
      setError(bridgeError(res, "Failed to start workflow run") ?? "Failed to start workflow run");
    } catch (e) {
      setError(errorMessage(e, "Failed to start workflow run"));
    }
    return null;
  }, []);

  const removeMember = useCallback(async (projectId: string, agentId: string) => {
    try {
      setError(null);
      const res = await bridgeInvoke("project-remove-member", { projectId, agentId });
      if (bridgeSucceeded(res)) {
        patchProjectSnapshot(projectId, (project) => ({
          ...project,
          members: ((project.members as ProjectMember[] | undefined) ?? []).filter((m) => m.agentId !== agentId),
        }));
        return true;
      }
      setError(bridgeError(res, "Failed to remove project member") ?? "Failed to remove project member");
    } catch (e) {
      setError(errorMessage(e, "Failed to remove project member"));
    }
    return false;
  }, []);

  const value = useMemo<ProjectsContextValue>(() => ({
    projects,
    loading,
    error,
    selectedProject,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    addMember,
    removeMember,
    listWorkflowTemplates,
    createWorkflowTemplateFromPrompt,
    listWorkflowRuns,
    startWorkflowRun,
    refresh: fetchProjects,
  }), [projects, loading, error, selectedProject, selectProject, createProject, updateProject, deleteProject, addMember, removeMember, listWorkflowTemplates, createWorkflowTemplateFromPrompt, listWorkflowRuns, startWorkflowRun, fetchProjects]);

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}
