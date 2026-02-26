"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Calendar, CalendarDays, CalendarRange, List, RefreshCw } from "lucide-react";
import { useOpenClawContext } from "$/Providers";
import { useOS } from "@OS/Provider/OSProv";
import { AppSchema } from "@OS/Layout/types";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunRecord } from "$/types/electron";
import {
  parseCronJobs,
  parseRelativeTime,
  fetchCronsFromBridge,
  getStatusColor,
  getAgentColor,
} from "../utils";

export interface CronsContextValue {
  jobsForList: OpenClawCronJobJson[];
  parsedCronJobs: ReturnType<typeof parseCronJobs>;
  runsByJobId: Record<string, CronRunRecord[]>;
  loading: boolean;
  bridgeOnly: boolean;
  installed: boolean | null;
  bridgeLoading: boolean;
  showEmptyState: boolean;
  refresh: () => void;
  fetchBridgeCrons: () => Promise<void>;
  handleToggleEnabled: (job: OpenClawCronJobJson) => Promise<void>;
  togglingId: string | null;
  selectedDate: Date | undefined;
  setSelectedDate: (d: Date | undefined) => void;
  getStatusColor: (status: string) => string;
  getAgentColor: (agent: string) => string;
  errors: Record<string, string | null>;
  appSchema: AppSchema;
}

const CronsContext = createContext<CronsContextValue | null>(null);

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
  const [bridgeCrons, setBridgeCrons] = useState<OpenClawCronJobJson[]>([]);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [runsByJobId, setRunsByJobId] = useState<Record<string, CronRunRecord[]>>({});

  const fetchBridgeCrons = useCallback(async () => {
    setBridgeLoading(true);
    try {
      const jobs = await fetchCronsFromBridge();
      setBridgeCrons(jobs);
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

  const refresh = useCallback(() => {
    if (installed) refreshAll();
    else fetchBridgeCrons();
  }, [installed, refreshAll, fetchBridgeCrons]);

  const handleToggleEnabled = useCallback(
    async (job: OpenClawCronJobJson) => {
      setTogglingId(job.id);
      try {
        const result = job.enabled ? await cronDisable(job.id) : await cronEnable(job.id);
        if (result?.success) await fetchCronListJson();
      } finally {
        setTogglingId(null);
      }
    },
    [cronDisable, cronEnable, fetchCronListJson]
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

  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        title: "Cron Jobs",
        leftUI: {
          type: "buttons",
          buttons: [
            {
              id: "refresh",
              label: "Refresh",
              icon: <RefreshCw className="w-4 h-4" />,
              onClick: refresh,
              variant: "ghost",
            },
          ],
        },
        centerUI: {
          type: "breadcrumbs",
          breadcrumbs: [{ label: headerTitle }],
          className: "text-base font-semibold text-foreground",
        },
        rightUI: {
          type: "tabs",
          tabs: [
            { id: "weekly", label: "Week", value: "weekly" },
            { id: "monthly", label: "Month", value: "monthly" },
            { id: "all", label: "List", value: "all" },
          ],
          activeValue: currentView,
          onValueChange: handleViewChange,
        },
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
      showEmptyState,
      refresh,
      fetchBridgeCrons,
      handleToggleEnabled,
      togglingId,
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
      showEmptyState,
      refresh,
      fetchBridgeCrons,
      handleToggleEnabled,
      togglingId,
      selectedDate,
      errors,
      appSchema,
    ]
  );

  return <CronsContext.Provider value={value}>{children}</CronsContext.Provider>;
}
