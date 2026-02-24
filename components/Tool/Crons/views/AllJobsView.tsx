"use client";

import React from "react";
import { motion } from "framer-motion";
import { Loader2, Server } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCrons } from "../provider/cronsProvider";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getJobNextRunDate, getJobPalette, getStatusColor } from "../utils";

export function AllJobsView() {
  const {
    jobsForList,
    parsedCronJobs,
    loading,
    bridgeOnly,
    bridgeLoading,
    handleToggleEnabled,
    togglingId,
  } = useCrons();

  if (loading || bridgeLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-3">
        {bridgeOnly && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm"
          >
            <Server className="w-4 h-4 text-sky-500 shrink-0" />
            <span className="text-foreground/80">
              Showing crons from Hyperclaw Bridge. Install OpenClaw CLI to
              enable or disable jobs.
            </span>
          </motion.div>
        )}

        <p className="text-[11px] text-muted-foreground/50">
          {jobsForList.length} job{jobsForList.length !== 1 ? "s" : ""}
        </p>

        <div className="space-y-1">
          {jobsForList.map((job, i) => {
            const nextRun = getJobNextRunDate(job, parsedCronJobs);
            const nextRunStr = nextRun
              ? formatDistanceToNow(nextRun, { addSuffix: true })
              : "—";
            const status = job.state?.lastStatus ?? "idle";
            const agent = job.agentId ?? "main";
            const isToggling = togglingId === job.id;
            const palette = getJobPalette(job.id);

            return (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-[3px]
                  ${palette.border}
                  hover:bg-muted/20 transition-colors
                  ${!job.enabled ? "opacity-40" : ""}
                `}
              >
                <Switch
                  checked={job.enabled}
                  onCheckedChange={() => handleToggleEnabled(job)}
                  disabled={isToggling || bridgeOnly}
                  className="shrink-0"
                />
                {isToggling && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-muted-foreground" />
                )}
                <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(status)}`} />
                <div className="flex-1 min-w-0" title={`${job.name}${job.id ? `\nID: ${job.id}` : ""}`}>
                  <div className="text-sm font-medium truncate">{job.name}</div>
                  <div className="text-[10px] text-muted-foreground/50 truncate">
                    {job.schedule?.expr || "—"}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
                  {nextRunStr}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${palette.bg} ${palette.text}`}
                >
                  {agent}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
