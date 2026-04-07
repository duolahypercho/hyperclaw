"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Server, CalendarClock, Inbox, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCrons } from "../provider/cronsProvider";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getJobNextRunDate, getJobPalette, getStatusColor } from "../utils";
import { CronJobDetailDialog } from "../CronJobDetailDialog";
import type { OpenClawCronJobJson } from "$/types/electron";

const statusLabels: Record<string, string> = {
  ok: "Success",
  error: "Failed",
  idle: "Idle",
  running: "In progress",
};

export function AllJobsView() {
  const {
    jobsForList,
    parsedCronJobs,
    loading,
    bridgeOnly,
    bridgeLoading,
    handleToggleEnabled,
    togglingId,
    runningJobIds,
  } = useCrons();
  const [detailJob, setDetailJob] = useState<OpenClawCronJobJson | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Only show skeleton when we have no jobs and are still loading from both sources
  if ((loading || bridgeLoading) && jobsForList.length === 0) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 bg-muted/30 animate-pulse rounded-xl"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-4">
        {bridgeOnly && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
          >
            <Server className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground/90">
              Viewing jobs from Hyperclaw Bridge. Install OpenClaw CLI to enable or disable jobs from this app.
            </span>
          </motion.div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {jobsForList.length} job{jobsForList.length !== 1 ? "s" : ""}
          </span>
        </div>

        {jobsForList.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-border/60 bg-muted/20"
          >
            <Inbox className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground">No cron jobs yet</p>
            <p className="text-xs text-muted-foreground text-center mt-1 max-w-[240px]">
              Create jobs with the OpenClaw CLI to see them here and manage schedules.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-1.5">
            {jobsForList.map((job, i) => {
              const nextRun = getJobNextRunDate(job, parsedCronJobs);
              const nextRunStr = nextRun
                ? formatDistanceToNow(nextRun, { addSuffix: true })
                : "—";
              const lastRunMs = job.state?.lastRunAtMs;
              const lastRunStr = lastRunMs
                ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true })
                : "—";
              const isRunning = runningJobIds.includes(job.id);
              const status = (isRunning ? "running" : (job.state?.lastStatus ?? "idle")) as string;
              const statusLabel = statusLabels[status] ?? status;
              const agent = job.agentId ?? "main";
              const isToggling = togglingId === job.id;
              const palette = getJobPalette(job.id);
              const lastError = job.state?.lastError;

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.15), duration: 0.2 }}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40
                    ${palette.border} border-l-[3px]
                    hover:bg-muted/30 hover:border-border/60 transition-colors duration-150
                    ${!job.enabled ? "opacity-50" : ""}
                    ${isRunning ? "bg-primary/5" : ""}
                  `}
                >
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="shrink-0">
                          <Switch
                            checked={job.enabled}
                            onCheckedChange={() => handleToggleEnabled(job)}
                            disabled={isToggling || bridgeOnly}
                            className="shrink-0"
                            aria-label={job.enabled ? "Disable job" : "Enable job"}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="font-medium">
                          {job.enabled ? "Disable" : "Enable"} job
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {bridgeOnly
                            ? "Install OpenClaw CLI to use openclaw cron enable/disable"
                            : `Uses openclaw cron ${job.enabled ? "disable" : "enable"}`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {isToggling && (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 text-muted-foreground" />
                  )}
                  {isRunning && !isToggling && (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" aria-label="Running" />
                  )}
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background ${getStatusColor(status)}`}
                          aria-label={`Status: ${statusLabel}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="font-medium">{statusLabel}</p>
                        {lastError && status === "error" && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lastError}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailJob(job);
                      setDetailOpen(true);
                    }}
                    className="flex-1 min-w-0 text-left rounded-md -m-1 p-1 hover:bg-muted/40 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                    title={job.id ? `${job.name}\nID: ${job.id}\nClick for run history` : job.name}
                  >
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {job.name}
                      {job.runtime && job.runtime !== "openclaw" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-normal shrink-0">
                          {job.runtime}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {job.schedule?.expr || "—"}
                    </div>
                  </button>
                  <span
                    className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0 flex items-center gap-1"
                    title={lastRunMs ? new Date(lastRunMs).toLocaleString() : "Last run unknown"}
                  >
                    Last {lastRunStr}
                  </span>
                  <span
                    className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0 flex items-center gap-1"
                    title={nextRun ? nextRun.toLocaleString() : undefined}
                  >
                    <CalendarClock className="w-3.5 h-3.5 opacity-60" />
                    {nextRunStr}
                  </span>
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium shrink-0 border border-border/40 ${palette.bgSoft} text-foreground`}
                  >
                    {agent}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailJob(job);
                      setDetailOpen(true);
                    }}
                    className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                    aria-label="View run history"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
      <CronJobDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        job={detailJob}
      />
    </ScrollArea>
  );
}
