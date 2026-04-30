export interface ProjectStoreProject {
  id: string;
  name: string;
  description: string;
  emoji: string;
  kind?: "project" | "workflow" | null;
  status: string;
  leadAgentId?: string | null;
  teamModeEnabled?: boolean;
  defaultWorkflowTemplateId?: string | null;
  createdAt: number;
  updatedAt: number;
  members?: unknown[];
  workflowTemplates?: unknown[];
  workflowRuns?: unknown[];
}

type ProjectStoreListener = (projects: ProjectStoreProject[]) => void;
export type ProjectStoreKind = "project" | "workflow";

const RECENT_PROJECT_MUTATION_TTL_MS = 30_000;
const KIND_HINT_STORAGE_KEY = "hyperclaw:project-kind-hints:v1";
const WORKFLOW_DATA_ACCESS_PREFIX = "hyperclaw:project-data-access:";

let projectSnapshot: ProjectStoreProject[] | null = null;
const listeners = new Set<ProjectStoreListener>();
const recentMutations = new Map<string, number>();
const projectKindHints = new Map<string, ProjectStoreKind>();

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadProjectKindHints(): void {
  if (projectKindHints.size > 0 || !canUseStorage()) return;
  try {
    const raw = window.localStorage.getItem(KIND_HINT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, kind] of Object.entries(parsed)) {
      if (kind === "project" || kind === "workflow") {
        projectKindHints.set(id, kind);
      }
    }
  } catch {
    // Best-effort compatibility hints only.
  }
}

function persistProjectKindHints(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      KIND_HINT_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(projectKindHints))
    );
  } catch {
    // Storage may be disabled; the in-memory hint still covers this session.
  }
}

function dedupeProjects(projects: ProjectStoreProject[]): ProjectStoreProject[] {
  const seen = new Set<string>();
  return projects.filter((project) => {
    if (seen.has(project.id)) return false;
    seen.add(project.id);
    return true;
  });
}

function publishProjectSnapshot(next: ProjectStoreProject[]) {
  projectSnapshot = dedupeProjects(next);
  listeners.forEach((listener) => listener(projectSnapshot ?? []));
}

function isRecentlyMutated(projectId: string, now: number): boolean {
  const mutatedAt = recentMutations.get(projectId);
  if (!mutatedAt) return false;
  if (now - mutatedAt <= RECENT_PROJECT_MUTATION_TTL_MS) return true;
  recentMutations.delete(projectId);
  return false;
}

export function getProjectSnapshot(): ProjectStoreProject[] | null {
  return projectSnapshot ? [...projectSnapshot] : null;
}

export function getProjectKindHint(projectId: string): ProjectStoreKind | null {
  loadProjectKindHints();
  const explicitHint = projectKindHints.get(projectId);
  if (explicitHint) return explicitHint;
  if (canUseStorage()) {
    try {
      if (window.localStorage.getItem(`${WORKFLOW_DATA_ACCESS_PREFIX}${projectId}`)) {
        rememberProjectKind(projectId, "workflow");
        return "workflow";
      }
    } catch {
      // Ignore storage failures; callers can fall back to connector data.
    }
  }
  return null;
}

export function rememberProjectKind(projectId: string, kind: ProjectStoreKind): void {
  loadProjectKindHints();
  projectKindHints.set(projectId, kind);
  persistProjectKindHints();
}

export function replaceProjectKindHint(previousId: string, projectId: string, kind: ProjectStoreKind): void {
  loadProjectKindHints();
  projectKindHints.delete(previousId);
  projectKindHints.set(projectId, kind);
  persistProjectKindHints();
}

export function subscribeProjectStore(listener: ProjectStoreListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function projectKindForStore(project: ProjectStoreProject): ProjectStoreKind {
  const kind = project.kind ?? getProjectKindHint(project.id);
  return kind === "workflow" ? "workflow" : "project";
}

export function replaceProjectsFromFetch(
  projects: ProjectStoreProject[],
  now = Date.now(),
  kind?: ProjectStoreKind
) {
  if (kind) {
    projects.forEach((project) => rememberProjectKind(project.id, kind));
  }
  const fetchedIds = new Set(projects.map((project) => project.id));
  const current = projectSnapshot ?? [];
  const otherKindProjects = kind
    ? current.filter((project) => projectKindForStore(project) !== kind)
    : [];
  const protectedProjects = current.filter((project) => {
    if (kind && projectKindForStore(project) !== kind) return false;
    return !fetchedIds.has(project.id) && isRecentlyMutated(project.id, now);
  });

  publishProjectSnapshot([...otherKindProjects, ...protectedProjects, ...projects]);
}

export function upsertProjectSnapshot(project: ProjectStoreProject, now = Date.now()) {
  recentMutations.set(project.id, now);
  const current = projectSnapshot ?? [];
  publishProjectSnapshot([project, ...current.filter((item) => item.id !== project.id)]);
}

export function mergeProjectSnapshot(project: ProjectStoreProject) {
  const current = projectSnapshot ?? [];
  const exists = current.some((item) => item.id === project.id);
  publishProjectSnapshot(
    exists
      ? current.map((item) => (item.id === project.id ? { ...item, ...project } : item))
      : [project, ...current],
  );
}

export function replaceProjectSnapshot(previousId: string, project: ProjectStoreProject, now = Date.now()) {
  recentMutations.delete(previousId);
  recentMutations.set(project.id, now);
  const current = projectSnapshot ?? [];
  publishProjectSnapshot([
    project,
    ...current.filter((item) => item.id !== previousId && item.id !== project.id),
  ]);
}

export function patchProjectSnapshot(
  projectId: string,
  updater: (project: ProjectStoreProject) => ProjectStoreProject,
  now = Date.now(),
) {
  const current = projectSnapshot ?? [];
  if (!current.some((project) => project.id === projectId)) return;
  recentMutations.set(projectId, now);
  publishProjectSnapshot(current.map((project) => (
    project.id === projectId ? updater(project) : project
  )));
}

export function removeProjectSnapshot(projectId: string) {
  recentMutations.delete(projectId);
  publishProjectSnapshot((projectSnapshot ?? []).filter((project) => project.id !== projectId));
}

export const __testProjectStore = {
  getSnapshot: () => projectSnapshot ? [...projectSnapshot] : [],
  replaceFromFetch: replaceProjectsFromFetch,
  upsert: upsertProjectSnapshot,
  replace: replaceProjectSnapshot,
  remove: removeProjectSnapshot,
  reset: () => {
    projectSnapshot = null;
    recentMutations.clear();
    projectKindHints.clear();
    listeners.clear();
  },
};
