"use client";

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Clock,
  Code2,
  Component,
  Database,
  Maximize2,
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useProjectAgentRoster,
  type ProjectRosterAgent,
} from "$/components/projects/use-agent-roster";
import { AgentMonogram } from "$/components/projects/agent-monogram";
import { Button } from "@/components/ui/button";
import {
  WIRE_PRESETS,
  hasInputPort,
  hasOutputPort,
  loadPersistedWireGraph,
  newWireEdge,
  newWireNode,
  runtimeToWireNodeKind,
  savePersistedWireGraph,
  type WireEdge,
  type WireNode,
  type WireNodeKind,
  type WireNodePatch,
  type WireSelection,
} from "$/lib/workflow-wiring";
import { publishWorkflowGraphTemplate } from "$/lib/hyperclaw-bridge-client";

/* ── Layout constants ────────────────────────────────────────────────────── */

// Card is sized to read like a small org-chart tile: avatar + role on top,
// the actual instruction in the body, and a footer that answers "how long?"
// and "handed off to whom?". Bigger than the old chip so the workflow tells a
// human-readable story without a side panel.
const NODE_W = 224;
const NODE_H = 124;
const SAVE_DEBOUNCE_MS = 350;
const LANE_X_GAP = NODE_W + 88;
const LANE_Y_GAP = NODE_H + 36;
const CANVAS_BG_DARK = "hsl(222 47% 8%)";
const CANVAS_BG_LIGHT = "hsl(216 33% 97%)";

/* ── Visual map per kind (lucide icon + color class on ag-glyph) ─────────── */

function NodeIcon({
  kind,
  size = 12,
}: {
  kind: WireNodeKind;
  size?: number;
}) {
  switch (kind) {
    case "trigger":
      return <Zap size={size} />;
    case "claude":
      return <Sparkles size={size} />;
    case "code":
      return <Code2 size={size} />;
    case "codex":
      return <Search size={size} />;
    case "hermes":
      return <MessageSquare size={size} />;
    case "openclaw":
      return <Bot size={size} />;
    case "wait":
      return <Clock size={size} />;
    case "condition":
      return <ArrowRight size={size} />;
    case "approval":
      return <Check size={size} />;
    case "sql":
      return <Database size={size} />;
    case "chart":
      return <BarChart3 size={size} />;
    case "component":
      return <Component size={size} />;
    case "output":
      return <Send size={size} />;
  }
}

/** Compact uppercase role tag shown under the node label (header band). */
function nodeRoleLabel(kind: WireNodeKind): string {
  switch (kind) {
    case "trigger":
      return "Trigger";
    case "claude":
      return "Claude";
    case "code":
      return "Code";
    case "codex":
      return "Codex";
    case "hermes":
      return "Hermes";
    case "openclaw":
      return "OpenClaw";
    case "wait":
      return "Wait";
    case "condition":
      return "If / Else";
    case "approval":
      return "Approval";
    case "sql":
      return "Legacy SQL";
    case "chart":
      return "Legacy Chart";
    case "component":
      return "Legacy Component";
    case "output":
      return "Output";
  }
}

/** Body copy when the user hasn't authored custom config yet. Agent nodes use
 * prompts; control nodes summarize orchestration-only settings. */
function nodeSummaryDefault(kind: WireNodeKind): string {
  switch (kind) {
    case "trigger":
      return "Kick off the workflow on schedule, webhook, or manual run.";
    case "claude":
      return "Plan, draft, and decide the next move with full context.";
    case "code":
      return "Read or write the repo to make the change land.";
    case "codex":
      return "Review the diff for risks, regressions, and trade-offs.";
    case "hermes":
      return "Talk to humans — collect intent, confirm action.";
    case "openclaw":
      return "Send the result through OpenClaw to the right channel.";
    case "wait":
      return "Pause the flow until a timer or specific moment is reached.";
    case "condition":
      return "Choose the next path with a plain-English if / else rule.";
    case "approval":
      return "Ask a human to approve or reject before the workflow continues.";
    case "sql":
      return "Legacy data block. Prefer asking an agent to query safely.";
    case "chart":
      return "Legacy chart block. Prefer asking an agent to create the view.";
    case "component":
      return "Legacy component block. Prefer describing the UI in an agent prompt.";
    case "output":
      return "Deliver the final artifact and close the loop.";
  }
}

function stringConfig(
  config: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function nodeSummaryText(kind: WireNodeKind, config?: Record<string, unknown>): {
  text: string;
  isDefault: boolean;
} {
  if (
    kind === "claude" ||
    kind === "code" ||
    kind === "codex" ||
    kind === "hermes" ||
    kind === "openclaw"
  ) {
    const prompt = stringConfig(config, "prompt");
    return { text: prompt ?? nodeSummaryDefault(kind), isDefault: !prompt };
  }

  if (kind === "trigger") {
    const triggerType = stringConfig(config, "triggerType") ?? "manual";
    const detail =
      triggerType === "schedule"
        ? stringConfig(config, "schedule")
        : triggerType === "webhook"
          ? stringConfig(config, "webhookPath")
          : stringConfig(config, "inputNotes");
    return {
      text: detail
        ? `${triggerType}: ${detail}`
        : nodeSummaryDefault(kind),
      isDefault: !detail,
    };
  }

  if (kind === "wait") {
    const duration = stringConfig(config, "waitDuration") ?? stringConfig(config, "waitUntil");
    return {
      text: duration ? `Pause for ${duration}` : nodeSummaryDefault(kind),
      isDefault: !duration,
    };
  }

  if (kind === "condition") {
    const condition = stringConfig(config, "condition");
    return {
      text: condition ? `If ${condition}` : nodeSummaryDefault(kind),
      isDefault: !condition,
    };
  }

  if (kind === "approval") {
    const question = stringConfig(config, "approvalQuestion");
    return {
      text: question ?? nodeSummaryDefault(kind),
      isDefault: !question,
    };
  }

  if (kind === "output") {
    const destination = stringConfig(config, "destination");
    return {
      text: destination ? `Send to ${destination}` : nodeSummaryDefault(kind),
      isDefault: !destination,
    };
  }

  return { text: nodeSummaryDefault(kind), isDefault: true };
}

/** Time-to-finish hint shown in the footer of the card. Defaults are best-
 *  effort estimates for each agent kind; users can override later. */
function nodeDurationLabel(kind: WireNodeKind): string {
  switch (kind) {
    case "trigger":
      return "Instant";
    case "claude":
    case "codex":
      return "~30s";
    case "code":
      return "~10s";
    case "hermes":
      return "~5s";
    case "openclaw":
      return "~3s";
    case "wait":
      return "Timer";
    case "condition":
      return "Instant";
    case "approval":
      return "Human";
    case "sql":
      return "~5s";
    case "chart":
      return "~2s";
    case "component":
      return "~5s";
    case "output":
      return "Instant";
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1500) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── React Flow ↔ WireGraph conversion ───────────────────────────────────── */

interface WireNodeData extends Record<string, unknown> {
  kind: WireNodeKind;
  label: string;
  config?: Record<string, unknown>;
}

type WireFlowNode = Node<WireNodeData, "wireNode">;

function toFlowNodes(wireNodes: WireNode[]): WireFlowNode[] {
  return wireNodes.map((n) => ({
    id: n.id,
    type: "wireNode",
    position: { x: n.x, y: n.y },
    data: { kind: n.kind, label: n.label, config: n.config },
  }));
}

function toFlowEdges(wireEdges: WireEdge[]): Edge[] {
  return wireEdges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    animated: true,
  }));
}

function fromFlowNodes(flowNodes: WireFlowNode[]): WireNode[] {
  return flowNodes.map((n) => ({
    id: n.id,
    kind: n.data.kind,
    label: n.data.label,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    ...(n.data.config ? { config: n.data.config } : {}),
  }));
}

function fromFlowEdges(flowEdges: Edge[]): WireEdge[] {
  return flowEdges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
  }));
}

/* ── Layout: overlap detection + topological auto-layout ─────────────────── */

function rectsOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
}

function detectOverlap(nodes: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (rectsOverlap(nodes[i], nodes[j])) return true;
    }
  }
  return false;
}

/**
 * Lay out nodes left-to-right by topological depth from root nodes.
 * Roots are nodes with no incoming edges (typically triggers). Within a depth
 * lane, siblings stack vertically. Disconnected nodes land in their own lane
 * after the main flow so nothing is lost off-screen.
 */
function autoLayout(nodes: WireNode[], edges: WireEdge[]): WireNode[] {
  if (nodes.length === 0) return nodes;

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }

  const depth = new Map<string, number>();
  const visit = (id: string, d: number) => {
    const prev = depth.get(id);
    if (prev !== undefined && prev >= d) return;
    depth.set(id, d);
    for (const next of outgoing.get(id) ?? []) visit(next, d + 1);
  };
  // BFS from roots first so triggers sit at depth 0
  for (const n of nodes) {
    if (!incoming.has(n.id)) visit(n.id, 0);
  }
  // Anything still missing (cycles, orphans) lands at depth 0+
  for (const n of nodes) {
    if (!depth.has(n.id)) depth.set(n.id, 0);
  }

  const byDepth = new Map<number, WireNode[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), n]);
  }

  const positioned = new Map<string, { x: number; y: number }>();
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  for (const d of depths) {
    const lane = byDepth.get(d) ?? [];
    lane.forEach((n, i) => {
      positioned.set(n.id, { x: 80 + d * LANE_X_GAP, y: 80 + i * LANE_Y_GAP });
    });
  }

  return nodes.map((n) => {
    const p = positioned.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
}

/* ── Custom node component ───────────────────────────────────────────────── */

interface WireBuilderCallbacks {
  onDelete: (id: string) => void;
  /** Preview-mode hides the per-node delete button and disables interactions
   *  upstream (drag/connect on ReactFlow itself). */
  editMode: boolean;
  /** Resolve a node's downstream handoff target labels (for the "→ to whom"
   *  badge). Returns an empty array when the node has no outgoing edges. */
  getHandoffLabels: (nodeId: string) => string[];
}

const WireBuilderContext = createContext<WireBuilderCallbacks | null>(null);

function WireFlowNodeCard({ id, data, selected }: NodeProps<WireFlowNode>) {
  const ctx = useContext(WireBuilderContext);
  const editMode = ctx?.editMode ?? false;
  const showInput = hasInputPort(data.kind);
  const showOutput = hasOutputPort(data.kind);

  // Agent nodes show their prompt. Control nodes show a safe orchestration
  // summary instead, so the graph doesn't imply SQL/chart/component execution.
  const { text: promptText, isDefault: promptIsDefault } = nodeSummaryText(
    data.kind,
    data.config,
  );

  const customDuration =
    typeof data.config?.duration === "string" && data.config.duration.trim().length > 0
      ? (data.config.duration as string)
      : null;
  const durationText = customDuration ?? nodeDurationLabel(data.kind);

  const handoffs = ctx?.getHandoffLabels(id) ?? [];
  const handoffText =
    handoffs.length > 0
      ? handoffs.length === 1
        ? handoffs[0]
        : `${handoffs[0]} +${handoffs.length - 1}`
      : data.kind === "output"
        ? "End of flow"
        : "Not wired yet";
  const handoffMuted = handoffs.length === 0;

  return (
    <div
      className={cn(
        "group flex flex-col rounded-xl border border-solid border-border bg-card shadow-sm transition-all",
        "hover:shadow-md hover:-translate-y-px",
        selected && "ring-1 ring-primary/60 border-primary/40 shadow-md",
      )}
      style={{ width: NODE_W, height: NODE_H }}
    >
      {/* Header — agent identity */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 pt-2.5 pb-2",
          editMode && "cursor-grab active:cursor-grabbing",
        )}
      >
        <span
          className={cn("ag-glyph", data.kind)}
          style={{ width: 24, height: 24, fontSize: 12 }}
        >
          <NodeIcon kind={data.kind} size={12} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12px] font-medium text-foreground">
            {data.label}
          </div>
          <div className="truncate text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/80">
            {nodeRoleLabel(data.kind)}
          </div>
        </div>
        {editMode && (
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="nodrag h-5 w-5 -mr-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Remove ${data.label}`}
            onClick={(e) => {
              e.stopPropagation();
              ctx?.onDelete(id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Body — what this agent actually does */}
      <div
        className={cn(
          "flex-1 px-3 text-[11px] leading-snug line-clamp-2",
          promptIsDefault ? "text-muted-foreground/80 italic" : "text-foreground/85",
        )}
        title={promptText}
      >
        {promptText}
      </div>

      {/* Footer — when it runs · who receives the output */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mt-1.5 border-t border-border/60 text-[10px]">
        <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          <span>{durationText}</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 min-w-0",
            handoffMuted ? "text-muted-foreground/60 italic" : "text-muted-foreground",
          )}
          title={handoffs.length > 0 ? `Handoff: ${handoffs.join(", ")}` : undefined}
        >
          <ArrowRight className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{handoffText}</span>
        </div>
      </div>

      {/* Ports stay in the DOM in both modes so existing edges keep their
          anchor points, but they're only interactable in edit mode (gated by
          the ReactFlow `nodesConnectable` flag). */}
      {showInput && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={editMode}
          style={{
            width: 10,
            height: 10,
            background: "hsl(var(--card))",
            border: "1.5px solid hsl(var(--muted-foreground) / 0.5)",
            cursor: editMode ? "crosshair" : "default",
          }}
        />
      )}
      {showOutput && (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={editMode}
          style={{
            width: 10,
            height: 10,
            background: "hsl(var(--foreground))",
            border: "1.5px solid hsl(var(--foreground))",
            cursor: editMode ? "crosshair" : "default",
          }}
        />
      )}
    </div>
  );
}

const nodeTypes = { wireNode: WireFlowNodeCard };

/* ── Component ───────────────────────────────────────────────────────────── */

/**
 * Imperative API the canvas exposes to its parent (MissionControl). We keep
 * it tiny on purpose — the parent's only mutation path is "the inspector
 * patched the selected node" — and route through the existing setNodes flow
 * so React Flow stays the single source of truth.
 */
export interface WireBuilderHandle {
  updateNode: (id: string, patch: WireNodePatch) => void;
}

interface WireBuilderProps {
  /** ID of the workflow this canvas belongs to. */
  projectId: string;
  /**
   * Fired when a wire node is clicked on the canvas (with a `WireSelection`
   * snapshot) or when the empty pane is clicked (with `null`). MissionControl
   * uses this to drive the inspector content + auto-open behavior.
   */
  onSelectNode?: (selection: WireSelection | null) => void;
}

export const WireBuilder = forwardRef<WireBuilderHandle, WireBuilderProps>(
  function WireBuilder(props, ref) {
    return (
      <ReactFlowProvider>
        <WireBuilderInner {...props} forwardedRef={ref} />
      </ReactFlowProvider>
    );
  },
);

function WireBuilderInner({
  projectId,
  onSelectNode,
  forwardedRef,
}: WireBuilderProps & {
  forwardedRef: ForwardedRef<WireBuilderHandle>;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WireFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Canvas defaults to a read-only preview. The user has to opt in to editing
  // by hitting "Edit canvas", which then exposes the palette and unlocks
  // drag/connect/delete on the nodes themselves.
  const [editMode, setEditMode] = useState(false);

  // Real agents the user has hired — feeds the Agents tab in the palette.
  // We project to the picker-friendly shape so the rows render the same
  // monogram + status the rest of the projects surface uses.
  const { agents: rosterAgents, hasAgents } = useProjectAgentRoster();

  // Suppress the persistence effect until the load for the current projectId
  // has completed — otherwise we can clobber the new project's graph with the
  // previous project's nodes during the brief gap between projectId change and
  // setNodes/setEdges resolving.
  const loadedProjectRef = useRef<string | null>(null);

  // When the surfaced workflow changes, fall back to preview so the user
  // doesn't carry an editing context across to a different project.
  useEffect(() => {
    setEditMode(false);
  }, [projectId]);

  /* ── Load / seed when project changes ─────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    loadedProjectRef.current = null;
    void (async () => {
      const stored = await loadPersistedWireGraph(projectId);
      if (cancelled) return;

      if (stored && stored.nodes.length > 0) {
        // If positions are obviously broken (overlap, or all collapsed at 0,0)
        // run the topological layout once before showing — keeps the user from
        // seeing a stack of nodes with the first one hidden underneath.
        const allAtOrigin = stored.nodes.every((n) => n.x === 0 && n.y === 0);
        const corrected =
          allAtOrigin || detectOverlap(stored.nodes)
            ? autoLayout(stored.nodes, stored.edges)
            : stored.nodes;
        setNodes(toFlowNodes(corrected));
        setEdges(toFlowEdges(stored.edges));
        setSavedAt(stored.updatedAt);
      } else {
        // Friendly starter: trigger → claude → output
        const t = newWireNode("trigger", { x: 80, y: 220 });
        // Explicit "Agent" label so the seed reads cleanly even though the
        // generic Agent preset is no longer in WIRE_PRESETS (only real
        // roster agents now back agent-kind nodes from the palette).
        const c = newWireNode("claude", { x: 360, y: 220 }, "Agent");
        const o = newWireNode("output", { x: 640, y: 220 });
        setNodes(toFlowNodes([t, c, o]));
        setEdges(toFlowEdges([newWireEdge(t.id, c.id), newWireEdge(c.id, o.id)]));
        setSavedAt(null);
      }

      loadedProjectRef.current = projectId;
      setSaveError(null);

      // Defer a fit-to-view so the canvas snaps to the loaded graph instead of
      // dropping the user into a random corner.
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 320, maxZoom: 1.1 });
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /* ── Auto-save (debounced) ────────────────────────────────────────────── */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loadedProjectRef.current !== projectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const graph = {
        nodes: fromFlowNodes(nodes),
        edges: fromFlowEdges(edges),
        updatedAt: Date.now(),
      };
      void savePersistedWireGraph(projectId, graph)
        .then(() => {
          setSavedAt(Date.now());
          setSaveError(null);
        })
        .catch((err) => {
          setSaveError(err instanceof Error ? err.message : "Bridge save failed");
        });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, projectId]);

  /* ── Wire two ports together (React Flow native connection) ───────────── */
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (params.source === params.target) return;
      setEdges((prev) => {
        const exists = prev.some(
          (e) => e.source === params.source && e.target === params.target,
        );
        if (exists) return prev;
        const wireEdge = newWireEdge(params.source!, params.target!);
        return addEdge({ ...params, id: wireEdge.id, type: "default" }, prev);
      });
    },
    [setEdges],
  );

  /* ── Add / delete ─────────────────────────────────────────────────────── */
  const handleDelete = useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) =>
        prev.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      // If the inspector was pointed at this node, clear the selection so the
      // parent can fall back to the empty / run views.
      onSelectNode?.(null);
    },
    [setNodes, setEdges, onSelectNode],
  );

  /**
   * Apply an inspector-driven patch to a single node. Patches are merged
   * shallowly into `data.config`, and `kind` / `label` overrides replace the
   * existing values. The change flows through React Flow state, which then
   * trips the existing debounced save effect — no new persistence path.
   */
  const applyNodePatch = useCallback(
    (id: string, patch: WireNodePatch) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== id) return node;
          const nextKind = patch.kind ?? node.data.kind;
          const nextLabel = patch.label ?? node.data.label;
          const nextConfig =
            patch.config !== undefined
              ? { ...(node.data.config ?? {}), ...patch.config }
              : node.data.config;
          return {
            ...node,
            data: {
              ...node.data,
              kind: nextKind,
              label: nextLabel,
              config: nextConfig,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  // Expose the imperative API to the parent (MissionControl). We only expose
  // the inspector mutation entry-point — selection itself is a one-way event
  // (canvas → parent) via `onSelectNode`, so it stays out of the handle.
  useImperativeHandle(
    forwardedRef,
    () => ({
      updateNode: applyNodePatch,
    }),
    [applyNodePatch],
  );

  // Build a once-per-render lookup so each card can answer "where does my
  // output go?" without each card re-walking the full edge list.
  const handoffLabelsByNode = useMemo(() => {
    const labelById = new Map<string, string>();
    for (const node of nodes) labelById.set(node.id, node.data.label);
    const out = new Map<string, string[]>();
    for (const edge of edges) {
      const targetLabel = labelById.get(edge.target);
      if (!targetLabel) continue;
      const list = out.get(edge.source) ?? [];
      list.push(targetLabel);
      out.set(edge.source, list);
    }
    return out;
  }, [edges, nodes]);

  const getHandoffLabels = useCallback(
    (nodeId: string): string[] => handoffLabelsByNode.get(nodeId) ?? [],
    [handoffLabelsByNode],
  );

  const callbacks = useMemo<WireBuilderCallbacks>(
    () => ({ onDelete: handleDelete, editMode, getHandoffLabels }),
    [editMode, getHandoffLabels, handleDelete],
  );

  // Smart placement: drop new nodes to the right of the rightmost one so they
  // don't pile on top of each other. If the spawn slot is taken (rare), nudge
  // down a lane.
  const placeNextNode = useCallback(
    (
      build: (target: { x: number; y: number }) => WireNode,
    ) => {
      setNodes((prev) => {
        const wireNodes = fromFlowNodes(prev);
        const rightmost = wireNodes.reduce(
          (acc, n) => (n.x > acc.x ? n : acc),
          { x: 0, y: 220 } as { x: number; y: number },
        );
        let target = { x: rightmost.x + LANE_X_GAP, y: rightmost.y };
        let lane = 0;
        while (
          wireNodes.some((n) => rectsOverlap(n, target)) &&
          lane < 8
        ) {
          lane += 1;
          target = { x: target.x, y: rightmost.y + lane * LANE_Y_GAP };
        }
        return [...prev, ...toFlowNodes([build(target)])];
      });
      // Pan the new node into view after layout settles
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 280, maxZoom: 1.1 });
      });
    },
    [fitView, setNodes],
  );

  const addNode = useCallback(
    (kind: WireNodeKind) => {
      placeNextNode((target) => newWireNode(kind, target));
    },
    [placeNextNode],
  );

  /**
   * Drop a roster agent onto the canvas: the agent's runtime determines the
   * node kind (so the card glyph + ports stay consistent), and we snapshot
   * the agent identity into `config` so the inspector can resolve it later
   * even if the roster entry is renamed or removed.
   */
  const addAgentNode = useCallback(
    (agent: ProjectRosterAgent) => {
      const kind = runtimeToWireNodeKind(agent.runtime);
      placeNextNode((target) => {
        const node = newWireNode(kind, target, agent.name);
        node.config = {
          agentId: agent.id,
          agentName: agent.name,
          runtime: agent.runtime,
        };
        return node;
      });
    },
    [placeNextNode],
  );

  const runAutoLayout = useCallback(() => {
    setNodes((prev) => {
      const laidOut = autoLayout(fromFlowNodes(prev), fromFlowEdges(edges));
      return toFlowNodes(laidOut);
    });
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 320 });
    });
  }, [edges, fitView, setNodes]);

  const clearAll = useCallback(() => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Clear all nodes and connections from this canvas?",
      );
      if (!ok) return;
    }
    setNodes([]);
    setEdges([]);
  }, [setEdges, setNodes]);

  const publishTemplate = useCallback(async () => {
    if (nodes.length === 0) return;
    setPublishing(true);
    try {
      const graph = {
        nodes: fromFlowNodes(nodes),
        edges: fromFlowEdges(edges),
        updatedAt: Date.now(),
      };
      await savePersistedWireGraph(projectId, graph);
      const template = await publishWorkflowGraphTemplate({
        projectId,
        name: `${graph.nodes[0]?.label ?? "Canvas"} workflow`,
        graph,
      });
      if (template) {
        setSavedAt(Date.now());
        setSaveError(null);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }, [edges, nodes, projectId]);

  const isEmpty = nodes.length === 0 && edges.length === 0;

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <WireBuilderContext.Provider value={callbacks}>
      <div className="absolute inset-0 select-none">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange as (changes: NodeChange[]) => void}
          onEdgesChange={onEdgesChange as (changes: EdgeChange[]) => void}
          onConnect={editMode ? onConnect : undefined}
          onNodeClick={
            onSelectNode
              ? (_event, node) => {
                  const flow = node as WireFlowNode;
                  onSelectNode({
                    id: flow.id,
                    kind: flow.data.kind,
                    label: flow.data.label,
                    config: flow.data.config ?? {},
                  });
                }
              : undefined
          }
          onPaneClick={onSelectNode ? () => onSelectNode(null) : undefined}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
          minZoom={0.25}
          maxZoom={2}
          panOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          // Editing toggles drag/connect/delete. Pan + zoom + selection stay on
          // in both modes so users can navigate and inspect freely.
          nodesDraggable={editMode}
          nodesConnectable={editMode}
          edgesFocusable={editMode}
          edgesReconnectable={editMode}
          deleteKeyCode={editMode ? ["Backspace", "Delete"] : null}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: {
              stroke: "hsl(var(--muted-foreground))",
              strokeWidth: 1.5,
              strokeOpacity: 0.55,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "hsl(var(--muted-foreground))",
              width: 14,
              height: 14,
            },
          }}
          proOptions={{ hideAttribution: true }}
          style={{
            background: "transparent",
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="hsl(var(--border))"
          />
        </ReactFlow>

        {/* Top-right: Edit / Done. Edit mode is the primary call-to-action and
            gets the filled accent so it's obvious how to enter it from the
            read-only preview. */}
        <div
          className="absolute top-3 right-3 flex items-center"
          style={{ zIndex: 6 }}
        >
          <Button
            type="button"
            size="sm"
            variant={editMode ? "default" : "outline"}
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
            className={cn(
              "h-7 gap-1.5 text-[11.5px] backdrop-blur",
              !editMode && "bg-card/90",
            )}
            title={
              editMode
                ? "Exit editing — return to preview"
                : "Edit canvas — show palette and unlock drag/connect"
            }
          >
            {editMode ? (
              <Check className="h-3 w-3" />
            ) : (
              <Pencil className="h-3 w-3" />
            )}
            {editMode ? "Done" : "Edit canvas"}
          </Button>
        </div>

        {/* Floating palette (bottom-left) — only mounted in edit mode. In
            preview the canvas is read-only so the palette would just be noise.
            Two tabs: Agents do the work; Steps only control the flow. */}
        {editMode && (
          <div
            className="absolute left-4 bottom-4 flex flex-col items-stretch gap-2 p-2 rounded-xl border border-border bg-card shadow-lg w-[208px]"
            style={{ zIndex: 6 }}
            role="toolbar"
            aria-label="Add a step"
          >
            <div className="px-1 pt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Add step
            </div>
            <p className="px-1 text-[10.5px] leading-snug text-muted-foreground/80">
              Agents execute prompts. Steps route, pause, approve, or hand off.
            </p>

            <Tabs defaultValue="agents" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-8 p-0.5">
                <TabsTrigger
                  value="agents"
                  className="h-7 text-[11.5px] gap-1"
                >
                  <Users className="h-3 w-3" />
                  Agents
                </TabsTrigger>
                <TabsTrigger
                  value="steps"
                  className="h-7 text-[11.5px] gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  Steps
                </TabsTrigger>
              </TabsList>

              {/* Agents tab — real hired agents, runtime-aware */}
              <TabsContent
                value="agents"
                className="mt-2 flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-0.5"
              >
                {hasAgents ? (
                  rosterAgents.map((agent) => (
                    <Button
                      key={agent.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 justify-start gap-2 px-2 text-[11.5px] font-medium"
                      onClick={() => addAgentNode(agent)}
                      title={`${agent.name} · ${agent.runtime ?? "agent"}`}
                    >
                      <AgentMonogram
                        agentId={agent.id}
                        name={agent.name}
                        runtime={agent.runtime}
                        status={agent.status}
                        avatarData={agent.avatarData}
                        initials={agent.initials}
                        size="sm"
                      />
                      <span className="flex-1 min-w-0 truncate text-left leading-tight">
                        {agent.name}
                      </span>
                      {agent.runtime && (
                        <span
                          className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground"
                          aria-hidden="true"
                        >
                          {agent.runtime}
                        </span>
                      )}
                    </Button>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      No agents hired yet.
                    </p>
                    <a
                      href="/Tool/Agent"
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Create an agent →
                    </a>
                  </div>
                )}
              </TabsContent>

              {/* Steps tab — safe orchestration primitives only. SQL / chart /
                  component work belongs inside an agent prompt. */}
              <TabsContent
                value="steps"
                className="mt-2 flex flex-col gap-1.5"
              >
                {WIRE_PRESETS.map((p) => (
                  <Button
                    key={p.kind}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start gap-1.5 px-2.5 text-[11.5px] font-medium"
                    onClick={() => addNode(p.kind)}
                    title={p.hint}
                  >
                    <span
                      className={cn("ag-glyph", p.kind)}
                      style={{ width: 18, height: 18, fontSize: 11 }}
                      aria-hidden="true"
                    >
                      <NodeIcon kind={p.kind} size={11} />
                    </span>
                    <span className="flex-1 text-left">{p.label}</span>
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </Button>
                ))}
              </TabsContent>
            </Tabs>

            {/* Canvas-level actions stay below the tabs and are gated on a
                non-empty graph, same as before. */}
            {nodes.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 justify-start gap-1.5 px-2.5 text-[11.5px] font-medium"
                  onClick={runAutoLayout}
                  title="Re-arrange nodes left-to-right"
                >
                  <Wand2 className="h-3 w-3" /> Auto-layout
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-7 justify-start gap-1.5 px-2.5 text-[11.5px] font-medium"
                  onClick={publishTemplate}
                  disabled={publishing}
                >
                  <Wand2 className="h-3 w-3" />{" "}
                  {publishing ? "Publishing..." : "Publish template"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-start gap-1.5 px-2.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
                  onClick={clearAll}
                >
                  <Trash2 className="h-3 w-3" /> Clear canvas
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Custom zoom pill (bottom-right) — replaces the default React Flow
            Controls so we get exactly the +/-/fit affordance we want, themed
            to match the Edit canvas button. */}
        <div
          className="absolute bottom-3 right-3 flex items-center gap-0.5 p-1 rounded-lg border border-border bg-card/90 backdrop-blur shadow-sm"
          style={{ zIndex: 6 }}
          role="toolbar"
          aria-label="Zoom"
        >
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => zoomOut({ duration: 160 })}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => zoomIn({ duration: 160 })}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <span className="w-px h-4 bg-border mx-0.5" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => fitView({ padding: 0.2, duration: 280, maxZoom: 1.1 })}
            aria-label="Fit to view"
            title="Fit to view"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>

        {/* Status pill (top center) — also signals which mode is active */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] backdrop-blur bg-card/85 border border-border text-muted-foreground"
          style={{ zIndex: 6 }}
          role="status"
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              saveError
                ? "bg-destructive"
                : editMode
                  ? "bg-primary"
                  : "bg-emerald-500",
            )}
          />
          {editMode
            ? savedAt
              ? `Editing · saved ${formatRelative(savedAt)}`
              : "Editing canvas"
            : savedAt
              ? `Preview · saved ${formatRelative(savedAt)}`
              : "Preview canvas"}
        </div>

        {/* Empty-canvas hint — sits just above the zoom pill at bottom-right
            and switches copy based on edit vs preview mode. */}
        {isEmpty && (
          <div
            className="absolute right-4 bottom-16 text-[11px] text-right max-w-[220px] text-muted-foreground"
            style={{ zIndex: 6 }}
          >
            {editMode
              ? "Add steps from the palette, then drag from one node's right port to another node's left port to wire them together."
              : "This workflow has no steps yet. Hit Edit canvas to start wiring."}
          </div>
        )}

        {/* Edge styling polish — animated dashed flow for the "company
            workflow" feel, plus hover/selection emphasis. The default React
            Flow attribution is hidden via proOptions, and the default Controls
            component is replaced by our own zoom pill, so neither needs CSS. */}
        <style jsx global>{`
          .react-flow__edge-path {
            transition: stroke-width 120ms, stroke-opacity 120ms;
          }
          .react-flow__edge:hover .react-flow__edge-path {
            stroke-width: 2px;
            stroke-opacity: 0.9;
          }
          .react-flow__edge.selected .react-flow__edge-path {
            stroke: hsl(var(--primary)) !important;
            stroke-width: 2.25px;
            stroke-opacity: 1;
          }
          .react-flow__edge.selected .react-flow__arrowhead polyline,
          .react-flow__edge.selected .react-flow__arrowhead path {
            fill: hsl(var(--primary)) !important;
            stroke: hsl(var(--primary)) !important;
          }
        `}</style>
      </div>
    </WireBuilderContext.Provider>
  );
}
