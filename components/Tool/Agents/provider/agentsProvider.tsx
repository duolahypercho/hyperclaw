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
import { Bot, FileText, RefreshCw, Save, Loader2 } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { AppSchema } from "@OS/Layout/types";
import type { SidebarSection, SidebarItem } from "@OS/Layout/Sidebar/SidebarSchema";
import { AgentSidebarSelect } from "../AgentSidebarSelect";

export interface Agent {
  id: string;
  name: string;
  status: string;
  role?: string;
  lastActive?: string;
}

export interface AgentFileEntry {
  relativePath: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface AgentOption {
  id: string;
  name: string;
}

interface AgentsContextValue {
  agents: Agent[];
  agentFiles: AgentFileEntry[];
  workspaceLabels: Record<string, string>;
  agentOptions: AgentOption[];
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
}

const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within AgentsProvider");
  return ctx;
}

async function fetchListAgents(): Promise<Agent[]> {
  const res = (await bridgeInvoke("list-agents", {})) as {
    success?: boolean;
    data?: Agent[];
  };
  if (!res?.success || !Array.isArray(res.data)) return [];
  return res.data;
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

/** Derive agent folder names from file paths (first path segment). */
function agentFoldersFromFiles(files: AgentFileEntry[]): string[] {
  const set = new Set<string>();
  for (const f of files) {
    const seg = f.relativePath.split("/")[0];
    if (seg) set.add(seg);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AgentsProvider({ children }: { children: React.ReactNode }) {
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
  const selectedPathRef = useRef<string | null>(null);

  // Agent options: folder-based when we have files (display names from identity.md); API agents when no files. No "All Agent" option.
  const agentOptions = useMemo(() => {
    const folders = agentFoldersFromFiles(agentFiles);
    if (folders.length > 0) {
      return folders.map((id) => ({
        id,
        name: workspaceLabels[id] ?? id,
      }));
    }
    if (agents.length > 0) {
      return agents;
    }
    return [];
  }, [agents, agentFiles, workspaceLabels]);

  // Files belonging to the selected agent (path prefix match)
  const filteredAgentFiles = useMemo(() => {
    if (!selectedAgentId) return [];
    return agentFiles.filter(
      (f) =>
        f.relativePath === selectedAgentId ||
        f.relativePath.startsWith(selectedAgentId + "/")
    );
  }, [agentFiles, selectedAgentId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsList, filesResponse] = await Promise.all([
        fetchListAgents(),
        fetchListAgentFiles(),
      ]);
      setAgents(agentsList);
      setAgentFiles(filesResponse.files);
      setWorkspaceLabels(filesResponse.workspaceLabels);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    refresh();
  }, [refresh]);

  // When options load, default to first agent; fix selection if missing from list
  useEffect(() => {
    if (loading || agentOptions.length === 0) return;
    const ids = new Set(agentOptions.map((o) => o.id));
    const targetId = agentOptions[0]?.id ?? "";
    if (selectedAgentId === "" || !ids.has(selectedAgentId)) {
      setSelectedAgentId(targetId);
    }
  }, [loading, agentOptions, selectedAgentId]);

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

    // Files belonging to the selected agent (title = name, subtitle = size)
    const fileItems: SidebarItem[] = filteredAgentFiles.map((file) => ({
      id: file.relativePath,
      title: file.name,
      subtitle: formatFileSize(file.sizeBytes),
      icon: FileText,
      isActive: selectedFile?.relativePath === file.relativePath,
      onClick: () => setSelectedFile(file),
    }));

    sections.push({
      id: `agent-files-${selectedAgentId}`,
      type: "default",
      title: "Files",
      items: fileItems,
    });

    if (!loading && agentOptions.length === 0 && agentFiles.length === 0) {
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
    agentOptions.length,
    agentFiles.length,
  ]);

  const hasUnsavedChanges =
    content !== null && originalContent !== null && content !== originalContent;

  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        title: "Agents",
        icon: Bot,
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "agents-save",
              label: saving ? "Saving…" : "Save",
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
    }),
    [
      sidebarSections,
      refresh,
      saveDoc,
      saving,
      selectedFile,
      content,
      hasUnsavedChanges,
    ]
  );

  const value = useMemo<AgentsContextValue>(
    () => ({
      agents,
      agentFiles,
      workspaceLabels,
      agentOptions,
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
    }),
    [
      agents,
      agentFiles,
      workspaceLabels,
      agentOptions,
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
    ]
  );

  return (
    <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
  );
}
