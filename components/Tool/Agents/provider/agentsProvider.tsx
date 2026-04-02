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
import { Bot, FileText, Plus, RefreshCw, Save, Loader2, Trash2, Sparkles, Brain, UserRound, Users, Wrench, Heart, Crown } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { dashboardState } from "$/lib/dashboard-state";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
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
  lastActive?: string;
  /** Folder name under OPENCLAW_HOME for this agent's workspace (from getTeam workspace path). */
  workspaceFolder?: string;
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
  addOptimisticAgent: (name: string) => void;
  /** Refresh with retry delay for post-mutation sync */
  refreshAfterMutation: () => Promise<void>;
}

const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within AgentsProvider");
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

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const { agents: openClawAgents, fetchAgents } = useOpenClawContext();
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
  const selectedPathRef = useRef<string | null>(null);
  const [ceoAgentId, setCeoAgentId] = useState<string | null>(null);
  const [deployingCeo, setDeployingCeo] = useState(false);

  // Load CEO agent ID from dashboard state
  useEffect(() => {
    const id = dashboardState.get("hyperclaw-ceo-id");
    setCeoAgentId(id || null);
  }, [loading]);

  // handleDeployOrchestrator is defined after refreshAfterMutation / addOptimisticAgent (below)

  // Files belonging to the selected agent: match by workspace folder from getTeam()
  const filteredAgentFiles = useMemo(() => {
    if (!selectedAgentId) return [];
    const agent = agents.find((a) => a.id === selectedAgentId);
    const folder = agent?.workspaceFolder ?? selectedAgentId;
    // Workspace dirs may be "workspace-{id}", "{id}", or "workspace" (for main)
    const prefixes = [folder, `workspace-${folder}`];
    if (folder === "main") prefixes.push("workspace");
    return agentFiles.filter((f) =>
      prefixes.some(
        (p) => f.relativePath === p || f.relativePath.startsWith(p + "/")
      )
    );
  }, [agentFiles, agents, selectedAgentId]);

  const refresh = useCallback(async (retries = 0) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch fresh agent list from the server instead of using the stale
      // context value — critical after add/delete so the UI updates immediately
      // rather than waiting for the next 30s auto-refresh cycle.
      const [freshAgents, filesResponse] = await Promise.all([
        fetchAgents(),
        fetchListAgentFiles(),
      ]);
      setAgents(freshAgents as Agent[]);
      setAgentFiles(filesResponse.files);
      setWorkspaceLabels(filesResponse.workspaceLabels);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [fetchAgents]);

  /** Refresh with a short delay + retry — gives the connector time to register the new agent */
  const refreshAfterMutation = useCallback(async () => {
    // First refresh immediately
    await refresh();
    // Then retry after a short delay in case the connector hasn't caught up
    setTimeout(() => refresh(), 1500);
  }, [refresh]);

  /** Optimistically add an agent to the list before server confirms */
  const addOptimisticAgent = useCallback((name: string) => {
    const normalizedId = name.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const optimistic: Agent = {
      id: normalizedId,
      name,
      status: "idle",
      role: "",
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
      await refreshAfterMutation();
    } catch (err) {
      console.error("[Orchestrator] Deploy failed:", err);
    } finally {
      setDeployingCeo(false);
    }
  }, [ceoAgentId, deployingCeo, addOptimisticAgent, refreshAfterMutation]);

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

  // When options load, default to first agent; fix selection if missing from list
  useEffect(() => {
    if (loading || agents.length === 0) return;
    const ids = new Set(agents.map((a) => a.id));
    const targetId = agents[0]?.id ?? "";
    if (selectedAgentId === "" || !ids.has(selectedAgentId)) {
      setSelectedAgentId(targetId);
    }
  }, [loading, agents, selectedAgentId]);

  // When agent or file list changes: keep current file if still in list; otherwise default to agents.md or first file
  useEffect(() => {
    const currentInList =
      selectedFile &&
      filteredAgentFiles.some((f) => f.relativePath === selectedFile.relativePath);
    if (currentInList) return;
    const defaultFile =
      filteredAgentFiles.find((f) => f.name === "agents.md") ?? filteredAgentFiles[0] ?? null;
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
            }] : []),
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
                if (!isFirstAgent) setDeleteAgentDialogOpen(true);
              },
              disabled: !selectedAgentId || isFirstAgent,
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
    ]
  );

  const value = useMemo<AgentsContextValue>(
    () => ({
      agents,
      agentFiles,
      workspaceLabels,
      selectedAgentId,
      setSelectedAgentId,
      filteredAgentFiles,
      selectedFile,
      content,
      loading,
      contentLoading,
      saving,
      error,
      saveError,
      appSchema,
      setSelectedFile,
      setContent,
      refresh,
      saveDoc,
      ceoAgentId,
      addOptimisticAgent,
      refreshAfterMutation,
    }),
    [
      agents,
      agentFiles,
      workspaceLabels,
      selectedAgentId,
      filteredAgentFiles,
      selectedFile,
      content,
      loading,
      contentLoading,
      saving,
      error,
      saveError,
      appSchema,
      setContent,
      refresh,
      saveDoc,
      ceoAgentId,
      addOptimisticAgent,
      refreshAfterMutation,
    ]
  );

  return (
    <AgentsContext.Provider value={value}>
      {children}
      <AddAgentDialog
        open={addAgentDialogOpen}
        onOpenChange={setAddAgentDialogOpen}
        onSuccess={(name) => {
          addOptimisticAgent(name);
          refreshAfterMutation();
        }}
      />
      <DeleteAgentDialog
        open={deleteAgentDialogOpen}
        onOpenChange={setDeleteAgentDialogOpen}
        agentId={selectedAgentId}
        agentDisplayName={workspaceLabels[selectedAgentId] ?? selectedAgentId}
        onSuccess={() => refresh()}
        isFirstAgent={
          agents[0] != null && selectedAgentId === agents[0].id
        }
      />
    </AgentsContext.Provider>
  );
}
