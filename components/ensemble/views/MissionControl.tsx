"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  Activity,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Square,
  StepForward,
  Undo2,
  History,
  Maximize2,
  Grid3x3,
  Plus,
  FolderOpen,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bridgeInvoke,
  cancelWorkflowRun,
  getWorkflowGraph,
  listWorkflowChartSpecs,
  startWorkflowRun,
  type BridgeWorkflowChartSpec,
} from "$/lib/hyperclaw-bridge-client";
import type { AgentEvent } from "$/lib/hyperclaw-bridge-client";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { getMissionControlProjectId } from "./mission-control-routing";
import { useMissionControlHeader } from "$/components/ensemble/shared/missionControlHeader";
import { WireBuilder, type WireBuilderHandle } from "./WireBuilder";
import {
  isAgentKind,
  isLegacyWireNodeKind,
  runtimeToWireNodeKind,
  wireGraphToTemplateSteps,
  type WireGraph,
  type WireNodePatch,
  type WireSelection,
} from "$/lib/workflow-wiring";
import {
  useProjectAgentRoster,
  type ProjectRosterAgent,
} from "$/components/projects/use-agent-roster";
import { AgentMonogram } from "$/components/projects/agent-monogram";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ── Local types ─────────────────────────────────────────────────────────── */

interface BridgeProject {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  status: string;
  leadAgentId?: string | null;
  updatedAt: number | string;
}

interface BridgeWorkflowRun {
  id: string;
  templateId?: string;
  projectId: string;
  status: string;
  createdAt: number;
  updatedAt: number | string;
  steps?: BridgeWorkflowStepRun[];
}

interface BridgeWorkflowStepRun {
  id: string;
  name: string;
  stepType: string;
  status: string;
  assignedAgentId?: string;
  dependsOn?: string[];
  position: number;
  startedAt?: number;
  finishedAt?: number;
  metadata?: Record<string, unknown>;
}

function graphToDisplaySteps(graph: WireGraph): BridgeWorkflowStepRun[] {
  return wireGraphToTemplateSteps(graph).map((step) => ({
    id: step.id,
    name: step.name,
    stepType: step.stepType,
    status: "pending",
    assignedAgentId: step.preferredAgentId,
    dependsOn: step.dependsOn,
    position: step.position,
    metadata: step.metadata,
  }));
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function stepStatusColor(status: string): string {
  switch (status) {
    case "running":       return "#3b82f6";
    case "completed":     return "#22c55e";
    case "failed":        return "#ef4444";
    case "waiting_approval": return "#f59e0b";
    default:              return "var(--muted-foreground, #9ca3af)";
  }
}

function stepStatusBg(status: string): string {
  switch (status) {
    case "running":          return "rgba(59,130,246,0.10)";
    case "completed":        return "rgba(34,197,94,0.10)";
    case "failed":           return "rgba(239,68,68,0.10)";
    case "waiting_approval": return "rgba(245,158,11,0.10)";
    default:                 return "rgba(107,114,128,0.08)";
  }
}

function runStatusDotClass(status: string): string {
  switch (status) {
    case "running":          return "bg-blue-500 animate-pulse";
    case "completed":        return "bg-emerald-500";
    case "failed":           return "bg-red-500";
    case "waiting_approval": return "bg-amber-500 animate-pulse";
    case "pending":          return "bg-amber-400";
    default:                 return "bg-muted";
  }
}

/** Map a run status into a status pill variant. */
function runStatusPillClass(status: string | undefined): "live" | "paused" | "needs" | "idle" | "danger" {
  switch (status) {
    case "running":          return "live";
    case "pending":          return "needs";
    case "waiting_approval": return "needs";
    case "paused":           return "paused";
    case "failed":           return "danger";
    case "completed":        return "idle";
    default:                 return "idle";
  }
}

/** Human-readable label for a run status. */
function runStatusLabel(status: string): string {
  switch (status) {
    case "running":          return "running";
    case "pending":          return "queued";
    case "waiting_approval": return "needs input";
    case "paused":           return "paused";
    case "failed":           return "failed";
    case "completed":        return "done";
    default:                 return status.replace(/_/g, " ");
  }
}

function isRunCancellable(status: string | undefined): boolean {
  return status === "running" || status === "pending" || status === "waiting_approval";
}

function formatTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCostFromEvents(events: AgentEvent[]): string {
  let total = 0;
  for (const e of events) {
    const cost = (e.data as Record<string, unknown> | undefined)?.totalCost;
    if (typeof cost === "number") total += cost;
  }
  if (total === 0) return "—";
  return `$${total.toFixed(4)}`;
}

function formatStepDuration(step: BridgeWorkflowStepRun): string {
  if (!step.startedAt || !step.finishedAt) return "—";
  const ms = Math.max(0, step.finishedAt - step.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/* ── Node graph constants ────────────────────────────────────────────────── */

const NODE_W = 184;
const NODE_H = 104;
const NODE_GAP_X = 164;
const NODE_GAP_Y = 68;
const NODE_PADDING_X = 52;
const NODE_PADDING_Y = 64;

function InspLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--ink-4, #9ca3af)" }}>
      {children}
    </span>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded animate-pulse", className)}
      style={{ background: "var(--line, #e5e7eb)", ...style }}
    />
  );
}

/* ── Canvas: workflow node graph ─────────────────────────────────────────── */

interface NodeGraphProps {
  steps: BridgeWorkflowStepRun[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
}

function stepInitials(step: BridgeWorkflowStepRun): string {
  const seed = step.assignedAgentId || step.stepType || step.name;
  const words = seed
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return initials || "AI";
}

function NodeGraph({ steps, selectedStepId, onSelectStep }: NodeGraphProps) {
  if (steps.length === 0) return null;

  const orderedSteps = [...steps].sort((a, b) => a.position - b.position);
  const columns = Array.from(new Set(orderedSteps.map((s) => s.position))).sort(
    (a, b) => a - b
  );
  const stepsByColumn = new Map<number, BridgeWorkflowStepRun[]>();
  for (const column of columns) {
    stepsByColumn.set(
      column,
      orderedSteps
        .filter((step) => step.position === column)
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }
  const maxRows = Math.max(
    1,
    ...Array.from(stepsByColumn.values()).map((columnSteps) => columnSteps.length)
  );
  const graphHeight = maxRows * NODE_H + (maxRows - 1) * NODE_GAP_Y;
  const svgW =
    NODE_PADDING_X * 2 +
    columns.length * NODE_W +
    Math.max(0, columns.length - 1) * NODE_GAP_X;
  const svgH = NODE_PADDING_Y * 2 + graphHeight;

  const posMap = new Map<string, { x: number; y: number; cx: number; cy: number }>();
  columns.forEach((column, columnIndex) => {
    const columnSteps = stepsByColumn.get(column) ?? [];
    const columnHeight =
      columnSteps.length * NODE_H + Math.max(0, columnSteps.length - 1) * NODE_GAP_Y;
    const startY = NODE_PADDING_Y + Math.max(0, (graphHeight - columnHeight) / 2);
    columnSteps.forEach((step, rowIndex) => {
      const x = NODE_PADDING_X + columnIndex * (NODE_W + NODE_GAP_X);
      const y = startY + rowIndex * (NODE_H + NODE_GAP_Y);
      posMap.set(step.id, {
        x,
        y,
        cx: x + NODE_W / 2,
        cy: y + NODE_H / 2,
      });
    });
  });

  // Build edge paths
  const edges: { d: string; color: string; key: string }[] = [];
  for (const step of orderedSteps) {
    if (!step.dependsOn) continue;
    for (const depId of step.dependsOn) {
      const from = posMap.get(depId);
      const to = posMap.get(step.id);
      if (!from || !to) continue;
      const startX = from.x + NODE_W;
      const startY = from.cy;
      const endX = to.x;
      const endY = to.cy;
      const mx = (startX + endX) / 2;
      const d = `M ${startX} ${startY} C ${mx} ${startY}, ${mx} ${endY}, ${endX} ${endY}`;
      edges.push({ d, color: stepStatusColor(step.status), key: `${depId}-${step.id}` });
    }
  }

  return (
    <div className="relative" style={{ width: svgW, height: svgH, minWidth: "100%" }}>
      <svg
        width={svgW}
        height={svgH}
        className="absolute top-0 left-0"
        aria-hidden="true"
      >
        {edges.map((e) => (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke={e.color}
            strokeWidth={1.5}
            strokeOpacity={0.45}
            strokeDasharray={e.color === stepStatusColor("running") ? "4 3" : undefined}
            strokeDashoffset={e.color === stepStatusColor("running") ? 12 : undefined}
            className={
              e.color === stepStatusColor("running")
                ? "[animation:ens-flow_0.9s_linear_infinite]"
                : undefined
            }
          />
        ))}
      </svg>
      {orderedSteps.map((step) => {
        const pos = posMap.get(step.id);
        if (!pos) return null;
        const color = stepStatusColor(step.status);
        const isRunning = step.status === "running";
        const isSelected = selectedStepId === step.id;
        return (
          <button
            key={step.id}
            type="button"
            className={cn(
              "ens-run-node absolute appearance-none p-0 text-left",
              isSelected && "selected",
              isRunning && "running"
            )}
            onClick={() => onSelectStep(step.id)}
            style={{
              left: pos.x,
              top: pos.y,
              width: NODE_W,
              height: NODE_H,
              ["--node-status" as string]: color,
              ["--node-status-bg" as string]: stepStatusBg(step.status),
            }}>
            <span className="ens-node-port in" aria-hidden="true" />
            <span className="ens-node-port out" aria-hidden="true" />
            <div className="ens-run-node-inner">
              <div className="ens-run-node-head">
                <span className="ens-run-node-glyph">{stepInitials(step)}</span>
                <span className="min-w-0 flex-1">
                  <span className="ens-run-node-title" title={step.name}>
                    {step.name}
                  </span>
                  <span className="ens-run-node-kind">
                    {step.stepType}
                  </span>
                </span>
                {isRunning && <Loader2 size={12} className="animate-spin flex-shrink-0" />}
              </div>
              <div className="ens-run-node-body">
                {step.assignedAgentId ? `${step.assignedAgentId} → ` : ""}
                {runStatusLabel(step.status)}
              </div>
              <div className="ens-run-node-foot">
                <span className="ens-run-node-state">
                  <span className="ens-run-node-dot" />
                  {runStatusLabel(step.status)}
                </span>
                <span>{formatStepDuration(step)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Empty canvas state ──────────────────────────────────────────────────── */

interface CanvasEmptyProps {
  /** True when at least one project exists in the workspace. */
  hasProjects: boolean;
  /** True when a project is currently selected (id resolved). */
  hasProject: boolean;
  /** Editor href for the active project (only meaningful when hasProject). */
  editProjectHref?: string;
  onCreateProject: () => void;
  onBrowseProjects: () => void;
  onEditProject?: () => void;
}

function CanvasEmpty({
  hasProjects,
  hasProject,
  editProjectHref,
  onCreateProject,
  onBrowseProjects,
  onEditProject,
}: CanvasEmptyProps) {
  // Three distinct empty states drive different headlines + CTAs:
  //   (a) No workflows at all        → create the first one
  //   (b) Workflows exist, none picked → browse the list
  //   (c) Workflow picked, no run yet  → edit workflow / browse to start one
  const variant: "no-projects" | "no-selection" | "no-run" = !hasProjects
    ? "no-projects"
    : !hasProject
      ? "no-selection"
      : "no-run";

  const Icon =
    variant === "no-projects" ? Plus : variant === "no-selection" ? FolderOpen : Activity;

  const title =
    variant === "no-projects"
      ? "No workflows yet"
      : variant === "no-selection"
        ? "No workflow selected"
        : "No active run";

  const subtitle =
    variant === "no-projects"
      ? "Create a workflow to assemble a crew, wire up triggers, and run it on this canvas."
      : variant === "no-selection"
        ? "Pick a workflow from the list to load it on the canvas."
        : "This workflow hasn't run yet. Open the editor to define its steps, or browse other workflows.";

  return (
    <div className="ens-canvas-empty select-none">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid var(--line)",
        }}
      >
        <Icon size={26} style={{ color: "var(--ink-4)" }} />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-medium" style={{ color: "var(--ink-2)" }}>
          {title}
        </p>
        <p
          className="text-[12px] mt-1 max-w-sm mx-auto"
          style={{ color: "var(--ink-4)" }}
        >
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {variant === "no-projects" && (
          <button
            type="button"
            className="ens-btn accent"
            onClick={onCreateProject}
          >
            <Plus size={12} /> Create your first workflow
          </button>
        )}

        {variant === "no-selection" && (
          <>
            <button
              type="button"
              className="ens-btn"
              onClick={onBrowseProjects}
            >
              <FolderOpen size={12} /> Browse workflows
            </button>
            <button
              type="button"
              className="ens-btn ghost"
              onClick={onCreateProject}
            >
              <Plus size={12} /> New workflow
            </button>
          </>
        )}

        {variant === "no-run" && (
          <>
            {editProjectHref && onEditProject && (
              <button
                type="button"
                className="ens-btn accent"
                onClick={onEditProject}
              >
                <Pencil size={12} /> Open workflow editor
              </button>
            )}
            <button
              type="button"
              className="ens-btn ghost"
              onClick={onBrowseProjects}
            >
              <FolderOpen size={12} /> Browse workflows
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Floating canvas controls ────────────────────────────────────────────── */

type CanvasToolbarBusyAction = "stop" | "replay" | null;

function ToolbarTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <HyperchoTooltip value={label} side="bottom">
      <span className="inline-flex">{children}</span>
    </HyperchoTooltip>
  );
}

function CanvasToolbar({
  isLive,
  runStatus,
  onPauseResume,
  onStop,
  onReplay,
  canStop,
  canReplay,
  busy,
  message,
}: {
  isLive: boolean;
  runStatus?: string;
  onPauseResume?: () => void;
  onStop?: () => void;
  onReplay?: () => void;
  canStop?: boolean;
  canReplay?: boolean;
  busy?: CanvasToolbarBusyAction;
  message?: string | null;
}) {
  const isBusy = busy !== null && busy !== undefined;
  const pauseLabel = isLive ? "Pause run is not wired yet" : "Resume run is not wired yet";
  const stopLabel = busy === "stop"
    ? "Stopping run..."
    : canStop
      ? "Stop run"
      : "No active run to stop";
  const replayLabel = busy === "replay"
    ? "Replaying from template..."
    : canReplay
      ? "Replay run"
      : "Replay needs a workflow template";

  return (
    <div className="ens-canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="tgroup">
        <ToolbarTooltip label="Select">
          <button type="button" className="titem" data-active="true" aria-label="Select">
            <Grid3x3 size={13} />
          </button>
        </ToolbarTooltip>
        <ToolbarTooltip label="Fit view is coming soon">
          <button type="button" className="titem" aria-label="Fit view is coming soon" disabled>
            <Maximize2 size={13} />
          </button>
        </ToolbarTooltip>
      </div>
      <div className="tgroup">
        <ToolbarTooltip label="Step back is coming soon">
          <button type="button" className="titem" aria-label="Step back is coming soon" disabled>
            <Undo2 size={13} />
          </button>
        </ToolbarTooltip>
        <ToolbarTooltip label={pauseLabel}>
          <button
            type="button"
            className="titem"
            onClick={onPauseResume}
            aria-label={pauseLabel}
            disabled
          >
            {isLive ? <Pause size={13} /> : <Play size={13} />}
          </button>
        </ToolbarTooltip>
        <ToolbarTooltip label="Step forward is coming soon">
          <button type="button" className="titem" aria-label="Step forward is coming soon" disabled>
            <StepForward size={13} />
          </button>
        </ToolbarTooltip>
        <ToolbarTooltip label={stopLabel}>
          <button
            type="button"
            className="titem"
            onClick={onStop}
            aria-label={stopLabel}
            disabled={!canStop || isBusy}
          >
            {busy === "stop" ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
          </button>
        </ToolbarTooltip>
      </div>
      <div className="tgroup">
        <ToolbarTooltip label={replayLabel}>
          <button
            type="button"
            className="titem wide"
            onClick={onReplay}
            aria-label={replayLabel}
            disabled={!canReplay || isBusy}
          >
            {busy === "replay" ? <Loader2 size={12} className="animate-spin" /> : <History size={12} />}
            replay
          </button>
        </ToolbarTooltip>
      </div>
      {(runStatus || message) && (
        <span className="ens-canvas-toolbar-status" role={message ? "status" : undefined}>
          {message ?? runStatus}
        </span>
      )}
    </div>
  );
}

function CanvasLegend() {
  return (
    <div className="ens-canvas-legend" aria-label="Cable legend">
      <div className="lrow">
        <span
          className="lsw"
          style={{ background: "hsl(var(--primary))" }}
        />
        flowing
      </div>
      <div className="lrow">
        <span
          className="lsw"
          style={{ background: "rgb(34 197 94)", opacity: 0.7 }}
        />
        done
      </div>
      <div className="lrow">
        <span className="lsw" style={{ background: "var(--line-strong)" }} />
        queued
      </div>
    </div>
  );
}

function CanvasZoom() {
  // Zoom controls are presentational only — they hint at functionality without
  // implementing pan/zoom on the SVG (out of scope for this refactor).
  return (
    <div className="ens-canvas-zoom" aria-label="Zoom controls">
      <button type="button" aria-label="Zoom out">−</button>
      <span className="val">100%</span>
      <button type="button" aria-label="Zoom in">+</button>
      <button type="button" aria-label="Fit screen" title="Fit screen">
        <Maximize2 size={11} />
      </button>
    </div>
  );
}

/* ── Inspector: design-mode step editor ──────────────────────────────────── */

const DEFAULT_TRIGGER_TYPE = "manual";
const DEFAULT_WAIT_MODE = "delay";

function configString(
  config: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

interface DesignStepEditorProps {
  selection: WireSelection;
  agents: ProjectRosterAgent[];
  onPatch: (id: string, patch: WireNodePatch) => void;
}

/**
 * Form rendered in the inspector when a wire node is selected on the canvas.
 *
 * Edits are applied optimistically — every keystroke / select change calls
 * `onPatch`, which routes through `WireBuilder.updateNode` and trips the
 * existing debounced graph save. The local state mirrors the canvas for
 * controlled-input behavior and re-initializes whenever the selection
 * changes (different node, or same node refreshed by a parent update).
 */
function DesignStepEditor({
  selection,
  agents,
  onPatch,
}: DesignStepEditorProps) {
  const config = (selection.config ?? {}) as Record<string, unknown>;

  const [name, setName] = useState<string>(selection.label ?? "");
  const [fields, setFields] = useState<Record<string, string>>({
    agentId: configString(config, "agentId"),
    prompt: configString(config, "prompt"),
    expectedOutput: configString(config, "expectedOutput"),
    inputNotes: configString(config, "inputNotes"),
    allowedTools: configString(config, "allowedTools"),
    timeout: configString(config, "timeout", configString(config, "duration")),
    retryPolicy: configString(config, "retryPolicy", "none"),
    triggerType: configString(config, "triggerType", DEFAULT_TRIGGER_TYPE),
    schedule: configString(config, "schedule"),
    webhookPath: configString(config, "webhookPath"),
    waitMode: configString(config, "waitMode", DEFAULT_WAIT_MODE),
    waitDuration: configString(config, "waitDuration"),
    waitUntil: configString(config, "waitUntil"),
    reason: configString(config, "reason"),
    condition: configString(config, "condition"),
    conditionSource: configString(config, "conditionSource"),
    truePathLabel: configString(config, "truePathLabel", "Continue"),
    falsePathLabel: configString(config, "falsePathLabel", "Stop"),
    approvalOwner: configString(config, "approvalOwner"),
    approvalQuestion: configString(config, "approvalQuestion"),
    rejectBehavior: configString(config, "rejectBehavior", "stop"),
    destination: configString(config, "destination"),
    deliveryChannel: configString(config, "deliveryChannel", "dashboard"),
    summaryFormat: configString(config, "summaryFormat"),
    includeNotes: configString(config, "includeNotes"),
  });

  // Re-hydrate the form when the selection itself swaps. We deliberately key
  // off id/kind/label so a same-node re-emit (e.g. parent re-render) still
  // refreshes inputs to the latest canonical values.
  useEffect(() => {
    const c = (selection.config ?? {}) as Record<string, unknown>;
    setName(selection.label ?? "");
    setFields({
      agentId: configString(c, "agentId"),
      prompt: configString(c, "prompt"),
      expectedOutput: configString(c, "expectedOutput"),
      inputNotes: configString(c, "inputNotes"),
      allowedTools: configString(c, "allowedTools"),
      timeout: configString(c, "timeout", configString(c, "duration")),
      retryPolicy: configString(c, "retryPolicy", "none"),
      triggerType: configString(c, "triggerType", DEFAULT_TRIGGER_TYPE),
      schedule: configString(c, "schedule"),
      webhookPath: configString(c, "webhookPath"),
      waitMode: configString(c, "waitMode", DEFAULT_WAIT_MODE),
      waitDuration: configString(c, "waitDuration"),
      waitUntil: configString(c, "waitUntil"),
      reason: configString(c, "reason"),
      condition: configString(c, "condition"),
      conditionSource: configString(c, "conditionSource"),
      truePathLabel: configString(c, "truePathLabel", "Continue"),
      falsePathLabel: configString(c, "falsePathLabel", "Stop"),
      approvalOwner: configString(c, "approvalOwner"),
      approvalQuestion: configString(c, "approvalQuestion"),
      rejectBehavior: configString(c, "rejectBehavior", "stop"),
      destination: configString(c, "destination"),
      deliveryChannel: configString(c, "deliveryChannel", "dashboard"),
      summaryFormat: configString(c, "summaryFormat"),
      includeNotes: configString(c, "includeNotes"),
    });
  }, [selection.id, selection.kind, selection.label, selection.config]);

  const isAgent = isAgentKind(selection.kind);
  const isLegacy = isLegacyWireNodeKind(selection.kind);

  const updateField = useCallback(
    (key: string, value: string, configKey = key) => {
      setFields((prev) => ({ ...prev, [key]: value }));
      onPatch(selection.id, { config: { [configKey]: value } });
    },
    [onPatch, selection.id],
  );

  // Picking a different agent rebinds BOTH the visual kind (so the card glyph
  // and ports change) and the identity in `config`, in one round-trip patch.
  const handleAgentChange = useCallback(
    (value: string) => {
      const agent = agents.find((a) => a.id === value);
      if (!agent) return;
      setName(agent.name);
      setFields((prev) => ({ ...prev, agentId: agent.id }));
      onPatch(selection.id, {
        label: agent.name,
        kind: runtimeToWireNodeKind(agent.runtime),
        config: {
          agentId: agent.id,
          agentName: agent.name,
          runtime: agent.runtime,
        },
      });
    },
    [agents, onPatch, selection.id],
  );

  return (
    <section aria-label="Step editor" className="space-y-4">
      <div>
        <InspLabel>Step name</InspLabel>
        <Input
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            onPatch(selection.id, { label: next });
          }}
          placeholder="Untitled step"
          className="h-8 text-[12px] px-2.5"
        />
      </div>

      {isAgent && (
        <>
          <div>
            <InspLabel>Assigned agent</InspLabel>
            {agents.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                No agents hired yet.{" "}
                <a
                  href="/Tool/Agent"
                  className="font-medium text-primary hover:underline"
                >
                  Create one
                </a>
              </div>
            ) : (
              <Select value={fields.agentId} onValueChange={handleAgentChange}>
                <SelectTrigger className="h-8 text-[12px] px-2.5">
                  <SelectValue placeholder="Bind to an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-[12px]">
                      <span className="flex items-center gap-2">
                        <AgentMonogram
                          agentId={a.id}
                          name={a.name}
                          runtime={a.runtime}
                          status={a.status}
                          avatarData={a.avatarData}
                          initials={a.initials}
                          size="xs"
                        />
                        <span className="truncate">{a.name}</span>
                        {a.runtime && (
                          <span className="text-[10px] text-muted-foreground">
                            · {a.runtime}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <InspLabel>Objective prompt</InspLabel>
            <Textarea
              value={fields.prompt}
              onChange={(e) => updateField("prompt", e.target.value)}
              placeholder="Tell the agent exactly what to do."
              className="text-[12px] px-2.5 py-2 min-h-[104px]"
            />
          </div>

          <div>
            <InspLabel>Expected output</InspLabel>
            <Textarea
              value={fields.expectedOutput}
              onChange={(e) => updateField("expectedOutput", e.target.value)}
              placeholder="What should this agent produce before handoff?"
              className="text-[12px] px-2.5 py-2 min-h-[72px]"
            />
          </div>

          <div>
            <InspLabel>Context / inputs</InspLabel>
            <Textarea
              value={fields.inputNotes}
              onChange={(e) => updateField("inputNotes", e.target.value)}
              placeholder="Inputs, files, prior step outputs, or constraints."
              className="text-[12px] px-2.5 py-2 min-h-[72px]"
            />
          </div>

          <div>
            <InspLabel>Allowed tools</InspLabel>
            <Input
              value={fields.allowedTools}
              onChange={(e) => updateField("allowedTools", e.target.value)}
              placeholder="e.g. browser, repo read, docs lookup"
              className="h-8 text-[12px] px-2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <InspLabel>Timeout</InspLabel>
              <Input
                value={fields.timeout}
                onChange={(e) => updateField("timeout", e.target.value, "duration")}
                placeholder="e.g. 5m"
                className="h-8 text-[12px] px-2.5"
              />
            </div>
            <div>
              <InspLabel>Retry</InspLabel>
              <Select
                value={fields.retryPolicy}
                onValueChange={(value) => updateField("retryPolicy", value)}
              >
                <SelectTrigger className="h-8 text-[12px] px-2.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[12px]">
                    No retry
                  </SelectItem>
                  <SelectItem value="once" className="text-[12px]">
                    Retry once
                  </SelectItem>
                  <SelectItem value="escalate" className="text-[12px]">
                    Escalate
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {selection.kind === "trigger" && (
        <>
          <div>
            <InspLabel>Start when</InspLabel>
            <Select
              value={fields.triggerType}
              onValueChange={(value) => updateField("triggerType", value)}
            >
              <SelectTrigger className="h-8 text-[12px] px-2.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual" className="text-[12px]">
                  Manual
                </SelectItem>
                <SelectItem value="schedule" className="text-[12px]">
                  Schedule
                </SelectItem>
                <SelectItem value="webhook" className="text-[12px]">
                  Webhook
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {fields.triggerType === "schedule" && (
            <div>
              <InspLabel>Schedule</InspLabel>
              <Input
                value={fields.schedule}
                onChange={(e) => updateField("schedule", e.target.value)}
                placeholder="e.g. every weekday at 9am"
                className="h-8 text-[12px] px-2.5"
              />
            </div>
          )}

          {fields.triggerType === "webhook" && (
            <div>
              <InspLabel>Webhook route</InspLabel>
              <Input
                value={fields.webhookPath}
                onChange={(e) => updateField("webhookPath", e.target.value)}
                placeholder="e.g. /webhooks/customer-created"
                className="h-8 text-[12px] px-2.5"
              />
            </div>
          )}

          <div>
            <InspLabel>Input payload notes</InspLabel>
            <Textarea
              value={fields.inputNotes}
              onChange={(e) => updateField("inputNotes", e.target.value)}
              placeholder="What context starts this workflow?"
              className="text-[12px] px-2.5 py-2 min-h-[76px]"
            />
          </div>
        </>
      )}

      {selection.kind === "wait" && (
        <>
          <div>
            <InspLabel>Wait mode</InspLabel>
            <Select
              value={fields.waitMode}
              onValueChange={(value) => updateField("waitMode", value)}
            >
              <SelectTrigger className="h-8 text-[12px] px-2.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delay" className="text-[12px]">
                  Delay
                </SelectItem>
                <SelectItem value="until" className="text-[12px]">
                  Until time
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <InspLabel>{fields.waitMode === "until" ? "Wait until" : "Wait duration"}</InspLabel>
            <Input
              value={fields.waitMode === "until" ? fields.waitUntil : fields.waitDuration}
              onChange={(e) =>
                updateField(
                  fields.waitMode === "until" ? "waitUntil" : "waitDuration",
                  e.target.value,
                )
              }
              placeholder={fields.waitMode === "until" ? "e.g. tomorrow 9am" : "e.g. 30m"}
              className="h-8 text-[12px] px-2.5"
            />
          </div>

          <div>
            <InspLabel>Why wait?</InspLabel>
            <Textarea
              value={fields.reason}
              onChange={(e) => updateField("reason", e.target.value)}
              placeholder="Explain the handoff delay in plain English."
              className="text-[12px] px-2.5 py-2 min-h-[72px]"
            />
          </div>
        </>
      )}

      {selection.kind === "condition" && (
        <>
          <div>
            <InspLabel>Evaluate</InspLabel>
            <Input
              value={fields.conditionSource}
              onChange={(e) => updateField("conditionSource", e.target.value)}
              placeholder="e.g. Previous agent output"
              className="h-8 text-[12px] px-2.5"
            />
          </div>
          <div>
            <InspLabel>If</InspLabel>
            <Textarea
              value={fields.condition}
              onChange={(e) => updateField("condition", e.target.value)}
              placeholder="e.g. if the review found launch-blocking issues"
              className="text-[12px] px-2.5 py-2 min-h-[88px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <InspLabel>True path</InspLabel>
              <Input
                value={fields.truePathLabel}
                onChange={(e) => updateField("truePathLabel", e.target.value)}
                placeholder="Continue"
                className="h-8 text-[12px] px-2.5"
              />
            </div>
            <div>
              <InspLabel>False path</InspLabel>
              <Input
                value={fields.falsePathLabel}
                onChange={(e) => updateField("falsePathLabel", e.target.value)}
                placeholder="Stop"
                className="h-8 text-[12px] px-2.5"
              />
            </div>
          </div>
        </>
      )}

      {selection.kind === "approval" && (
        <>
          <div>
            <InspLabel>Reviewer / owner</InspLabel>
            <Input
              value={fields.approvalOwner}
              onChange={(e) => updateField("approvalOwner", e.target.value)}
              placeholder="e.g. project lead, founder, manager"
              className="h-8 text-[12px] px-2.5"
            />
          </div>
          <div>
            <InspLabel>Approval question</InspLabel>
            <Textarea
              value={fields.approvalQuestion}
              onChange={(e) => updateField("approvalQuestion", e.target.value)}
              placeholder="What should the human approve before continuing?"
              className="text-[12px] px-2.5 py-2 min-h-[88px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <InspLabel>Timeout</InspLabel>
              <Input
                value={fields.timeout}
                onChange={(e) => updateField("timeout", e.target.value)}
                placeholder="e.g. 24h"
                className="h-8 text-[12px] px-2.5"
              />
            </div>
            <div>
              <InspLabel>If rejected</InspLabel>
              <Select
                value={fields.rejectBehavior}
                onValueChange={(value) => updateField("rejectBehavior", value)}
              >
                <SelectTrigger className="h-8 text-[12px] px-2.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop" className="text-[12px]">
                    Stop
                  </SelectItem>
                  <SelectItem value="revise" className="text-[12px]">
                    Send back
                  </SelectItem>
                  <SelectItem value="notify" className="text-[12px]">
                    Notify only
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {selection.kind === "output" && (
        <>
          <div>
            <InspLabel>Destination</InspLabel>
            <Input
              value={fields.destination}
              onChange={(e) => updateField("destination", e.target.value)}
              placeholder="e.g. Slack #design, project brief, email"
              className="h-8 text-[12px] px-2.5"
            />
          </div>
          <div>
            <InspLabel>Delivery channel</InspLabel>
            <Select
              value={fields.deliveryChannel}
              onValueChange={(value) => updateField("deliveryChannel", value)}
            >
              <SelectTrigger className="h-8 text-[12px] px-2.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dashboard" className="text-[12px]">
                  Dashboard
                </SelectItem>
                <SelectItem value="chat" className="text-[12px]">
                  Chat
                </SelectItem>
                <SelectItem value="slack" className="text-[12px]">
                  Slack
                </SelectItem>
                <SelectItem value="email" className="text-[12px]">
                  Email
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <InspLabel>Summary format</InspLabel>
            <Textarea
              value={fields.summaryFormat}
              onChange={(e) => updateField("summaryFormat", e.target.value)}
              placeholder="e.g. concise launch note with links and decisions"
              className="text-[12px] px-2.5 py-2 min-h-[72px]"
            />
          </div>
          <div>
            <InspLabel>Include</InspLabel>
            <Textarea
              value={fields.includeNotes}
              onChange={(e) => updateField("includeNotes", e.target.value)}
              placeholder="What artifacts, links, or context should be included?"
              className="text-[12px] px-2.5 py-2 min-h-[72px]"
            />
          </div>
        </>
      )}

      {isLegacy && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
          This is a legacy {selection.kind} block. New workflows should put this
          work inside an agent prompt so execution stays owned by an agent.
        </div>
      )}
    </section>
  );
}

/* ── Inspector: run details ──────────────────────────────────────────────── */

type InspectorMode = "design-step" | "run-step" | "empty";

interface InspectorProps {
  project: BridgeProject | null;
  run: BridgeWorkflowRun | null;
  selectedStep: BridgeWorkflowStepRun | null;
  chartSpecs: BridgeWorkflowChartSpec[];
  events: AgentEvent[];
  loadingRun: boolean;
  loadingEvents: boolean;
  /** When set, the canvas has a selected wire node and the inspector renders
   *  the design-step editor instead of the run tabs. */
  wireSelection: WireSelection | null;
  /** Apply an inspector patch back into the canvas. */
  onUpdateNode: (id: string, patch: WireNodePatch) => void;
}

function Inspector({
  project,
  run,
  selectedStep,
  chartSpecs,
  events,
  loadingRun,
  loadingEvents,
  wireSelection,
  onUpdateNode,
}: InspectorProps) {
  const steps = run?.steps ?? [];
  const estimatedCost = formatCostFromEvents(events);
  const tabs = ["Overview", "Events", "Cost", "Output"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const progressPercent =
    steps.length > 0
      ? Math.round((completedSteps / steps.length) * 100)
      : run?.status === "completed"
        ? 100
        : 0;

  // Roster for the design-mode agent picker. Pulled here (not at the parent)
  // so the inspector is self-contained and we don't have to drill the list
  // through MissionControl's own props.
  const { agents: rosterAgents } = useProjectAgentRoster();

  // Inspector mode is driven first by the canvas selection (always wins —
  // matches the request "if we click on the component or steps, then they
  // should be able to automatically turn on the inspector"), and falls back
  // to the existing run/empty rendering when nothing is selected on the wire.
  const mode: InspectorMode =
    wireSelection !== null
      ? "design-step"
      : project || run
        ? "run-step"
        : "empty";
  const activeTabId =
    mode === "design-step"
      ? "mission-control-tab-configure"
      : `mission-control-tab-${tab.toLowerCase()}`;
  const visibleEvents = tab === "Overview" ? events.slice(0, 12) : events;

  useEffect(() => {
    setTab("Overview");
  }, [project?.id, run?.id]);

  return (
    <aside
      className="ens-inspector flex flex-col h-full overflow-hidden"
      style={{
        width: 340,
        minWidth: 280,
      }}
      aria-label="Inspector"
    >
      <div className="ens-inspector-head">
        <div className="flex items-center justify-between">
          <span
            className="ens-inspector-kicker"
          >
            {mode === "design-step" ? "Edit step" : mode === "empty" ? "Inspector" : "Project run"}
          </span>
          {mode === "design-step" && wireSelection ? (
            <span
              className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--ink-4)]"
              aria-hidden="true"
            >
              {wireSelection.kind}
            </span>
          ) : (
            run && (
              <span
                className={cn("ens-pill", runStatusPillClass(run.status))}
              >
                <span className="pdot" />
                {runStatusLabel(run.status)}
              </span>
            )
          )}
        </div>
        {mode !== "design-step" && (
          <div className="min-w-0">
            <h2 className="ens-inspector-title">
              {project?.name ?? "No run selected"}
            </h2>
            <p className="ens-inspector-desc">
              {project?.description?.trim() ||
                "Track the latest workflow run, inspect handoffs, and review output."}
            </p>
          </div>
        )}
        {mode === "design-step" ? (
          <div className="ens-inspector-tabs" role="tablist" aria-label="Step inspector tabs">
            <span
              id="mission-control-tab-configure"
              role="tab"
              aria-selected="true"
              aria-controls="mission-control-inspector-panel"
              tabIndex={0}
              className="ens-inspector-tab active"
            >
              Configure
            </span>
          </div>
        ) : (
          <div className="ens-inspector-tabs" role="tablist" aria-label="Project run tabs">
            {tabs.map((t) => (
              <button
                id={`mission-control-tab-${t.toLowerCase()}`}
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls="mission-control-inspector-panel"
                onClick={() => setTab(t)}
                className={cn(
                  "ens-inspector-tab",
                  tab === t && "active"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        id="mission-control-inspector-panel"
        role="tabpanel"
        aria-labelledby={activeTabId}
        className="ens-inspector-body flex-1 overflow-y-auto px-4 py-4 space-y-5"
      >
        {mode === "design-step" && wireSelection && (
          <DesignStepEditor
            selection={wireSelection}
            agents={rosterAgents}
            onPatch={onUpdateNode}
          />
        )}

        {mode !== "design-step" && tab === "Overview" && project && (
          <section aria-label="Workflow identity">
            <InspLabel>Workflow</InspLabel>
            <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
              <div className="flex items-center gap-2">
                {project.emoji && <span aria-hidden="true">{project.emoji}</span>}
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
                  {project.name}
                </span>
              </div>
              <div
                className="mt-1 text-[10.5px] font-mono"
                style={{ color: "var(--ink-4)" }}
              >
                {project.id}
              </div>
            </div>
          </section>
        )}

        {mode === "run-step" && tab === "Overview" && (
          <section aria-label="Selected step">
            <InspLabel>Selected step</InspLabel>
            {selectedStep ? (
              <div
                className="rounded-lg border px-3 py-3"
                style={{
                  borderColor: stepStatusColor(selectedStep.status) + "66",
                  background: stepStatusBg(selectedStep.status),
                }}
              >
                <div className="flex items-start gap-2.5">
                  <StepIcon status={selectedStep.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
                      {selectedStep.name}
                    </div>
                    <div className="mt-0.5 text-[10.5px] font-mono" style={{ color: "var(--ink-4)" }}>
                      {selectedStep.stepType} · {runStatusLabel(selectedStep.status)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniMetric label="Agent" value={selectedStep.assignedAgentId ?? "—"} />
                  <MiniMetric label="Duration" value={formatStepDuration(selectedStep)} />
                </div>
                {selectedStep.metadata && Object.keys(selectedStep.metadata).length > 0 && (
                  <div className="mt-3 rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                    <div
                      className="text-[9px] uppercase tracking-[0.1em]"
                      style={{
                        color: "var(--ink-4)",
                        fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      }}
                    >
                      Node config
                    </div>
                    <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                      {JSON.stringify(selectedStep.metadata.config ?? selectedStep.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                {chartSpecs.length > 0 && (
                  <div className="mt-3 rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                    <div
                      className="text-[9px] uppercase tracking-[0.1em]"
                      style={{
                        color: "var(--ink-4)",
                        fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      }}
                    >
                      Linked charts
                    </div>
                    <div className="mt-1 space-y-1">
                      {chartSpecs.slice(0, 3).map((spec) => (
                        <div key={spec.id} className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
                          <span className="truncate">{spec.name}</span>
                          <span className="font-mono">{spec.chartType}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
                  No step selected
                </span>
              </div>
            )}
          </section>
        )}

        {mode !== "design-step" && (tab === "Cost" || (tab === "Overview" && !run)) && (
          <section aria-label="Run status">
            <InspLabel>Run status</InspLabel>
            {loadingRun ? (
              <Skeleton className="h-6 w-28" />
            ) : run ? (
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", runStatusDotClass(run.status))} />
                <span
                  className="text-[13px] font-medium capitalize"
                  style={{ color: "var(--ink)" }}
                >
                  {runStatusLabel(run.status)}
                </span>
              </div>
            ) : (
              <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
                No run selected
              </span>
            )}
          </section>
        )}

        {mode !== "design-step" && tab === "Overview" && run && (
          <section aria-label="Latest run">
            <InspLabel>Latest run</InspLabel>
            <div className="ens-run-card">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="ens-run-card-kicker">
                    Started {formatTime(run.createdAt)}
                  </div>
                  <div className="ens-run-card-title">
                    Run {run.id.slice(0, 8)}
                  </div>
                </div>
                <span className={cn("ens-pill", runStatusPillClass(run.status))}>
                  <span className="pdot" />
                  {runStatusLabel(run.status)}
                </span>
              </div>
              <div
                className="ens-run-progress"
                aria-hidden="true"
                style={{ ["--run-progress" as string]: `${progressPercent}%` }}
              >
                <span />
              </div>
              <div className="ens-run-card-meta">
                <span>{completedSteps}/{steps.length} steps</span>
                <span>{estimatedCost} run cost</span>
              </div>
            </div>
          </section>
        )}

        {mode !== "design-step" && run && (tab === "Overview" || tab === "Cost") && (
          <section aria-label="Estimated cost">
            <InspLabel>Estimated cost</InspLabel>
            {loadingEvents ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span
                className="text-[13px] font-mono"
                style={{ color: "var(--ink-2)" }}
              >
                {estimatedCost}
              </span>
            )}
          </section>
        )}

        {mode !== "design-step" && run && tab === "Overview" && (
          <section aria-label="Steps">
            <InspLabel>Steps</InspLabel>
            {loadingRun ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : steps.length === 0 ? (
              <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
                No steps
              </span>
            ) : (
              <ol className="space-y-1.5">
                {[...steps]
                  .sort((a, b) => a.position - b.position)
                  .map((step) => (
                    <li
                      key={step.id}
                      className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg border"
                      style={{
                        background: stepStatusBg(step.status),
                        borderColor: stepStatusColor(step.status) + "44",
                      }}
                    >
                      <StepIcon status={step.status} />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[12px] font-medium truncate"
                          style={{ color: "var(--ink)" }}
                        >
                          {step.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--ink-4)" }}
                          >
                            {step.stepType}
                          </span>
                          {step.startedAt && (
                            <span
                              className="text-[10px] flex items-center gap-0.5"
                              style={{ color: "var(--ink-4)" }}
                            >
                              <Clock size={9} /> {formatTime(step.startedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        )}

        {mode !== "design-step" && run && (tab === "Overview" || tab === "Events" || tab === "Output") && events.length > 0 && (
          <section aria-label="Recent events">
            <InspLabel>{tab === "Output" ? "Output" : "Recent events"}</InspLabel>
            <ol className="space-y-1">
              {visibleEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="text-[11px] px-2 py-1.5 rounded-md font-mono"
                  style={{
                    background: "var(--paper-2)",
                    color: "var(--ink-3)",
                  }}
                >
                  <span className="font-medium" style={{ color: "var(--ink-2)" }}>
                    {ev.eventType}
                  </span>
                  {" — "}
                  {ev.status}
                </li>
              ))}
            </ol>
            {tab === "Overview" && events.length > 12 && (
              <div className="mt-2 text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                Showing latest 12. Open Events for the full stream.
              </div>
            )}
          </section>
        )}

        {mode !== "design-step" && run && tab === "Overview" && loadingEvents && events.length === 0 && (
          <section aria-label="Recent events loading">
            <InspLabel>Recent events</InspLabel>
            <div className="space-y-1">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-7 w-full rounded-md" />
              ))}
            </div>
          </section>
        )}

        {mode !== "design-step" && run && (tab === "Events" || tab === "Output") && events.length === 0 && (
          <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
            {loadingEvents ? "Loading…" : "Nothing here yet."}
          </span>
        )}
      </div>
    </aside>
  );
}

function StepIcon({ status }: { status: string }) {
  const color = stepStatusColor(status);
  if (status === "running")          return <Loader2 size={13} className="animate-spin mt-0.5 flex-shrink-0" style={{ color }} />;
  if (status === "completed")        return <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" style={{ color }} />;
  if (status === "failed")           return <AlertCircle size={13} className="mt-0.5 flex-shrink-0" style={{ color }} />;
  if (status === "waiting_approval") return <Clock size={13} className="mt-0.5 flex-shrink-0" style={{ color }} />;
  return <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ background: color, opacity: 0.5 }} />;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
      <div
        className="text-[9px] uppercase tracking-[0.1em]"
        style={{
          color: "var(--ink-4)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
        }}
      >
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11.5px] font-medium" style={{ color: "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function MissionControl() {
  const router = useRouter();
  const { setActiveProject, setActions } = useMissionControlHeader();
  const [projects, setProjects] = useState<BridgeProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<BridgeWorkflowRun | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  // Wire-canvas selection (null when nothing is selected). Drives the
  // inspector's "design step" mode and is cleared whenever the user clicks
  // an empty pane or the active project changes.
  const [selectedWireNode, setSelectedWireNode] =
    useState<WireSelection | null>(null);
  // Inspector visibility — owned here so the SiteHeader toggle and the
  // auto-open-on-select behavior agree on a single source of truth.
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [persistedGraph, setPersistedGraph] = useState<WireGraph | null>(null);
  const [chartSpecs, setChartSpecs] = useState<BridgeWorkflowChartSpec[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  // Imperative handle to the canvas — only used by the inspector to apply
  // node patches. Selection itself flows back via `onSelectNode`.
  const wireBuilderRef = useRef<WireBuilderHandle>(null);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [runEffect, setRunEffect] = useState<CanvasToolbarBusyAction>(null);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toolbarMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedProjectId = useMemo(
    () => (router.isReady ? getMissionControlProjectId(router.query) : null),
    [router.isReady, router.query],
  );

  // Fetch project list on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);
    bridgeInvoke("project-list", { kind: "project" }).then((result) => {
      if (cancelled) return;
      const r = result as { success?: boolean; data?: BridgeProject[] };
      const list = r?.data ?? (Array.isArray(result) ? (result as BridgeProject[]) : []);
      setProjects(list);
    }).catch(() => {
      if (!cancelled) setProjects([]);
    }).finally(() => {
      if (!cancelled) setLoadingProjects(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!router.isReady || loadingProjects) return;
    if (projects.length === 0) {
      if (selectedProjectId !== null) setSelectedProjectId(null);
      return;
    }

    const queryProject = requestedProjectId && projects.some((p) => p.id === requestedProjectId)
      ? requestedProjectId
      : null;
    const currentProject = selectedProjectId && projects.some((p) => p.id === selectedProjectId)
      ? selectedProjectId
      : null;
    const nextProjectId = queryProject ?? currentProject ?? projects[0].id;

    if (nextProjectId !== selectedProjectId) {
      setSelectedProjectId(nextProjectId);
    }
  }, [router.isReady, loadingProjects, projects, requestedProjectId, selectedProjectId]);

  const fetchRunForProject = useCallback(async (projectId: string) => {
    setLoadingRun(true);
    try {
      const result = await bridgeInvoke("workflow-run-list", { projectId });
      const r = result as { success?: boolean; data?: BridgeWorkflowRun[] };
      const runs: BridgeWorkflowRun[] = r?.data ?? (Array.isArray(result) ? (result as BridgeWorkflowRun[]) : []);

      const prioritized =
        runs.find((r) => r.status === "running") ??
        runs.find((r) => r.status === "pending") ??
        runs.find((r) => r.status === "waiting_approval") ??
        runs[0] ?? null;

      if (!prioritized) {
        setActiveRun(null);
        setLoadingRun(false);
        return;
      }

      // Fetch full run with steps
      const runResult = await bridgeInvoke("workflow-run-get", { id: prioritized.id });
      const rr = runResult as { success?: boolean; data?: BridgeWorkflowRun };
      setActiveRun(rr?.data ?? prioritized);
    } catch {
      setActiveRun(null);
    } finally {
      setLoadingRun(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const result = await bridgeInvoke("get-agent-events", { limit: 20 });
      const r = result as { events?: AgentEvent[] } | AgentEvent[];
      const list: AgentEvent[] = Array.isArray(r) ? r : ((r as { events?: AgentEvent[] })?.events ?? []);
      setEvents(list);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchPersistedDetails = useCallback(async (projectId: string) => {
    try {
      const [graphRecord, charts] = await Promise.all([
        getWorkflowGraph({ projectId }),
        listWorkflowChartSpecs({ projectId }),
      ]);
      const graph = graphRecord?.graph as Partial<WireGraph> | undefined;
      setPersistedGraph(
        graphRecord && graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
          ? {
              nodes: graph.nodes,
              edges: graph.edges,
              updatedAt: typeof graph.updatedAt === "number" ? graph.updatedAt : graphRecord.updatedAt,
              version: graphRecord.version,
            }
          : null,
      );
      setChartSpecs(charts);
    } catch {
      setPersistedGraph(null);
      setChartSpecs([]);
    }
  }, []);

  // Fetch run when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    fetchRunForProject(selectedProjectId);
    fetchPersistedDetails(selectedProjectId);
    fetchEvents();
  }, [selectedProjectId, fetchRunForProject, fetchPersistedDetails, fetchEvents]);

  // Poll every 5s when run is active
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const isActive =
      activeRun?.status === "running" ||
      activeRun?.status === "pending" ||
      activeRun?.status === "waiting_approval";

    if (isActive && selectedProjectId) {
      pollRef.current = setInterval(() => {
        fetchRunForProject(selectedProjectId);
        fetchEvents();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeRun?.status, selectedProjectId, fetchRunForProject, fetchEvents]);

  const designSteps = useMemo(
    () => (persistedGraph ? graphToDisplaySteps(persistedGraph) : []),
    [persistedGraph],
  );
  const steps = useMemo(
    () => activeRun?.steps ?? designSteps,
    [activeRun?.steps, designSteps],
  );
  const hasActiveRun = !!activeRun;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const isLive = activeRun?.status === "running";
  const toolbarRunStatus = activeRun ? runStatusLabel(activeRun.status) : undefined;
  const canStopRun = !!activeRun && isRunCancellable(activeRun.status) && !loadingRun;
  const canReplayRun = !!activeRun?.templateId && !loadingRun;
  const headerRunCost = useMemo(() => formatCostFromEvents(events), [events]);

  const selectedStep = useMemo(
    () => steps.find((step) => step.id === selectedStepId) ?? steps[0] ?? null,
    [selectedStepId, steps],
  );

  useEffect(() => {
    if (steps.length === 0) {
      if (selectedStepId !== null) setSelectedStepId(null);
      return;
    }
    if (!selectedStepId || !steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(steps[0].id);
    }
  }, [selectedStepId, steps]);

  // Drop the wire selection whenever the active project changes — a node id
  // is only meaningful inside the project that owns it.
  useEffect(() => {
    setSelectedWireNode(null);
  }, [selectedProjectId]);

  // Publish the active project up to the SiteHeader. Reset on unmount so
  // the breadcrumb collapses back to "Hypercho / Mission Control" if the
  // user navigates away.
  useEffect(() => {
    setActiveProject(
      selectedProject
        ? {
            id: selectedProject.id,
            name: selectedProject.name,
            emoji: selectedProject.emoji,
          }
        : null,
    );
  }, [selectedProject, setActiveProject]);

  useEffect(() => {
    return () => setActiveProject(null);
  }, [setActiveProject]);

  // Refresh + Configure now live in the global SiteHeader. Stable callbacks
  // are published through MissionControlHeaderProvider so the page-level app
  // schema can render them without reaching into MissionControl internals.
  const handleHeaderRefresh = useCallback(() => {
    if (selectedProjectId) {
      fetchRunForProject(selectedProjectId);
      fetchPersistedDetails(selectedProjectId);
    }
    fetchEvents();
  }, [
    selectedProjectId,
    fetchRunForProject,
    fetchPersistedDetails,
    fetchEvents,
  ]);

  const handleHeaderConfigure = useCallback(() => {
    if (!selectedProject) return;
    router.push(`/Tool/ProjectEditor?id=${selectedProject.id}`);
  }, [router, selectedProject]);

  const handleToggleInspector = useCallback(() => {
    setInspectorOpen((prev) => !prev);
  }, []);

  const handleHeaderFind = useCallback(() => {
    const canvas = document.querySelector<HTMLElement>(".ens-canvas-scroll");
    canvas?.focus();
  }, []);

  const clearToolbarMessageTimer = useCallback(() => {
    if (toolbarMessageTimeoutRef.current) {
      clearTimeout(toolbarMessageTimeoutRef.current);
      toolbarMessageTimeoutRef.current = null;
    }
  }, []);

  const showToolbarMessage = useCallback(
    (message: string, autoClear = true) => {
      clearToolbarMessageTimer();
      setToolbarMessage(message);
      if (autoClear) {
        toolbarMessageTimeoutRef.current = setTimeout(() => {
          setToolbarMessage(null);
          toolbarMessageTimeoutRef.current = null;
        }, 3200);
      }
    },
    [clearToolbarMessageTimer],
  );

  const handleStopRun = useCallback(async () => {
    if (!activeRun || !selectedProjectId || !isRunCancellable(activeRun.status) || runEffect) return;
    setRunEffect("stop");
    showToolbarMessage("Stopping run...", false);
    try {
      const cancelled = await cancelWorkflowRun(activeRun.id);
      if (!cancelled) throw new Error("Stop request was not accepted");

      setActiveRun((prev) =>
        prev?.id === activeRun.id
          ? { ...prev, status: "cancelled", updatedAt: Date.now() }
          : prev,
      );
      showToolbarMessage("Run stopped");
      await Promise.all([
        fetchRunForProject(selectedProjectId),
        fetchEvents(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not stop run";
      showToolbarMessage(message);
    } finally {
      setRunEffect(null);
    }
  }, [
    activeRun,
    selectedProjectId,
    runEffect,
    showToolbarMessage,
    fetchRunForProject,
    fetchEvents,
  ]);

  const handleReplayRun = useCallback(async () => {
    if (!activeRun?.templateId || runEffect) return;
    setRunEffect("replay");
    showToolbarMessage("Replaying from template...", false);
    try {
      const nextRun = await startWorkflowRun(activeRun.templateId, "mission-control");
      if (!nextRun) throw new Error("Replay request was not accepted");

      setActiveRun(nextRun);
      setSelectedStepId(null);
      showToolbarMessage("Replay started");
      await Promise.all([
        fetchRunForProject(nextRun.projectId),
        fetchEvents(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not replay run";
      showToolbarMessage(message);
    } finally {
      setRunEffect(null);
    }
  }, [
    activeRun?.templateId,
    runEffect,
    showToolbarMessage,
    fetchRunForProject,
    fetchEvents,
  ]);

  useEffect(() => {
    clearToolbarMessageTimer();
    setRunEffect(null);
    setToolbarMessage(null);
  }, [selectedProjectId, clearToolbarMessageTimer]);

  useEffect(() => {
    return clearToolbarMessageTimer;
  }, [clearToolbarMessageTimer]);

  // Auto-open the inspector whenever the user selects something on the
  // canvas — either a wire node in design mode or a run step. Pane clicks
  // that clear the wire selection (sel === null) intentionally do NOT close
  // the rail; only the SiteHeader toggle does that.
  const handleSelectWireNode = useCallback(
    (sel: WireSelection | null) => {
      setSelectedWireNode(sel);
      if (sel) setInspectorOpen(true);
    },
    [],
  );
  const handleSelectStep = useCallback(
    (stepId: string) => {
      setSelectedStepId(stepId);
      setInspectorOpen(true);
    },
    [],
  );

  useEffect(() => {
    setActions({
      onRefresh: handleHeaderRefresh,
      onConfigure: selectedProject ? handleHeaderConfigure : undefined,
      onFind: handleHeaderFind,
      onToggleInspector: handleToggleInspector,
      inspectorOpen,
      loadingRun,
      runStatus: activeRun
        ? runStatusLabel(activeRun.status)
        : selectedProject
          ? "design"
          : undefined,
      runCost: headerRunCost !== "—" ? headerRunCost : undefined,
      hasActiveRun,
    });
  }, [
    setActions,
    handleHeaderRefresh,
    handleHeaderConfigure,
    handleHeaderFind,
    handleToggleInspector,
    inspectorOpen,
    selectedProject,
    loadingRun,
    activeRun,
    headerRunCost,
    hasActiveRun,
  ]);

  useEffect(() => {
    return () => setActions({});
  }, [setActions]);

  return (
    <div
      className="ensemble-root flex h-full overflow-hidden"
      data-ensemble
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
      }}
    >
      {/* Main canvas — full width, no in-component topbar (breadcrumb +
          refresh + configure moved into the global SiteHeader). */}
      <main
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        aria-label="Workflow canvas"
      >
        <div className="ens-canvas-wrap flex-1">
          {/*
            Three render states for the canvas:
              1. Loading           → skeleton tiles (inside ens-canvas-scroll)
              2. Active run        → live NodeGraph (inside ens-canvas-scroll)
              3. Design mode       → WireBuilder overlay (project selected,
                                     no active run) — author the workflow
              4. Truly empty       → CanvasEmpty overlay (no project picked)
          */}
          <div className="ens-canvas-scroll" tabIndex={-1}>
            <div className="p-8" style={{ minWidth: "100%", minHeight: "100%" }}>
              {loadingProjects || loadingRun ? (
                <div className="flex items-center gap-6 pt-12">
                  {[1, 2, 3].map((i) => (
                    <Skeleton
                      key={i}
                      className="rounded-[10px]"
                      style={{ width: NODE_W, height: NODE_H }}
                    />
                  ))}
                </div>
              ) : hasActiveRun && steps.length > 0 ? (
                <NodeGraph
                  steps={steps}
                  selectedStepId={selectedStep?.id ?? null}
                  onSelectStep={handleSelectStep}
                />
              ) : null}
            </div>
          </div>

          {/* Design-mode wiring canvas — visible when a project is selected
              and there's no active run. Lets the user drop agent nodes,
              wire input/output ports, and auto-saves to localStorage. */}
          {!loadingRun &&
            !loadingProjects &&
            !!selectedProjectId &&
            (!hasActiveRun || steps.length === 0) && (
              <WireBuilder
                ref={wireBuilderRef}
                projectId={selectedProjectId}
                onSelectNode={handleSelectWireNode}
              />
            )}

          {/* Truly-empty state — no project selected (or no projects yet). */}
          {!loadingRun &&
            !loadingProjects &&
            !selectedProjectId &&
            (!hasActiveRun || steps.length === 0) && (
              <CanvasEmpty
                hasProjects={projects.length > 0}
                hasProject={false}
                onCreateProject={() => router.push("/Tool/ProjectEditor")}
                onBrowseProjects={() => router.push("/Tool/Workflows")}
              />
            )}

          {/* Run-only overlays — only meaningful while a workflow is
              actually running. Hidden in design mode so they don't
              compete with the WireBuilder palette. */}
          {hasActiveRun && (
            <>
              <CanvasToolbar
                isLive={isLive}
                runStatus={toolbarRunStatus}
                onStop={handleStopRun}
                onReplay={handleReplayRun}
                canStop={canStopRun}
                canReplay={canReplayRun}
                busy={runEffect}
                message={toolbarMessage}
              />
              <CanvasLegend />
              <CanvasZoom />
            </>
          )}
        </div>
      </main>

      {/* Inspector — width animates to 0 when collapsed via the SiteHeader
          toggle so the canvas flexes back smoothly. */}
      <div
        className="h-full overflow-hidden transition-[width,opacity] duration-200 ease-out"
        style={{
          width: inspectorOpen ? 340 : 0,
          opacity: inspectorOpen ? 1 : 0,
        }}
        aria-hidden={!inspectorOpen}
      >
        {inspectorOpen && (
          <Inspector
            project={selectedProject}
            run={activeRun}
            selectedStep={selectedStep}
            chartSpecs={chartSpecs.filter((spec) => !selectedStep?.id || !spec.stepId || spec.stepId === selectedStep.id)}
            events={events}
            loadingRun={loadingRun}
            loadingEvents={loadingEvents}
            wireSelection={selectedWireNode}
            onUpdateNode={(id, patch) =>
              wireBuilderRef.current?.updateNode(id, patch)
            }
          />
        )}
      </div>
    </div>
  );
}
