"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  Bot,
  Code2,
  Component,
  Database,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIRE_PRESETS,
  hasInputPort,
  hasOutputPort,
  loadPersistedWireGraph,
  newWireEdge,
  newWireNode,
  savePersistedWireGraph,
  type WireEdge,
  type WireNode,
  type WireNodeKind,
} from "$/lib/workflow-wiring";
import { publishWorkflowGraphTemplate } from "$/lib/hyperclaw-bridge-client";

/* ── Layout constants ────────────────────────────────────────────────────── */

const NODE_W = 188;
const NODE_H = 76;
const PORT_R = 5;
const PORT_HIT_R = 11;
const SAVE_DEBOUNCE_MS = 350;

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

function nodeSubtitle(kind: WireNodeKind): string {
  switch (kind) {
    case "trigger":
      return "Webhook · cron · manual";
    case "claude":
      return "claude-code agent";
    case "code":
      return "code execution";
    case "codex":
      return "codex review";
    case "hermes":
      return "hermes agent";
    case "openclaw":
      return "openclaw gateway";
    case "sql":
      return "connector SQLite";
    case "chart":
      return "data preview";
    case "component":
      return "reusable block";
    case "output":
      return "deliver / stop";
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

/* ── Component ───────────────────────────────────────────────────────────── */

interface WireBuilderProps {
  /** ID of the workflow this canvas belongs to. */
  projectId: string;
}

export function WireBuilder({ projectId }: WireBuilderProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<WireNode[]>([]);
  const [edges, setEdges] = useState<WireEdge[]>([]);
  const [bounds, setBounds] = useState({ w: 1200, h: 700 });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Drag
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Wire (click-port-to-port)
  const [armedFrom, setArmedFrom] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);

  // Debounced save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load / seed when project changes ─────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadPersistedWireGraph(projectId);
      if (cancelled) return;
      if (stored) {
        setNodes(stored.nodes);
        setEdges(stored.edges);
        setSavedAt(stored.updatedAt);
        return;
      }
      // Friendly starter: trigger → claude → output
      const t = newWireNode("trigger", { x: 80, y: 220 });
      const c = newWireNode("claude", { x: 360, y: 220 });
      const o = newWireNode("output", { x: 640, y: 220 });
      setNodes([t, c, o]);
      setEdges([newWireEdge(t.id, c.id), newWireEdge(c.id, o.id)]);
      setSavedAt(null);
    })();
    setArmedFrom(null);
    setHoverEdgeId(null);
    setSaveError(null);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /* ── Auto-save (debounced) ────────────────────────────────────────────── */
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void savePersistedWireGraph(projectId, {
        nodes,
        edges,
        updatedAt: Date.now(),
      })
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

  /* ── Track surface size ───────────────────────────────────────────────── */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setBounds({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Esc cancels armed connection ─────────────────────────────────────── */
  useEffect(() => {
    if (!armedFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmedFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedFrom]);

  /* ── Track pointer when armed (for live cable) ────────────────────────── */
  useEffect(() => {
    if (!armedFrom) {
      setPointer(null);
      return;
    }
    const onMove = (e: MouseEvent) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [armedFrom]);

  /* ── Drag a node ──────────────────────────────────────────────────────── */
  const onNodeHeaderMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      dragOffsetRef.current = {
        x: e.clientX - rect.left - node.x,
        y: e.clientY - rect.top - node.y,
      };
      setDragId(nodeId);
      e.stopPropagation();
      e.preventDefault();
    },
    [nodes],
  );

  useEffect(() => {
    if (!dragId) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    const onMove = (e: MouseEvent) => {
      const rect = surface.getBoundingClientRect();
      const px = e.clientX - rect.left - dragOffsetRef.current.x;
      const py = e.clientY - rect.top - dragOffsetRef.current.y;
      const x = Math.max(8, Math.min(bounds.w - NODE_W - 8, px));
      const y = Math.max(8, Math.min(bounds.h - NODE_H - 8, py));
      setNodes((prev) =>
        prev.map((n) => (n.id === dragId ? { ...n, x, y } : n)),
      );
    };
    const onUp = () => setDragId(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragId, bounds.w, bounds.h]);

  /* ── Wire ports together ──────────────────────────────────────────────── */
  const onOutputPortClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setArmedFrom((cur) => (cur === nodeId ? null : nodeId));
    },
    [],
  );

  const onInputPortClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setArmedFrom((cur) => {
        if (!cur) return cur;
        if (cur === nodeId) return null;
        const exists = edges.some((edge) => edge.from === cur && edge.to === nodeId);
        if (exists) return null;
        setEdges((prev) => [...prev, newWireEdge(cur, nodeId)]);
        return null;
      });
    },
    [edges],
  );

  /* ── Add / delete ─────────────────────────────────────────────────────── */
  const addNode = useCallback(
    (kind: WireNodeKind) => {
      const cx = Math.max(120, bounds.w / 2 - NODE_W / 2);
      const cy = Math.max(60, bounds.h / 2 - NODE_H / 2);
      const jitter = (nodes.length % 6) * 24;
      const node = newWireNode(kind, { x: cx + jitter, y: cy + jitter });
      setNodes((prev) => [...prev, node]);
    },
    [nodes.length, bounds.w, bounds.h],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) =>
        prev.filter((e) => e.from !== nodeId && e.to !== nodeId),
      );
      if (armedFrom === nodeId) setArmedFrom(null);
    },
    [armedFrom],
  );

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setHoverEdgeId(null);
  }, []);

  const clearAll = useCallback(() => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Clear all nodes and connections from this canvas?",
      );
      if (!ok) return;
    }
    setNodes([]);
    setEdges([]);
    setArmedFrom(null);
    // The auto-save effect will persist the empty graph,
    // so we won't re-seed the starter on next visit.
  }, []);

  const publishTemplate = useCallback(async () => {
    if (nodes.length === 0) return;
    setPublishing(true);
    try {
      await savePersistedWireGraph(projectId, { nodes, edges, updatedAt: Date.now() });
      const template = await publishWorkflowGraphTemplate({
        projectId,
        name: `${nodes[0]?.label ?? "Canvas"} workflow`,
        graph: { nodes, edges, updatedAt: Date.now() },
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

  /* ── Edge geometry ────────────────────────────────────────────────────── */
  const nodeIndex = useMemo(() => {
    const m = new Map<string, WireNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const edgeShapes = useMemo(() => {
    return edges
      .map((e) => {
        const from = nodeIndex.get(e.from);
        const to = nodeIndex.get(e.to);
        if (!from || !to) return null;
        const sx = from.x + NODE_W;
        const sy = from.y + NODE_H / 2;
        const tx = to.x;
        const ty = to.y + NODE_H / 2;
        const dx = Math.max(40, Math.abs(tx - sx) * 0.5);
        const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
        return { id: e.id, d, mx: (sx + tx) / 2, my: (sy + ty) / 2 };
      })
      .filter(
        (s): s is { id: string; d: string; mx: number; my: number } =>
          s !== null,
      );
  }, [edges, nodeIndex]);

  const livePath = (() => {
    if (!armedFrom || !pointer) return null;
    const from = nodeIndex.get(armedFrom);
    if (!from) return null;
    const sx = from.x + NODE_W;
    const sy = from.y + NODE_H / 2;
    const tx = pointer.x;
    const ty = pointer.y;
    const dx = Math.max(40, Math.abs(tx - sx) * 0.5);
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
  })();

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div
      ref={surfaceRef}
      className="absolute inset-0 select-none"
      onClick={() => {
        if (armedFrom) setArmedFrom(null);
      }}
      style={{ cursor: armedFrom ? "crosshair" : undefined }}
      role="application"
      aria-label="Workflow canvas — connect agents by clicking output, then input"
    >
      {/* The dotted canvas backdrop is provided by `.ens-canvas-wrap`,
          so we don't paint our own — adding one stacks two grids and
          looks noisy. */}

      {/* SVG cable layer */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={bounds.w}
        height={bounds.h}
      >
        {edgeShapes.map((e) => (
          <g key={e.id} className="pointer-events-auto">
            <path
              d={e.d}
              fill="none"
              stroke="var(--ink-3, #6b7280)"
              strokeWidth={1.5}
              strokeOpacity={0.55}
            />
            {/* Wide invisible hit-area for hover */}
            <path
              d={e.d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              onMouseEnter={() => setHoverEdgeId(e.id)}
              onMouseLeave={() =>
                setHoverEdgeId((cur) => (cur === e.id ? null : cur))
              }
              style={{ cursor: "pointer" }}
            />
            {hoverEdgeId === e.id && (
              <g
                transform={`translate(${e.mx - 9},${e.my - 9})`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  deleteEdge(e.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={9}
                  cy={9}
                  r={9}
                  fill="hsl(var(--card))"
                  stroke="var(--ink-3, #6b7280)"
                  strokeWidth={1}
                />
                <line
                  x1={6}
                  y1={6}
                  x2={12}
                  y2={12}
                  stroke="var(--ink-2, #374151)"
                  strokeWidth={1.5}
                />
                <line
                  x1={12}
                  y1={6}
                  x2={6}
                  y2={12}
                  stroke="var(--ink-2, #374151)"
                  strokeWidth={1.5}
                />
              </g>
            )}
          </g>
        ))}

        {livePath && (
          <path
            d={livePath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.6}
            strokeDasharray="4 4"
          />
        )}
      </svg>

      {/* Nodes */}
      {nodes.map((node) => {
        const isArmed = armedFrom === node.id;
        const showInput = hasInputPort(node.kind);
        const showOutput = hasOutputPort(node.kind);
        return (
          <div
            key={node.id}
            className={cn(
              "absolute rounded-[10px] border bg-card shadow-sm transition-shadow",
              "hover:shadow-md",
              isArmed && "ring-1 ring-[hsl(var(--primary))]",
            )}
            style={{
              left: node.x,
              top: node.y,
              width: NODE_W,
              height: NODE_H,
              borderColor: "var(--line, #e5e7eb)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (drag handle) */}
            <div
              className={cn(
                "flex items-center gap-2 px-2.5 pt-2 pb-1",
                dragId === node.id ? "cursor-grabbing" : "cursor-grab",
              )}
              onMouseDown={(e) => onNodeHeaderMouseDown(node.id, e)}
            >
              <span
                className={cn("ag-glyph", node.kind)}
                style={{ width: 22, height: 22, fontSize: 12 }}
              >
                <NodeIcon kind={node.kind} size={12} />
              </span>
              <span
                className="text-[12px] font-medium truncate flex-1"
                style={{ color: "var(--ink, #111827)" }}
              >
                {node.label}
              </span>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={`Remove ${node.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode(node.id);
                }}
              >
                <X size={12} style={{ color: "var(--ink-4, #9ca3af)" }} />
              </button>
            </div>

            {/* Subtitle */}
            <div
              className="px-2.5 pb-2 text-[11px] truncate"
              style={{ color: "var(--ink-4, #9ca3af)" }}
            >
              {nodeSubtitle(node.kind)}
            </div>

            {/* Input port */}
            {showInput && (
              <button
                type="button"
                onClick={(e) => onInputPortClick(node.id, e)}
                aria-label="Input port"
                className="absolute"
                style={{
                  left: -PORT_HIT_R,
                  top: NODE_H / 2 - PORT_HIT_R,
                  width: PORT_HIT_R * 2,
                  height: PORT_HIT_R * 2,
                  borderRadius: "999px",
                  background: "transparent",
                  cursor: armedFrom ? "crosshair" : "default",
                  zIndex: 1,
                  padding: 0,
                  border: 0,
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: PORT_R * 2,
                    height: PORT_R * 2,
                    margin: PORT_HIT_R - PORT_R,
                    border: armedFrom
                      ? "1.5px solid hsl(var(--primary))"
                      : "1.5px solid var(--ink-4, #9ca3af)",
                    background: armedFrom
                      ? "hsl(var(--primary) / 0.18)"
                      : "hsl(var(--card))",
                  }}
                />
              </button>
            )}

            {/* Output port */}
            {showOutput && (
              <button
                type="button"
                onClick={(e) => onOutputPortClick(node.id, e)}
                aria-label="Output port"
                className="absolute"
                style={{
                  right: -PORT_HIT_R,
                  top: NODE_H / 2 - PORT_HIT_R,
                  width: PORT_HIT_R * 2,
                  height: PORT_HIT_R * 2,
                  borderRadius: "999px",
                  background: "transparent",
                  cursor: "pointer",
                  zIndex: 1,
                  padding: 0,
                  border: 0,
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: PORT_R * 2,
                    height: PORT_R * 2,
                    margin: PORT_HIT_R - PORT_R,
                    background: isArmed
                      ? "hsl(var(--primary))"
                      : "var(--ink, #111827)",
                    border: "1.5px solid var(--ink, #111827)",
                  }}
                />
              </button>
            )}
          </div>
        );
      })}

      {/* Floating palette (bottom-left) */}
      <div
        className="absolute left-4 bottom-4 flex flex-col items-stretch gap-1.5 p-2 rounded-xl border"
        style={{
          background: "hsl(var(--card))",
          borderColor: "var(--line, #e5e7eb)",
          boxShadow: "0 6px 20px -10px rgb(0 0 0 / 0.18)",
          zIndex: 4,
        }}
        role="toolbar"
        aria-label="Add a step"
      >
        <div
          className="px-1.5 pb-0.5 text-[10px] uppercase tracking-wider"
          style={{ color: "var(--ink-4, #9ca3af)" }}
        >
          Add step
        </div>
        {WIRE_PRESETS.map((p) => (
          <button
            key={p.kind}
            type="button"
            className="ens-btn justify-start"
            onClick={() => addNode(p.kind)}
            title={p.hint}
            style={{ width: 168 }}
          >
            <span
              className={cn("ag-glyph", p.kind)}
              style={{ width: 18, height: 18, fontSize: 11 }}
              aria-hidden="true"
            >
              <NodeIcon kind={p.kind} size={11} />
            </span>
            <span className="flex-1 text-left">{p.label}</span>
            <Plus size={11} style={{ color: "var(--ink-4, #9ca3af)" }} />
          </button>
        ))}
        {(nodes.length > 0 || edges.length > 0) && (
          <>
          <button
            type="button"
            className="ens-btn justify-start"
            onClick={publishTemplate}
            disabled={publishing || nodes.length === 0}
            style={{ width: 168 }}
          >
            <Wand2 size={11} /> {publishing ? "Publishing..." : "Publish template"}
          </button>
          <button
            type="button"
            className="ens-btn ghost"
            onClick={clearAll}
            style={{ width: 168 }}
          >
            <Trash2 size={11} /> Clear canvas
          </button>
          </>
        )}
      </div>

      {/* Status pill (top center) */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] backdrop-blur"
        style={{
          background: armedFrom
            ? "hsl(var(--primary) / 0.95)"
            : "hsl(var(--card) / 0.85)",
          color: armedFrom
            ? "hsl(var(--primary-foreground))"
            : "var(--ink-3, #6b7280)",
          border: "1px solid var(--line, #e5e7eb)",
          zIndex: 4,
        }}
        role="status"
      >
        {armedFrom ? (
          <>
            <Wand2 size={11} />
            Click an input port to connect (Esc to cancel)
          </>
        ) : (
          <>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "rgb(34 197 94)" }}
            />
            {savedAt
              ? `${saveError ? "Local draft saved" : "Draft saved"} · ${formatRelative(savedAt)}`
              : "Draft canvas"}
          </>
        )}
      </div>

      {/* Empty-canvas hint (bottom right, only when truly empty) */}
      {nodes.length === 0 && edges.length === 0 && (
        <div
          className="absolute right-4 bottom-4 text-[11px] text-right max-w-[220px]"
          style={{ color: "var(--ink-4, #9ca3af)" }}
        >
          Add steps from the palette, then click an output port and the next
          input port to wire them together.
        </div>
      )}
    </div>
  );
}
