"use client";

import {
  getRunningJobIds,
  addRunningJobId,
  subscribeToRunningCrons,
} from "$/lib/crons-running-store";
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Plus, RefreshCw } from "lucide-react";
import { useOpenClawContext } from "$/Providers";
import { useOS } from "@OS/Provider/OSProv";
import { AppSchema } from "@OS/Layout/types";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunRecord } from "$/types/electron";
import {
  parseCronJobs,
  fetchCronsFromBridge,
  fetchCronRunsFromBridge,
  getStatusColor,
  getAgentColor,
  cronAdd as cronAddUtil,
  cronRun as cronRunUtil,
  cronEdit as cronEditUtil,
  cronDelete as cronDeleteUtil,
  type CronAddParams,
  type CronEditParams,
} from "../utils";
import { AddCronDialog } from "../AddCronDialog";

export interface CronsContextValue {
  jobsForList: OpenClawCronJobJson[];
  parsedCronJobs: ReturnType<typeof parseCronJobs>;
  runsByJobId: Record<string, CronRunRecord[]>;
  loading: boolean;
  bridgeOnly: boolean;
  installed: boolean | null;
  bridgeLoading: boolean;
  bridgeError: string | null;
  showEmptyState: boolean;
  refresh: () => void;
  fetchBridgeCrons: () => Promise<OpenClawCronJobJson[]>;
  handleToggleEnabled: (job: OpenClawCronJobJson) => Promise<void>;
  cronAdd: (params: CronAddParams) => Promise<{ success: boolean; error?: string }>;
  cronRun: (jobId: string, options?: { due?: boolean }) => Promise<{ success: boolean; error?: string }>;
  cronEdit: (jobId: string, params: CronEditParams) => Promise<{ success: boolean; error?: string }>;
  cronDelete: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  openAddCron: () => void;
  togglingId: string | null;
  runningJobId: string | null;
  /** All job IDs currently running (from session store; synced with Tool page and widget). */
  runningJobIds: string[];
  selectedDate: Date | undefined;
  setSelectedDate: (d: Date | undefined) => void;
  getStatusColor: (status: string) => string;
  getAgentColor: (agent: string) => string;
  errors: Record<string, string | null>;
  appSchema: AppSchema;
}

const CronsContext = createContext<CronsContextValue | null>(null);

export function useCronsActions() {
  return useCrons();
}

export function useCrons() {
  const ctx = useContext(CronsContext);
  if (!ctx) throw new Error("useCrons must be used within CronsProvider");
  return ctx;
}

export function CronsProvider({ children }: { children: ReactNode }) {
  const { updateAppSettings, activeTool, getAppSettings } = useOS();
  const currentView = getAppSettings(activeTool?.id ?? "crons").currentActiveTab || "weekly";
  const {
    cronJobs,
    cronJobsJson,
    loading,
    errors,
    installed,
    refreshAll,
    fetchCronListJson,
    cronEnable,
    cronDisable,
  } = useOpenClawContext();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [runningJobIds, setRunningJobIds] = useState<string[]>(() => getRunningJobIds());
  const previousRunningIdsRef = useRef<string[]>(getRunningJobIds());
  const [bridgeCrons, setBridgeCrons] = useState<OpenClawCronJobJson[]>([]);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [runsByJobId, setRunsByJobId] = useState<Record<string, CronRunRecord[]>>({});
  const deletedJobRollbackRef = useRef<OpenClawCronJobJson | null>(null);

  const fetchBridgeCrons = useCallback(async () => {
    setBridgeLoading(true);
    setBridgeError(null);
    try {
      const jobs = await fetchCronsFromBridge();
      const list = Array.isArray(jobs) ? jobs : [];
      setBridgeCrons(list);
      return list;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load cron jobs";
      setBridgeError(message);
      setBridgeCrons([]);
      return [];
    } finally {
      setBridgeLoading(false);
    }
  }, []);

  // Load cron list from file (via bridge) immediately on mount so the list appears without waiting for useOpenClaw
  useEffect(() => {
    fetchBridgeCrons();
  }, [fetchBridgeCrons]);

  useEffect(() => {
    if (installed === false) fetchBridgeCrons();
  }, [installed, fetchBridgeCrons]);

  const parsedCronJobs = useMemo(() => parseCronJobs(cronJobs), [cronJobs]);
  const openClawJobs =
    cronJobsJson ??
    parsedCronJobs.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: true,
      agentId: p.agent,
      state: { nextRunAtMs: undefined, lastStatus: p.status },
    })) as OpenClawCronJobJson[];
  // Prefer bridge list so the list appears as soon as get-crons returns (one file read). Don't wait for useOpenClaw.
  const rawJobs = bridgeCrons.length ? bridgeCrons : openClawJobs;
  // Sort by next run ascending (closest incoming first); jobs without nextRunAtMs go last
  const jobsForList = useMemo(() => {
    return [...rawJobs].sort((a, b) => {
      const nextA = a.state?.nextRunAtMs ?? Number.POSITIVE_INFINITY;
      const nextB = b.state?.nextRunAtMs ?? Number.POSITIVE_INFINITY;
      return nextA - nextB;
    });
  }, [rawJobs]);
  const bridgeOnly = !installed && bridgeCrons.length > 0;
  const showEmptyState = !installed && bridgeCrons.length === 0 && !bridgeLoading;

  // No bulk run fetch on mount — list uses job.state (lastRunAtMs, lastStatus). Run history loads on demand when user opens a job detail.

  // Load run history for calendar (week/month) so completed runs show in day view
  const loadRunsForCalendar = useCallback(async () => {
    const ids = jobsForList.map((j) => j.id).filter(Boolean);
    if (ids.length === 0) return;
    try {
      const runs = await fetchCronRunsFromBridge(ids);
      setRunsByJobId(runs);
    } catch {
      setRunsByJobId({});
    }
  }, [jobsForList]);

  useEffect(() => {
    if (showEmptyState || bridgeLoading) return;
    loadRunsForCalendar();
  }, [showEmptyState, bridgeLoading, loadRunsForCalendar]);

  const refresh = useCallback(async () => {
    // Always refresh the bridge list so the UI (which prefers bridgeCrons when it has length) updates
    const jobs = await fetchBridgeCrons();
    const jobIds = Array.isArray(jobs) ? jobs.map((j) => j.id).filter(Boolean) : [];
    if (installed) {
      await refreshAll();
    }
    if (jobIds.length > 0) {
      try {
        const runs = await fetchCronRunsFromBridge(jobIds);
        setRunsByJobId(runs);
      } catch {
        // keep existing
      }
    }
  }, [installed, refreshAll, fetchBridgeCrons]);

  // Sync running job IDs from session store (shared with CronsWidget and Tool/Crons page).
  // OpenClaw provider polls get-running-crons and removes jobs when done; we refresh when store loses a job.
  useEffect(() => {
    setRunningJobIds((prev) => {
      const next = getRunningJobIds();
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev;
      return next;
    });
    const unsubscribe = subscribeToRunningCrons((newIds) => {
      const prev = previousRunningIdsRef.current;
      setRunningJobIds((current) => {
        if (current.length === newIds.length && current.every((id, i) => id === newIds[i])) return current;
        previousRunningIdsRef.current = newIds;
        return newIds;
      });
      if (prev.length > newIds.length) refresh();
    });
    return unsubscribe;
  }, [refresh]);

  const handleToggleEnabled = useCallback(
    async (job: OpenClawCronJobJson) => {
      setTogglingId(job.id);
      try {
        const result = job.enabled
          ? await cronDisable(job.id)
          : await cronEnable(job.id);
        if (result?.success) await refresh();
      } finally {
        setTogglingId(null);
      }
    },
    [cronDisable, cronEnable, refresh]
  );

  const cronAdd = useCallback(
    async (params: CronAddParams) => {
      const optimisticId = `pending-add-${Date.now()}`;
      const scheduleExpr = params.cron?.trim() ?? params.at?.trim() ?? "";
      const optimisticJob: OpenClawCronJobJson = {
        id: optimisticId,
        name: params.name?.trim() ?? "New job",
        enabled: true,
        agentId: params.agent ?? "main",
        schedule: {
          kind: params.cron ? "cron" : "every",
          expr: scheduleExpr,
        },
        state: { lastStatus: "idle" },
      };
      setBridgeCrons((prev) => [...prev, optimisticJob]);
      try {
        const result = await cronAddUtil(params);
        if (result.success) {
          await refresh();
          return result;
        }
        setBridgeCrons((prev) => prev.filter((j) => j.id !== optimisticId));
        return result;
      } catch (err) {
        setBridgeCrons((prev) => prev.filter((j) => j.id !== optimisticId));
        throw err;
      }
    },
    [refresh]
  );

  const cronRun = useCallback(
    async (jobId: string, options?: { due?: boolean }) => {
      try {
        console.log("cronRun", jobId, options);
        const result = await cronRunUtil(jobId, options);
        if (result.success) {
          addRunningJobId(jobId);
          setRunningJobIds(getRunningJobIds());
          await refresh();
          return result;
        }
        return result;
      } catch (err) {
        throw err;
      }
    },
    [refresh]
  );

  const cronEdit = useCallback(
    async (jobId: string, params: CronEditParams) => {
      setBridgeCrons((prev) =>
        prev.map((j) => {
          if (j.id !== jobId) return j;
          return {
            ...j,
            ...(typeof params.name === "string" && params.name.trim() && { name: params.name.trim() }),
            ...(params.clearAgent && { agentId: undefined }),
            ...(typeof params.agent === "string" && params.agent.trim() && { agentId: params.agent.trim() }),
          };
        })
      );
      try {
        const result = await cronEditUtil(jobId, params);
        if (result.success) {
          await refresh();
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [refresh]
  );

  const cronDelete = useCallback(
    async (jobId: string) => {
      setBridgeCrons((prev) => {
        const removed = prev.find((j) => j.id === jobId) ?? null;
        deletedJobRollbackRef.current = removed;
        return removed ? prev.filter((j) => j.id !== jobId) : prev;
      });
      try {
        const result = await cronDeleteUtil(jobId);
        if (result.success) {
          deletedJobRollbackRef.current = null;
          await refresh();
          return result;
        }
        if (deletedJobRollbackRef.current) {
          setBridgeCrons((prev) => [...prev, deletedJobRollbackRef.current!]);
          deletedJobRollbackRef.current = null;
        }
        return result;
      } catch (err) {
        if (deletedJobRollbackRef.current) {
          setBridgeCrons((prev) => [...prev, deletedJobRollbackRef.current!]);
          deletedJobRollbackRef.current = null;
        }
        throw err;
      }
    },
    [refresh]
  );

  const handleViewChange = useCallback(
    (viewId: string) => {
      if (activeTool?.id) {
        updateAppSettings(activeTool.id, { currentActiveTab: viewId });
      }
    },
    [activeTool?.id, updateAppSettings]
  );

  const headerTitle = useMemo(() => {
    const d = selectedDate || new Date();
    if (currentView === "monthly") return format(d, "MMMM yyyy");
    if (currentView === "weekly") {
      const start = startOfWeek(d, { weekStartsOn: 0 });
      const end = endOfWeek(d, { weekStartsOn: 0 });
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return "All Jobs";
  }, [currentView, selectedDate]);

  const [addCronOpen, setAddCronOpen] = useState(false);
  const openAddCron = useCallback(() => setAddCronOpen(true), []);
  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        title: "Cron Jobs",
        leftUI:{
          type: "tabs",
          tabs: [
            { id: "weekly", label: "Week", value: "weekly" },
            { id: "monthly", label: "Month", value: "monthly" },
            { id: "all", label: "List", value: "all" },
          ],
          activeValue: currentView,
          onValueChange: handleViewChange,
        },
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "refresh",
              label: "Refresh",
              icon: <RefreshCw className="w-4 h-4" />,
              onClick: refresh,
              variant: "ghost",
            },
            {
              id: "add-cron",
              label: "Add",
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setAddCronOpen(true),
              variant: "default",
            }
          ],
        },
        centerUI: {
          type: "breadcrumbs",
          breadcrumbs: [{ label: headerTitle }],
          className: "text-base font-semibold text-foreground",
        }
      },
      sidebar: undefined,
    }),
    [handleViewChange, currentView, refresh, headerTitle]
  );

  const value: CronsContextValue = useMemo(
    () => ({
      jobsForList,
      parsedCronJobs,
      runsByJobId,
      loading,
      bridgeOnly,
      installed,
      bridgeLoading,
      bridgeError,
      showEmptyState,
      refresh,
      fetchBridgeCrons,
      handleToggleEnabled,
      cronAdd,
      cronRun,
      cronEdit,
      cronDelete,
      openAddCron,
      togglingId,
      runningJobId: runningJobIds[0] ?? null,
      runningJobIds,
      selectedDate,
      setSelectedDate,
      getStatusColor,
      getAgentColor,
      errors,
      appSchema,
    }),
    [
      jobsForList,
      parsedCronJobs,
      runsByJobId,
      loading,
      bridgeOnly,
      installed,
      bridgeLoading,
      bridgeError,
      showEmptyState,
      refresh,
      fetchBridgeCrons,
      handleToggleEnabled,
      cronAdd,
      cronRun,
      cronEdit,
      cronDelete,
      openAddCron,
      togglingId,
      runningJobIds,
      selectedDate,
      errors,
      appSchema,
    ]
  );

  return (
    <CronsContext.Provider value={value}>
      {children}
      {addCronOpen && (
        <AddCronDialog
          open={addCronOpen}
          onOpenChange={setAddCronOpen}
          onSuccess={() => {
            setAddCronOpen(false);
          }}
        />
      )}
    </CronsContext.Provider>
  );
}
