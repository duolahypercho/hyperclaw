import type { Project } from "$/components/Tool/Projects/provider/projectsProvider";
import type { ProjectRosterAgent } from "./use-agent-roster";
import type { Task, TaskStatus } from "./task-types";

// Pure reference helpers used by tests and future client-side fallbacks. The
// connector is the authoritative heartbeat runner so all writes stay local.
export interface TeammateProfile {
  id: string;
  name: string;
  role?: string;
  runtime?: string;
  status?: string;
  responsibility?: string;
  soulSummary?: string;
}

export interface LeadAssignment {
  taskId: string;
  agentId: string;
  reason?: string;
}

export interface RuntimeOutcome {
  status: "completed" | "blocked" | "in_progress";
  summary: string;
  blocker: string | null;
  artifacts: string[];
}

export interface ProjectLeadHeartbeatResult {
  success: boolean;
  projectId: string;
  leadAgentId?: string;
  leadReason?: string;
  deletedMateIds?: string[];
  cleanup?: {
    deletedMateIds?: string[];
    removedMembers?: number;
    resetAssignments?: number;
    leadChanged?: boolean;
  };
  candidateSource?: "project" | "team" | "none";
  openIssueCount?: number;
  assignments?: Array<{ taskId: string; agentId: string; reason?: string }>;
  dispatches?: Array<{
    success?: boolean;
    taskId?: string;
    agentId?: string;
    runtime?: string;
    taskStatus?: TaskStatus;
    outcome?: RuntimeOutcome;
    error?: string;
  }>;
  heartbeatAt?: number;
  promptVersion?: string;
}

export function isOpenUnassignedIssue(task: Task, projectId?: string): boolean {
  return task.status === "pending"
    && !task.assignedAgentId
    && (!projectId || task.projectId === projectId);
}

export function loadTeammateProfiles(
  project: Project | null | undefined,
  rosterAgents: ProjectRosterAgent[]
): TeammateProfile[] {
  const byId = new Map(rosterAgents.map((agent) => [agent.id, agent]));
  const profiles: TeammateProfile[] = [];
  for (const member of project?.members ?? []) {
    const agent = byId.get(member.agentId);
    if (!agent) continue;
    profiles.push({
        id: agent.id,
        name: agent.name,
        role: agent.subtitle ?? member.role,
        runtime: agent.runtime,
        status: agent.status,
        responsibility: agent.subtitle ?? member.role,
        soulSummary: agent.subtitle ?? "",
    });
  }
  return profiles;
}

export function findDeletedProjectMates(
  project: Project | null | undefined,
  rosterAgents: ProjectRosterAgent[]
): string[] {
  const live = new Map(rosterAgents.map((agent) => [agent.id, agent]));
  return (project?.members ?? [])
    .filter((member) => {
      const agent = live.get(member.agentId);
      return !agent || agent.status === "deleting";
    })
    .map((member) => member.agentId);
}

export function sanitizeAssignmentsForDeletedMates(
  tasks: Task[],
  deletedAgentIds: string[]
): Task[] {
  const deleted = new Set(deletedAgentIds);
  return tasks.map((task) => {
    if (!task.assignedAgentId || !deleted.has(task.assignedAgentId)) return task;
    if (task.status !== "pending" && task.status !== "in_progress") return task;
    return {
      ...task,
      status: "pending",
      assignedAgent: undefined,
      assignedAgentId: undefined,
    };
  });
}

export function scoreTeammateForProjectLead(
  project: Project,
  issues: Task[],
  teammate: TeammateProfile
): number {
  if (teammate.status === "deleting") return -1;
  const corpus = [
    project.name,
    project.description,
    ...issues.flatMap((issue) => [issue.title, issue.description]),
  ].join(" ");
  const profileText = [
    teammate.name,
    teammate.role,
    teammate.responsibility,
    teammate.soulSummary,
  ].join(" ");
  let score = keywordOverlap(corpus, profileText);
  if (/lead|manager|orchestrat/i.test(teammate.role ?? "")) score += 3;
  if (score === 0) score = 1;
  return score;
}

export function resolveBestFitLead(
  project: Project,
  issues: Task[],
  teammates: TeammateProfile[]
): { agentId: string; reason: string } | null {
  const currentLead = project.leadAgentId
    ? teammates.find((profile) => profile.id === project.leadAgentId && profile.status !== "deleting")
    : null;
  if (currentLead) {
    return { agentId: currentLead.id, reason: "current lead is still available" };
  }
  const scored = teammates
    .map((profile) => ({
      profile,
      score: scoreTeammateForProjectLead(project, issues, profile),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return {
    agentId: best.profile.id,
    reason: `best responsibility/profile match for ${issues.length} unresolved issue${issues.length === 1 ? "" : "s"}`,
  };
}

export function buildLeadAssignmentPrompt(
  project: Project,
  issues: Task[],
  teammates: TeammateProfile[]
): string {
  return [
    "You are the project lead. Assign every open issue to the best teammate.",
    "Return only JSON: { \"assignments\": [{ \"taskId\": string, \"agentId\": string, \"reason\": string }] }.",
    "",
    `Project: ${project.name}`,
    project.description,
    "",
    "Open issues:",
    JSON.stringify(issues.map((issue) => ({
      taskId: issue._id,
      title: issue.title,
      description: issue.description,
      status: issue.status,
    })), null, 2),
    "",
    "Teammates:",
    JSON.stringify(teammates, null, 2),
  ].join("\n");
}

export function parseLeadAssignmentResponse(raw: string, activeAgentIds: Set<string>): LeadAssignment[] {
  const parsed = parseJsonObject(raw) as { assignments?: LeadAssignment[] } | LeadAssignment[] | null;
  const assignments = Array.isArray(parsed) ? parsed : parsed?.assignments;
  if (!Array.isArray(assignments)) return [];
  return assignments.filter((assignment) => (
    typeof assignment.taskId === "string"
    && typeof assignment.agentId === "string"
    && activeAgentIds.has(assignment.agentId)
  ));
}

export function buildTaskDispatchPrompt(
  task: Task,
  project: Project,
  assigneeProfile: TeammateProfile,
  runtime: string
): string {
  return [
    `You are ${assigneeProfile.name}. Start executing this assigned project issue now.`,
    "",
    `Project: ${project.name}`,
    project.description,
    "",
    `Issue: ${task.title}`,
    task.description,
    "",
    `Runtime: ${runtime}`,
    `Responsibility/profile: ${assigneeProfile.responsibility ?? assigneeProfile.role ?? "generalist"}`,
    "",
    "If you need human input, mark blocked with the exact question.",
    "Finish with JSON: { \"status\": \"completed\" | \"blocked\" | \"in_progress\", \"summary\": string, \"blocker\": string | null, \"artifacts\": string[] }",
  ].join("\n");
}

export function mapRuntimeOutcomeToTaskStatus(response: string | RuntimeOutcome): TaskStatus {
  const outcome = typeof response === "string" ? parseRuntimeOutcome(response) : response;
  if (outcome.status === "completed") return "completed";
  if (outcome.status === "blocked") return "blocked";
  return "in_progress";
}

export function parseRuntimeOutcome(raw: string): RuntimeOutcome {
  const parsed = parseJsonObject(raw) as Partial<RuntimeOutcome> | null;
  const status = parsed?.status === "completed" || parsed?.status === "blocked"
    ? parsed.status
    : "in_progress";
  return {
    status,
    summary: typeof parsed?.summary === "string" ? parsed.summary : raw.trim(),
    blocker: typeof parsed?.blocker === "string" ? parsed.blocker : null,
    artifacts: Array.isArray(parsed?.artifacts)
      ? parsed.artifacts.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function keywordOverlap(a: string, b: string): number {
  const left = keywordSet(a);
  const right = keywordSet(b);
  let score = 0;
  left.forEach((word) => {
    if (right.has(word)) score += 1;
  });
  return score;
}

function keywordSet(text: string): Set<string> {
  const stop = new Set(["the", "and", "for", "with", "this", "that", "project", "issue", "task"]);
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length > 2 && !stop.has(word)) ?? []
  );
}

function parseJsonObject(raw: string): unknown {
  const candidates = [
    raw.trim(),
    ...Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)).map((match) => match[1].trim()),
  ];
  const firstObject = raw.indexOf("{");
  const lastObject = raw.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(raw.slice(firstObject, lastObject + 1));
  }
  const firstArray = raw.indexOf("[");
  const lastArray = raw.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    candidates.push(raw.slice(firstArray, lastArray + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
