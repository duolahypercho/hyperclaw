import React, { memo, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Clock,
  Plus,
  RefreshCw,
  ExternalLink,
  Loader2,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCrons } from "$/components/Tool/Crons/provider/cronsProvider";
import { CronsProvider } from "$/components/Tool/Crons/provider/cronsProvider";
import { CronJobDetailDialog } from "$/components/Tool/Crons/CronJobDetailDialog";
import { useOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";
import { formatDistanceToNow } from "date-fns";
import {
  getJobNextRunDate,
  getJobPalette,
  getStatusColor,
} from "$/components/Tool/Crons/utils";
import type { OpenClawCronJobJson } from "$/types/electron";

export const CronsCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { jobsForList, bridgeLoading, refresh, openAddCron } = useCrons();
  const { toolAbstracts } = useOS();

  const cronsTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "crons"),
    [toolAbstracts]
  );

  const isLoading = bridgeLoading && jobsForList.length === 0;

  return (
    <div className={cn("flex items-center justify-between gap-2 px-3 py-2 min-h-0 transition-opacity duration-200", !isEditMode && "absolute top-0 left-0 right-0 z-10 bg-card/90 backdrop-blur-sm rounded-t-md opacity-0 group-hover:opacity-100")}>
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex shrink-0 items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary shrink-0">
          {cronsTool?.icon || <Clock className="w-3.5 h-3.5" />}
        </div>
        <h3
          className="text-xs font-normal text-foreground truncate min-w-0"
          title={widget.title}
        >
          {widget.title}
        </h3>
        {!isLoading && jobsForList.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {jobsForList.length} job{jobsForList.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6 text-primary"
          onClick={openAddCron}
          title="Add cron job"
        >
          <Plus className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => refresh()}
          disabled={isLoading}
          title="Refresh"
        >
          <RefreshCw
            className={cn("w-3 h-3", isLoading && "animate-spin")}
          />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => window.open("/Tool/Crons", "_blank")}
          title="Open Crons"
        >
          <ExternalLink className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onMaximize}
          className="h-6 w-6"
        >
          {isMaximized ? (
            <Minimize2 className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
};

const CronsWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const {
    jobsForList,
    parsedCronJobs,
    bridgeLoading,
    bridgeError,
    showEmptyState,
    refresh,
    bridgeOnly,
    runningJobIds,
  } = useCrons();

  const [selectedJob, setSelectedJob] = useState<OpenClawCronJobJson | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Running jobs first, then sort the rest by last run (most recent first)
  const sortedJobs = useMemo(() => {
    const running: OpenClawCronJobJson[] = [];
    const rest: OpenClawCronJobJson[] = [];
    for (const j of jobsForList) {
      if (runningJobIds.includes(j.id)) running.push(j);
      else rest.push(j);
    }
    rest.sort((a, b) => {
      const aMs = a.state?.lastRunAtMs ?? 0;
      const bMs = b.state?.lastRunAtMs ?? 0;
      return bMs - aMs; // descending: most recent last run first
    });
    return [...running, ...rest];
  }, [jobsForList, runningJobIds]);

  const handleJobClick = useCallback((job: OpenClawCronJobJson) => {
    setSelectedJob(job);
    setDetailOpen(true);
  }, []);

  const isLoading = bridgeLoading && jobsForList.length === 0;

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <CronsCustomHeader {...props} />

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-2 pb-2">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading crons...
              </span>
            </div>
          ) : showEmptyState ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <Clock className="w-8 h-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                OpenClaw not found or no crons.
              </p>
              {bridgeError && (
                <p className="text-xs text-destructive mb-3 max-w-[240px]">
                  {bridgeError}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => refresh()}
                disabled={bridgeLoading}
              >
                {bridgeLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {bridgeLoading ? "Retrying…" : "Retry"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs mt-2 gap-1.5"
                onClick={() => window.open("/Tool/Crons", "_blank")}
              >
                <ExternalLink className="w-3 h-3" />
                Open Crons
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2">
                <div className="space-y-1">
                  {sortedJobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No cron jobs
                    </p>
                  ) : (
                    sortedJobs.map((job, i) => {
                      const nextRun = getJobNextRunDate(job, parsedCronJobs);
                      const nextRunStr = nextRun
                        ? formatDistanceToNow(nextRun, { addSuffix: true })
                        : "—";
                      const lastRunMs = job.state?.lastRunAtMs;
                      const lastRunStr = lastRunMs
                        ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true })
                        : "—";
                      const isRunning = runningJobIds.includes(job.id);
                      const status = isRunning ? "running" : (job.state?.lastStatus ?? "idle");
                      const palette = getJobPalette(job.id);

                      return (
                        <motion.div
                          key={job.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleJobClick(job)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleJobClick(job);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md border-l-2 transition-colors cursor-pointer",
                            palette.border,
                            "hover:bg-muted/20",
                            !job.enabled && "opacity-50",
                            isRunning && "bg-primary/5"
                          )}
                        >
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0 relative z-50",
                              isRunning ? "bg-amber-500" : getStatusColor(status)
                            )}
                          />
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" />
                          ) : null}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p
                              className="text-xs font-normal text-foreground truncate min-w-0"
                              title={job.name}
                            >
                              {job.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {isRunning
                                ? "In progress…"
                                : `Next ${nextRunStr} · Last ${lastRunStr}`}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
              <CronJobDetailDialog
                job={selectedJob}
                open={detailOpen}
                onOpenChange={(open) => {
                  setDetailOpen(open);
                  if (!open) setSelectedJob(null);
                }}
              />
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

CronsWidgetContent.displayName = "CronsWidgetContent";

const CronsWidget = memo((props: CustomProps) => {
  return (
    <CronsProvider>
      <CronsWidgetContent {...props} />
    </CronsProvider>
  );
});

CronsWidget.displayName = "CronsWidget";

export default CronsWidget;
