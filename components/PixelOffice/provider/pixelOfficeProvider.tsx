"use client";

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { buildAgentsFromTeam, type AgentConfig, type AgentStatus, type RoomLabels } from "../types";

/** How often to refetch employee status (lightweight). */
const STATUS_POLL_MS = 12_000;
/** How often to refetch team source (list-agents + agent files — heavier). */
const FULL_REFRESH_MS = 45_000;

/** One cron job in current-working or next-coming list (same idea as Crons tool: includes agentId). */
export interface EmployeeCronJob {
  id: string;
  name: string;
  schedule: string;
  nextRunAtMs?: number;
  agentId?: string;
}

/** Previous task (last run outside 10 min window) for "X mins/hours/days ago" display. */
export interface EmployeePreviousTask {
  id: string;
  name: string;
  schedule: string;
  lastRunAtMs: number;
  agentId?: string;
}

interface BridgeEmployeeStatus {
  id: string;
  name: string;
  status: "working" | "idle";
  currentTask?: string;
  currentWorkingJobs?: { id: string; name: string; schedule: string; agentId?: string }[];
  previousTasks?: EmployeePreviousTask[];
  nextComingCrons?: EmployeeCronJob[];
}

interface BridgeResponse {
  employees?: BridgeEmployeeStatus[];
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


/** Single batched state to avoid 5+ setState calls per fetch → fewer re-renders. */
interface OfficeData {
  agents: AgentConfig[];
  statuses: Record<string, AgentStatus>;
  currentTasks: Record<string, string>;
  currentWorkingJobsByAgent: Record<string, { id: string; name: string; schedule: string; agentId?: string }[]>;
  previousTasksByAgent: Record<string, EmployeePreviousTask[]>;
  nextComingCronsByAgent: Record<string, EmployeeCronJob[]>;
  error: string | null;
}

interface PixelOfficeContextValue {
  agents: AgentConfig[];
  statuses: Record<string, AgentStatus>;
  currentTasks: Record<string, string>;
  /** Per-agent: cron jobs currently working (running or last run within 10 mins). */
  currentWorkingJobsByAgent: Record<string, { id: string; name: string; schedule: string; agentId?: string }[]>;
  /** Per-agent: previous tasks (last run outside 10 min) for "X ago" display. */
  previousTasksByAgent: Record<string, EmployeePreviousTask[]>;
  /** Per-agent: cron jobs next coming (nextRunAtMs in future). */
  nextComingCronsByAgent: Record<string, EmployeeCronJob[]>;
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
  currentWorkingJobsByAgent: {},
  previousTasksByAgent: {},
  nextComingCronsByAgent: {},
  officeName: "",
  roomLabels: {},
  loading: true,
  error: null,
  appSchema: { sidebar: { sections: [] } },
  refresh: async () => {},
};

const EMPTY_OFFICE_DATA: OfficeData = {
  agents: [],
  statuses: {},
  currentTasks: {},
  currentWorkingJobsByAgent: {},
  previousTasksByAgent: {},
  nextComingCronsByAgent: {},
  error: null,
};

const ROOM_LABELS: RoomLabels = {
  meetingRoom: "Meeting room",
  kitchen: "Kitchen",
  lounge: "Lounge",
  gym: "Gym",
  bathroom: "Bathroom",
};

const PixelOfficeContext = createContext<PixelOfficeContextValue>(defaultValue);

/** Build employee lookup maps once from validated array. */
function buildEmployeeMaps(employees: BridgeEmployeeStatus[]) {
  const byId = new Map<string, BridgeEmployeeStatus>();
  const byName = new Map<string, BridgeEmployeeStatus>();
  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    if (!e || typeof e !== "object") continue;
    if (e.id != null) byId.set(e.id, e);
    const nameKey = (e.name ?? "").toString().toLowerCase();
    if (nameKey) byName.set(nameKey, e);
  }
  return { byId, byName };
}

/** Merge employee status into one OfficeData from built agents + employees. */
function mergeEmployeeStatus(
  built: AgentConfig[],
  employees: BridgeEmployeeStatus[],
  hasDataError: boolean
): OfficeData {
  const { byId, byName } = buildEmployeeMaps(employees);
  const statuses: Record<string, AgentStatus> = {};
  const currentTasks: Record<string, string> = {};
  const currentWorkingJobsByAgent: Record<string, { id: string; name: string; schedule: string; agentId?: string }[]> = {};
  const previousTasksByAgent: Record<string, EmployeePreviousTask[]> = {};
  const nextComingCronsByAgent: Record<string, EmployeeCronJob[]> = {};
  for (let i = 0; i < built.length; i++) {
    const a = built[i];
    const emp = byId.get(a.id) ?? byName.get((a.name || a.id || "").toLowerCase());
    statuses[a.id] = (emp?.status === "working" ? "working" : "idle") as AgentStatus;
    currentTasks[a.id] = emp?.currentTask ?? "Idle";
    currentWorkingJobsByAgent[a.id] = Array.isArray(emp?.currentWorkingJobs) ? emp.currentWorkingJobs as { id: string; name: string; schedule: string; agentId?: string }[] : [];
    previousTasksByAgent[a.id] = Array.isArray(emp?.previousTasks) ? emp.previousTasks : [];
    nextComingCronsByAgent[a.id] = Array.isArray(emp?.nextComingCrons) ? emp.nextComingCrons : [];
  }
  return {
    agents: built,
    statuses,
    currentTasks,
    currentWorkingJobsByAgent,
    previousTasksByAgent,
    nextComingCronsByAgent,
    error: hasDataError && built.length === 0 ? "Failed to load team" : null,
  };
}

export function PixelOfficeProvider({ children }: { children: React.ReactNode }) {
  const [officeData, setOfficeData] = useState<OfficeData>(EMPTY_OFFICE_DATA);
  const [loading, setLoading] = useState(true);
  const lastTeamSourceRef = useRef<{ teamForBuild: { id: string; name: string; status?: string }[] } | null>(null);

  const runFullRefresh = useCallback(async () => {
    try {
      const [data, agentsList] = await Promise.all([
        bridgeInvoke("get-employee-status") as Promise<BridgeResponse>,
        fetchListAgents(),
      ]);
      const employeesRaw = data && typeof data === "object" && "employees" in data ? (data as BridgeResponse).employees : undefined;
      const employees = Array.isArray(employeesRaw) ? employeesRaw : [];
      const hasDataError = !!(data && typeof data === "object" && (data as { error?: string }).error);
      const teamForBuild =
        agentsList.length > 0
          ? agentsList.map((a) => ({ id: a.id, name: a.name, status: a.status }))
          : employees.filter((e) => e && typeof e === "object" && e.id).map((e) => ({ id: e.id, name: e.name ?? e.id, status: (e as BridgeEmployeeStatus).status }));
      lastTeamSourceRef.current = { teamForBuild };
      const built = buildAgentsFromTeam(teamForBuild);
      setOfficeData(mergeEmployeeStatus(built, employees, hasDataError));
    } catch (e) {
      lastTeamSourceRef.current = null;
      setOfficeData({
        ...EMPTY_OFFICE_DATA,
        error: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const runStatusOnlyRefresh = useCallback(async () => {
    const teamSource = lastTeamSourceRef.current?.teamForBuild;
    if (!teamSource || teamSource.length === 0) {
      await runFullRefresh();
      return;
    }
    try {
      const data = (await bridgeInvoke("get-employee-status")) as BridgeResponse;
      const employees = Array.isArray(data?.employees) ? data.employees : [];
      const hasDataError = !!(data && typeof data === "object" && (data as { error?: string }).error);
      const built = buildAgentsFromTeam(teamSource);
      setOfficeData(mergeEmployeeStatus(built, employees, hasDataError));
    } catch {
      // Keep last data on status-only failure; next full refresh will recover
    }
  }, [runFullRefresh]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await runFullRefresh();
  }, [runFullRefresh]);

  useEffect(() => {
    setLoading(true);
    runFullRefresh();
  }, [runFullRefresh]);

  useEffect(() => {
    if (loading) return;
    let fullId: ReturnType<typeof setInterval> | null = null;
    let statusId: ReturnType<typeof setInterval> | null = null;
    const schedule = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!fullId) fullId = setInterval(runFullRefresh, FULL_REFRESH_MS);
      if (!statusId) statusId = setInterval(runStatusOnlyRefresh, STATUS_POLL_MS);
    };
    const clear = () => {
      if (fullId) clearInterval(fullId);
      if (statusId) clearInterval(statusId);
      fullId = null;
      statusId = null;
    };
    schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
      else clear();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loading, runFullRefresh, runStatusOnlyRefresh]);

  const { agents, statuses, currentTasks, currentWorkingJobsByAgent, previousTasksByAgent, nextComingCronsByAgent, error } = officeData;
  const officeName = agents[0] ? (agents[0].name || agents[0].id) : "";

  const appSchema = useMemo<AppSchema>(
    () => ({
      header: {
        title: officeName ? `${officeName} Office` : "Office",
        icon: LayoutGrid,
      },
      sidebar: { sections: [] },
    }),
    [officeName]
  );

  const value = useMemo(
    () => ({
      agents,
      statuses,
      currentTasks,
      currentWorkingJobsByAgent,
      previousTasksByAgent,
      nextComingCronsByAgent,
      officeName,
      roomLabels: ROOM_LABELS,
      loading,
      error,
      appSchema,
      refresh,
    }),
    [
      agents,
      statuses,
      currentTasks,
      currentWorkingJobsByAgent,
      previousTasksByAgent,
      nextComingCronsByAgent,
      officeName,
      loading,
      error,
      appSchema,
      refresh,
    ]
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
