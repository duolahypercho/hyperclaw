"use client";

import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { buildAgentsFromTeam, type AgentConfig, type AgentStatus, type EmployeeStatus, type RoomLabels } from "../types";

const POLL_MS = 5000;

interface BridgeEmployeeStatus {
  id: string;
  name: string;
  status: "working" | "idle";
  currentTask?: string;
}

interface BridgeResponse {
  employees?: BridgeEmployeeStatus[];
  crons?: { id: string; name: string; schedule: string; agentId?: string }[];
}

/** Same as Agents tool: full roster from OpenClaw. */
interface ListAgentItem {
  id: string;
  name: string;
  status?: string;
  role?: string;
  lastActive?: string;
}



async function fetchListAgents(): Promise<ListAgentItem[]> {
  const res = (await bridgeInvoke("list-agents", {})) as {
    success?: boolean;
    data?: ListAgentItem[];
  };
  if (!res?.success || !Array.isArray(res.data)) return [];
  return res.data;
}


/** Agent file entry from list-openclaw-agent-files (same shape as Agents tool). */
interface AgentFileEntry {
  relativePath: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
}

async function fetchListAgentFiles(): Promise<{ files: AgentFileEntry[]; workspaceLabels: Record<string, string> }> {
  const res = (await bridgeInvoke("list-openclaw-agent-files", {})) as {
    success?: boolean;
    data?: AgentFileEntry[] | { files: AgentFileEntry[]; workspaceLabels: Record<string, string> };
  };
  if (!res?.success || !res.data) return { files: [], workspaceLabels: {} };
  if (Array.isArray(res.data)) return { files: res.data, workspaceLabels: {} };
  const { files = [], workspaceLabels = {} } = res.data;
  return { files, workspaceLabels };
}

/** Derive agent folder ids from file paths (first segment) — same as Agents tool. */
function agentFoldersFromFiles(files: AgentFileEntry[]): string[] {
  const set = new Set<string>();
  for (const f of files) {
    const seg = f.relativePath.split("/")[0];
    if (seg) set.add(seg);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

interface PixelOfficeContextValue {
  agents: AgentConfig[];
  statuses: Record<string, AgentStatus>;
  currentTasks: Record<string, string>;
  crons: { id: string; name: string; schedule: string; agentId?: string }[];
  /** Office name = main/lead agent's name (dynamic). */
  officeName: string;
  roomLabels: RoomLabels;
  loading: boolean;
  error: string | null;
  appSchema: AppSchema;
  refresh: () => Promise<void>;
}

const defaultValue: PixelOfficeContextValue = {
  agents: [],
  statuses: {},
  currentTasks: {},
  crons: [],
  officeName: "",
  roomLabels: {},
  loading: true,
  error: null,
  appSchema: { sidebar: { sections: [] } },
  refresh: async () => {},
};

const PixelOfficeContext = createContext<PixelOfficeContextValue>(defaultValue);

export function PixelOfficeProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [currentTasks, setCurrentTasks] = useState<Record<string, string>>({});
  const [crons, setCrons] = useState<{ id: string; name: string; schedule: string; agentId?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFromBridge = useCallback(async () => {
    try {
      const [data, agentsList, filesResponse] = await Promise.all([
        bridgeInvoke("get-employee-status") as Promise<BridgeResponse>,
        fetchListAgents(),
        fetchListAgentFiles(),
      ]);
      console.log("data", data, "agentsList", agentsList, "filesResponse", filesResponse);
      const employees = data?.employees ?? [];
      const cronsData = data?.crons ?? [];
      const hasDataError = data && (data as { error?: string }).error;
      const { files: agentFiles, workspaceLabels } = filesResponse;
      const folders = agentFoldersFromFiles(agentFiles);
      // Prefer workspace layout (agentFiles → folders): who actually has a workspace on disk, with names from identity.md.
      // Fall back to list-agents (CLI roster) then get-employee-status when no workspace files exist (e.g. fresh install).
      const teamForBuild =
        folders.length > 0
          ? folders.map((id) => ({ id, name: workspaceLabels[id] ?? id, status: undefined as string | undefined }))
          : agentsList.length > 0
            ? agentsList.map((a) => ({ id: a.id, name: a.name, status: a.status }))
            : employees.map((e) => ({ id: e.id, name: e.name, status: e.status }));
      const built = buildAgentsFromTeam(teamForBuild);
      setAgents(built);
      const statusMap: Record<string, AgentStatus> = {};
      const taskMap: Record<string, string> = {};
      // Overlay status/currentTask from get-employee-status where available (by id or name match)
      const employeeById = new Map(employees.map((e) => [e.id, e]));
      const employeeByName = new Map(employees.map((e) => [e.name.toLowerCase(), e]));
      built.forEach((a) => {
        const emp = employeeById.get(a.id) ?? employeeByName.get((a.name || a.id).toLowerCase());
        statusMap[a.id] = (emp?.status === "working" ? "working" : "idle") as AgentStatus;
        taskMap[a.id] = emp?.currentTask ?? "Idle";
      });
      setStatuses(statusMap);
      setCurrentTasks(taskMap);
      setCrons(cronsData);
      setError(hasDataError && built.length === 0 ? "Failed to load team" : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setAgents(buildAgentsFromTeam([]));
      setStatuses({});
      setCurrentTasks({});
      setCrons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFromBridge();
  }, [fetchFromBridge]);

  useEffect(() => {
    if (!loading) {
      const interval = setInterval(fetchFromBridge, POLL_MS);
      return () => clearInterval(interval);
    }
  }, [loading, fetchFromBridge]);

  const officeName = useMemo(() => (agents[0] ? (agents[0].name || agents[0].id) : ""), [agents]);

  const appSchema = useMemo<AppSchema>(() => ({
    header: {
      title: officeName ? `${officeName} Office` : "Office",
      icon: LayoutGrid,
    },
    sidebar: { sections: [] },
  }), [officeName]);

  const roomLabels = useMemo<RoomLabels>(
    () => ({
      meetingRoom: "Meeting room",
      kitchen: "Kitchen",
      lounge: "Lounge",
      gym: "Gym",
      bathroom: "Bathroom",
    }),
    []
  );

  const value = useMemo(
    () => ({
      agents,
      statuses,
      currentTasks,
      crons,
      officeName,
      roomLabels,
      loading,
      error,
      appSchema,
      refresh: fetchFromBridge,
    }),
    [agents, statuses, currentTasks, crons, officeName, roomLabels, loading, error, appSchema, fetchFromBridge]
  );

  return (
    <PixelOfficeContext.Provider value={value}>
      {children}
    </PixelOfficeContext.Provider>
  );
}

export function usePixelOffice() {
  const ctx = useContext(PixelOfficeContext);
  return ctx ?? defaultValue;
}
