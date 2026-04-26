/**
 * Workflow wiring storage — persists design-time canvas layouts.
 *
 * Workflow graphs are persisted through the connector SQLite bridge. The
 * localStorage path remains as a one-release import fallback for older drafts.
 *
 * The wire format is intentionally agent-agnostic: a Trigger node has no
 * input port, an Output node has no output port, and everything in between
 * carries an arbitrary `kind` so we can grow the palette without migrations.
 */
import {
  getWorkflowGraph,
  saveWorkflowGraph,
  type BridgeWorkflowStep,
} from "$/lib/hyperclaw-bridge-client";

const STORAGE_PREFIX = "hc:wire:v1:";

/** Distinct visual archetypes available in the palette. */
export type WireNodeKind =
  | "trigger"
  | "claude"
  | "code"
  | "codex"
  | "hermes"
  | "openclaw"
  | "sql"
  | "chart"
  | "component"
  | "output";

/** A single node placed on the canvas. */
export interface WireNode {
  id: string;
  kind: WireNodeKind;
  /** Display label (user-editable in future). */
  label: string;
  /** Top-left position, in canvas pixels. */
  x: number;
  y: number;
  /** Data-only node configuration, safe for bridge persistence. */
  config?: Record<string, unknown>;
}

/** A directed connection between two nodes. */
export interface WireEdge {
  id: string;
  /** Source node id (output port). */
  from: string;
  /** Target node id (input port). */
  to: string;
}

/** Persisted graph for one workflow project. */
export interface WireGraph {
  nodes: WireNode[];
  edges: WireEdge[];
  updatedAt: number;
  version?: number;
}

/* ── Presets driving the canvas palette ─────────────────────────────────── */

export interface WirePreset {
  kind: WireNodeKind;
  label: string;
  /** Short description rendered under the palette button. */
  hint: string;
}

export const WIRE_PRESETS: WirePreset[] = [
  { kind: "trigger", label: "Trigger", hint: "Kicks the workflow off" },
  { kind: "claude", label: "Claude", hint: "Plans, drafts, decides" },
  { kind: "code", label: "Code", hint: "Reads & writes the repo" },
  { kind: "codex", label: "Codex", hint: "Independent review" },
  { kind: "openclaw", label: "OpenClaw", hint: "Talks to humans" },
  { kind: "hermes", label: "Hermes", hint: "Hermes agent" },
  { kind: "sql", label: "SQL", hint: "Query connector data" },
  { kind: "chart", label: "Chart", hint: "Visualize query output" },
  { kind: "component", label: "Component", hint: "Reusable UI/data block" },
  { kind: "output", label: "Output", hint: "Final result / handoff" },
];

/* ── Persistence ─────────────────────────────────────────────────────────── */

const isBrowser = (): boolean => typeof window !== "undefined";

/** Load the persisted graph for a workflow, or `null` if nothing saved yet. */
export function loadWireGraph(projectId: string): WireGraph | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WireGraph;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeWireGraph(raw: unknown): WireGraph | null {
  const parsed = raw as Partial<WireGraph> | null;
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
  return {
    nodes: parsed.nodes,
    edges: parsed.edges,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    version: parsed.version,
  };
}

/** Load a graph from SQLite first, then fall back to legacy localStorage. */
export async function loadPersistedWireGraph(projectId: string, templateId?: string): Promise<WireGraph | null> {
  try {
    const persisted = await getWorkflowGraph({ projectId, ...(templateId ? { templateId } : {}) });
    const graph = normalizeWireGraph(persisted?.graph);
    if (graph) return { ...graph, version: persisted?.version };
  } catch {
    // Connector may be unavailable in browser-only preview; fallback below.
  }
  return loadWireGraph(projectId);
}

/** Save (overwrite) the graph for a workflow. */
export function saveWireGraph(projectId: string, graph: WireGraph): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + projectId,
      JSON.stringify({ ...graph, updatedAt: Date.now() }),
    );
  } catch {
    // Storage full / disabled — best-effort.
  }
}

/** Persist to SQLite and keep localStorage as a best-effort import fallback. */
export async function savePersistedWireGraph(projectId: string, graph: WireGraph, templateId?: string): Promise<void> {
  const withTimestamp = { ...graph, updatedAt: Date.now() };
  saveWireGraph(projectId, withTimestamp);
  await saveWorkflowGraph({
    projectId,
    ...(templateId ? { templateId } : {}),
    graph: withTimestamp as unknown as Record<string, unknown>,
  });
}

/** Drop the persisted graph for a workflow. */
export function clearWireGraph(projectId: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + projectId);
  } catch {
    /* ignore */
  }
}

/* ── Constructors ────────────────────────────────────────────────────────── */

let nodeCounter = 0;
let edgeCounter = 0;

function uid(prefix: string, counter: number): string {
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function newWireNode(
  kind: WireNodeKind,
  position: { x: number; y: number },
  label?: string,
): WireNode {
  nodeCounter += 1;
  const preset = WIRE_PRESETS.find((p) => p.kind === kind);
  return {
    id: uid("n", nodeCounter),
    kind,
    label: label ?? preset?.label ?? kind,
    x: position.x,
    y: position.y,
  };
}

export function newWireEdge(from: string, to: string): WireEdge {
  edgeCounter += 1;
  return {
    id: uid("e", edgeCounter),
    from,
    to,
  };
}

/* ── Capability map per kind ─────────────────────────────────────────────── */

/** Whether nodes of this kind expose an input port (left). */
export function hasInputPort(kind: WireNodeKind): boolean {
  return kind !== "trigger";
}

/** Whether nodes of this kind expose an output port (right). */
export function hasOutputPort(kind: WireNodeKind): boolean {
  return kind !== "output";
}

export function wireNodeKindToStepType(kind: WireNodeKind): BridgeWorkflowStep["stepType"] {
  switch (kind) {
    case "trigger":
      return "manual_trigger";
    case "sql":
      return "sql_query";
    case "chart":
      return "chart";
    case "component":
      return "component";
    case "output":
      return "notification";
    default:
      return "agent_task";
  }
}

export function wireGraphToTemplateSteps(graph: Pick<WireGraph, "nodes" | "edges">): BridgeWorkflowStep[] {
  const deps = new Map<string, string[]>();
  graph.edges.forEach((edge) => {
    deps.set(edge.to, [...(deps.get(edge.to) ?? []), edge.from]);
  });
  return graph.nodes.map((node, index) => ({
    id: node.id,
    name: node.label,
    stepType: wireNodeKindToStepType(node.kind),
    dependsOn: deps.get(node.id) ?? [],
    position: index,
    metadata: {
      wireKind: node.kind,
      x: node.x,
      y: node.y,
      ...(node.config ? { config: node.config } : {}),
    },
  }));
}
