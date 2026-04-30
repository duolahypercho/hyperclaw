/**
 * Public API for the Projects feature.
 * Import from `@/components/projects` to keep call sites tidy.
 */

export { AgentGlyph, AgentCluster } from "./agent-glyph";
export { ProjectMemberCluster } from "./project-member-cluster";
export { StatusPill } from "./status-pill";
export { ProjectCard } from "./project-card";
export { ProjectCardMenu } from "./project-card-menu";
export { EditProjectDrawer } from "./edit-project-drawer";
export { ProjectRemoveDialog } from "./project-remove-dialog";
export { ProjectsList } from "./projects-list";
export { ProjectCanvas } from "./project-canvas";
export { ProjectForm } from "./project-form";

export {
  AGENT_KINDS,
  AGENTS,
  PROJECTS,
  TEMPLATES,
  getAgent,
  getAgentKind,
  getProject,
} from "./data";

export type {
  Agent,
  AgentKind,
  AgentKindId,
  AgentStatus,
  NodeStatus,
  Project,
  ProjectEdge,
  ProjectIssueCounts,
  ProjectNode,
  ProjectStatus,
  ProjectTemplate,
} from "./types";
