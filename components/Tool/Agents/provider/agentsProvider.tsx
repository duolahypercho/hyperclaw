"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Bot, FileText, Plus, RefreshCw, Save, Loader2, Trash2, Sparkles, Brain, UserRound, Users, Wrench, Heart, Crown, Zap } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { patchIdentityCache } from "$/hooks/useAgentIdentity";
import { dashboardState } from "$/lib/dashboard-state";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { cronAdd } from "$/components/Tool/Crons/utils";
import type { CEOHeartbeatConfig } from "$/types/electron";
import { AppSchema } from "@OS/Layout/types";
import type { SidebarSection, SidebarItem } from "@OS/Layout/Sidebar/SidebarSchema";
import { AgentSidebarSelect } from "../AgentSidebarSelect";
import { AddAgentDialog } from "../AddAgentDialog";
import { DeleteAgentDialog } from "$/components/Tool/Agents/DeleteAgentDialog";

export interface Agent {
  id: string;
  name: string;
  status: string;
  role?: string;
  description?: string;
  lastActive?: string;
  /** Folder name under OPENCLAW_HOME for this agent's workspace (from getTeam workspace path). */
  workspaceFolder?: string;
  /** Which runtime this agent belongs to: openclaw, hermes, claude-code, codex */
  runtime?: "openclaw" | "hermes" | "claude-code" | "codex";
}

export interface AgentFileEntry {
  relativePath: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
}

interface AgentsContextValue {
  agents: Agent[];
  agentFiles: AgentFileEntry[];
  workspaceLabels: Record<string, string>;
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  filteredAgentFiles: AgentFileEntry[];
  selectedFile: AgentFileEntry | null;
  content: string | null;
  loading: boolean;
  contentLoading: boolean;
  saving: boolean;
  error: string | null;
  saveError: string | null;
  appSchema: AppSchema;
  setSelectedFile: (file: AgentFileEntry | null) => void;
  setContent: (value: string | null) => void;
  refresh: () => Promise<void>;
  saveDoc: () => Promise<boolean>;
  /** The agent ID marked as the HyperClaw orchestrator (CEO), or null if none */
  ceoAgentId: string | null;
  /** Optimistically add an agent before server confirms */
  addOptimisticAgent: (name: string, id?: string, runtime?: Agent["runtime"], details?: Pick<Agent, "role" | "description">) => void;
  /** Refresh with retry delay for post-mutation sync */
  refreshAfterMutation: () => Promise<void>;
  /** Agent IDs that have a background delete in flight */
  deletingAgentIds: Set<string>;
}

/** Stable data that rarely changes — cheap to subscribe to */
interface AgentsDataContextValue {
  agents: Agent[];
  agentFiles: AgentFileEntry[];
  workspaceLabels: Record<string, string>;
  filteredAgentFiles: AgentFileEntry[];
  ceoAgentId: string | null;
  appSchema: AppSchema;
  refresh: () => Promise<void>;
}

/** Volatile UI state that changes often */
interface AgentsUIContextValue {
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  selectedFile: AgentFileEntry | null;
  setSelectedFile: (file: AgentFileEntry | null) => void;
  content: string | null;
  setContent: (value: string | null) => void;
  loading: boolean;
  contentLoading: boolean;
  saving: boolean;
  error: string | null;
  saveError: string | null;
  addOptimisticAgent: (name: string, id?: string, runtime?: Agent["runtime"], details?: Pick<Agent, "role" | "description">) => void;
  refreshAfterMutation: () => Promise<void>;
  deletingAgentIds: Set<string>;
  saveDoc: () => Promise<boolean>;
}

const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);
const AgentsDataContext = createContext<AgentsDataContextValue | null>(null);
const AgentsUIContext = createContext<AgentsUIContextValue | null>(null);

export function useAgents(): AgentsContextValue {
  const data = useAgentsData();
  const ui = useAgentsUI();
  return { ...data, ...ui };
}

export function useAgentsData(): AgentsDataContextValue {
  const ctx = useContext(AgentsDataContext);
  if (!ctx) throw new Error("useAgentsData must be used within AgentsProvider");
  return ctx;
}

export function useAgentsUI(): AgentsUIContextValue {
  const ctx = useContext(AgentsUIContext);
  if (!ctx) throw new Error("useAgentsUI must be used within AgentsProvider");
  return ctx;
}


export interface AgentFilesResponse {
  files: AgentFileEntry[];
  workspaceLabels: Record<string, string>;
}

async function fetchListAgentFiles(): Promise<AgentFilesResponse> {
  const res = (await bridgeInvoke("list-openclaw-agent-files", {})) as {
    success?: boolean;
    data?: AgentFileEntry[] | AgentFilesResponse;
  };
  if (!res?.success || !res.data) return { files: [], workspaceLabels: {} };
  // Support both legacy array and new { files, workspaceLabels } shape
  if (Array.isArray(res.data)) {
    return { files: res.data, workspaceLabels: {} };
  }
  const { files = [], workspaceLabels = {} } = res.data as AgentFilesResponse;
  return { files, workspaceLabels };
}

async function fetchDocContent(relativePath: string): Promise<string | null> {
  const res = (await bridgeInvoke("get-openclaw-doc", { relativePath })) as {
    success?: boolean;
    content?: string | null;
    error?: string;
  };
  if (res?.success && typeof res.content === "string") return res.content;
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Map well-known agent file names to distinct icons */
const FILE_ICONS: Record<string, typeof FileText> = {
  "SOUL.md": Sparkles,
  "MEMORY.md": Brain,
  "IDENTITY.md": UserRound,
  "AGENTS.md": Users,
  "TOOLS.md": Wrench,
  "USER.md": UserRound,
  "HEARTBEAT.md": Heart,
};

// Allowed personality files per runtime (strict filtering).
const RUNTIME_FILES: Record<string, Set<string>> = {
  openclaw: new Set(["IDENTITY.md", "SOUL.md", "AGENTS.md", "TOOLS.md", "USER.md", "HEARTBEAT.md", "MEMORY.md"]),
  hermes: new Set(["SOUL.md"]),
  "claude-code": new Set(["SOUL.md"]), // stored as SOUL.md, compiled into CLAUDE.md by connector
  codex: new Set(["AGENTS.md"]),
};

const AGENT_RUNTIMES: Agent["runtime"][] = ["openclaw", "hermes", "claude-code", "codex"];

function toAgentRuntime(runtime: string): Agent["runtime"] | undefined {
  return AGENT_RUNTIMES.includes(runtime as Agent["runtime"])
    ? runtime as Agent["runtime"]
    : undefined;
}

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const { agents: openClawAgents, fetchAgents } = useHyperclawContext();
  // Keep a ref so refresh() always calls the latest fetchAgents without
  // capturing it in deps — prevents refresh from recreating every 30s when
  // the context proxy identity changes.
  const fetchAgentsRef = useRef(fetchAgents);
  fetchAgentsRef.current = fetchAgents;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentFiles, setAgentFiles] = useState<AgentFileEntry[]>([]);
  const [workspaceLabels, setWorkspaceLabels] = useState<Record<string, string>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<AgentFileEntry | null>(null);
  const [content, setContentState] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addAgentDialogOpen, setAddAgentDialogOpen] = useState(false);
  const [deleteAgentDialogOpen, setDeleteAgentDialogOpen] = useState(false);
  // Snapshot of the agent to delete — captured when the dialog opens so it
  // doesn't shift if selectedAgentId changes while the dialog is visible.
  const [pendingDeleteAgentId, setPendingDeleteAgentId] = useState<string>("");
  const [deletingAgentIds, setDeletingAgentIds] = useState<Set<string>>(new Set());
  const selectedPathRef = useRef<string | null>(null);
  const [ceoAgentId, setCeoAgentId] = useState<string | null>(null);
  const [deployingCeo, setDeployingCeo] = useState(false);
  const [wakingCeo, setWakingCeo] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

  // Load CEO agent ID from dashboard state
  useEffect(() => {
    const id = dashboardState.get("hyperclaw-ceo-id");
    setCeoAgentId(id || null);
  }, [loading]);

  // handleDeployOrchestrator is defined after refreshAfterMutation / addOptimisticAgent (below)

  // Files belonging to the selected agent: match by workspace folder from getTeam()
  // Then filter by runtime — only show files relevant to the agent's runtime
  const filteredAgentFiles = useMemo(() => {
    if (!selectedAgentId) return [];
    const agent = agents.find((a) => a.id === selectedAgentId);
    const folder = agent?.workspaceFolder ?? selectedAgentId;
    const runtime = agent?.runtime ?? "openclaw";
    const allowedFiles = RUNTIME_FILES[runtime] ?? RUNTIME_FILES.openclaw;

    // Workspace dirs may be "workspace-{id}", "{id}", or "workspace" (for main)
    const prefixes = [folder, `workspace-${folder}`];
    if (folder === "main") prefixes.push("workspace");

    return agentFiles
      .filter((f) =>
        prefixes.some(
          (p) => f.relativePath === p || f.relativePath.startsWith(p + "/")
        )
      )
      .filter((f) => allowedFiles.has(f.name));
  }, [agentFiles, agents, selectedAgentId]);

  const refresh = useCallback(async (retries = 0) => {
    setLoading(true);
    setError(null);
    try {
      // All agents come from HyperclawProvider (SQLite single source).
      // We only need to trigger a re-fetch + grab the agent files list.
      const [freshAgents, filesResponse] = await Promise.all([
        fetchAgentsRef.current().catch(() => [] as Agent[]),
        fetchListAgentFiles(),
      ]);
      const allAgents = (freshAgents as Agent[]).map((a) => ({
        ...a,
        runtime: a.runtime ?? ("openclaw" as const),
      }));

      // Patch the identity cache so useAgentIdentity returns the correct runtime.
      for (const agent of allAgents) {
        patchIdentityCache(agent.id, {
          runtime: agent.runtime,
          name: agent.name,
          role: agent.role,
          description: agent.description,
        });
      }
      setAgents((prev) => {
        const freshIds = new Set(allAgents.map((agent) => agent.id));
        const pendingHiring = prev.filter((agent) => agent.status === "hiring" && !freshIds.has(agent.id));
        const nextAgents = [...allAgents, ...pendingHiring];
        return nextAgents;
      });
      setAgentFiles(filesResponse.files);
      setWorkspaceLabels(filesResponse.workspaceLabels);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []); // fetchAgents read via ref; stable identity stops needless re-subscriptions

  /** Refresh with a short delay + retry — gives the connector time to register the new agent */
  const refreshAfterMutation = useCallback(async () => {
    // First refresh immediately
    await refresh();
    // Then retry after a short delay in case the connector hasn't caught up
    setTimeout(() => refresh(), 1500);
  }, [refresh]);

  /** Optimistically add an agent to the list before server confirms */
  const addOptimisticAgent = useCallback((name: string, id?: string, runtime?: Agent["runtime"], details?: Pick<Agent, "role" | "description">) => {
    const normalizedId = id || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_.-]/g, "");
    const optimistic: Agent = {
      id: normalizedId,
      name,
      status: "hiring",
      role: details?.role || "",
      description: details?.description || "",
      runtime,
    };
    setAgents((prev) => {
      if (prev.some((a) => a.id === normalizedId)) return prev;
      return [...prev, optimistic];
    });
    setSelectedAgentId(normalizedId);
  }, []);

  // Deploy orchestrator: create agent + write CEO template files
  const handleDeployOrchestrator = useCallback(async () => {
    if (ceoAgentId || deployingCeo) return;
    setDeployingCeo(true);
    try {
      const { deployCEOTemplates } = await import("$/lib/ceo-templates");
      const name = "hyperclaw";
      // Optimistic: show agent immediately
      addOptimisticAgent(name);

      const result = (await bridgeInvoke("add-agent", { agentName: name })) as {
        success?: boolean;
        error?: string;
      };
      if (!result?.success) {
        console.error("[Orchestrator] Failed to create agent:", result?.error);
        await refreshAfterMutation(); // revert optimistic on failure
        return;
      }
      // Deploy template files to workspace (pass name for IDENTITY.md)
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      const deployResult = await deployCEOTemplates(`workspace-${name}`, displayName);
      if (!deployResult.success) {
        await deployCEOTemplates(name, displayName);
      }
      // Mark as CEO
      dashboardState.set("hyperclaw-ceo-id", name, { flush: true });
      setCeoAgentId(name);

      // Create recurring heartbeat cron (every 30 min)
      const heartbeatConfig: CEOHeartbeatConfig = {
        enabled: true,
        intervalMs: 30 * 60 * 1000,
        runtime: "openclaw",
        agentId: name,
        maxTasksPerBeat: 5,
        goals: [],
      };
      dashboardState.set("ceo-heartbeat-config", JSON.stringify(heartbeatConfig), { flush: true });

      try {
        await cronAdd({
          name: "CEO Heartbeat",
          cron: "*/30 * * * *",
          session: "isolated",
          agent: name,
          message: "Run your heartbeat cycle. Read HEARTBEAT.md and follow the checklist. Return a JSON block with your mutations.",
          announce: true,
          channel: "announce",
        });
      } catch (cronErr) {
        console.error("[Orchestrator] Heartbeat cron creation failed:", cronErr);
      }

      await refreshAfterMutation();
    } catch (err) {
      console.error("[Orchestrator] Deploy failed:", err);
    } finally {
      setDeployingCeo(false);
    }
  }, [ceoAgentId, deployingCeo, addOptimisticAgent, refreshAfterMutation]);

  // Wake CEO: trigger an immediate heartbeat cycle
  const handleWakeCeo = useCallback(async () => {
    if (!ceoAgentId || wakingCeo) return;
    setWakingCeo(true);
    try {
      const result = (await bridgeInvoke("cron-run-agent", {
        agentId: ceoAgentId,
        message: "Run your heartbeat cycle now. Read HEARTBEAT.md and follow the checklist. Return a JSON block with your mutations.",
        session: "isolated",
      })) as { success?: boolean; error?: string };

      if (!result?.success) {
        // Fallback: try spawning via agent spawner
        const { spawnAgentForTask } = await import("$/lib/useAgentSpawner");
        await spawnAgentForTask({
          taskId: `ceo-heartbeat-${Date.now()}`,
          agentId: ceoAgentId,
          taskTitle: "CEO Heartbeat (manual)",
          taskDescription: "Run your heartbeat cycle. Read HEARTBEAT.md and follow the checklist.",
        });
      }
      setLastHeartbeat(new Date().toISOString());
    } catch (err) {
      console.error("[CEO] Wake failed:", err);
    } finally {
      setWakingCeo(false);
    }
  }, [ceoAgentId, wakingCeo]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    refresh();
  }, [refresh]);

  // Auto-refresh when the connector reports agents changed (add/delete from OpenClaw chat)
  useEffect(() => {
    const unsub = gatewayConnection.on("agents.changed", () => {
      refresh();
    });
    return unsub;
  }, [refresh]);

  useEffect(() => {
    const onAgentHired = (event: Event) => {
      const agentId = (event as CustomEvent).detail?.agentId as string | undefined;
      void refresh();
    };
    const onAgentHireFailed = (event: Event) => {
      const agentId = (event as CustomEvent).detail?.agentId as string | undefined;
      if (!agentId) return;
      setAgents((prev) => prev.filter((agent) => agent.id !== agentId));
    };
    window.addEventListener("agent.hired", onAgentHired);
    window.addEventListener("agent.hire.failed", onAgentHireFailed);
    return () => {
      window.removeEventListener("agent.hired", onAgentHired);
      window.removeEventListener("agent.hire.failed", onAgentHireFailed);
    };
  }, [refresh]);

  // When options load, default to first agent; fix selection if missing from list
  useEffect(() => {
    if (loading || agents.length === 0) return;
    const ids = new Set(agents.map((a) => a.id));
    const targetId = agents[0]?.id ?? "";
    if (selectedAgentId === "" || !ids.has(selectedAgentId)) {
      setSelectedAgentId(targetId);
    }
  }, [loading, agents, selectedAgentId]);

  // Broadcast selected agent name to the titlebar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const name = agents.find((a) => a.id === selectedAgentId)?.name ?? selectedAgentId ?? null;
    window.dispatchEvent(new CustomEvent("titlebar-context", { detail: { subtitle: name } }));
    return () => {
      window.dispatchEvent(new CustomEvent("titlebar-context", { detail: { subtitle: null } }));
    };
  }, [selectedAgentId, agents]);

  // When agent or file list changes: keep current file if still in list; otherwise default to agents.md or first file
  useEffect(() => {
    const currentInList =
      selectedFile &&
      filteredAgentFiles.some((f) => f.relativePath === selectedFile.relativePath);
    if (currentInList) return;
    const defaultFile =
      filteredAgentFiles.find((f) => f.name === "AGENTS.md") ?? filteredAgentFiles[0] ?? null;
    setSelectedFile(defaultFile);
  }, [selectedAgentId, filteredAgentFiles, selectedFile]);

  useEffect(() => {
    if (!selectedFile?.relativePath) {
      setContentState(null);
      setOriginalContent(null);
      selectedPathRef.current = null;
      return;
    }
    selectedPathRef.current = selectedFile.relativePath;
    setContentLoading(true);
    setSaveError(null);
    fetchDocContent(selectedFile.relativePath)
      .then((text) => {
        if (selectedPathRef.current === selectedFile.relativePath) {
          const value = text ?? "";
          setContentState(value);
          setOriginalContent(value);
        }
      })
      .finally(() => {
        if (selectedPathRef.current === selectedFile.relativePath) {
          setContentLoading(false);
        }
      });
  }, [selectedFile?.relativePath]);

  const setContent = useCallback((value: string | null) => {
    setContentState(value);
    setSaveError(null);
  }, []);

  const saveDoc = useCallback(async (): Promise<boolean> => {
    if (!selectedFile?.relativePath || content === null) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const result = (await bridgeInvoke("write-openclaw-doc", {
        relativePath: selectedFile.relativePath,
        content,
      })) as { success?: boolean; error?: string };
      if (result?.success) {
        setSaveError(null);
        setOriginalContent(content);
        return true;
      }
      setSaveError(result?.error ?? "Failed to save");
      return false;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedFile?.relativePath, content]);

  const sidebarSections = useMemo((): SidebarSection[] => {
    const sections: SidebarSection[] = [];

    // Top: agent select dropdown (custom section rendered at top of sidebar)
    sections.push({
      id: "agent-select",
      type: "custom",
      content: <AgentSidebarSelect />,
    });

    // Files belonging to the selected agent (title = name, subtitle = size, distinct icons)
    const fileItems: SidebarItem[] = filteredAgentFiles.map((file) => ({
      id: file.relativePath,
      title: file.name,
      subtitle: formatFileSize(file.sizeBytes),
      icon: FILE_ICONS[file.name] ?? FileText,
      isActive: selectedFile?.relativePath === file.relativePath,
      onClick: () => setSelectedFile(file),
    }));

    const isCeoAgent = ceoAgentId != null && selectedAgentId === ceoAgentId;
    sections.push({
      id: `agent-files-${selectedAgentId}`,
      type: "default",
      title: isCeoAgent ? "Files  \u{1F451}" : "Files",
      items: fileItems,
    });

    if (!loading && agents.length === 0 && agentFiles.length === 0) {
      sections.push({
        id: "agents-empty",
        type: "default",
        items: [
          {
            id: "empty",
            title: "No agents or files found",
            icon: Bot,
          },
        ],
      });
    }

    return sections;
  }, [
    filteredAgentFiles,
    selectedFile?.relativePath,
    selectedAgentId,
    loading,
    agents.length,
    agentFiles.length,
    ceoAgentId,
  ]);

  const hasUnsavedChanges =
    content !== null && originalContent !== null && content !== originalContent;

  const selectedAgentName = useMemo(() => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    return agent?.name ?? selectedAgentId;
  }, [agents, selectedAgentId]);

  const appSchema: AppSchema = useMemo(
    () => {
      const firstAgentId = agents[0]?.id ?? null;
      const isFirstAgent = firstAgentId != null && selectedAgentId === firstAgentId;
      const selectedAgent = agents.find((a) => a.id === selectedAgentId);
      const isProtectedAgent = selectedAgentId === "main" || selectedAgentId === "__main__";
      const breadcrumbs = [{ label: "Agents" }];
      if (selectedAgentName) breadcrumbs.push({ label: selectedAgentName });
      if (selectedFile) breadcrumbs.push({ label: selectedFile.name });

      return {
      header: {
        title: "Agents",
        icon: Bot,
        centerUI: {
          type: "breadcrumbs" as const,
          breadcrumbs,
          className: "text-xs text-muted-foreground",
        },
        rightUI: {
          type: "buttons",
          buttons: [
            ...(!ceoAgentId ? [{
              id: "deploy-orchestrator",
              label: deployingCeo ? "Deploying…" : "Deploy Orchestrator",
              icon: deployingCeo
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Crown className="h-4 w-4 text-amber-500" />,
              onClick: handleDeployOrchestrator,
              disabled: deployingCeo,
              className: "text-amber-500 hover:text-amber-400",
            }] : [{
              id: "wake-ceo",
              label: wakingCeo ? "Waking…" : "Wake CEO",
              icon: wakingCeo
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Zap className="h-4 w-4 text-yellow-500" />,
              onClick: handleWakeCeo,
              disabled: wakingCeo,
              className: "text-yellow-500 hover:text-yellow-400",
            }]),
            {
              id: "add-agent",
              label: "Add agent",
              icon: <Plus className="h-4 w-4" />,
              onClick: () => setAddAgentDialogOpen(true),
            },
            {
              id: "delete-agent",
              label: "Delete agent",
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => {
                if (!isProtectedAgent) {
                  setPendingDeleteAgentId(selectedAgentId);
                  setDeleteAgentDialogOpen(true);
                }
              },
              disabled: !selectedAgentId || isProtectedAgent,
              variant: "ghost",
              className: "text-muted-foreground hover:text-destructive",
            },
            {
              id: "agents-save",
              label: saving ? "Saving…" : hasUnsavedChanges ? "Save ⌘S" : "Save",
              icon:
                saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                ),
              onClick: () => saveDoc(),
              disabled: !selectedFile || content === null || saving,
              variant: hasUnsavedChanges ? "success" : "ghost",
              className: hasUnsavedChanges
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                : "text-muted-foreground",
            },
            {
              id: "refresh-agents",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => refresh(),
              label: "Refresh",
            },
          ],
        },
      },
      sidebar: { sections: sidebarSections },
    };
    },
    [
      sidebarSections,
      refresh,
      saveDoc,
      saving,
      selectedFile,
      content,
      hasUnsavedChanges,
      agents,
      selectedAgentId,
      selectedAgentName,
      ceoAgentId,
      deployingCeo,
      handleDeployOrchestrator,
      wakingCeo,
      handleWakeCeo,
    ]
  );

  const dataValue = useMemo<AgentsDataContextValue>(
    () => ({
      agents,
      agentFiles,
      workspaceLabels,
      filteredAgentFiles,
      ceoAgentId,
      appSchema,
      refresh,
    }),
    [agents, agentFiles, workspaceLabels, filteredAgentFiles, ceoAgentId, appSchema, refresh]
  );

  const uiValue = useMemo<AgentsUIContextValue>(
    () => ({
      selectedAgentId,
      setSelectedAgentId,
      selectedFile,
      setSelectedFile,
      content,
      setContent,
      loading,
      contentLoading,
      saving,
      error,
      saveError,
      addOptimisticAgent,
      refreshAfterMutation,
      deletingAgentIds,
      saveDoc,
    }),
    [
      selectedAgentId,
      selectedFile,
      content,
      loading,
      contentLoading,
      saving,
      error,
      saveError,
      setContent,
      addOptimisticAgent,
      refreshAfterMutation,
      deletingAgentIds,
      saveDoc,
    ]
  );

  // Keep the legacy single-context value for backward compat consumers
  const value = useMemo<AgentsContextValue>(
    () => ({ ...dataValue, ...uiValue }),
    [dataValue, uiValue]
  );

  return (
    <AgentsContext.Provider value={value}>
      <AgentsDataContext.Provider value={dataValue}>
        <AgentsUIContext.Provider value={uiValue}>
          {children}
          <AddAgentDialog
            open={addAgentDialogOpen}
            onOpenChange={setAddAgentDialogOpen}
            existingAgents={agents}
            onSuccess={(agentId, runtime, displayName, details) => {
              addOptimisticAgent(displayName || agentId, agentId, toAgentRuntime(runtime), details);
            }}
          />
          <DeleteAgentDialog
            open={deleteAgentDialogOpen}
            onOpenChange={setDeleteAgentDialogOpen}
            agentId={pendingDeleteAgentId}
            agentDisplayName={workspaceLabels[pendingDeleteAgentId] ?? pendingDeleteAgentId}
            onDeleteStart={() => {
              setDeletingAgentIds((prev) => new Set([...prev, pendingDeleteAgentId]));
            }}
            onSuccess={() => {
              setDeletingAgentIds((prev) => {
                const next = new Set(prev);
                next.delete(pendingDeleteAgentId);
                return next;
              });
              refresh();
            }}
            isFirstAgent={pendingDeleteAgentId === "main" || pendingDeleteAgentId === "__main__"}
          />
        </AgentsUIContext.Provider>
      </AgentsDataContext.Provider>
    </AgentsContext.Provider>
  );
}
