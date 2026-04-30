"use client";

import React, { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  HyperclawAgent,
  KnowledgeCollectionEntry,
  KnowledgeFileEntry,
} from "../../hooks/useKnowledgeData";

type GraphNodeKind = "root" | "collection" | "file" | "agent";

type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  subLabel?: string;
  x: number;
  y: number;
  size: number;
  collection?: KnowledgeCollectionEntry;
  file?: KnowledgeFileEntry;
  agent?: HyperclawAgent;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "contains" | "edited_by";
};

interface KnowledgeGraphViewProps {
  collections: KnowledgeCollectionEntry[];
  agents: HyperclawAgent[];
  selectedCollection: string | null;
  selectedPath: string | null;
  onSelectCollection: (id: string) => void;
  onSelectFile: (relativePath: string, collection: string) => void;
}

const WIDTH = 1200;
const HEIGHT = 720;
const CENTER = { x: 600, y: 360 };
const FILE_SLOTS_PER_RING = 14;
const DOT_COLOR = "hsl(var(--primary))";

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function jitter(value: string, amount: number): number {
  return ((hashString(value) % 1000) / 1000 - 0.5) * amount;
}

function dotSizeFromBytes(bytes = 0, min = 7, max = 26): number {
  const normalized = Math.min(1, Math.log10(Math.max(bytes, 1)) / 7);
  return Math.round(min + (max - min) * normalized);
}

function collectionBytes(collection: KnowledgeCollectionEntry): number {
  return (collection.files ?? []).reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0);
}

function buildGraph(collections: KnowledgeCollectionEntry[], agents: HyperclawAgent[]) {
  const nodes: GraphNode[] = [
    {
      id: "root",
      kind: "root",
      label: "hyperclaw memory",
      subLabel: `${collections.reduce((sum, col) => sum + col.fileCount, 0)} files`,
      x: CENTER.x,
      y: CENTER.y,
      size: 28,
    },
  ];
  const edges: GraphEdge[] = [];
  const agentIdsWithFiles = new Set<string>();
  const agentByteTotals = new Map<string, number>();

  const collectionCount = Math.max(collections.length, 1);
  collections.forEach((collection, collectionIndex) => {
    const angle = (Math.PI * 2 * collectionIndex) / collectionCount - Math.PI / 2;
    const collectionRadius = collectionCount <= 2 ? 170 : 190 + Math.min(collection.fileCount, 10) * 4;
    const collectionX = CENTER.x + Math.cos(angle) * collectionRadius + jitter(collection.id, 34);
    const collectionY = CENTER.y + Math.sin(angle) * collectionRadius + jitter(`${collection.id}:y`, 34);
    const collectionNode: GraphNode = {
      id: `collection:${collection.id}`,
      kind: "collection",
      label: collection.name.charAt(0).toUpperCase() + collection.name.slice(1),
      subLabel: `${collection.fileCount} docs`,
      x: collectionX,
      y: collectionY,
      size: dotSizeFromBytes(collectionBytes(collection), 13, 32),
      collection,
    };
    nodes.push(collectionNode);
    edges.push({
      id: `root:${collection.id}`,
      source: "root",
      target: collectionNode.id,
      kind: "contains",
    });

    const files = collection.files ?? [];
    files.forEach((file, fileIndex) => {
      const slot = fileIndex % FILE_SLOTS_PER_RING;
      const ring = Math.min(142, 62 + Math.floor(fileIndex / FILE_SLOTS_PER_RING) * 26);
      const collectionSector = (Math.PI * 2) / collectionCount;
      const fileSpread = Math.min(Math.PI * 1.05, collectionSector * 0.74);
      const fileAngle =
        angle +
        ((slot - (FILE_SLOTS_PER_RING - 1) / 2) / FILE_SLOTS_PER_RING) * fileSpread +
        jitter(file.relativePath, 0.12);
      const fileNode: GraphNode = {
        id: `file:${file.relativePath}`,
        kind: "file",
        label: file.name.replace(/\.(md|mdx)$/i, ""),
        subLabel: file.relativePath,
        x: Math.max(46, Math.min(WIDTH - 46, collectionNode.x + Math.cos(fileAngle) * ring + jitter(file.relativePath, 18))),
        y: Math.max(46, Math.min(HEIGHT - 46, collectionNode.y + Math.sin(fileAngle) * ring + jitter(`${file.relativePath}:y`, 18))),
        size: dotSizeFromBytes(file.sizeBytes ?? 0),
        collection,
        file,
      };
      nodes.push(fileNode);
      edges.push({
        id: `contains:${collection.id}:${file.relativePath}`,
        source: collectionNode.id,
        target: fileNode.id,
        kind: "contains",
      });
      if (file.agentId) {
        agentIdsWithFiles.add(file.agentId);
        agentByteTotals.set(file.agentId, (agentByteTotals.get(file.agentId) ?? 0) + (file.sizeBytes ?? 0));
      }
    });
  });

  const activeAgents = agents.filter((agent) => agentIdsWithFiles.has(agent.id));
  activeAgents.forEach((agent, index) => {
    const agentAngle = Math.PI / 10 + (Math.PI * 1.8 * index) / Math.max(activeAgents.length, 1);
    const agentRadius = 335;
    const agentNode: GraphNode = {
      id: `agent:${agent.id}`,
      kind: "agent",
      label: agent.name,
      subLabel: "agent memory",
      x: CENTER.x + Math.cos(agentAngle) * agentRadius + jitter(agent.id, 28),
      y: CENTER.y + Math.sin(agentAngle) * agentRadius * 0.72 + jitter(`${agent.id}:y`, 28),
      size: dotSizeFromBytes(agentByteTotals.get(agent.id) ?? 0, 8, 18),
      agent,
    };
    nodes.push(agentNode);
  });

  for (const collection of collections) {
    for (const file of collection.files ?? []) {
      if (!file.agentId || !agentIdsWithFiles.has(file.agentId)) continue;
      edges.push({
        id: `edited:${file.agentId}:${file.relativePath}`,
        source: `agent:${file.agentId}`,
        target: `file:${file.relativePath}`,
        kind: "edited_by",
      });
    }
  }

  return { nodes, edges };
}

function GraphNodeButtonBase({
  node,
  active,
  dimmed,
  onSelectCollection,
  onSelectFile,
  onHover,
}: {
  node: GraphNode;
  active: boolean;
  dimmed: boolean;
  onSelectCollection: (id: string) => void;
  onSelectFile: (relativePath: string, collection: string) => void;
  onHover: (id: string | null) => void;
}) {
  const clickable = Boolean(node.collection || node.file);
  const labelSize =
    node.kind === "root"
      ? "text-xs font-semibold"
      : node.kind === "collection"
      ? "text-[11px] font-medium"
      : "text-[10px] font-normal";

  return (
    <button
      type="button"
      aria-disabled={!clickable}
      tabIndex={clickable ? 0 : -1}
      onClick={() => {
        if (!clickable) return;
        if (node.file) {
          onSelectFile(node.file.relativePath, node.file.collection);
          return;
        }
        if (node.collection) onSelectCollection(node.collection.id);
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onPointerCancel={() => onHover(null)}
      onPointerLeave={() => onHover(null)}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[opacity,transform,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        clickable && "cursor-pointer hover:scale-125",
        !clickable && "cursor-default",
        active && "scale-125",
        dimmed && "opacity-15",
      )}
      aria-label={`${node.kind} node: ${node.label}${node.subLabel ? `, ${node.subLabel}` : ""}`}
      style={{
        left: `${(node.x / WIDTH) * 100}%`,
        top: `${(node.y / HEIGHT) * 100}%`,
        width: node.size,
        height: node.size,
        background: DOT_COLOR,
        borderColor: active ? "hsl(var(--foreground))" : "hsl(var(--border))",
        boxShadow: active
          ? "0 0 0 5px hsl(var(--primary) / 0.25), 0 10px 28px hsl(var(--foreground) / 0.18)"
          : "0 4px 12px hsl(var(--foreground) / 0.12)",
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap leading-none transition-[color,opacity] duration-150",
          labelSize,
          active ? "text-foreground" : "text-muted-foreground",
        )}
        style={{
          maxWidth: 160,
          textShadow: "0 1px 2px hsl(var(--background) / 0.8)",
        }}
      >
        {node.label}
      </span>
    </button>
  );
}

const GraphNodeButton = React.memo(GraphNodeButtonBase);

export function KnowledgeGraphView({
  collections,
  agents,
  selectedCollection,
  selectedPath,
  onSelectCollection,
  onSelectFile,
}: KnowledgeGraphViewProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const handleHover = useCallback((id: string | null) => {
    setHoveredNodeId(id);
  }, []);
  const handleSelectCollection = useCallback(
    (id: string) => onSelectCollection(id),
    [onSelectCollection],
  );
  const handleSelectFile = useCallback(
    (relativePath: string, collection: string) => onSelectFile(relativePath, collection),
    [onSelectFile],
  );
  const { nodes, edges } = useMemo(
    () => buildGraph(collections, agents),
    [collections, agents],
  );
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const linkedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const linked = new Set<string>([hoveredNodeId]);
    for (const edge of edges) {
      if (edge.source === hoveredNodeId) linked.add(edge.target);
      if (edge.target === hoveredNodeId) linked.add(edge.source);
    }
    return linked;
  }, [edges, hoveredNodeId]);

  if (collections.length === 0) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-2xl border border-border bg-card/60 p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">No graph yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create collections and documents first. Hyperclaw will turn them into connected knowledge dots here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[680px] overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 48%, hsl(var(--primary) / 0.08), transparent 38%), linear-gradient(hsl(var(--border) / 0.18) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.18) 1px, transparent 1px)",
          backgroundSize: "auto, 36px 36px, 36px 36px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background)_/_0.22)_58%,hsl(var(--background)_/_0.86)_100%)]" />

      <div className="relative z-10 flex h-full items-center justify-center p-6">
        <div className="relative aspect-[5/3] w-full max-w-[1240px]">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {edges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;
              const selected =
                target.id === `file:${selectedPath}` ||
                source.id === `collection:${selectedCollection}` ||
                target.id === `collection:${selectedCollection}`;
              const hovered =
                hoveredNodeId === edge.source ||
                hoveredNodeId === edge.target;
              const muted = Boolean(hoveredNodeId) && !hovered;
              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={selected || hovered ? "hsl(var(--primary))" : "hsl(var(--foreground))"}
                  strokeWidth={selected || hovered ? 1.8 : edge.kind === "edited_by" ? 1 : 0.9}
                  strokeDasharray={edge.kind === "edited_by" ? "3 5" : undefined}
                  opacity={muted ? 0.06 : selected || hovered ? 0.9 : edge.kind === "edited_by" ? 0.55 : 0.45}
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const active =
              node.id === `file:${selectedPath}` ||
              node.id === `collection:${selectedCollection}`;
            return (
              <GraphNodeButton
                key={node.id}
                node={node}
                active={active}
                dimmed={Boolean(hoveredNodeId) && !linkedNodeIds.has(node.id)}
                onSelectCollection={handleSelectCollection}
                onSelectFile={handleSelectFile}
                onHover={handleHover}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
