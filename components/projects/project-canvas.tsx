"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AGENT_KINDS } from "./data";
import type { NodeStatus, Project, ProjectNode } from "./types";

interface ProjectCanvasProps {
  project: Project;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

const NODE_W = 168;
const NODE_H = 64;

const STATUS_TONE: Record<NodeStatus, string> = {
  idle: "text-[var(--ink-3)]",
  queued: "text-[var(--pending)]",
  running: "text-[var(--ok)]",
  done: "text-[var(--ink-3)]",
  paused: "text-[var(--warn)]",
  needs: "text-[var(--accent)]",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: "idle",
  queued: "queued",
  running: "running",
  done: "done",
  paused: "paused",
  needs: "needs",
};

/**
 * ProjectCanvas — SVG-rendered DAG of nodes + cables.
 * Cables animate when both endpoints are live (running/queued).
 */
export function ProjectCanvas({
  project,
  selectedNodeId,
  onSelectNode,
  className,
}: ProjectCanvasProps) {
  const { width, height } = React.useMemo(() => {
    const maxX = Math.max(...project.nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...project.nodes.map((n) => n.y + NODE_H));
    return { width: maxX + 60, height: maxY + 60 };
  }, [project.nodes]);

  const nodeMap = React.useMemo(() => {
    const m = new Map<string, ProjectNode>();
    project.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [project.nodes]);

  return (
    <div
      data-ensemble
      className={cn(
        "relative w-full overflow-auto rounded-xl border border-[var(--line)] bg-[var(--paper-2)]",
        "[background-image:radial-gradient(circle,var(--line)_1px,transparent_1px)]",
        "[background-size:24px_24px]",
        className
      )}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block min-w-full"
      >
        {/* Cables */}
        <g>
          {project.edges.map(([fromId, toId]) => {
            const from = nodeMap.get(fromId);
            const to = nodeMap.get(toId);
            if (!from || !to) return null;
            return (
              <Cable
                key={`${fromId}-${toId}`}
                from={from}
                to={to}
                live={isCableLive(from.status, to.status)}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {project.nodes.map((node) => (
            <Node
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              onSelect={onSelectNode}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function isCableLive(a: NodeStatus, b: NodeStatus): boolean {
  return (
    (a === "running" || a === "done") &&
    (b === "running" || b === "queued" || b === "needs")
  );
}

interface CableProps {
  from: ProjectNode;
  to: ProjectNode;
  live: boolean;
}

function Cable({ from, to, live }: CableProps) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

  return (
    <path
      d={d}
      fill="none"
      stroke="var(--ink-4)"
      strokeWidth={1.25}
      strokeLinecap="round"
      className={live ? "cable-flow" : ""}
      opacity={live ? 0.9 : 0.45}
    />
  );
}

interface NodeProps {
  node: ProjectNode;
  selected: boolean;
  onSelect?: (id: string) => void;
}

function Node({ node, selected, onSelect }: NodeProps) {
  const meta = AGENT_KINDS[node.kind];
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={() => onSelect?.(node.id)}
      style={{ cursor: onSelect ? "pointer" : "default" }}
      className="group"
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={10}
        ry={10}
        fill="var(--paper)"
        stroke={selected ? "var(--ink)" : "var(--line)"}
        strokeWidth={selected ? 1.5 : 1}
        className="transition-colors group-hover:stroke-[var(--ink-3)]"
      />

      {/* Glyph */}
      <foreignObject x={10} y={10} width={28} height={28}>
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-white text-[10px] font-semibold",
            meta.cls
          )}
          style={{ fontFamily: "var(--mono)" }}
        >
          {meta.glyph}
        </div>
      </foreignObject>

      {/* Title */}
      <text
        x={46}
        y={26}
        fontSize={11.5}
        fontWeight={600}
        fill="var(--ink)"
        style={{ fontFamily: "var(--sans)", letterSpacing: "-0.01em" }}
      >
        {truncate(node.title, 18)}
      </text>

      {/* Body */}
      <text
        x={46}
        y={40}
        fontSize={10}
        fill="var(--ink-3)"
        style={{ fontFamily: "var(--mono)" }}
      >
        {truncate(node.body, 22)}
      </text>

      {/* Status */}
      <foreignObject x={10} y={NODE_H - 18} width={NODE_W - 20} height={14}>
        <div className="flex items-center justify-between text-[9px]">
          <span
            className={cn("uppercase tracking-[0.1em]", STATUS_TONE[node.status])}
            style={{ fontFamily: "var(--mono)" }}
          >
            {STATUS_LABEL[node.status]}
            {node.status === "running" && (
              <span className="ml-1 inline-block h-1 w-1 rounded-full bg-current animate-pulse" />
            )}
          </span>
          {node.ms !== null && (
            <span
              className="text-[var(--ink-4)] tabular-nums"
              style={{ fontFamily: "var(--mono)" }}
            >
              {formatMs(node.ms)}
            </span>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
