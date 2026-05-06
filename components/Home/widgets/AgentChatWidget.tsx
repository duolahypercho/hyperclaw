"use client";

import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Save,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  Check,
  X,
  Timer,
  Database,
  ArrowUpRight,
  Pencil,
  Play,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFocusMode } from "./hooks/useFocusMode";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  useAgentIdentity,
  resolveAvatarUrl,
} from "$/hooks/useAgentIdentity";
import { ClaudeCodeIcon, CodexIcon, HermesIcon, OpenClawIcon } from "$/components/Onboarding/RuntimeIcons";
import {
  InfoTab,
  FileEditorTab,
  type FooterSaveState,
} from "$/components/Tool/Agents/AgentDetailDialog";
import { DeleteAgentDialog } from "$/components/Tool/Agents/DeleteAgentDialog";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import {
  CLEAR_AGENT_CHAT_EVENT,
  RELOAD_AGENT_CHAT_EVENT,
  AGENT_CHAT_ACTIVE_EVENT,
  PanelChatView,
  type PanelChatViewHandle,
} from "./AgentChatPanel";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import { OPEN_AGENT_CHAT_EVENT, AGENT_READ_EVENT, consumePendingOpenAgent } from "./StatusWidget";
import { OPEN_AGENT_PANEL_EVENT } from "./AgentChatPanel";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";
import AgentOverviewTab from "./AgentOverviewTab";
import { AgentSkillsTab } from "./AgentSkillsTab";
import { AgentMcpsTab } from "./AgentMcpsTab";
// Crons imports - using direct bridge fetch instead of global provider
import { CronsProvider } from "$/components/Tool/Crons/provider/cronsProvider";
import { AddCronDialog } from "$/components/Tool/Crons/AddCronDialog";
import { EditCronDialog } from "$/components/Tool/Crons/EditCronDialog";
import {
  cronEdit,
  cronRun,
  fetchAllCronRunsForJob,
  fetchCronsFromBridge,
  fetchCronRunDetail,
  fetchCronRunsFromBridge,
  formatDurationMs,
  formatScheduleExpr,
  getJobPalette,
} from "$/components/Tool/Crons/utils";
import { formatDistanceToNow } from "date-fns";
import type { CronRunRecord, OpenClawCronJobJson } from "$/types/electron";
import { getRunningJobIds, subscribeToRunningCrons } from "$/lib/crons-running-store";
import { ProjectsProvider, useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { ProjectPanel } from "./ProjectPanel";
import { OPEN_PROJECT_PANEL_EVENT } from "./ProjectWidgetEvents";
import { StatusDot, normalizeAgentState, useAgentStatus } from "$/components/ensemble";
import type { RightContentLayoutType } from "@OS/Layout/RightContentLayout";
import {
  MEMORY_SEARCH_CONFIG_KEYS,
  MEMORY_SEARCH_PROVIDERS,
  resolveMemorySearchSettings,
  unwrapOpenClawConfigValue,
} from "./openclaw-memory-search";

/* ── Helpers ──────────────────────────────────────────────── */

/** Dispatched by AgentChatWidgetContent when the active cron job / scoped sessions change.
 *  detail: { cronJobId: string | null, sessions: SessionItem[], loading: boolean }
 */
export const CRON_CHAT_ACTIVE_EVENT = "agentchat:cron-active";

/** Tell the widget to load a specific session in the chat pane (used by the header dropdown). */
export const LOAD_CRON_SESSION_EVENT = "agentchat:load-cron-session";

/** Tell the widget to start a fresh chat for the active cron job. */
export const NEW_CRON_CHAT_EVENT = "agentchat:new-cron-chat";

/** Tell the widget to refresh the cron session list used by the site header. */
export const REFRESH_CRON_CHAT_SESSIONS_EVENT = "agentchat:refresh-cron-sessions";

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

/** Pull the last assistant text out of a messages array */
function extractLastAssistantText(messages: Array<{ role?: string; content?: unknown }>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) return content.trim().slice(0, 200);
    if (Array.isArray(content)) {
      const block = content.find((b: unknown) => (b as { type?: string })?.type === "text") as { text?: string } | undefined;
      if (block?.text?.trim()) return block.text.trim().slice(0, 200);
    }
  }
  return undefined;
}

type BridgeHistoryResult = {
  messages?: Array<{ role?: string; content?: unknown }>;
};

function AgentWidgetSectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-medium">
        {children}
      </p>
      {action}
    </div>
  );
}

type Session = { key: string; label?: string; updatedAt?: number; status?: string; trigger?: string; preview?: string };

/* ── Tab definitions ──────────────────────────────────────── */

const TAB_FILES = [
  { key: "SOUL",      label: "Soul",      desc: "Personality & behavior" },
  { key: "IDENTITY",  label: "Identity",  desc: "Agent identity — name, emoji, avatar" },
  { key: "USER",      label: "User",      desc: "Context about the human" },
  { key: "AGENTS",    label: "Agents",    desc: "Team awareness" },
  { key: "TOOLS",     label: "Tools",     desc: "Agent tool context and built-in Hyperclaw actions" },
  { key: "HEARTBEAT", label: "Heartbeat", desc: "Periodic tasks & work schedule" },
  { key: "MEMORY",    label: "Memory",    desc: "Persistent memory" },
] as const;

type FileTabKey = (typeof TAB_FILES)[number]["key"];
type WidgetTab = "CHAT" | "OVERVIEW" | "INFO" | "FILES" | "CRONS" | "SKILLS" | "MCPS";
type WidgetMode = "agent" | "project";

const BACKEND_TABS = new Set<BackendTab>(["openclaw", "claude-code", "codex", "hermes"]);

function parseBackendTab(value: unknown): BackendTab | undefined {
  return typeof value === "string" && BACKEND_TABS.has(value as BackendTab)
    ? (value as BackendTab)
    : undefined;
}

/* ── Agent Crons Tab ──────────────────────────────────────── */

type AgentCronsTabVariant = "compact" | "profile";

export type AgentCronsHeaderState = {
  visible: boolean;
  refreshing: boolean;
  onRefresh?: () => void;
  onAddRun?: () => void;
};

function getCronPayload(job: OpenClawCronJobJson | null): Record<string, unknown> {
  const payload = job?.payload;
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

function getCronPrompt(job: OpenClawCronJobJson | null): string {
  const payload = getCronPayload(job);
  for (const key of ["message", "text", "systemEvent"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getCronPayloadString(job: OpenClawCronJobJson | null, key: string): string {
  const value = getCronPayload(job)[key];
  return typeof value === "string" ? value : "";
}

function getCronRunKey(run: CronRunRecord): string {
  return `${run.runAtMs}-${run.sessionId ?? run.runAtMs}`;
}

function createCronSessionKey(agentId: string, cronJobId: string): string {
  return `agent:${agentId}:cron:${cronJobId}`;
}

function stripRuntimePrefix(sessionKey: string): string {
  return sessionKey.replace(/^(claude|codex|hermes):/i, "");
}

function sessionHasCronJobId(sessionKey: string, cronJobId: string): boolean {
  if (!cronJobId) return false;
  const normalized = stripRuntimePrefix(sessionKey);
  const marker = `:cron:${cronJobId}`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return false;
  const nextChar = normalized[markerIndex + marker.length];
  return nextChar === undefined || nextChar === ":";
}

function parseCronJobIdFromSessionKey(sessionKey: string): string | null {
  const parts = stripRuntimePrefix(sessionKey).split(":");
  if (parts.length < 4 || parts[0] !== "agent" || parts[2] !== "cron") return null;
  return parts[3]?.trim() || null;
}

function collectCronSessionCandidates(
  job: OpenClawCronJobJson | null,
  runs: CronRunRecord[],
  options?: { agentId?: string; cronJobId?: string | null }
): Set<string> {
  const candidates = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    candidates.add(stripRuntimePrefix(trimmed));
  };

  if (options?.agentId && options?.cronJobId) {
    add(createCronSessionKey(options.agentId, options.cronJobId));
  }
  add((job as { sessionKey?: unknown } | null)?.sessionKey);
  add(getCronPayload(job).sessionKey);
  runs.forEach((run) => add(run.sessionId));
  return candidates;
}

function sessionMatchesCronCandidates(
  sessionKey: string,
  candidates: Set<string>,
  options?: { cronJobId?: string | null }
): boolean {
  if (candidates.size === 0) return false;
  if (options?.cronJobId && !sessionHasCronJobId(sessionKey, options.cronJobId)) {
    return false;
  }
  const normalized = stripRuntimePrefix(sessionKey);
  if (candidates.has(sessionKey) || candidates.has(normalized)) return true;
  for (const candidate of candidates) {
    if (candidate && (sessionKey.endsWith(candidate) || normalized.endsWith(candidate))) {
      return true;
    }
  }
  return false;
}

function isCronSuccessStatus(status?: string): boolean {
  return status === "ok" || status === "success" || status === "completed" || status === "done";
}

function isCronErrorStatus(status?: string): boolean {
  return status === "error" || status === "failed" || status === "aborted";
}

function formatCronDetailValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getCronRunMessage(
  run?: Pick<CronRunRecord, "status" | "summary" | "error"> | null,
  detail?: Record<string, unknown> | null,
): string | undefined {
  const candidates = isCronErrorStatus(run?.status)
    ? [run?.error, run?.summary, detail?.error, detail?.summary]
    : [run?.summary, run?.error, detail?.summary, detail?.error];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value != null) return formatCronDetailValue(value);
  }
  return undefined;
}

function CronMarkdownBlock({
  value,
  tone = "default",
  className,
}: {
  value: unknown;
  tone?: "default" | "error";
  className?: string;
}) {
  const text = formatCronDetailValue(value).trim();
  if (!text) return null;
  return (
    <div
      className={cn(
        "prose prose-invert max-w-none text-[11px] leading-5",
        "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:font-semibold",
        "prose-code:rounded prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-code:before:content-none prose-code:after:content-none",
        tone === "error" ? "text-destructive/85 prose-strong:text-destructive/90" : "text-foreground/80 prose-strong:text-foreground",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

type AgentRunProfileDetailProps = {
  agentId: string;
  selectedJob: OpenClawCronJobJson;
  detailMode: "view" | "edit";
  setDetailMode: React.Dispatch<React.SetStateAction<"view" | "edit">>;
  onClose: () => void;
  selectedStatus: string;
  selectedLastRunMs?: number;
  selectedIsRunning: boolean;
  selectedSchedule: string;
  selectedNextRunMs?: number;
  selectedPrompt: string;
  selectedRun?: CronRunRecord;
  selectedRuns: CronRunRecord[];
  selectedRunsLoading: boolean;
  selectedRunKey: string | null;
  onSelectedRunKeyChange: (runKey: string) => void;
  selectedRunDetail: Record<string, unknown> | null;
  selectedRunDetailLoading: boolean;
  selectedRunText?: unknown;
  runNowError: string | null;
  deletingId: string | null;
  inlineEditError: string | null;
  inlineEditSaving: boolean;
  editName: string;
  editPrompt: string;
  editModel: string;
  editAgent: string;
  setEditName: React.Dispatch<React.SetStateAction<string>>;
  setEditPrompt: React.Dispatch<React.SetStateAction<string>>;
  setEditModel: React.Dispatch<React.SetStateAction<string>>;
  setEditAgent: React.Dispatch<React.SetStateAction<string>>;
  handleRunNow: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  handleInlineEditSubmit: (event: React.FormEvent) => Promise<void>;
};

function AgentRunProfileDetail({
  agentId,
  selectedJob,
  detailMode,
  setDetailMode,
  onClose,
  selectedStatus,
  selectedLastRunMs,
  selectedIsRunning,
  selectedSchedule,
  selectedNextRunMs,
  selectedPrompt,
  selectedRun,
  selectedRuns,
  selectedRunsLoading,
  selectedRunKey,
  onSelectedRunKeyChange,
  selectedRunDetail,
  selectedRunDetailLoading,
  selectedRunText,
  runNowError,
  deletingId,
  inlineEditError,
  inlineEditSaving,
  editName,
  editPrompt,
  editModel,
  editAgent,
  setEditName,
  setEditPrompt,
  setEditModel,
  setEditAgent,
  handleRunNow,
  deleteJob,
  handleInlineEditSubmit,
}: AgentRunProfileDetailProps) {
  const detailTabId = "agent-run-detail-tab-detail";
  const editTabId = "agent-run-detail-tab-edit";
  const detailPanelId = "agent-run-detail-panel-detail";
  const editPanelId = "agent-run-detail-panel-edit";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ens-inspector-head shrink-0">
        <div className="flex items-center justify-between gap-3">
          <span className="ens-inspector-kicker">
            {detailMode === "edit" ? "Edit run" : "Run detail"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label="Close run detail"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0">
          <h2 className="ens-inspector-title">{selectedJob.name}</h2>
          <p className="ens-inspector-desc">
            {selectedStatus === "running"
              ? "Running now"
              : selectedLastRunMs
                ? `Last run ${formatDistanceToNow(new Date(selectedLastRunMs), { addSuffix: true })}`
                : "No completed run yet"}
          </p>
        </div>
        <div className="ens-inspector-tabs" role="tablist" aria-label="Run detail mode">
          <button
            type="button"
            id={detailTabId}
            role="tab"
            aria-selected={detailMode === "view"}
            aria-controls={detailPanelId}
            onClick={() => setDetailMode("view")}
            className={cn("ens-inspector-tab", detailMode === "view" && "active")}
          >
            Detail
          </button>
          <button
            type="button"
            id={editTabId}
            role="tab"
            aria-selected={detailMode === "edit"}
            aria-controls={editPanelId}
            onClick={() => setDetailMode("edit")}
            className={cn("ens-inspector-tab", detailMode === "edit" && "active")}
          >
            Edit
          </button>
        </div>
      </div>

      {detailMode === "view" ? (
        <>
          <div
            id={detailPanelId}
            role="tabpanel"
            aria-labelledby={detailTabId}
            className="ens-inspector-body min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4"
          >
          <section>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              Schedule
            </p>
            <div className="space-y-2 rounded-lg border border-border border-solid bg-background px-3 py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                  selectedIsRunning && "bg-amber-400/15 text-amber-600 dark:text-amber-300",
                  !selectedIsRunning && isCronSuccessStatus(selectedStatus) && "bg-emerald-500/10 text-emerald-500",
                  !selectedIsRunning && isCronErrorStatus(selectedStatus) && "bg-destructive/10 text-destructive",
                  !selectedIsRunning && !isCronSuccessStatus(selectedStatus) && !isCronErrorStatus(selectedStatus) && "bg-muted/50 text-muted-foreground",
                )}>
                  {selectedStatus}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Expression</span>
                <span className="truncate font-mono text-foreground" title={selectedSchedule}>{selectedSchedule}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Next</span>
                <span className="truncate text-foreground">
                  {selectedNextRunMs ? new Date(selectedNextRunMs).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Agent</span>
                <span className="truncate font-mono text-foreground">{selectedJob.agentId ?? agentId}</span>
              </div>
              <p className="break-all border-t border-border/50 pt-2 font-mono text-[10px] text-muted-foreground">
                {selectedJob.id}
              </p>
            </div>
          </section>

          {selectedPrompt && (
            <section>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                Prompt
              </p>
              <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border border-solid bg-background px-3 py-3 text-xs leading-5 text-foreground/80">
                {selectedPrompt}
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                Run history
              </p>
              {selectedRuns.length > 0 && (
                <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {selectedRuns.length}
                </span>
              )}
            </div>
            {selectedRunsLoading ? (
              <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-lg border border-border/70 animate-pulse" />
                ))}
              </div>
            ) : !selectedRun ? (
              <div className="rounded-lg border border-border/70 px-3 py-3 text-xs text-muted-foreground">
                No run history yet.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1 customScrollbar2">
                  {selectedRuns.slice(0, 12).map((run) => {
                    const runKey = getCronRunKey(run);
                    const active = selectedRunKey === runKey;
                    const durationText = run.durationMs != null
                      ? formatDurationMs(run.durationMs)
                      : "Duration unavailable";
                    return (
                      <button
                        key={runKey}
                        type="button"
                        onClick={() => onSelectedRunKeyChange(runKey)}
                        className={cn(
                          "grid w-full grid-cols-[1fr_auto] gap-2 rounded-lg border border-solid px-3 py-2 text-left text-xs transition-colors",
                          active ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/10",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-foreground/80">
                            {new Date(run.runAtMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/60">
                            {durationText}
                          </span>
                        </span>
                        <span className={cn(
                          "self-start rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase",
                          isCronSuccessStatus(run.status) && "bg-emerald-500/10 text-emerald-500",
                          isCronErrorStatus(run.status) && "bg-destructive/10 text-destructive",
                          !isCronSuccessStatus(run.status) && !isCronErrorStatus(run.status) && "bg-muted/50 text-muted-foreground",
                        )}>
                          {run.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-border border-solid bg-background px-3 py-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {new Date(selectedRun.runAtMs).toLocaleString()}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {selectedRun.durationMs != null ? formatDurationMs(selectedRun.durationMs) : "Duration unavailable"}
                      </p>
                    </div>
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase",
                      isCronSuccessStatus(selectedRun.status) && "bg-emerald-500/10 text-emerald-500",
                      isCronErrorStatus(selectedRun.status) && "bg-destructive/10 text-destructive",
                      !isCronSuccessStatus(selectedRun.status) && !isCronErrorStatus(selectedRun.status) && "bg-muted/50 text-muted-foreground",
                    )}>
                      {selectedRun.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedRunDetailLoading ? (
                      <p className="text-muted-foreground">Loading…</p>
                    ) : selectedRunText ? (
                      <CronMarkdownBlock
                        value={selectedRunText}
                        tone={isCronErrorStatus(selectedRun.status) ? "error" : "default"}
                        className="max-h-56 overflow-y-auto pr-1 customScrollbar2"
                      />
                    ) : (
                      <p className="text-muted-foreground">No summary captured.</p>
                    )}
                    {selectedRunDetail?.log != null && String(selectedRunDetail.log).trim() !== "" && (
                      <div>
                        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                          Log
                        </p>
                        <CronMarkdownBlock
                          value={selectedRunDetail.log}
                          className="max-h-40 overflow-y-auto pr-1 customScrollbar2 text-foreground/75"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          </div>
          <div className="shrink-0 border-t border-border/70 bg-card/95 px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
            <Button
              variant={selectedIsRunning ? "outline" : "default"}
              size="sm"
              className="h-8 gap-1"
              disabled={selectedIsRunning}
              onClick={() => void handleRunNow(selectedJob.id)}
            >
              {selectedIsRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setDetailMode("edit")}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1"
              disabled={deletingId === selectedJob.id}
              onClick={() => void deleteJob(selectedJob.id)}
            >
              {deletingId === selectedJob.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
            {runNowError && (
              <p className="col-span-3 text-xs text-destructive">{runNowError}</p>
            )}
            </div>
          </div>
        </>
      ) : (
        <form
          id={editPanelId}
          role="tabpanel"
          aria-labelledby={editTabId}
          onSubmit={handleInlineEditSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="ens-inspector-body min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {inlineEditError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {inlineEditError}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="profile-run-title" className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
                Title
              </Label>
              <Input
                id="profile-run-title"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Run title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-run-model" className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
                Model
              </Label>
              <Input
                id="profile-run-model"
                value={editModel}
                onChange={(event) => setEditModel(event.target.value)}
                placeholder="Leave blank to keep default"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-run-agent" className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
                Agent
              </Label>
              <Input
                id="profile-run-agent"
                value={editAgent}
                onChange={(event) => setEditAgent(event.target.value)}
                placeholder={agentId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-run-prompt" className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
                Prompt
              </Label>
              <Textarea
                id="profile-run-prompt"
                value={editPrompt}
                onChange={(event) => setEditPrompt(event.target.value)}
                placeholder="Prompt sent when this run fires"
                rows={7}
                className="resize-y"
              />
            </div>
          </div>
          <div className="shrink-0 border-t border-border/70 bg-card/95 px-4 py-3">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setDetailMode("view")}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={inlineEditSaving}>
                {inlineEditSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                {inlineEditSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function AgentRunProfileEmptyDetail() {
  return (
    <>
      <div className="ens-inspector-head">
        <div className="flex items-center justify-between gap-3">
          <span className="ens-inspector-kicker">Run detail</span>
        </div>
        <div className="min-w-0">
          <h2 className="ens-inspector-title">Select a run</h2>
          <p className="ens-inspector-desc">
            Click a scheduled run on the left to inspect history, prompt, schedule, and edit fields.
          </p>
        </div>
      </div>
      <div className="ens-inspector-body flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-5 text-sm text-muted-foreground">
          Run details will appear here.
        </div>
      </div>
    </>
  );
}

/**
 * Fetches and displays cron jobs for a specific agent.
 * Fetches directly from the bridge with agentId filter instead of using the global CronsProvider.
 * This ensures we only load crons for this agent.
 */
export function AgentCronsTab({
  agentId,
  runtime,
  variant = "compact",
  panelId,
  panelLabelledBy,
  onProfileDetailChange,
  selectedJobId: controlledSelectedJobId,
  onSelectedJobChange,
  onSelectedJobRunsChange,
  onSelectedJobRunsLoadingChange,
  onProfileHeaderStateChange,
  renderProfileList = true,
}: {
  agentId: string;
  runtime?: string;
  variant?: AgentCronsTabVariant;
  panelId?: string;
  panelLabelledBy?: string;
  onProfileDetailChange?: (detail: RightContentLayoutType | undefined) => void;
  selectedJobId?: string | null;
  onSelectedJobChange?: (job: OpenClawCronJobJson | null) => void;
  onSelectedJobRunsChange?: (runs: CronRunRecord[]) => void;
  onSelectedJobRunsLoadingChange?: (loading: boolean) => void;
  onProfileHeaderStateChange?: (state: AgentCronsHeaderState) => void;
  renderProfileList?: boolean;
}) {
  const [jobs, setJobs] = useState<OpenClawCronJobJson[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<OpenClawCronJobJson | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningJobIds, setRunningJobIds] = useState<string[]>([]);
  const [runsByJobId, setRunsByJobId] = useState<Record<string, CronRunRecord[]>>({});
  const [selectedRuns, setSelectedRuns] = useState<CronRunRecord[]>([]);
  const [selectedRunsLoading, setSelectedRunsLoading] = useState(false);
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<Record<string, unknown> | null>(null);
  const [selectedRunDetailLoading, setSelectedRunDetailLoading] = useState(false);
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view");
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editAgent, setEditAgent] = useState("");
  const [inlineEditSaving, setInlineEditSaving] = useState(false);
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
  const [runNowError, setRunNowError] = useState<string | null>(null);
  const isProfileVariant = variant === "profile";

  const selectJob = useCallback((job: OpenClawCronJobJson | null) => {
    setSelectedJob(job);
    onSelectedJobChange?.(job);
  }, [onSelectedJobChange]);

  const openAddRun = useCallback(() => {
    setAddOpen(true);
  }, []);

  // Fetch crons filtered by agentId
  const fetchAgentCrons = useCallback(async () => {
    setLoading(true);
    try {
      const { fetchCronsFromBridge } = await import("$/components/Tool/Crons/utils");
      const data = await fetchCronsFromBridge({ agentId, runtime });
      setJobs(data);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, runtime]);

  useEffect(() => {
    fetchAgentCrons();
  }, [fetchAgentCrons]);

  useEffect(() => {
    if (!isProfileVariant || !onProfileHeaderStateChange) return;
    onProfileHeaderStateChange({
      visible: true,
      refreshing: loading,
      onRefresh: fetchAgentCrons,
      onAddRun: openAddRun,
    });
    return () => {
      onProfileHeaderStateChange({ visible: false, refreshing: false });
    };
  }, [fetchAgentCrons, isProfileVariant, loading, onProfileHeaderStateChange, openAddRun]);

  useEffect(() => {
    setRunningJobIds(getRunningJobIds());
    return subscribeToRunningCrons(setRunningJobIds);
  }, []);

  // Sort jobs: running first, then by last run time
  const sortedJobs = useMemo(() => {
    const running: OpenClawCronJobJson[] = [];
    const rest: OpenClawCronJobJson[] = [];
    for (const j of jobs) {
      if (runningJobIds.includes(j.id)) running.push(j);
      else rest.push(j);
    }
    rest.sort((a, b) => (b.state?.lastRunAtMs ?? 0) - (a.state?.lastRunAtMs ?? 0));
    return [...running, ...rest];
  }, [jobs, runningJobIds]);

  const selectedJobId = selectedJob?.id ?? null;
  const jobIdsKey = useMemo(
    () => sortedJobs.map((job) => job.id).filter(Boolean).join(","),
    [sortedJobs],
  );

  useEffect(() => {
    if (!isProfileVariant) return;
    const ids = jobIdsKey ? jobIdsKey.split(",") : [];
    if (ids.length === 0) {
      setRunsByJobId({});
      return;
    }
    let cancelled = false;
    fetchCronRunsFromBridge(ids)
      .then((runs) => {
        if (!cancelled) setRunsByJobId(runs);
      })
      .catch(() => {
        if (!cancelled) setRunsByJobId({});
      });
    return () => {
      cancelled = true;
    };
  }, [isProfileVariant, jobIdsKey]);

  useEffect(() => {
    if (!selectedJobId) return;
    const updated = jobs.find((job) => job.id === selectedJobId);
    if (updated && updated !== selectedJob) {
      setSelectedJob(updated);
      onSelectedJobChange?.(updated);
    }
  }, [jobs, onSelectedJobChange, selectedJob, selectedJobId]);

  useEffect(() => {
    if (!controlledSelectedJobId) return;
    const job = jobs.find((item) => item.id === controlledSelectedJobId);
    if (job && selectedJob?.id !== job.id) {
      setSelectedJob(job);
      onSelectedJobChange?.(job);
    }
  }, [controlledSelectedJobId, jobs, onSelectedJobChange, selectedJob?.id]);

  useEffect(() => {
    setDetailMode("view");
    setInlineEditError(null);
    setRunNowError(null);
  }, [selectedJobId]);

  useEffect(() => {
    if (!isProfileVariant || !selectedJob?.id) {
      setSelectedRuns([]);
      setSelectedRunKey(null);
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedRunsLoading(true);
    setSelectedRunDetail(null);
    fetchAllCronRunsForJob(selectedJob.id)
      .then((runs) => {
        if (cancelled) return;
        setSelectedRuns(runs);
        const firstRun = runs[0];
        setSelectedRunKey(firstRun ? getCronRunKey(firstRun) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedRuns([]);
          setSelectedRunKey(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedRunsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isProfileVariant, selectedJob?.id]);

  const selectedRun = useMemo(
    () => selectedRuns.find((run) => getCronRunKey(run) === selectedRunKey) ?? null,
    [selectedRunKey, selectedRuns],
  );
  const selectedRunAtMs = selectedRun?.runAtMs;

  useEffect(() => {
    onSelectedJobRunsChange?.(selectedRuns);
  }, [onSelectedJobRunsChange, selectedRuns]);

  useEffect(() => {
    onSelectedJobRunsLoadingChange?.(selectedRunsLoading);
  }, [onSelectedJobRunsLoadingChange, selectedRunsLoading]);

  useEffect(() => {
    if (!isProfileVariant || !selectedJob?.id || !selectedRunKey || selectedRunAtMs == null) {
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedRunDetailLoading(true);
    fetchCronRunDetail(selectedJob.id, selectedRunAtMs, selectedRun?.sessionId)
      .then((detail) => {
        if (cancelled) return;
        const detailKey = detail?.runAtMs != null
          ? getCronRunKey(detail as CronRunRecord)
          : null;
        setSelectedRunDetail(detailKey === selectedRunKey ? detail : null);
      })
      .catch(() => {
        if (!cancelled) setSelectedRunDetail(null);
      })
      .finally(() => {
        if (!cancelled) setSelectedRunDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isProfileVariant, selectedJob?.id, selectedRun?.sessionId, selectedRunAtMs, selectedRunKey]);

  useEffect(() => {
    if (!selectedJob || detailMode !== "edit") return;
    setEditName(selectedJob.name ?? "");
    setEditPrompt(getCronPrompt(selectedJob));
    setEditModel(getCronPayloadString(selectedJob, "model"));
    setEditAgent(selectedJob.agentId ?? "");
    setInlineEditError(null);
  }, [detailMode, selectedJob]);

  const deleteJob = useCallback(async (jobId: string) => {
    setDeletingId(jobId);
    try {
      const { cronDelete } = await import("$/components/Tool/Crons/utils");
      const result = await cronDelete(jobId);
      if (result.success) {
        const deletedSelectedJob = selectedJobId === jobId;
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        setRunsByJobId((prev) => {
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
        setSelectedJob((prev) => {
          if (prev?.id !== jobId) return prev;
          return null;
        });
        if (deletedSelectedJob) onSelectedJobChange?.(null);
      }
    } catch {
      // Keep the row visible if the connector rejects the delete request.
    } finally {
      setDeletingId(null);
    }
  }, [onSelectedJobChange, selectedJobId]);

  const handleDelete = useCallback((e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    void deleteJob(jobId);
  }, [deleteJob]);

  const handleAddSuccess = useCallback(() => {
    setAddOpen(false);
    fetchAgentCrons();
  }, [fetchAgentCrons]);

  const handleEditClose = useCallback((open: boolean) => {
    setEditOpen(open);
    if (!open) {
      selectJob(null);
      fetchAgentCrons(); // Refresh after edit
    }
  }, [fetchAgentCrons, selectJob]);

  const handleRunNow = useCallback(async (jobId: string) => {
    setRunNowError(null);
    try {
      const result = await cronRun(jobId);
      if (!result.success) {
        setRunNowError(result.error ?? "Run request failed");
      }
      await fetchAgentCrons();
    } catch (error) {
      setRunNowError(error instanceof Error ? error.message : "Run request failed");
    }
  }, [fetchAgentCrons]);

  const handleInlineEditSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedJob?.id) return;
    setInlineEditError(null);
    const nextName = editName.trim();
    const nextPrompt = editPrompt.trim();
    const nextModel = editModel.trim();
    const nextAgent = editAgent.trim();
    const currentName = (selectedJob.name ?? "").trim();
    const currentPrompt = getCronPrompt(selectedJob).trim();
    const currentModel = getCronPayloadString(selectedJob, "model").trim();
    const currentAgent = (selectedJob.agentId ?? "").trim();
    const params = {
      ...(nextName && nextName !== currentName && { name: nextName }),
      ...(nextPrompt && nextPrompt !== currentPrompt && { message: nextPrompt }),
      ...(nextModel && nextModel !== currentModel && { model: nextModel }),
      ...(nextAgent !== currentAgent
        ? nextAgent
          ? { agent: nextAgent }
          : { clearAgent: true }
        : {}),
    };
    if (Object.keys(params).length === 0) {
      setInlineEditError("Change at least one field.");
      return;
    }
    setInlineEditSaving(true);
    try {
      const result = await cronEdit(selectedJob.id, params);
      if (!result.success) {
        setInlineEditError(result.error ?? "Could not save run.");
        return;
      }
      await fetchAgentCrons();
      setDetailMode("view");
    } catch (error) {
      setInlineEditError(error instanceof Error ? error.message : "Could not save run.");
    } finally {
      setInlineEditSaving(false);
    }
  }, [editAgent, editModel, editName, editPrompt, fetchAgentCrons, selectedJob]);

  const selectedStatus = selectedJob
    ? runningJobIds.includes(selectedJob.id)
      ? "running"
      : (selectedJob.state?.lastStatus ?? "idle")
    : "idle";
  const selectedIsRunning = selectedJob ? runningJobIds.includes(selectedJob.id) : false;
  const selectedLastRunMs = selectedJob?.state?.lastRunAtMs;
  const selectedNextRunMs = selectedJob?.state?.nextRunAtMs;
  const selectedSchedule = selectedJob
    ? formatScheduleExpr(selectedJob.schedule?.expr, selectedJob.schedule?.kind)
    : "—";
  const selectedPrompt = getCronPrompt(selectedJob);
  const selectedRunText = getCronRunMessage(selectedRun, selectedRunDetail);

  const profileDetailBody = useMemo(() => {
    if (!isProfileVariant) return null;
    if (!selectedJob) return <AgentRunProfileEmptyDetail />;
    return (
      <AgentRunProfileDetail
        agentId={agentId}
        selectedJob={selectedJob}
        detailMode={detailMode}
        setDetailMode={setDetailMode}
        onClose={() => selectJob(null)}
        selectedStatus={selectedStatus}
        selectedLastRunMs={selectedLastRunMs}
        selectedIsRunning={selectedIsRunning}
        selectedSchedule={selectedSchedule}
        selectedNextRunMs={selectedNextRunMs}
        selectedPrompt={selectedPrompt}
        selectedRun={selectedRun ?? undefined}
        selectedRuns={selectedRuns}
        selectedRunsLoading={selectedRunsLoading}
        selectedRunKey={selectedRunKey}
        onSelectedRunKeyChange={setSelectedRunKey}
        selectedRunDetail={selectedRunDetail}
        selectedRunDetailLoading={selectedRunDetailLoading}
        selectedRunText={selectedRunText}
        runNowError={runNowError}
        deletingId={deletingId}
        inlineEditError={inlineEditError}
        inlineEditSaving={inlineEditSaving}
        editName={editName}
        editPrompt={editPrompt}
        editModel={editModel}
        editAgent={editAgent}
        setEditName={setEditName}
        setEditPrompt={setEditPrompt}
        setEditModel={setEditModel}
        setEditAgent={setEditAgent}
        handleRunNow={handleRunNow}
        deleteJob={deleteJob}
        handleInlineEditSubmit={handleInlineEditSubmit}
      />
    );
  }, [
    agentId,
    deleteJob,
    deletingId,
    detailMode,
    editAgent,
    editModel,
    editName,
    editPrompt,
    handleInlineEditSubmit,
    handleRunNow,
    inlineEditError,
    inlineEditSaving,
    isProfileVariant,
    runNowError,
    selectedIsRunning,
    selectJob,
    selectedJob,
    selectedLastRunMs,
    selectedNextRunMs,
    selectedPrompt,
    selectedRun,
    selectedRunKey,
    selectedRuns,
    selectedRunsLoading,
    selectedRunDetail,
    selectedRunDetailLoading,
    selectedRunText,
    selectedSchedule,
    selectedStatus,
  ]);

  const profileDetailConfig = useMemo<RightContentLayoutType | undefined>(() => {
    if (!isProfileVariant || !profileDetailBody) return undefined;
    if (!selectedJob && controlledSelectedJobId && loading) return undefined;
    return {
      animation: "Right",
      animationKey: selectedJob ? `agent-runs-detail-${selectedJob.id}` : "agent-runs-detail-empty",
      body: profileDetailBody,
      className: "ens-inspector",
      width: "420px",
    };
  }, [controlledSelectedJobId, isProfileVariant, loading, profileDetailBody, selectedJob]);

  useEffect(() => {
    if (!onProfileDetailChange) return;
    onProfileDetailChange(isProfileVariant ? profileDetailConfig : undefined);
  }, [isProfileVariant, onProfileDetailChange, profileDetailConfig]);

  useEffect(() => {
    return () => onProfileDetailChange?.(undefined);
  }, [onProfileDetailChange]);

  if (isProfileVariant) {
    return (
      <CronsProvider>
        <>
          {renderProfileList && (
            <section
              id={panelId}
              role={panelId ? "tabpanel" : undefined}
              aria-labelledby={panelLabelledBy}
              aria-label={panelLabelledBy ? undefined : "Runs"}
              className="min-h-[640px] min-w-0 overflow-y-auto customScrollbar2"
            >
              {loading && sortedJobs.length === 0 ? (
                <div className="space-y-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-[54px] rounded-md border border-solid border-border animate-pulse" />
                  ))}
                </div>
              ) : sortedJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/70 py-8 text-muted-foreground/55">
                  <Timer className="h-6 w-6 opacity-40" />
                  <p className="text-sm">No runs yet</p>
                  <p className="text-[11px]">Use Add run in the header to schedule the first one.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {sortedJobs.map((job, i) => {
                    const nextRunMs = job.state?.nextRunAtMs;
                    const nextRunStr = nextRunMs ? formatDistanceToNow(new Date(nextRunMs), { addSuffix: true }) : "—";
                    const lastRunMs = job.state?.lastRunAtMs;
                    const lastRunStr = lastRunMs ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true }) : "—";
                    const isRunning = runningJobIds.includes(job.id);
                    const isDeleting = deletingId === job.id;
                    const status = isRunning ? "running" : (job.state?.lastStatus ?? "idle");
                    const isDisabled = job.enabled === false;
                    const isSuccess = isCronSuccessStatus(status);
                    const isError = isCronErrorStatus(status);
                    const isSelected = selectedJob?.id === job.id;
                    const statusLabel = isRunning ? "running" : isDisabled ? "off" : isError ? "error" : isSuccess ? "success" : null;

                    return (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.015 }}
                        className={cn(
                          "group relative rounded-md border border-solid transition-colors",
                          isRunning
                            ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                            : isError
                              ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                              : "border-border hover:bg-muted/10",
                          isSelected && "border-primary/50 bg-primary/5 hover:bg-primary/10",
                          isDisabled && "opacity-60",
                          isDeleting && "pointer-events-none opacity-40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectJob(job)}
                          className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 pr-8 text-left text-[11px] focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                        >
                          <div className="mt-0.5 shrink-0">
                            {isRunning ? (
                              <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                            ) : isSuccess ? (
                              <Check className="h-3 w-3 text-emerald-500/60" />
                            ) : isError ? (
                              <X className="h-3 w-3 text-destructive/70" />
                            ) : (
                              <Timer className="h-3 w-3 text-muted-foreground/30" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                              <span className={cn(
                                "min-w-0 flex-1 truncate text-foreground/80",
                                isRunning && "font-semibold text-emerald-600 dark:text-emerald-400",
                                isDisabled && "text-muted-foreground/45",
                              )}>
                                {job.name || job.id}
                              </span>
                              {statusLabel && (
                                <span className={cn(
                                  "shrink-0 rounded-full px-1 py-0.5 text-[8px] font-medium",
                                  isRunning && "bg-emerald-500/10 text-emerald-500",
                                  !isRunning && !isDisabled && isError && "bg-destructive/10 text-destructive",
                                  !isRunning && !isDisabled && isSuccess && "bg-emerald-500/10 text-emerald-500",
                                  isDisabled && "bg-muted/40 text-muted-foreground/55",
                                )}>
                                  {statusLabel}
                                </span>
                              )}
                            </div>
                            <p className={cn(
                              "mt-0.5 truncate text-[10px]",
                              isRunning ? "text-emerald-600/75 dark:text-emerald-300/70" : "text-muted-foreground/50",
                            )}>
                              {isRunning ? "Running now" : `Next ${nextRunStr} · Last ${lastRunStr}`}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, job.id)}
                          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                          title="Delete"
                          aria-label={`Delete ${job.name}`}
                        >
                          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          <AddCronDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            defaultAgent={agentId}
            defaultRuntime={runtime}
            onSuccess={handleAddSuccess}
          />
        </>
      </CronsProvider>
    );
  }

  if (loading && jobs.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3">
        <AgentWidgetSectionLabel
          action={
            <span className="text-[9px] text-muted-foreground/40">
              Loading
            </span>
          }
        >
          Runs
        </AgentWidgetSectionLabel>
        <div className="space-y-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[50px] rounded-md border border-solid border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <CronsProvider>
      <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3">
        <AgentWidgetSectionLabel
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchAgentCrons}
                className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-foreground/60 transition-colors"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-foreground/60 transition-colors"
              >
                <Plus className="w-2.5 h-2.5" />
                Add
              </button>
            </div>
          }
        >
          <span className="inline-flex items-center gap-1">
            Runs
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold text-primary">
              {sortedJobs.length}
            </span>
          </span>
        </AgentWidgetSectionLabel>

        {sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-1.5 py-4 text-muted-foreground/50">
            <Timer className="w-5 h-5 opacity-30" />
            <p className="text-[11px]">No runs yet</p>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 mt-1" onClick={() => setAddOpen(true)}>
              <Plus className="w-3 h-3" />
              Add run
            </Button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2">
            <div className="space-y-1">
              {sortedJobs.map((job, i) => {
                const nextRunMs = job.state?.nextRunAtMs;
                const nextRunStr = nextRunMs ? formatDistanceToNow(new Date(nextRunMs), { addSuffix: true }) : "—";
                const lastRunMs = job.state?.lastRunAtMs;
                const lastRunStr = lastRunMs ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true }) : "—";
                const isRunning = runningJobIds.includes(job.id);
                const isDeleting = deletingId === job.id;
                const status = isRunning ? "running" : (job.state?.lastStatus ?? "idle");
                const palette = getJobPalette(job.id);
                const isDisabled = job.enabled === false;
                const isSuccess = status === "ok" || status === "success" || status === "completed" || status === "done";
                const isError = status === "error" || status === "failed" || status === "aborted";
                const statusLabel = isRunning ? "RUNNING" : isDisabled ? "OFF" : isError ? "ERROR" : isSuccess ? "OK" : null;
                return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={cn(
                    "group relative rounded-md border border-solid transition-colors",
                    isRunning
                      ? "border-amber-400/40 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.08)] hover:bg-amber-400/15"
                      : "border-border hover:bg-muted/10",
                    isDisabled && "opacity-60",
                    isDeleting && "opacity-40 pointer-events-none"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => { selectJob(job); setEditOpen(true); }}
                    className="flex items-start gap-2 w-full px-2.5 py-2 pr-8 rounded-md text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                  >
                    <div className="shrink-0 w-3 flex items-center justify-center mt-1">
                      {isRunning ? (
                        <span className="relative flex w-2 h-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full w-2 h-2 bg-amber-600 dark:bg-amber-500" />
                        </span>
                      ) : isError ? (
                        <X className="w-3 h-3 text-destructive/70" />
                      ) : isSuccess ? (
                        <Check className="w-3 h-3 text-emerald-500/70" />
                      ) : (
                        <span className={cn("w-1.5 h-1.5 rounded-full", isDisabled ? "bg-muted-foreground/20" : palette.dot)} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={cn(
                            "flex-1 min-w-0 truncate text-[11px]",
                            isRunning
                              ? "font-semibold text-amber-700 dark:text-amber-300"
                              : isDisabled
                                ? "text-muted-foreground/45"
                                : "text-foreground/70"
                          )}
                          title={job.name}
                        >
                          {job.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {statusLabel && (
                            <span
                              className={cn(
                                "text-[8px] font-semibold px-1 py-0.5 rounded-full",
                                isRunning && "text-amber-800 dark:text-amber-300 bg-amber-400/15 border border-amber-400/25",
                                !isRunning && !isDisabled && isError && "text-destructive bg-destructive/10",
                                !isRunning && !isDisabled && isSuccess && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
                                isDisabled && "text-muted-foreground/55 bg-muted/40"
                              )}
                            >
                              {statusLabel}
                            </span>
                          )}
                          {!isRunning && lastRunMs && (
                            <span className="text-[10px] text-muted-foreground/40">
                              {formatDistanceToNow(new Date(lastRunMs), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          "text-[10px] line-clamp-2 mt-0.5 [overflow-wrap:anywhere]",
                          isRunning ? "text-amber-800/75 dark:text-amber-100/65" : "text-muted-foreground/55"
                        )}
                      >
                        {isRunning ? "In progress..." : `Next ${nextRunStr} · Last ${lastRunStr}`}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, job.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                    title="Delete"
                    aria-label={`Delete ${job.name}`}
                  >
                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AddCronDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultAgent={agentId}
        defaultRuntime={runtime}
        onSuccess={handleAddSuccess}
      />
      <EditCronDialog
        job={selectedJob}
        open={editOpen}
        onOpenChange={handleEditClose}
      />
    </CronsProvider>
  );
}

/* ── Empty state onboarding ────────────────────────────────── */

interface RuntimeCardProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  installed: boolean;
  onAdd: () => void;
}

function RuntimeCard({ id, label, description, icon, installed, onAdd }: RuntimeCardProps) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onAdd}
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border text-left transition-colors w-full",
        "bg-card/50 hover:bg-card/80 border-border/50 hover:border-primary/30"
      )}
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{label}</h4>
          {!installed && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
              Not installed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
      </div>
    </motion.button>
  );
}

interface EmptyAgentsStateProps {
  onAddAgent: (runtime?: string) => void;
}

function EmptyAgentsState({ onAddAgent }: EmptyAgentsStateProps) {
  const [runtimeStatus, setRuntimeStatus] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectorAvailable, setConnectorAvailable] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await bridgeInvoke("list-available-runtimes", {}) as {
          runtimes?: Array<{ name: string; available: boolean }>;
        };
        const status: Record<string, boolean> = {};
        for (const rt of result?.runtimes ?? []) {
          status[rt.name] = rt.available;
        }
        setRuntimeStatus(status);
        setConnectorAvailable(true);
      } catch {
        // Connector not available - don't show install status
        setRuntimeStatus(null);
        setConnectorAvailable(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runtimes = [
    {
      id: "claude-code",
      label: "Claude Code",
      description: "Anthropic's agentic coding assistant. Works in any directory with custom instructions and memory.",
      icon: <ClaudeCodeIcon className="w-5 h-5" />,
    },
    {
      id: "codex",
      label: "Codex",
      description: "OpenAI's coding agent with sandboxed execution. Great for code generation and automation.",
      icon: <CodexIcon className="w-5 h-5" />,
    },
    {
      id: "hermes",
      label: "Hermes",
      description: "Self-improving agent framework with skill management. Learns and adapts over time.",
      icon: <HermesIcon className="w-5 h-5" />,
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      description: "Multi-channel AI gateway for WhatsApp, Slack, Discord, and more. Connect AI to your messaging apps.",
      icon: <OpenClawIcon className="w-5 h-5" />,
    },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center mb-6"
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Plus className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-base font-semibold mb-1">Add your first agent</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Connect an AI runtime to get started. Each agent can have its own personality and tools.
        </p>
      </motion.div>

      <div className="grid gap-3 w-full max-w-md">
        {runtimes.map((rt, i) => (
          <motion.div
            key={rt.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <RuntimeCard
              {...rt}
              installed={runtimeStatus?.[rt.id] ?? true}
              onAdd={() => onAddAgent(rt.id)}
            />
          </motion.div>
        ))}
      </div>

      {!connectorAvailable ? (
        <p className="text-[10px] text-amber-500 mt-6 text-center max-w-xs">
          Connector offline — install status unavailable. You can still add agents manually.
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-6 text-center max-w-xs">
          Don&apos;t have any installed? Run <code className="px-1 py-0.5 rounded bg-muted text-[10px]">npm i -g @anthropics/claude-code</code> to get started with Claude Code.
        </p>
      )}
    </div>
  );
}

/* ── Widget content ────────────────────────────────────────── */

const AgentChatWidgetContent = memo((props: CustomProps) => {
  const { widget, isEditMode, onConfigChange, className } = props;
  const { isFocusModeActive } = useFocusMode();
  const { agents } = useHyperclawContext();
  const { selectProject } = useProjects();
  const router = useRouter();

  // Persisted config
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const configSessionKey = config?.sessionKey as string | undefined;
  const configBackendTab = parseBackendTab(config?.backendTab);
  const configHideTabs = config?.hideTabs === true;
  const configHideNewChat = config?.hideNewChat === true;

  // Local state
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(configAgentId);
  const selectedAgentIdRef = useRef<string | undefined>(configAgentId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [widgetMode, setWidgetMode] = useState<WidgetMode>("agent");
  const [backendTab, setBackendTab] = useState<BackendTab>(configBackendTab ?? "openclaw");
  const [activeTab, setActiveTab] = useState<WidgetTab>("CHAT");
  const [selectedFileKey, setSelectedFileKey] = useState<FileTabKey>("SOUL");
  const [footerState, setFooterState] = useState<FooterSaveState>({
    isDirty: false, saving: false, saved: false, save: null,
  });
  // Personality cache keyed by agentId — fetched once per agent switch so
  // file-key tab changes inside the FILES tab are instant with no bridge round-trip.
  const [personalityCache, setPersonalityCache] = useState<Record<string, string> | null>(null);
  const personalityCacheAgentRef = useRef<string | undefined>(undefined);

  // Lazy-mount tabs: only mount when first visited, stay mounted thereafter.
  // Data survives tab switches; explicit refresh remounts via key change.
  const [mountedTabs, setMountedTabs] = useState<Set<WidgetTab>>(new Set(["CHAT"]));
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean | null>(null);
  const [memoryProvider, setMemoryProvider] = useState<string | null>(null);
  const [memoryToggling, setMemoryToggling] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [addAgentInitialRuntime, setAddAgentInitialRuntime] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Snapshot captured when the dialog opens — prevents deleting the wrong agent
  // if currentAgentId changes while the confirmation dialog is visible.
  const [pendingDeleteAgentId, setPendingDeleteAgentId] = useState<string>("");
  const chatRef = useRef<PanelChatViewHandle>(null);
  // Keyed by "agentId:backendTab" — avoids refetching when re-opening the same agent
  const sessionsCacheRef = useRef<Map<string, Session[]>>(new Map());
  // Primary session key — resolved from the connector for the current agent
  const [primarySessionKey, setPrimarySessionKey] = useState<string | undefined>();
  // Tracks which cron job ID is waiting for its latest session to be auto-opened.
  // Set when a cron row is clicked in configHideTabs mode; cleared after the first
  // matching session is opened so subsequent inboxSessions updates don't re-fire.
  const pendingCronAutoOpenJobIdRef = useRef<string | null>(null);
  const suppressCronAutoOpenJobIdRef = useRef<string | null>(null);

  // Inbox state
  const [chatView, setChatView] = useState<"inbox" | "chat">("chat");
  const [inboxSessions, setInboxSessions] = useState<Session[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLastSeenTs, setInboxLastSeenTs] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | undefined>();
  const [selectedCronJobId, setSelectedCronJobId] = useState<string | null>(null);
  const [selectedCronJob, setSelectedCronJob] = useState<OpenClawCronJobJson | null>(null);
  const [cronScopedRuns, setCronScopedRuns] = useState<CronRunRecord[]>([]);
  const [cronScopedSessionsLoading, setCronScopedSessionsLoading] = useState(false);
  const [cronHeaderSessions, setCronHeaderSessions] = useState<Session[]>([]);
  const [cronHeaderSessionsLoading, setCronHeaderSessionsLoading] = useState(false);
  const cronHeaderFetchTokenRef = useRef(0);
  const pendingNewChatAgentRef = useRef<string | null>(null);
  // Per-session read tracking — only sessions in this set show as read in the inbox
  const [readSessions, setReadSessions] = useState<Set<string>>(new Set());
  const readSessionsRef = useRef<Set<string>>(readSessions);
  useEffect(() => { readSessionsRef.current = readSessions; }, [readSessions]);
  // Cache of last-assistant-message per session key, fetched lazily when inbox opens
  const [inboxPreviews, setInboxPreviews] = useState<Map<string, string>>(new Map());
  const previewFetchedForRef = useRef<Set<string>>(new Set());

  // Sync config on late hydration and when embedded surfaces (like /Tool/Chat)
  // switch the target agent via props instead of the global open-agent event.
  useEffect(() => {
    if (!configAgentId || configAgentId === selectedAgentIdRef.current) return;
    selectedAgentIdRef.current = configAgentId;
    setSelectedAgentId(configAgentId);
    setPrimarySessionKey(configSessionKey);
    setActiveSessionLabel(undefined);
    setInboxSessions([]);
    setInboxLoading(false);
    readSessionsRef.current = new Set();
    setReadSessions(readSessionsRef.current);
    setChatView("chat");
    setSelectedCronJobId(null);
    setSelectedCronJob(null);
    setCronScopedRuns([]);
    setCronScopedSessionsLoading(false);
    setCronHeaderSessions([]);
    setCronHeaderSessionsLoading(false);
  }, [configAgentId, configSessionKey]);
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => {
    if (configBackendTab) setBackendTab(configBackendTab);
  }, [configBackendTab]);

  // Resolve agent — do NOT fall back to agents[0] automatically; require an explicit
  // selection via OPEN_AGENT_CHAT_EVENT / OPEN_AGENT_PANEL_EVENT / user click, or a
  // persisted configAgentId (dashboard widget). When neither is set (e.g. bare
  // /Tool/Chat page load), noAgentSelected is true and a placeholder is shown.
  const noAgentSelected = !selectedAgentId && !configAgentId;
  const currentAgentId = selectedAgentId || configAgentId || "main";
  const currentAgent = agents.find((a) => a.id === currentAgentId) || {
    id: currentAgentId,
    name: currentAgentId === "main" ? "General Assistant" : currentAgentId,
  };

  // Agent identity
  const identity = useAgentIdentity(currentAgentId);
  const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
  // Only use img for custom uploads (PNG/JPG/HTTP); SVG data URIs are the seed defaults.
  const avatarUrl = resolvedAvatarUrl && !resolvedAvatarUrl.startsWith("data:image/svg+xml") ? resolvedAvatarUrl : undefined;
  // agentListRuntime is authoritative for OpenClaw agents — a stale SQLite
  // identity record (e.g. runtime="hermes") must not override it.
  const agentListRuntime = (currentAgent as { runtime?: string }).runtime;
  const effectiveRuntime = agentListRuntime || identity?.runtime;
  const displayName = identity?.name || currentAgent.name;
  const fallbackInitials = (displayName || currentAgentId || "AI").slice(0, 2).toUpperCase();
  const { state: currentAgentState } = useAgentStatus(currentAgentId, {
    status: (currentAgent as { status?: string }).status,
  });
  const isCurrentAgentDeleting = currentAgentState === "deleting";
  const isCurrentAgentHiring = currentAgentState === "hiring";
  const sendDisabledReason = isCurrentAgentHiring
    ? `${displayName} is still being hired - chat unlocks when setup finishes.`
    : isCurrentAgentDeleting
      ? `${displayName} is being fired - chat is locked.`
      : undefined;

  // Lazily fetch last assistant message for each inbox session
  useEffect(() => {
    if (inboxSessions.length === 0) return;
    const unfetched = inboxSessions.filter((s) => !previewFetchedForRef.current.has(s.key) && !s.preview);
    if (unfetched.length === 0) return;
    unfetched.forEach((s) => previewFetchedForRef.current.add(s.key));

    Promise.all(
      unfetched.map(async (s): Promise<[string, string] | null> => {
        try {
          let messages: Array<{ role?: string; content?: unknown }> = [];
          if (backendTab === "openclaw") {
            const r = await gatewayConnection.getChatHistory(s.key, 20);
            messages = (r.messages || []) as typeof messages;
          } else if (backendTab === "claude-code") {
            // claude-code-load-history expects sessionId, not sessionKey
            // session keys are formatted as "claude:<sessionId>"
            const sessionId = s.key.startsWith("claude:") ? s.key.slice(7) : s.key;
            const r = await bridgeInvoke("claude-code-load-history", {
              sessionId,
              agentId: currentAgentId,
              ...(identity?.project ? { projectPath: identity.project } : {}),
            }) as BridgeHistoryResult;
            messages = r?.messages || [];
          } else if (backendTab === "codex") {
            // codex-load-history expects sessionId (without the "codex:" prefix)
            const codexSessionId = s.key.replace(/^codex:/, "");
            const r = await bridgeInvoke("codex-load-history", { sessionId: codexSessionId }) as BridgeHistoryResult;
            messages = r?.messages || [];
          } else if (backendTab === "hermes") {
            // hermes-load-history expects sessionId (without the "hermes:" prefix)
            const hermesSessionId = s.key.replace(/^hermes:/, "").replace(/^agent:[^:]+:/, "");
            const r = await bridgeInvoke("hermes-load-history", { sessionId: hermesSessionId }) as BridgeHistoryResult;
            messages = r?.messages || [];
          }
          const text = extractLastAssistantText(messages);
          return text ? [s.key, text] : null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      const updates: Array<[string, string]> = results.filter(Boolean) as Array<[string, string]>;
      if (updates.length > 0) {
        setInboxPreviews((prev) => {
          const next = new Map(prev);
          for (const [key, text] of updates) next.set(key, text);
          return next;
        });
      }
    });
  }, [inboxSessions, backendTab, currentAgentId, identity?.project]);

  useEffect(() => {
    if (selectedCronJobId) return;
    setCronScopedRuns([]);
    setCronScopedSessionsLoading(false);
  }, [selectedCronJobId]);

  const markSessionRead = useCallback((key: string) => {
    if (!currentAgentId || !key) return;
    const alreadyRead = readSessionsRef.current.has(key);
    if (!alreadyRead) {
      const next = new Set([...readSessionsRef.current, key]);
      readSessionsRef.current = next;
      setReadSessions(next);
      setInboxUnreadCount((count) => Math.max(0, count - 1));
    }
    window.dispatchEvent(
      new CustomEvent(AGENT_READ_EVENT, {
        detail: { agentId: currentAgentId, sessionKey: key, alreadyRead },
      })
    );
  }, [currentAgentId]);

  const cronScopedSessionCandidates = useMemo(
    () => collectCronSessionCandidates(selectedCronJob, cronScopedRuns, {
      agentId: currentAgentId,
      cronJobId: selectedCronJobId,
    }),
    [cronScopedRuns, currentAgentId, selectedCronJob, selectedCronJobId]
  );

  const cronScopedSessions = useMemo(
    () => inboxSessions.filter((session) => sessionMatchesCronCandidates(session.key, cronScopedSessionCandidates, {
      cronJobId: selectedCronJobId,
    })),
    [cronScopedSessionCandidates, inboxSessions, selectedCronJobId]
  );

  // Notify pages/Tool/Chat.tsx (and any other consumer) about the active cron context.
  // This drives the scoped session dropdown in the site header.
  useEffect(() => {
    if (!configHideTabs) return;
    window.dispatchEvent(new CustomEvent(CRON_CHAT_ACTIVE_EVENT, {
      detail: {
        cronJobId: selectedCronJobId,
        sessions: cronHeaderSessions,
        loading: cronHeaderSessionsLoading,
      },
    }));
  }, [configHideTabs, selectedCronJobId, cronHeaderSessions, cronHeaderSessionsLoading]);

  useEffect(() => {
    if ((isCurrentAgentDeleting || isCurrentAgentHiring) && activeTab === "CHAT") {
      setActiveTab("OVERVIEW");
    }
  }, [activeTab, isCurrentAgentDeleting, isCurrentAgentHiring]);

  // Sync backendTab with the agent's runtime whenever the agent or its
  // identity changes. The agents list (HyperclawProv) is authoritative for
  // OpenClaw agents — always "openclaw" — so prefer it over the SQLite-backed
  // identity cache which can hold stale runtime values for the same agent ID.
  useEffect(() => {
    const runtime = agentListRuntime || identity?.runtime;
    if (!runtime) return;
    const expected: BackendTab =
      runtime === "claude-code" ? "claude-code"
      : runtime === "codex" ? "codex"
      : runtime === "hermes" ? "hermes"
      : "openclaw";
    setBackendTab(expected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgentId, agentListRuntime, identity?.runtime]);

  // Fetch memory search state for OpenClaw agents. Onboarding writes the
  // OpenClaw default memory-search keys, so this menu mirrors that scope.
  useEffect(() => {
    if (effectiveRuntime !== "openclaw") {
      setMemoryEnabled(null);
      setMemoryProvider(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [enabledRes, providerRes] = await Promise.all([
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.enabled }),
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.provider }),
        ]);
        if (cancelled) return;
        const settings = resolveMemorySearchSettings({
          enabledValue: unwrapOpenClawConfigValue(enabledRes),
          providerValue: unwrapOpenClawConfigValue(providerRes),
          modelValue: null,
        });
        setMemoryEnabled(settings.enabled);
        setMemoryProvider(settings.provider);
      } catch {
        if (!cancelled) {
          setMemoryEnabled(null);
          setMemoryProvider(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentAgentId, effectiveRuntime]);

  const handleMemoryToggle = useCallback(async () => {
    if (memoryEnabled === null) return;
    const next = !memoryEnabled;
    setMemoryEnabled(next);
    setMemoryToggling(true);
    try {
      if (next && !memoryProvider) {
        const provider = MEMORY_SEARCH_PROVIDERS[0].id;
        await bridgeInvoke("openclaw-config-set", {
          key: MEMORY_SEARCH_CONFIG_KEYS.provider,
          value: provider,
        });
        setMemoryProvider(provider);
      }
      await bridgeInvoke("openclaw-config-set", {
        key: MEMORY_SEARCH_CONFIG_KEYS.enabled,
        value: String(next),
      });
    } catch {
      setMemoryEnabled(!next);
    } finally {
      setMemoryToggling(false);
    }
  }, [memoryEnabled, memoryProvider]);

  // Listen for agent-click events from StatusWidget
  useEffect(() => {
    const handleAgentPanelOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        agentId?: string;
        sessionKey?: string;
        sessionCount?: number;
        unreadCount?: number;
        lastSeenTs?: number;
        runtime?: string;
        runtimeUnavailable?: boolean;
        hiring?: boolean;
        cronJobId?: string;
        newChat?: boolean;
      };
      if (!detail?.agentId) return;
      const {
        agentId,
        sessionKey,
        lastSeenTs = 0,
        unreadCount = 0,
        runtime,
        runtimeUnavailable: unavailable = false,
        hiring = false,
        cronJobId,
        newChat = false,
      } = detail;
      const targetAgent = agents.find((agent) => agent.id === agentId);
      const targetIsHiring = hiring || normalizeAgentState((targetAgent as { status?: string } | undefined)?.status) === "hiring";
      const wasSameAgent = selectedAgentIdRef.current === agentId;
      const currentPanelSessionKey = chatRef.current?.selectedSessionKey;
      const tabForRuntime = parseBackendTab(runtime)
        ?? parseBackendTab((targetAgent as { runtime?: unknown } | undefined)?.runtime)
        ?? "openclaw";
      const canonicalCronSessionKey = cronJobId ? createCronSessionKey(agentId, cronJobId) : undefined;
      setWidgetMode("agent");
      setSelectedProjectId(undefined);
      setInboxUnreadCount(unreadCount);
      setRuntimeUnavailable(unavailable);

      // Set the correct backend tab immediately so fetchSessions queries the right endpoint
      setBackendTab(tabForRuntime);

      selectedAgentIdRef.current = agentId;
      setSelectedAgentId(agentId);
      // Default to OVERVIEW when the agent is not chat-ready.
      setActiveTab(unavailable || targetIsHiring ? "OVERVIEW" : "CHAT");
      if (cronJobId && !unavailable && !targetIsHiring) {
        if (configHideTabs) {
          // Chat-only surface: stay on CHAT — but keep the cronJobId context so we can
          // fetch cron runs and build a scoped session list for the header dropdown.
          setSelectedCronJobId(cronJobId);
          setSelectedCronJob(null);
          setCronScopedRuns([]);
          setCronScopedSessionsLoading(true);
        } else {
          setActiveTab("CRONS");
          setSelectedCronJobId(cronJobId);
          setSelectedCronJob(null);
          setCronScopedSessionsLoading(true);
        }
      } else {
        setSelectedCronJobId(null);
        setSelectedCronJob(null);
        setCronScopedRuns([]);
        setCronScopedSessionsLoading(false);
      }
      setInboxLastSeenTs(lastSeenTs);
      setActiveSessionLabel(undefined);
      if (!wasSameAgent) {
        const emptyReadSessions = new Set<string>();
        readSessionsRef.current = emptyReadSessions;
        setReadSessions(emptyReadSessions);
      }
      if (newChat && !unavailable && !targetIsHiring) {
        pendingNewChatAgentRef.current = agentId;
        setActiveTab("CHAT");
      }

      // Resolve the primary session key from the connector.
      // For cron-in-chat-only, use the deterministic cron session key instead
      // of run.sessionId. Run records can contain connector run UUIDs or suffixes,
      // neither of which is safe as the full chat session key.
      const isCronOpenInChatOnly = Boolean(cronJobId && configHideTabs);
      if (sessionKey && !isCronOpenInChatOnly) {
        // Chat surfaces like /Tool/Chat pass an explicit DM key. Do not let the
        // async primary-session lookup switch Hermes to a different historical session.
        setPrimarySessionKey(sessionKey);
        const alreadyRead = wasSameAgent && readSessionsRef.current.has(sessionKey);
        const nextReadSessions = new Set([...readSessionsRef.current, sessionKey]);
        readSessionsRef.current = nextReadSessions;
        setReadSessions(nextReadSessions);
        if (!alreadyRead) {
          setInboxUnreadCount((count) => Math.max(0, count - 1));
        }
        window.dispatchEvent(new CustomEvent(AGENT_READ_EVENT, { detail: { agentId, sessionKey, alreadyRead } }));
        if (wasSameAgent && currentPanelSessionKey && currentPanelSessionKey !== sessionKey) {
          chatRef.current?.onSessionChange(sessionKey);
        }
      } else if (isCronOpenInChatOnly) {
        // Open the deterministic cron session immediately. Without this, the
        // chat pane can keep the previous selected session or fall back to the
        // agent primary session while cron-scoped sessions load.
        setPrimarySessionKey(canonicalCronSessionKey);
      } else {
        // Fetch primary session key (non-blocking — chat opens immediately)
        // Guard against stale async resolve when user switches agents quickly
        const resolveForAgentId = agentId;
        setPrimarySessionKey(undefined);
        bridgeInvoke("get-primary-session", { agentId, runtime: tabForRuntime })
          .then((result) => {
            const r = result as { success?: boolean; data?: { sessionKey?: string } };
            if (!r?.success || !r.data?.sessionKey) return;
            // Verify this agent is still the selected one
            if (selectedAgentIdRef.current === resolveForAgentId) {
              setPrimarySessionKey(r.data.sessionKey);
            }
          })
          .catch(() => { /* connector offline — PanelChatView uses its default */ });
      }

      // Check cache for session list (inbox dropdown)
      const cacheKey = `${agentId}:${tabForRuntime}`;
      const cached = sessionsCacheRef.current.get(cacheKey);

      if (cached) {
        setInboxSessions(cached);
        setInboxLoading(false);
        setChatView("chat");
      } else {
        setInboxSessions([]);
        setChatView("chat");
        setInboxLoading(true);
      }
    };

    const handleProjectPanelOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId) return;
      setWidgetMode("project");
      setSelectedProjectId(detail.projectId);
      void selectProject(detail.projectId);
    };

    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handleAgentPanelOpen);
    window.addEventListener(OPEN_AGENT_PANEL_EVENT, handleAgentPanelOpen);
    window.addEventListener(OPEN_PROJECT_PANEL_EVENT, handleProjectPanelOpen);
    const pending = consumePendingOpenAgent();
    if (pending?.agentId) {
      handleAgentPanelOpen(
        new CustomEvent(OPEN_AGENT_CHAT_EVENT, {
          detail: {
            agentId: pending.agentId,
            runtime: pending.runtime,
          },
        })
      );
    }
    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handleAgentPanelOpen);
      window.removeEventListener(OPEN_AGENT_PANEL_EVENT, handleAgentPanelOpen);
      window.removeEventListener(OPEN_PROJECT_PANEL_EVENT, handleProjectPanelOpen);
    };
  }, [agents, configHideTabs, selectProject]);

  // Reset footer state when switching tabs
  useEffect(() => {
    setFooterState({ isDirty: false, saving: false, saved: false, save: null });
  }, [activeTab, currentAgentId]);

  // Expand mounted-tabs set on first visit so the component stays alive across tab switches.
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  // Reset mounted tabs on agent change — only CHAT and the active tab survive.
  // Other tabs will mount lazily when visited again, fetching for the new agent.
  useEffect(() => {
    setMountedTabs(new Set<WidgetTab>(["CHAT", activeTab]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgentId]);

  useEffect(() => {
    if (activeTab !== "CHAT") return;
    if (!currentAgentId || pendingNewChatAgentRef.current !== currentAgentId) return;
    pendingNewChatAgentRef.current = null;
    chatRef.current?.newChat();
    setActiveSessionLabel(undefined);
  }, [activeTab, currentAgentId]);

  // Prefetch personality when FILES tab opens or agent changes — keeps tab switches instant.
  useEffect(() => {
    if (activeTab !== "FILES") return;
    if (personalityCacheAgentRef.current === currentAgentId && personalityCache !== null) return;
    personalityCacheAgentRef.current = currentAgentId;
    setPersonalityCache(null);
    (async () => {
      try {
        const p = (await bridgeInvoke("get-agent-personality", { agentId: currentAgentId })) as Record<string, unknown>;
        setPersonalityCache({
          SOUL:      (p?.soul      as string) ?? "",
          IDENTITY:  (p?.identity  as string) ?? "",
          USER:      (p?.user      as string) ?? "",
          AGENTS:    (p?.agents    as string) ?? "",
          TOOLS:     (p?.tools     as string) ?? "",
          HEARTBEAT: (p?.heartbeat as string) ?? "",
          MEMORY:    (p?.memory    as string) ?? "",
        });
      } catch {
        setPersonalityCache({});
      }
    })();
  }, [activeTab, currentAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist config
  const onConfigChangeRef = useRef(onConfigChange);
  onConfigChangeRef.current = onConfigChange;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistMountedRef = useRef(false);

  useEffect(() => {
    if (!persistMountedRef.current) { persistMountedRef.current = true; return; }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      onConfigChangeRef.current?.({ agentId: currentAgentId, backendTab });
      persistTimerRef.current = null;
    }, 500);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        onConfigChangeRef.current?.({ agentId: currentAgentId, backendTab });
      }
    };
  }, [currentAgentId, backendTab]);

  const handleAfterFileSave = useCallback((fileKey: string, newContent: string) => {
    setPersonalityCache(prev => prev ? { ...prev, [fileKey]: newContent } : null);
  }, []);

  /** Refresh all mounted data tabs — remounts via key change, clears personality cache. */
  const handleRefreshAll = useCallback(() => {
    setRefreshCounter(c => c + 1);
    personalityCacheAgentRef.current = undefined;
    setPersonalityCache(null);
  }, []);

  /** Stable callback for fetching sessions — prevents infinite loop in SessionHistoryDropdown.
   *  Only shows loading spinner if we don't have cached sessions — otherwise shows stale data
   *  immediately while refreshing in the background (stale-while-revalidate). */
  const handleFetchSessions = useCallback(() => {
    // Only show loading if cache is empty — otherwise show cached sessions immediately
    if (inboxSessions.length === 0) {
      setInboxLoading(true);
    }
    chatRef.current?.fetchSessions();
  }, [inboxSessions.length]);

  const fetchCronHeaderSessions = useCallback(async () => {
    const token = ++cronHeaderFetchTokenRef.current;
    const isCurrentFetch = () => cronHeaderFetchTokenRef.current === token;

    if (!configHideTabs || !selectedCronJobId || noAgentSelected || backendTab !== "openclaw") {
      setCronHeaderSessions([]);
      setCronHeaderSessionsLoading(false);
      return;
    }

    setCronHeaderSessionsLoading(true);
    try {
      const jobs = await fetchCronsFromBridge({ agentId: currentAgentId, runtime: effectiveRuntime });
      const cronJobIds = Array.from(new Set(
        jobs
          .map((job) => job.id?.trim())
          .filter((id): id is string => Boolean(id))
      ));
      if (!isCurrentFetch()) return;
      if (cronJobIds.length === 0) {
        setCronHeaderSessions([]);
        return;
      }

      const response = await gatewayConnection.listSessions(currentAgentId, 1000, {
        includeDefault: false,
        cronJobIds,
      });
      const sessions = (response.sessions || []).map((session) => ({
        ...session,
        key: session.key,
        label: session.label || session.key,
      })).filter((session) => Boolean(session.key));
      if (!isCurrentFetch()) return;
      setCronHeaderSessions(sessions);
    } catch {
      if (isCurrentFetch()) setCronHeaderSessions([]);
    } finally {
      if (isCurrentFetch()) setCronHeaderSessionsLoading(false);
    }
  }, [backendTab, configHideTabs, currentAgentId, effectiveRuntime, noAgentSelected, selectedCronJobId]);

  useEffect(() => {
    void fetchCronHeaderSessions();
  }, [fetchCronHeaderSessions]);

  useEffect(() => {
    if (!configHideTabs) return;
    const handleRefreshCronSessions = () => {
      void fetchCronHeaderSessions();
    };
    window.addEventListener(REFRESH_CRON_CHAT_SESSIONS_EVENT, handleRefreshCronSessions);
    return () => window.removeEventListener(REFRESH_CRON_CHAT_SESSIONS_EVENT, handleRefreshCronSessions);
  }, [configHideTabs, fetchCronHeaderSessions]);

  useEffect(() => {
    if (activeTab !== "CRONS" || !selectedCronJobId) return;
    if (inboxSessions.length > 0 || inboxLoading) return;
    handleFetchSessions();
  }, [activeTab, handleFetchSessions, inboxLoading, inboxSessions.length, selectedCronJobId]);

  // In configHideTabs (chat-only) mode, fetch cron runs directly when selectedCronJobId
  // changes — AgentCronsTab is not rendered, so there is no other trigger for this load.
  useEffect(() => {
    if (!configHideTabs || !selectedCronJobId) {
      if (configHideTabs) {
        setCronScopedRuns([]);
        setCronScopedSessionsLoading(false);
      }
      return;
    }
    let cancelled = false;
    setCronScopedSessionsLoading(true);
    fetchAllCronRunsForJob(selectedCronJobId)
      .then((runs) => {
        if (!cancelled) {
          setCronScopedRuns(runs);
        }
      })
      .catch(() => {
        if (!cancelled) setCronScopedRuns([]);
      })
      .finally(() => {
        if (!cancelled) setCronScopedSessionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [configHideTabs, selectedCronJobId]);

  // When a cron job is selected in chat-only mode, mark it as needing an auto-open.
  // This fires before the cron runs / session list have loaded.
  useEffect(() => {
    if (configHideTabs && selectedCronJobId) {
      if (suppressCronAutoOpenJobIdRef.current === selectedCronJobId) {
        suppressCronAutoOpenJobIdRef.current = null;
        pendingCronAutoOpenJobIdRef.current = null;
      } else {
        pendingCronAutoOpenJobIdRef.current = selectedCronJobId;
      }
    } else {
      suppressCronAutoOpenJobIdRef.current = null;
      pendingCronAutoOpenJobIdRef.current = null;
    }
  }, [configHideTabs, selectedCronJobId]);

  // Once cronScopedSessions becomes non-empty for the pending job, open the most
  // recent matching session (index 0 — sessions are sorted newest-first).
  // The ref guard ensures this fires at most once per cron-row click.
  useEffect(() => {
    if (!configHideTabs || !selectedCronJobId || cronScopedSessions.length === 0) return;
    if (pendingCronAutoOpenJobIdRef.current !== selectedCronJobId) return;
    pendingCronAutoOpenJobIdRef.current = null; // clear so re-renders don't re-fire
    const latestSession = cronScopedSessions[0];
    if (latestSession?.key) {
      chatRef.current?.onSessionChange(latestSession.key);
      markSessionRead(latestSession.key);
    }
  }, [configHideTabs, markSessionRead, selectedCronJobId, cronScopedSessions]);

  useEffect(() => {
    const handleClearCurrentChat = () => {
      if (!configHideTabs && widget.id !== "ensemble-chat") return;
      chatRef.current?.newChat();
      setActiveSessionLabel(undefined);
    };
    window.addEventListener(CLEAR_AGENT_CHAT_EVENT, handleClearCurrentChat);
    return () => window.removeEventListener(CLEAR_AGENT_CHAT_EVENT, handleClearCurrentChat);
  }, [configHideTabs, widget.id]);

  // Handle external reload requests (e.g. from the /Tool/Chat page header button)
  useEffect(() => {
    if (!configHideTabs) return;
    const handleReload = () => {
      chatRef.current?.reload();
    };
    window.addEventListener(RELOAD_AGENT_CHAT_EVENT, handleReload);
    return () => window.removeEventListener(RELOAD_AGENT_CHAT_EVENT, handleReload);
  }, [configHideTabs]);

  // Handle requests to load a specific cron session from the header dropdown.
  useEffect(() => {
    if (!configHideTabs) return;
    const handleLoadCronSession = (e: Event) => {
      const key = (e as CustomEvent<{ sessionKey: string }>).detail?.sessionKey;
      if (!key) return;
      const cronJobId = parseCronJobIdFromSessionKey(key);
      if (cronJobId && cronJobId !== selectedCronJobId) {
        suppressCronAutoOpenJobIdRef.current = cronJobId;
        setSelectedCronJobId(cronJobId);
        setSelectedCronJob(null);
      }
      pendingCronAutoOpenJobIdRef.current = null;
      const session = cronHeaderSessions.find((s) => s.key === key);
      setActiveSessionLabel(session?.label || key.split(":").pop() || key);
      chatRef.current?.onSessionChange(key);
      markSessionRead(key);
    };
    window.addEventListener(LOAD_CRON_SESSION_EVENT, handleLoadCronSession);
    return () => window.removeEventListener(LOAD_CRON_SESSION_EVENT, handleLoadCronSession);
  }, [configHideTabs, cronHeaderSessions, markSessionRead, selectedCronJobId]);

  // Handle requests to start a new chat for the active cron job from the header.
  useEffect(() => {
    if (!configHideTabs) return;
    const handleNewCronChat = () => {
      chatRef.current?.newChat();
      setActiveSessionLabel(undefined);
    };
    window.addEventListener(NEW_CRON_CHAT_EVENT, handleNewCronChat);
    return () => window.removeEventListener(NEW_CRON_CHAT_EVENT, handleNewCronChat);
  }, [configHideTabs]);

  // Notify the page header whether an agent/chat is active so it can show/hide the reload button
  useEffect(() => {
    if (!configHideTabs) return;
    window.dispatchEvent(
      new CustomEvent(AGENT_CHAT_ACTIVE_EVENT, {
        detail: { hasActive: !noAgentSelected },
      })
    );
  }, [configHideTabs, noAgentSelected]);

  const isEditorTab = activeTab === "INFO" || activeTab === "FILES";
  const showChatActions = activeTab === "CHAT";
  const showCronSessionActions = activeTab === "CRONS" && Boolean(selectedCronJobId);
  const showSaveButton = isEditorTab;

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]",
          className,
        )}
      >
        {widgetMode === "project" ? (
          <ProjectPanel projectId={selectedProjectId} />
        ) : agents.length === 0 ? (
          <EmptyAgentsState
            onAddAgent={(runtime) => {
              setAddAgentInitialRuntime(runtime);
              setAddAgentOpen(true);
            }}
          />
        ) : noAgentSelected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground/60">
              Select an agent or session to start chatting
            </p>
          </div>
        ) : (
          <>
        {/* ── Header: avatar + tabs + actions — hidden when embedded as pure chat surface ── */}
        {!configHideTabs && <div className="shrink-0 border-b border-border/50">
          {/* Top row: agent info + maximize */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {isEditMode ? (
                <div className="cursor-move h-7 w-7 flex items-center justify-center shrink-0">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ) : null}
              <div className="relative shrink-0">
                <Avatar
                  key={currentAgentId}
                  className={cn("h-8 w-8", runtimeUnavailable && "grayscale opacity-60")}
                  title={runtimeUnavailable ? `${backendTab === "claude-code" ? "Claude Code" : backendTab === "codex" ? "Codex" : backendTab === "hermes" ? "Hermes" : "OpenClaw"} is not installed` : undefined}
                >
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {identity?.emoji
                      ? identity.emoji
                      : fallbackInitials
                    }
                  </AvatarFallback>
                </Avatar>
                <StatusDot state={currentAgentState} size="sm" corner />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold truncate">
                    {activeSessionLabel ?? displayName}
                  </h3>
                  {isCurrentAgentDeleting && (
                    <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
                      <Loader2 className="w-2 h-2 animate-spin" />Firing
                    </span>
                  )}
                  {isCurrentAgentHiring && (
                    <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
                      <Loader2 className="w-2 h-2 animate-spin" />Hiring
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {activeSessionLabel
                    ? displayName
                    : backendTab === "claude-code" ? "Claude Code"
                    : backendTab === "codex" ? "Codex"
                    : backendTab === "hermes" ? "Hermes"
                    : "OpenClaw"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Chat actions — only on Chat tab */}
              {showChatActions && !isCurrentAgentDeleting && !isCurrentAgentHiring && (
                <>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => chatRef.current?.reload()} title="Reload chat">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                  {!configHideNewChat && (
                    <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => { chatRef.current?.newChat(); setActiveSessionLabel(undefined); }} title="New chat">
                      <Plus className="w-3 h-3" />
                    </Button>
                  )}
                  <SessionHistoryDropdown
                    sessions={inboxSessions}
                    isLoading={inboxLoading}
                    error={null}
                    currentSessionKey={chatRef.current?.selectedSessionKey}
                    primarySessionKey={primarySessionKey ?? configSessionKey}
                    onLoadSession={(key) => {
                      chatRef.current?.onSessionChange(key);
                      const s = inboxSessions.find((s) => s.key === key);
                      setActiveSessionLabel(s?.label || key.split(":").pop() || key);
                      markSessionRead(key);
                    }}
                    onNewChat={() => { chatRef.current?.newChat(); setActiveSessionLabel(undefined); }}
                    onFetchSessions={handleFetchSessions}
                    newChatLabel="+ New Chat"
                    onSetPrimary={(key) => {
                      const prevKey = primarySessionKey;
                      setPrimarySessionKey(key);
                      bridgeInvoke("set-primary-session", {
                        agentId: currentAgentId,
                        runtime: backendTab,
                        sessionKey: key,
                      }).catch(() => {
                        // Rollback on failure (connector offline)
                        setPrimarySessionKey(prevKey);
                      });
                    }}
                  />
                </>
              )}
              {showCronSessionActions && !isCurrentAgentDeleting && !isCurrentAgentHiring && (
                <SessionHistoryDropdown
                  sessions={cronScopedSessions}
                  isLoading={cronScopedSessionsLoading || (inboxLoading && inboxSessions.length === 0)}
                  error={null}
                  currentSessionKey={chatRef.current?.selectedSessionKey}
                  primarySessionKey={undefined}
                  onLoadSession={(key) => {
                    const session = cronScopedSessions.find((s) => s.key === key);
                    setActiveSessionLabel(session?.label || key.split(":").pop() || key);
                    setChatView("chat");
                    setActiveTab("CHAT");
                    chatRef.current?.onSessionChange(key);
                    markSessionRead(key);
                  }}
                  onNewChat={() => {
                    setActiveTab("CHAT");
                    setChatView("chat");
                    chatRef.current?.newChat();
                    setActiveSessionLabel(undefined);
                  }}
                  onFetchSessions={handleFetchSessions}
                  newChatLabel="+ New Chat"
                />
              )}
              {/* Refresh button — visible on data tabs (overview, runs, skills, MCPs) */}
              {!showChatActions && !showCronSessionActions && !isEditorTab && (
                <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={handleRefreshAll} title="Refresh">
                  <RefreshCw className="w-3 h-3" />
                </Button>
              )}
              {/* Save button — only on editor tabs when dirty */}
              {showSaveButton && (
                <div className="flex items-center gap-1.5">
                  {footerState.saved && (
                    <span className="text-[10px] text-emerald-500">Saved</span>
                  )}
                  {footerState.isDirty && !footerState.saved && (
                    <span className="text-[10px] text-amber-500">Unsaved</span>
                  )}
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="h-6 w-6"
                    disabled={footerState.saving || !footerState.isDirty}
                    onClick={() => footerState.save?.()}
                    title="Save"
                  >
                    {footerState.saving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              )}
              {currentAgentId && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-6 w-6"
                  title="View agent profile"
                  onClick={() => router.push(`/Tool/Agent/${currentAgentId}`)}
                >
                  <ArrowUpRight className="w-3 h-3" />
                </Button>
              )}
              <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" title="More options">
                    <MoreHorizontal className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 z-[60]">
                  <DropdownMenuItem
                    className="gap-2 text-xs"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreMenuOpen(false);
                      // Mark all inbox sessions as read and clear the unread badge
                      const allKeys = new Set(inboxSessions.map((s) => s.key));
                      readSessionsRef.current = allKeys;
                      setReadSessions(allKeys);
                      setInboxUnreadCount(0);
                      window.dispatchEvent(
                        new CustomEvent(AGENT_READ_EVENT, {
                          detail: { agentId: currentAgentId, clearAll: true },
                        })
                      );
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark all as read
                  </DropdownMenuItem>
                  {effectiveRuntime === "openclaw" && memoryEnabled !== null && (
                    <DropdownMenuItem
                      className="gap-2 text-xs"
                      disabled={memoryToggling}
                      onSelect={(e) => {
                        e.preventDefault();
                        handleMemoryToggle();
                      }}
                    >
                      <Database className="w-3.5 h-3.5" />
                      Memory Search
                      <span className={cn(
                        "ml-auto text-[10px] font-medium",
                        memoryEnabled ? "text-emerald-500" : "text-muted-foreground",
                      )}>
                        {memoryEnabled ? "On" : "Off"}
                      </span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2 text-xs"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreMenuOpen(false);
                      setPendingDeleteAgentId(currentAgentId);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete agent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Tab row — hidden when embedded as a pure chat surface */}
          {!configHideTabs && <div className="flex items-center gap-0.5 px-3 pb-1 -mb-px overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("CHAT")}
              disabled={runtimeUnavailable || isCurrentAgentDeleting || isCurrentAgentHiring}
              title={
                isCurrentAgentHiring
                  ? "Agent is still hiring - chat unlocks when setup finishes"
                  : isCurrentAgentDeleting
                  ? "Agent is firing - chat is locked"
                  : runtimeUnavailable
                    ? "Runtime not installed"
                    : undefined
              }
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                runtimeUnavailable || isCurrentAgentDeleting || isCurrentAgentHiring
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : activeTab === "CHAT"
                    ? "border-border text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("INFO")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "INFO"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Config
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("OVERVIEW")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "OVERVIEW"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("CRONS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "CRONS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Runs
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("FILES")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0 flex items-center gap-1",
                activeTab === "FILES"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Instructions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("SKILLS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "SKILLS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Skills
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("MCPS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "MCPS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              MCPs
            </button>
          </div>}
        </div>}

        {/* ── Content area ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* PanelChatView — always mounted so chat history and ref survive tab switches. */}
          <div className={cn(
            "flex-1 min-h-0 flex flex-col",
            activeTab !== "CHAT" && "hidden"
          )}>
            <PanelChatView
              ref={chatRef}
              agentId={currentAgentId}
              initialSessionKey={primarySessionKey ?? configSessionKey}
              backendTab={backendTab}
              onBackendTabChange={setBackendTab}
              showSubHeader={false}
              initialSessions={inboxSessions}
              runtimeUnavailable={runtimeUnavailable}
              sendDisabledReason={sendDisabledReason}
              onSessionsUpdate={(sessions) => {
                setInboxSessions(sessions);
                setInboxLoading(false);
                sessionsCacheRef.current.set(`${currentAgentId}:${backendTab}`, sessions);
              }}
            />
          </div>

          {mountedTabs.has("INFO") && (
            <div className={cn("flex-1 min-h-0 overflow-y-auto customScrollbar2 px-4 py-4", activeTab !== "INFO" && "hidden")}>
              <InfoTab
                key={`info-${refreshCounter}`}
                agentId={currentAgentId}
                identity={identity}
                onStateChange={setFooterState}
              />
            </div>
          )}

          {mountedTabs.has("OVERVIEW") && (
            <div className={cn("flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-3", activeTab !== "OVERVIEW" && "hidden")}>
              <AgentOverviewTab
                key={`overview-${refreshCounter}`}
                agentId={currentAgentId}
                agentRuntime={agentListRuntime || identity?.runtime}
                sessions={inboxSessions.map((s) => ({
                  ...s,
                  preview: s.preview ?? inboxPreviews.get(s.key),
                }))}
                sessionsLoading={inboxLoading}
                lastSeenTs={inboxLastSeenTs}
                readSessions={readSessions}
                unreadCount={inboxUnreadCount}
                onOpenSession={runtimeUnavailable || isCurrentAgentHiring || isCurrentAgentDeleting ? undefined : (key) => {
                  const session = inboxSessions.find((s) => s.key === key);
                  setActiveSessionLabel(session?.label || key);
                  setChatView("chat");
                  setActiveTab("CHAT");
                  chatRef.current?.onSessionChange(key);
                  markSessionRead(key);
                }}
                onNewChat={runtimeUnavailable || isCurrentAgentHiring || isCurrentAgentDeleting ? undefined : () => {
                  setActiveTab("CHAT");
                  setChatView("chat");
                  chatRef.current?.newChat();
                  setActiveSessionLabel(undefined);
                }}
                runtimeUnavailable={runtimeUnavailable}
              />
            </div>
          )}

          {mountedTabs.has("FILES") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "FILES" && "hidden")}>
              {/* File selector bar */}
              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[10px] font-medium px-2"
                    >
                      {TAB_FILES.find((t) => t.key === selectedFileKey)?.label}
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 z-[60]">
                    {TAB_FILES.map((tf) => (
                      <DropdownMenuItem
                        key={tf.key}
                        className="flex flex-col items-start gap-0.5 py-2"
                        onSelect={() => setSelectedFileKey(tf.key)}
                      >
                        <span className={cn("text-xs font-medium", tf.key === selectedFileKey && "text-primary")}>
                          {tf.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{tf.desc}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-[10px] text-muted-foreground truncate">
                  {TAB_FILES.find((t) => t.key === selectedFileKey)?.desc}
                </span>
              </div>
              {/* Editor */}
              <div className="flex-1 min-h-0 flex flex-col px-4 py-3">
                <FileEditorTab
                  key={`${currentAgentId}-${selectedFileKey}`}
                  agentId={currentAgentId}
                  fileKey={selectedFileKey}
                  onStateChange={setFooterState}
                  className="flex-1 min-h-0"
                  preloaded={personalityCache ? (personalityCache[selectedFileKey] ?? null) : undefined}
                  onAfterSave={handleAfterFileSave}
                />
              </div>
            </div>
          )}
          {mountedTabs.has("CRONS") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden px-3 py-3", activeTab !== "CRONS" && "hidden")}>
              <AgentCronsTab
                key={`crons-${refreshCounter}`}
                agentId={currentAgentId}
                runtime={effectiveRuntime}
                variant="profile"
                selectedJobId={selectedCronJobId}
                onSelectedJobChange={(job) => {
                  setSelectedCronJob(job);
                  setSelectedCronJobId(job?.id ?? null);
                }}
                onSelectedJobRunsChange={setCronScopedRuns}
                onSelectedJobRunsLoadingChange={setCronScopedSessionsLoading}
              />
            </div>
          )}

          {mountedTabs.has("SKILLS") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "SKILLS" && "hidden")}>
              <AgentSkillsTab
                key={`skills-${refreshCounter}`}
                agentId={currentAgentId}
                runtime={effectiveRuntime ?? backendTab}
                projectPath={identity?.project}
              />
            </div>
          )}

          {mountedTabs.has("MCPS") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "MCPS" && "hidden")}>
              <AgentMcpsTab key={`mcps-${refreshCounter}`} agentId={currentAgentId} runtime={effectiveRuntime} />
            </div>
          )}

        </div>
          </>
        )}
      </Card>

      <AddAgentDialog
        open={addAgentOpen}
        onOpenChange={(open) => {
          setAddAgentOpen(open);
          if (!open) setAddAgentInitialRuntime(undefined);
        }}
        initialRuntime={addAgentInitialRuntime}
        onSuccess={(id, runtime) => {
            setSelectedAgentId(id);
            setSelectedCronJobId(null);
            setSelectedCronJob(null);
            setCronScopedRuns([]);
            setCronScopedSessionsLoading(false);
            if (runtime === "claude-code") setBackendTab("claude-code");
            else if (runtime === "codex") setBackendTab("codex");
            else if (runtime === "hermes") setBackendTab("hermes");
            else setBackendTab("openclaw");
          }}
      />

      <DeleteAgentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        agentId={pendingDeleteAgentId}
        agentDisplayName={agents.find((a) => a.id === pendingDeleteAgentId)?.name ?? pendingDeleteAgentId}
        onDeleteStart={() => {
          // Switch to next agent immediately — no red/deleting state shown here.
          // StatusWidget shows the Firing… badge for that.
          const next = agents.find((a) => a.id !== pendingDeleteAgentId);
          setSelectedAgentId(next?.id);
          setSelectedCronJobId(null);
          setSelectedCronJob(null);
          setCronScopedRuns([]);
          setCronScopedSessionsLoading(false);
          // If deleting the last agent, reset to agent mode so EmptyAgentsState shows
          if (!next) {
            setWidgetMode("agent");
            setSelectedProjectId(undefined);
            setActiveTab("CHAT");
            setActiveSessionLabel(undefined);
            setInboxSessions([]);
            readSessionsRef.current = new Set();
            setReadSessions(readSessionsRef.current);
          }
        }}
        onSuccess={() => { /* context refresh handled by agent.deleted event */ }}
      />
    </motion.div>
  );
});

AgentChatWidgetContent.displayName = "AgentChatWidgetContent";

export const AgentChatCustomHeader = () => null;

const AgentChatWidget = memo((props: CustomProps) => {
  return (
    <ProjectsProvider>
      <AgentChatWidgetContent className={props.className} {...props} />
    </ProjectsProvider>
  );
});

AgentChatWidget.displayName = "AgentChatWidget";

export default AgentChatWidget;
