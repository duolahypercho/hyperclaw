/**
 * Domain types for the Ensemble Projects feature.
 * A "project" in Ensemble = a wired crew of agents (a workflow).
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
}

export interface ProjectTemplate {
  id: string;
  name: string;
  desc: string;
  chain: string[];
  agents: string[];
}
