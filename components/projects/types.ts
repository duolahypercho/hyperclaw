/**
 * Domain types for the Ensemble Projects feature.
 * A project is an issue workspace: leads create and assign work to agents,
 * while workflows remain separate reusable step-by-step automations.
 */

export type AgentKindId =
  | "claude"
  | "code"
  | "codex"
  | "openclaw"
  | "hermes"
  | "input"
  | "output";

export interface AgentKind {
  id: AgentKindId;
  label: string;
  glyph: string;
  cls: string;
  role: string;
}

export type AgentStatus = "online" | "busy" | "offline";

export interface Agent {
  id: string;
  name: string;
  kind: AgentKindId;
  title: string;
  dept: string;
  status: AgentStatus;
  tagline: string;
  emoji: string;
  tone: string;
  cost: { today: number; month: number; tokens: number };
  projects: number;
}

export type ProjectStatus = "live" | "paused" | "needs" | "idle";
export type NodeStatus = "idle" | "queued" | "running" | "done" | "paused" | "needs";

export interface ProjectNode {
  id: string;
  kind: AgentKindId;
  x: number;
  y: number;
  title: string;
  body: string;
  status: NodeStatus;
  ms: number | null;
}

export type ProjectEdge = [from: string, to: string];

export interface ProjectIssueCounts {
  /** Issues currently waiting to be picked up (`pending`). */
  open: number;
  /** Issues actively moving (`in_progress`). */
  inProgress: number;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string;
  owner: string;
  agents: string[];
  cost: { run: number; month: number };
  runs: number;
  eta: string;
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  /**
   * Real issue rollup, keyed off the local project issue store. When omitted, the card
   * falls back to deriving counts from `nodes` (used by mock/loading data).
   */
  issueCounts?: ProjectIssueCounts;
  /**
   * Whether the project has a workflow template attached. The card surfaces
   * a binary indicator instead of step counts when this is provided.
   */
  workflowAttached?: boolean;
  /**
   * Stable id of the project's lead agent. Used to highlight the lead in the
   * member cluster (ring + tooltip). Derived from the StoredProject so cards
   * can render without joining the projects + agents stores again.
   */
  leadAgentId?: string;
  /** Optional emoji glyph for the project (used by the edit dialog). */
  emoji?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  desc: string;
  chain: string[];
  agents: string[];
}
