"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Save,
  Loader2,
  UserPlus,
  FileClock,
  LockKeyhole,
  MessageSquare,
  MoreHorizontal,
  UserPen,
  Flame,
} from "lucide-react";
import {
  getAgent,
  formatUSD,
  formatTokens,
  EnsShell,
  AgentGlyph,
  StatusDot,
  useEnsembleData,
  useEnsembleAgents,
  useLiveAgents,
  useAgentStatus,
  findEnsembleAgent,
} from "$/components/ensemble";
import type { EnsembleAgent } from "$/components/ensemble";
import { useAgentIdentity } from "$/hooks/useAgentIdentity";
import {
  InfoTab,
  FileEditorTab,
  HermesTextFileTab,
  type FooterSaveState,
} from "$/components/Tool/Agents/AgentDetailDialog";
import AgentOverviewTab, { type OverviewSession } from "$/components/Home/widgets/AgentOverviewTab";
import { AgentSkillsTab } from "$/components/Home/widgets/AgentSkillsTab";
import { AgentMcpsTab } from "$/components/Home/widgets/AgentMcpsTab";
import { AgentStackAdaptersTab } from "$/components/Home/widgets/AgentStackAdaptersTab";
import { AgentCronsTab } from "$/components/Home/widgets/AgentChatWidget";
import { ensureAgenticStackAdapter } from "$/lib/agentic-stack-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteAgentDialog } from "$/components/Tool/Agents/DeleteAgentDialog";
import { cn } from "$/utils";
import TeamChannelConfig from "./TeamChannelConfig";
import { loadAgentOverviewSessions } from "./agent-overview-sessions";
import { resolveAgentProfileDisplay } from "./agent-profile-display";
import { getAgentProfileFileTabs } from "./agent-profile-files";
import { getProfileChannelConfigAgents } from "./team-channel-config-state";

type Tab = "files" | "overview" | "config" | "runs" | "skills" | "mcps" | "adapter" | "cost";
export const OPEN_AGENT_FIRE_EVENT = "ensemble:fire-agent";
export const OPEN_AGENT_EDIT_EVENT = "ensemble:edit-agent-info";
const EMPTY_READ_SESSIONS = new Set<string>();

/** Tabs after the file tab. */
const STATIC_TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "config",   label: "Config" },
  { key: "runs",     label: "Runs" },
  { key: "skills",   label: "Skills" },
  { key: "mcps",     label: "MCPs" },
  { key: "adapter",  label: "Actions" },
  { key: "cost",     label: "Cost & usage" },
];

const HIRING_DISABLED_TABS = new Set<Tab>(["files", "config", "runs", "skills", "mcps", "adapter", "cost"]);

function HiringSetupPanel({
  agentName,
  runtimeLabel,
}: {
  agentName: string;
  runtimeLabel: string;
}) {
  const firstName = agentName.split(" ")[0] || "This agent";
  return (
    <div className="ens-doc-card overflow-hidden">
      <div className="relative border-b border-red-400/15 bg-red-500/[0.04] px-5 py-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.18),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(251,113,133,0.12),transparent_28%)]" />
        <div className="relative flex items-start gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-400/25 bg-red-500/10 text-red-300">
            <span className="absolute inset-0 rounded-2xl border border-red-400/30 animate-ping" />
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Hiring {firstName}</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Setting up
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              We are preparing the agent workspace before exposing editable files. Identity, soul, user memory, and runtime bindings may still be syncing.
            </p>
          </div>
        </div>
      </div>

      <div className="db">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
              <FileClock className="h-3.5 w-3.5 text-red-300" />
              Files locked
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              <code>IDENTITY.md</code>, <code>SOUL.md</code>, and <code>USER.md</code> will appear when setup finishes.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
              <LockKeyhole className="h-3.5 w-3.5 text-red-300" />
              Config paused
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Runtime config stays disabled so you do not edit stale or incomplete setup data.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-300" />
              {runtimeLabel}
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              This page will unlock automatically once the hiring status changes to active.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentProfile({
  agentId,
  onOpenChat,
}: {
  agentId: string;
  onOpenChat?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [saveState, setSaveState] = useState<FooterSaveState>({
    isDirty: false,
    saving: false,
    saved: false,
    save: null,
    reset: null,
  });
  const channelSaveRef = useRef<(() => Promise<void>) | null>(null);
  const [channelIsDirty, setChannelIsDirty] = useState(false);
  const { activity } = useEnsembleData();
  const ensembleAgents = useEnsembleAgents();
  const liveAgents = useLiveAgents(ensembleAgents, activity);
  const identity = useAgentIdentity(agentId);
  const [overviewSessions, setOverviewSessions] = useState<OverviewSession[]>([]);
  const [overviewSessionsLoading, setOverviewSessionsLoading] = useState(false);
  // Which file is active inside the "files" tab (key matches FileTabSpec.key)
  const [activeFileKey, setActiveFileKey] = useState<string>("soul");
  const [showDelete, setShowDelete] = useState(false);

  const [autoAdapterError, setAutoAdapterError] = useState<string | null>(null);
  const ensuredAdapterKeysRef = useRef<Set<string>>(new Set());

  // Reset to overview + default file + clean save state when navigating to a different agent
  useEffect(() => {
    setTab("overview");
    setActiveFileKey("soul");
    setSaveState({ isDirty: false, saving: false, saved: false, save: null, reset: null });
    setAutoAdapterError(null);
  }, [agentId]);

  const row = useMemo(
    () => liveAgents.find((r) => r.agent.id === agentId),
    [liveAgents, agentId]
  );
  const liveView = useMemo(
    () => findEnsembleAgent(ensembleAgents, agentId),
    [ensembleAgents, agentId],
  );
  const agent: EnsembleAgent | undefined = useMemo(
    () =>
      row?.agent ||
      (liveView
        ? {
            id: liveView.id,
            name: liveView.name,
            title: liveView.title,
            department: liveView.department,
            emoji: liveView.emoji,
            kind: liveView.kind,
            runtimeLabel: liveView.runtimeLabel,
            identity: liveView.identity,
            seedCostMonth: 0,
            seedTokensMonth: 0,
            seedState: "idle",
          }
        : getAgent(agentId)),
    [agentId, liveView, row?.agent],
  );

  const rawState = row?.state ?? agent?.seedState ?? "idle";
  // Pass the base state into the hook so "hiring" cannot be masked by a live stream.
  const { state } = useAgentStatus(agentId, { state: rawState });
  const isHiring = state === "hiring";

  useEffect(() => {
    if (!isHiring || !HIRING_DISABLED_TABS.has(tab)) return;
    setTab("overview");
    setChannelIsDirty(false);
    setSaveState({ isDirty: false, saving: false, saved: false, save: null, reset: null });
  }, [isHiring, tab]);

  const peers = useMemo(() => {
    if (!agent) return [];
    const others = ensembleAgents.filter((a) => a.id !== agentId);
    const sameDept = others.filter((a) => a.department === agent.department);
    return (sameDept.length > 0 ? sameDept : others)
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        department: a.department,
        emoji: a.emoji,
        kind: a.kind,
        runtimeLabel: a.runtimeLabel,
        identity: a.identity,
        seedCostMonth: 0,
        seedTokensMonth: 0,
        seedState: "idle" as const,
      }));
  }, [ensembleAgents, agentId, agent]);
  const channelConfigAgents = useMemo(
    () => getProfileChannelConfigAgents(ensembleAgents, agent),
    [ensembleAgents, agent],
  );

  useEffect(() => {
    const onFireAgent = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      if (detail?.agentId && detail.agentId !== agentId) return;
      setShowDelete(true);
    };

    window.addEventListener(OPEN_AGENT_FIRE_EVENT, onFireAgent);
    return () => window.removeEventListener(OPEN_AGENT_FIRE_EVENT, onFireAgent);
  }, [agentId]);

  useEffect(() => {
    const onEditAgentInfo = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      if (detail?.agentId && detail.agentId !== agentId) return;
      if (isHiring) return;
      setTab("config");
    };

    window.addEventListener(OPEN_AGENT_EDIT_EVENT, onEditAgentInfo);
    return () => window.removeEventListener(OPEN_AGENT_EDIT_EVENT, onEditAgentInfo);
  }, [agentId, isHiring]);

  // Fetch sessions for the Overview tab based on agent runtime
  useEffect(() => {
    if (!agentId) return;
    if (!agent?.kind) return;
    let cancelled = false;
    setOverviewSessionsLoading(true);
    const fetchSessions = async () => {
      try {
        const runtime = agent.kind;
        const result = await loadAgentOverviewSessions({
          agentId,
          runtime,
          projectPath: identity?.project,
        });
        if (!cancelled) setOverviewSessions(result);
      } catch {
        if (!cancelled) setOverviewSessions([]);
      } finally {
        if (!cancelled) setOverviewSessionsLoading(false);
      }
    };
    fetchSessions();
    return () => { cancelled = true; };
  }, [agentId, agent?.kind, identity?.project]);

  // Background: make sure the agent's runtime workspace has our managed
  // block so the runtime can find the shared brain. Idempotent and
  // de-duplicated per-agent so we don't re-run on every render.
  useEffect(() => {
    if (!agentId || !agent?.kind || isHiring) return;
    const ensureKey = `${agentId}:${agent.kind}`;
    if (ensuredAdapterKeysRef.current.has(ensureKey)) return;
    ensuredAdapterKeysRef.current.add(ensureKey);
    let cancelled = false;
    void (async () => {
      try {
        const result = await ensureAgenticStackAdapter({
          agentId,
          runtime: agent.kind,
          projectPath: identity?.project,
        });
        if (cancelled) return;
        if (result.success === false && result.error) {
          setAutoAdapterError(result.error);
        } else {
          setAutoAdapterError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setAutoAdapterError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, agent?.kind, identity?.project, isHiring]);

  if (!agentId) {
    return (
      <EnsShell>
        <div className="flex items-center justify-center h-full">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </EnsShell>
    );
  }

  if (!agent) {
    return (
      <EnsShell>
        <div className="ens-card">
          <div className="ens-sh mb-2">Not found</div>
          <p className="ens-sub mb-4">
            No agent with id <code className="ens-mono">{agentId}</code>.
          </p>
          <Button variant="ghost" size="sm" onClick={() => router.push("/Tool/Team")}>
            <ArrowLeft size={14} /> Back to team
          </Button>
        </div>
      </EnsShell>
    );
  }

  const costMonth = row?.costMonth ?? agent.seedCostMonth ?? 0;
  const tokensMonth = row?.tokensMonth ?? agent.seedTokensMonth ?? 0;
  const sessions = row?.sessions ?? 0;
  const agentDisplay = resolveAgentProfileDisplay(agent, identity);
  const agentName = agentDisplay.name;
  const agentFirstName = agentName.split(" ")[0] || "Agent";
  const agentRole = agentDisplay.role;
  const agentDescription = agentDisplay.description;
  const displayAgent = {
    ...agent,
    name: agentName,
    emoji: identity?.emoji || agent.emoji,
  };

  // Runtime-specific file specs. Config-owned files are omitted from the raw file editor.
  const fileTabs = getAgentProfileFileTabs(agent.kind);
  // Currently active file within the "files" tab
  const activeFile = fileTabs.find(ft => ft.key === activeFileKey) ?? fileTabs[0];
  // Single "files" tab whose label reflects the active file, followed by common tabs
  const allTabs: { key: Tab; label: string }[] = [
    { key: "files", label: activeFile.label },
    ...STATIC_TABS,
  ];
  const showHiringSetupPanel = isHiring && (tab === "overview" || HIRING_DISABLED_TABS.has(tab));

  return (
    <EnsShell padded={false}>
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className={cn("ens-profile-hero relative overflow-hidden", isHiring && "border-red-400/20 bg-red-500/[0.025]")}>
        {isHiring && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_4rem_50%,rgba(239,68,68,0.16),transparent_18rem)]" />
        )}
        {/* Glyph + status dot */}
        <div className="relative shrink-0">
          {isHiring && (
            <>
              <span className="absolute -inset-3 rounded-full border border-red-400/20 animate-ping" />
              <span className="absolute -inset-1 rounded-full bg-red-500/10 blur-md" />
            </>
          )}
          <AgentGlyph agent={displayAgent} size={72} avatar={identity?.avatar} />
        </div>
        {/* Name / meta */}
        <div className="relative">
          <h1>{agentName}</h1>
          <div className="sub-line">
            <span>{agent.department}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono text-xs">{agent.runtimeLabel}</span>
            {identity?.project && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-mono text-xs truncate max-w-[180px]">
                  {identity.project}
                </span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <StatusDot state={state} label />
          </div>
          <div className="mt-1 max-w-2xl space-y-1">
            <span className="block text-sm text-secondary-foreground">
              {isHiring ? "Hiring in progress — workspace setup is still syncing" : agentRole}
            </span>
            {agentDescription && (
              <p className="text-sm leading-6 text-muted-foreground">
                {agentDescription}
              </p>
            )}
          </div>
        </div>

        {/* Primary agent actions sit beside the name; dirty-state save UI tucks underneath. */}
        <div className="relative flex flex-col items-end gap-2 pt-1">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Button
              size="xs"
              variant="default"
              disabled={!agentId || isHiring}
              onClick={() => onOpenChat?.()}
              className="gap-1 [&_svg]:mr-1"
            >
              {isHiring ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" fill="currentColor" />
              )}
              {isHiring ? "Hiring…" : `Chat with ${agentFirstName}`}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-7 w-7 p-0 [&_svg]:mr-0"
                  disabled={!agent || isHiring}
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  disabled={!agent || isHiring}
                  onSelect={() => setTab("config")}
                >
                  <UserPen className="h-3.5 w-3.5" />
                  Edit info
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!agent || isHiring}
                  onSelect={() => setShowDelete(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Flame className="h-3.5 w-3.5" />
                  Remove employee
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {!isHiring && (tab === "files" || tab === "config") && (saveState.isDirty || channelIsDirty || saveState.saved) && (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {saveState.saved && !channelIsDirty ? (
                <span className="text-xs text-emerald-500">Saved</span>
              ) : (
                <>
                  {tab === "files" && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={saveState.saving}
                      onClick={() => saveState.reset?.()}
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    size="xs"
                    disabled={saveState.saving}
                    onClick={async () => {
                      if (tab === "config") {
                        await saveState.save?.();
                        await channelSaveRef.current?.();
                      } else {
                        await saveState.save?.();
                      }
                    }}
                    className="gap-1"
                  >
                    {saveState.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {saveState.saving ? "Saving…" : "Save"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar (underline style, matches Ensemble design) ── */}
      <div className="ens-profile-tabs" role="tablist" aria-label="Agent profile sections">
        {isHiring && (
          <span id="hiring-lock-notice" className="sr-only">
            Locked until hiring finishes.
          </span>
        )}
        {allTabs.map((t) => (
          (() => {
            const disabled = isHiring && HIRING_DISABLED_TABS.has(t.key);
            return (
              <button
                key={t.key}
                type="button"
                id={`agent-profile-tab-${t.key}`}
                role="tab"
                aria-disabled={disabled}
                aria-selected={tab === t.key}
                aria-controls="agent-profile-panel"
                aria-describedby={disabled ? "hiring-lock-notice" : undefined}
                disabled={disabled}
                title={disabled ? "Locked until hiring finishes" : undefined}
                className={cn(
                  "ens-profile-tab",
                  disabled && "cursor-not-allowed opacity-40 hover:opacity-40",
                )}
                data-active={tab === t.key ? "true" : "false"}
                onClick={() => {
                  if (disabled) return;
                  setTab(t.key);
                }}
              >
                {t.label}
              </button>
            );
          })()
        ))}
      </div>

      {/* ── Body: left content + right sidebar ─────────────────── */}
      <div className="ens-profile-body">
        {/* ── Left: tab content ── */}
        <div
          id="agent-profile-panel"
          role="tabpanel"
          aria-labelledby={`agent-profile-tab-${tab}`}
        >
          {showHiringSetupPanel && (
            <HiringSetupPanel agentName={agentName} runtimeLabel={agent.runtimeLabel} />
          )}

          {/* ── Files tab ── single panel, pill switcher for multi-file runtimes ── */}
          {!isHiring && tab === "files" && (
            <div className="ens-doc-card">
              <div className="dh flex flex-col gap-2">
                {/* File picker: pill buttons (multi-file) or plain label (single-file) */}
                {fileTabs.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {fileTabs.map((ft) => (
                      <button
                        key={ft.key}
                        type="button"
                        onClick={() => setActiveFileKey(ft.key)}
                        className={cn("font-mono text-[11.5px] px-2.5 py-1 rounded-md border  transition-colors bg-transparent border-solid border-border",
                          ft.key === activeFile.key && "bg-primary border-primary text-primary-foreground"
                        )}
                      >
                        {ft.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="font-mono text-[13px] font-medium">{activeFile.label}</span>
                )}
                {/* Description for the active file */}
                {activeFile.description && (
                  <p className="text-xs" style={{ color: "var(--ink-3)", margin: 0 }}>
                    {activeFile.description}
                  </p>
                )}
              </div>
              <div className="db">
                {activeFile.hermesAction && activeFile.hermesUpdateAction ? (
                  <HermesTextFileTab
                    key={activeFile.key}
                    agentId={agentId}
                    action={activeFile.hermesAction}
                    updateAction={activeFile.hermesUpdateAction}
                    placeholder={activeFile.hermesPlaceholder}
                    onStateChange={setSaveState}
                  />
                ) : activeFile.fileKey ? (
                  <FileEditorTab
                    key={activeFile.key}
                    agentId={agentId}
                    fileKey={activeFile.fileKey}
                    runtime={agent.kind}
                    runtimeDocFileName={activeFile.runtimeDocFileName}
                    placeholder={activeFile.placeholder}
                    onStateChange={setSaveState}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This runtime file is not editable from the dashboard yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {!isHiring && tab === "overview" && (
            <AgentOverviewTab
              agentId={agentId}
              agentRuntime={agent.kind}
              sessions={overviewSessions}
              sessionsLoading={overviewSessionsLoading}
              lastSeenTs={row?.lastActivity ?? 0}
              readSessions={EMPTY_READ_SESSIONS}
              unreadCount={0}
            />
          )}

          {!isHiring && tab === "config" && (
            <>
              <InfoTab
                agentId={agentId}
                identity={identity}
                agentRuntime={agent.kind}
                onStateChange={setSaveState}
              />
              {(agent.kind === "hermes" || agent.kind === "openclaw") && (
                <div className="mt-6">
                  <TeamChannelConfig
                    agents={channelConfigAgents}
                    saveRef={channelSaveRef}
                    onDirtyChange={setChannelIsDirty}
                    hideButton
                  />
                </div>
              )}
            </>
          )}

          {!isHiring && tab === "runs" && (
            <AgentCronsTab agentId={agentId} runtime={agent.runtimeLabel} />
          )}

          {!isHiring && tab === "skills" && (
            <AgentSkillsTab
              agentId={agentId}
              runtime={agent.kind}
              projectPath={identity?.project}
            />
          )}

          {!isHiring && tab === "mcps" && (
            <AgentMcpsTab agentId={agentId} runtime={agent.kind} />
          )}

          {!isHiring && tab === "adapter" && (
            <AgentStackAdaptersTab
              agentId={agentId}
              runtime={agent.kind}
              projectPath={identity?.project}
              autoError={autoAdapterError}
              onAutoErrorClear={() => setAutoAdapterError(null)}
            />
          )}

          {!isHiring && tab === "cost" && (
            <div className="ens-doc-card">
              <div className="dh">Cost & usage</div>
              <div className="db">
                <div className="ens-stat-grid mb-4">
                  <div className="ens-stat">
                    <span className="k">Spend · mo</span>
                    <span className="v">{formatUSD(costMonth)}</span>
                  </div>
                  <div className="ens-stat">
                    <span className="k">Tokens · mo</span>
                    <span className="v">{formatTokens(tokensMonth)}</span>
                  </div>
                  <div className="ens-stat">
                    <span className="k">Sessions</span>
                    <span className="v">{sessions}</span>
                  </div>
                  <div className="ens-stat">
                    <span className="k">Avg / session</span>
                    <span className="v">
                      {sessions > 0 ? formatUSD(costMonth / sessions) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: persistent sidebar ── */}
        <div>
          {/* Live stats */}
          <div className="ens-side-card">
            <div className="sct">Stats</div>
            <div className="ens-stat-grid">
              <div className="ens-stat">
                <span className="k">Sessions</span>
                <span className="v">{sessions}</span>
              </div>
              <div className="ens-stat">
                <span className="k">Tokens · mo</span>
                <span className="v">{formatTokens(tokensMonth)}</span>
              </div>
              <div className="ens-stat">
                <span className="k">Spend · mo</span>
                <span className="v">{formatUSD(costMonth)}</span>
              </div>
              <div className="ens-stat">
                <span className="k">State</span>
                <span className="v capitalize">{state}</span>
              </div>
            </div>
          </div>

          {/* Teammates */}
          {peers.length > 0 && (
            <div className="ens-side-card">
              <div className="sct">Teammates</div>
              {peers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => router.push(`/Tool/Agent/${a.id}`)}
                  className="flex w-full items-center gap-3 py-2 border-b last:border-b-0 text-left cursor-pointer bg-transparent hover:opacity-70 transition-opacity"
                  style={{ borderColor: "var(--line)" }}
                >
                  <AgentGlyph agent={a} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                      {a.name}
                    </div>
                    <div className="truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                      {a.title} · {a.runtimeLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Bridge */}
          <div className="ens-side-card">
            <div className="sct">Bridge</div>
            <div className="flex items-center gap-3">
              <AgentGlyph agent={agent} size={28} />
              <div>
                <div className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                  {agent.runtimeLabel}
                </div>
                <div className="font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                  connected · {agent.department}
                </div>
              </div>
            </div>
            {identity?.project && (
              <div
                className="mt-2 font-mono text-[11px] break-all"
                style={{ color: "var(--ink-4)" }}
              >
                {identity.project}
              </div>
            )}
          </div>
        </div>
      </div>

      <DeleteAgentDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        agentId={agent.id}
        agentDisplayName={agentName}
        onDeleteStart={() => router.push("/Tool/Team")}
      />
    </EnsShell>
  );
}
