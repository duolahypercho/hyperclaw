export interface ProjectStoreProject {
  id: string;
  name: string;
  description: string;
  emoji: string;
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

const RECENT_PROJECT_MUTATION_TTL_MS = 30_000;

let projectSnapshot: ProjectStoreProject[] | null = null;
const listeners = new Set<ProjectStoreListener>();
const recentMutations = new Map<string, number>();

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

export function subscribeProjectStore(listener: ProjectStoreListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function replaceProjectsFromFetch(projects: ProjectStoreProject[], now = Date.now()) {
  const fetchedIds = new Set(projects.map((project) => project.id));
  const protectedProjects = (projectSnapshot ?? []).filter(
    (project) => !fetchedIds.has(project.id) && isRecentlyMutated(project.id, now),
  );

  publishProjectSnapshot([...protectedProjects, ...projects]);
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
    listeners.clear();
  },
};
