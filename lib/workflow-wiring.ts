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
  | "wait"
  | "condition"
  | "approval"
  | "sql"
  | "chart"
  | "component"
  | "output";

const VALID_WIRE_NODE_KINDS = new Set<WireNodeKind>([
  "trigger",
  "claude",
  "code",
  "codex",
  "hermes",
  "openclaw",
  "wait",
  "condition",
  "approval",
  "sql",
  "chart",
  "component",
  "output",
]);

/** A single node placed on the canvas. */
export interface WireNode {
  id: string;
  kind: WireNodeKind;
  /** Display label (user-editable in future). */
  label: string;
  /** Top-left position, in canvas pixels. */
  x: number;
  y: number;
  /**
   * Data-only node configuration, safe for bridge persistence.
   *
   * Recognized keys (all optional):
   * - `agentId` — when the node is bound to a roster agent, this is its id.
   * - `agentName` — display name snapshot taken at bind time (so the canvas
   *   doesn't go blank if the agent is later renamed/removed).
   * - `runtime` — the agent's runtime tag (`claude` / `code` / `codex` /
   *   `openclaw` / `hermes`); kept for cheap UI lookups without a roster hit.
   * - `prompt` — agent-authored objective for agent-runtime nodes only.
   * - `expectedOutput` — what the agent should produce before handing off.
   * - `inputNotes` — plain-English context / payload notes.
   * - `allowedTools` — comma-separated tool permissions for the agent.
   * - `timeout` / `duration` — operator-authored ETA / execution guard.
   * - `retryPolicy` — how the agent should retry or escalate on failure.
   * - `triggerType` — for `kind === "trigger"`: `manual` | `schedule` | `webhook`.
   * - `schedule` / `webhookPath` — trigger-specific setup notes.
   * - `waitMode` / `waitDuration` / `waitUntil` — timer configuration.
   * - `condition` / `conditionSource` — plain-English branch rule and input.
   * - `truePathLabel` / `falsePathLabel` — branch labels shown to humans.
   * - `approvalOwner` / `approvalQuestion` — human approval checkpoint.
   * - `rejectBehavior` — what happens when approval is denied.
   * - `destination` / `deliveryChannel` / `summaryFormat` / `includeNotes`
   *   — final handoff configuration.
   */
  config?: Record<string, unknown>;
}

/**
 * Snapshot a wire node passes up when selected on the canvas. Kept flat
 * (kind + label + config) so the inspector can render and edit without
 * needing a back-reference into React Flow internals.
 */
export interface WireSelection {
  id: string;
  kind: WireNodeKind;
  label: string;
  config: Record<string, unknown>;
}

/** Patch shape the inspector hands back to mutate a selected node. */
export interface WireNodePatch {
  label?: string;
  kind?: WireNodeKind;
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

// The palette exposes safe orchestration primitives only. Real execution
// happens inside roster-bound agent nodes, so risky standalone SQL / chart /
// component blocks are intentionally absent from the creation palette. Those
// legacy kinds remain in `WireNodeKind` so older persisted graphs still render.
export const WIRE_PRESETS: WirePreset[] = [
  { kind: "trigger", label: "Trigger", hint: "Kicks the workflow off" },
  { kind: "wait", label: "Wait", hint: "Pause until a time or delay" },
  { kind: "condition", label: "If / Else", hint: "Branch by a simple rule" },
  { kind: "approval", label: "Approval", hint: "Ask a human before continuing" },
  { kind: "output", label: "Output", hint: "Final result / handoff" },
];

/** AI runtime roles the inspector lets the operator switch between for an
 *  agent node. Order is editorial — Claude first because it's the default. */
export const AGENT_KIND_OPTIONS: ReadonlyArray<{
  kind: WireNodeKind;
  label: string;
  description: string;
}> = [
  { kind: "claude", label: "Claude", description: "Plans, drafts, decides" },
  { kind: "code", label: "Code", description: "Reads & writes the repo" },
  { kind: "codex", label: "Codex", description: "Independent review" },
  { kind: "openclaw", label: "OpenClaw", description: "Talks to humans" },
  { kind: "hermes", label: "Hermes", description: "Hermes agent" },
];

/** True when a node kind is one of the AI agent runtimes (i.e. swappable in
 *  the inspector's Agent picker). Control nodes are not executable work. */
export function isAgentKind(kind: WireNodeKind): boolean {
  return AGENT_KIND_OPTIONS.some((option) => option.kind === kind);
}

/** Legacy executable block kinds are rendered for old saved graphs but are no
 * longer exposed in the palette. New work should happen inside agent prompts. */
export function isLegacyWireNodeKind(kind: WireNodeKind): boolean {
  return kind === "sql" || kind === "chart" || kind === "component";
}

/**
 * Map a roster-agent's `runtime` tag onto the canvas node kind that should
 * represent it. Falls back to `"claude"` for unknown / missing values so the
 * canvas always lands on a valid agent kind.
 */
export function runtimeToWireNodeKind(
  runtime: string | undefined | null,
): WireNodeKind {
  switch ((runtime ?? "").toLowerCase()) {
    case "claude":
      return "claude";
    case "code":
    case "claude-code":
    case "claudecode":
      return "code";
    case "codex":
      return "codex";
    case "openclaw":
      return "openclaw";
    case "hermes":
      return "hermes";
    default:
      return "claude";
  }
}

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
  const nodes = parsed.nodes.filter((node): node is WireNode => {
    const candidate = node as Partial<WireNode> | null;
    return (
      !!candidate &&
      typeof candidate.id === "string" &&
      VALID_WIRE_NODE_KINDS.has(candidate.kind as WireNodeKind) &&
      typeof candidate.label === "string" &&
      typeof candidate.x === "number" &&
      typeof candidate.y === "number"
    );
  }).map((node) => {
    if (!isAgentKind(node.kind) || !node.config) return node;
    const timeout =
      typeof node.config.timeout === "string" ? node.config.timeout : "";
    const duration =
      typeof node.config.duration === "string" ? node.config.duration : "";
    if (!timeout || duration) return node;
    const { timeout: _timeout, ...config } = node.config;
    void _timeout;
    return { ...node, config: { ...config, duration: timeout } };
  });
  return {
    nodes,
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
    case "approval":
      return "human_approval";
    case "wait":
      return "wait";
    case "condition":
      return "condition";
    case "sql":
    case "chart":
    case "component":
      return "agent_task";
    case "claude":
    case "code":
    case "codex":
    case "hermes":
    case "openclaw":
      return "agent_task";
    case "output":
      return "notification";
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return "agent_task";
    }
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
    ...(typeof node.config?.agentId === "string" && node.config.agentId.trim().length > 0
      ? { preferredAgentId: node.config.agentId }
      : {}),
    metadata: {
      wireKind: node.kind,
      x: node.x,
      y: node.y,
      ...(node.config ? { config: node.config } : {}),
    },
  }));
}
