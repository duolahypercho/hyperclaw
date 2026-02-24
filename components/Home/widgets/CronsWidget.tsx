import React, { memo, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Clock,
  RefreshCw,
  ExternalLink,
  Loader2,
  Server,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCrons } from "$/components/Tool/Crons/provider/cronsProvider";
import { CronsProvider } from "$/components/Tool/Crons/provider/cronsProvider";
import { useOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";
import { formatDistanceToNow, format } from "date-fns";
import {
  getJobNextRunDate,
  getJobPalette,
  getStatusColor,
  formatDurationMs,
} from "$/components/Tool/Crons/utils";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunRecord } from "$/types/electron";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const CronsCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { jobsForList, loading, bridgeLoading, refresh } = useCrons();
  const { toolAbstracts } = useOS();

  const cronsTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "crons"),
    [toolAbstracts]
  );

  const isLoading = loading || bridgeLoading;

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary">
          {cronsTool?.icon || <Clock className="w-3.5 h-3.5" />}
        </div>
        <h3 className="text-xs font-normal text-foreground truncate">
          {widget.title}
        </h3>
        {!isLoading && jobsForList.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {jobsForList.length} job{jobsForList.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
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

/** Dialog showing run history (logs) for a single job, same style as Tool/Crons. */
function JobLogsDialog({
  job,
  runs,
  open,
  onOpenChange,
}: {
  job: OpenClawCronJobJson | null;
  runs: CronRunRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!job) return null;
  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.runAtMs - a.runAtMs),
    [runs]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden flex flex-col gap-4 p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base font-semibold pr-8 truncate">
            {job.name}
          </DialogTitle>
          <DialogDescription>
            Run history · {sortedRuns.length} run{sortedRuns.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
          <div className="space-y-3 pb-4 min-w-0">
            {sortedRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No runs recorded yet
              </p>
            ) : (
              sortedRuns.map((run, idx) => (
                <div
                  key={`${run.runAtMs}-${idx}`}
                  className={cn(
                    "rounded-lg border border-solid p-3 text-sm min-w-0 overflow-hidden",
                    run.status === "ok"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-destructive/30 bg-destructive/5"
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {run.status === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="text-xs font-normal tabular-nums">
                      {format(new Date(run.runAtMs), "h:mm:ss a, MMM d")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {formatDistanceToNow(new Date(run.runAtMs), { addSuffix: true })}
                    </span>
                    {run.durationMs != null && (
                      <span className="text-xs text-muted-foreground">
                        · Runtime: {formatDurationMs(run.durationMs)}
                      </span>
                    )}
                  </div>
                  {run.summary && (
                    <div className="my-2 min-w-0 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Summary
                      </p>
                      <div className="text-foreground rounded-md bg-muted/40 p-2 text-sm leading-relaxed prose prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0 max-w-full overflow-x-auto break-words [&>*]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-all">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {run.summary}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {run.status === "error" && run.error && (
                    <div className="min-w-0 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wider text-destructive/80 mb-1">
                        Error
                      </p>
                      <div className="text-destructive/90 rounded-md bg-destructive/10 p-2 text-sm leading-relaxed prose prose-invert prose-p:my-1 max-w-full overflow-x-auto break-words [&>*]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-all">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {run.error}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CronsWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const {
    jobsForList,
    parsedCronJobs,
    runsByJobId,
    loading,
    bridgeLoading,
    showEmptyState,
    fetchBridgeCrons,
    bridgeOnly,
  } = useCrons();

  const [selectedJob, setSelectedJob] = useState<OpenClawCronJobJson | null>(null);

  const sortedJobs = useMemo(() => {
    return [...jobsForList].sort((a, b) => {
      const runsA = runsByJobId[a.id];
      const runsB = runsByJobId[b.id];
      const lastA = runsA?.length ? Math.max(...runsA.map((r) => r.runAtMs)) : 0;
      const lastB = runsB?.length ? Math.max(...runsB.map((r) => r.runAtMs)) : 0;
      return lastB - lastA;
    });
  }, [jobsForList, runsByJobId]);

  const handleJobClick = useCallback((job: OpenClawCronJobJson) => {
    setSelectedJob(job);
  }, []);

  const isLoading = loading || bridgeLoading;

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
          "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all shadow-sm duration-300 rounded-md",
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
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={fetchBridgeCrons}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
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
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-1 pr-2">
                  {sortedJobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No cron jobs
                    </p>
                  ) : (
                    sortedJobs.slice(0, 12).map((job, i) => {
                      const nextRun = getJobNextRunDate(job, parsedCronJobs);
                      const nextRunStr = nextRun
                        ? formatDistanceToNow(nextRun, { addSuffix: true })
                        : "—";
                      const status = job.state?.lastStatus ?? "idle";
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
                            !job.enabled && "opacity-50"
                          )}
                        >
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              getStatusColor(status)
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-normal text-foreground truncate">
                              {job.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {nextRunStr}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              <JobLogsDialog
                job={selectedJob}
                runs={selectedJob ? runsByJobId[selectedJob.id] ?? [] : []}
                open={!!selectedJob}
                onOpenChange={(open) => !open && setSelectedJob(null)}
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
