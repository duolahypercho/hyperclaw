import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Rocket, Building2, Bot, Monitor, Check, RotateCcw, CircleDashed, CheckCircle2, XCircle, SkipForward, Loader2 } from "lucide-react";
const EASE = [0.16, 1, 0.3, 1] as const;

export interface LaunchProgressItem {
  key: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface GuidedStep4Props {
  companyName: string;
  agentName: string;
  runtime?: string;
  provider?: string;
  isLaunching?: boolean;
  error?: string | null;
  progressItems?: LaunchProgressItem[];
  onBack: () => void;
  onComplete: () => void;
  onRetry?: () => void;
}

/* ─── Status icon for each progress row ─────────────────────────────────── */

function StepIcon({ status }: { status: LaunchProgressItem["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
    case "running":
      return (
        <Loader2 className="w-4 h-4 text-sky-500 dark:text-sky-400 animate-spin" />
      );
    case "skipped":
      return <SkipForward className="w-3.5 h-3.5 text-foreground/30" />;
    default:
      return <CircleDashed className="w-4 h-4 text-foreground/25" />;
  }
}

/* ─── Self-resetting elapsed timer (mounts when step goes running) ───────── */

function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="text-[10px] text-foreground/25 tabular-nums ml-1.5">
      {m > 0 ? `${m}m ${s}s` : `${s}s`}
    </span>
  );
}

/* ─── The "Ready to launch" confirmation screen ─────────────────────────── */

function ConfirmationView({
  summaryItems,
  isLaunching,
  onBack,
  onComplete,
}: {
  summaryItems: { icon: React.ElementType; label: string; value: string }[];
  isLaunching: boolean;
  onBack: () => void;
  onComplete: () => void;
}) {
  return (
    <motion.div
      key="confirmation"
      className="h-full flex flex-col text-center"
      initial={{ opacity: 0, x: 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.3, ease: EASE } }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden customScrollbar2 pr-1">
        <div className="space-y-8">
          <motion.div className="space-y-3" variants={fadeUp}>
            <h1 className="text-[28px] font-medium text-foreground tracking-tight">
              Ready to launch
            </h1>
            <p className="text-foreground/40 text-[15px]">
              Here&apos;s what we set up for you.
            </p>
          </motion.div>

          <div className="space-y-2 max-w-sm mx-auto">
            {summaryItems.map((item, i) => (
              <motion.div
                key={item.label}
                className="flex items-center gap-3.5 bg-foreground/[0.04] rounded-xl border border-foreground/8 p-3.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.45, ease: EASE }}
              >
                <div className="w-9 h-9 rounded-lg bg-foreground/[0.06] flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-foreground/40" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[11px] uppercase tracking-wider text-foreground/25">{item.label}</div>
                  <div className="text-[14px] font-medium text-foreground/90 mt-0.5">{item.value}</div>
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.12, type: "spring", stiffness: 400, damping: 22 }}
                >
                  <Check className="w-4 h-4 text-foreground/40 shrink-0" />
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <motion.div
        variants={fadeUp}
        className="mt-4 pt-4 border-t border-foreground/8 flex items-center justify-center gap-3"
      >
        <motion.button
          type="button"
          onClick={onBack}
          disabled={isLaunching}
          className="min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium text-foreground/70 bg-foreground/[0.04] hover:bg-foreground/[0.07] border border-foreground/10 hover:border-foreground/20 disabled:bg-foreground/[0.02] disabled:text-foreground/25 disabled:border-foreground/6 disabled:cursor-not-allowed transition-all"
          whileHover={isLaunching ? {} : { y: -1 }}
          whileTap={isLaunching ? {} : { y: 0 }}
        >
          Back
        </motion.button>
        <motion.button
          onClick={onComplete}
          disabled={isLaunching}
          className="min-h-[48px] px-8 py-3 rounded-lg text-sm font-medium text-background bg-foreground hover:bg-foreground/90 disabled:bg-foreground/[0.08] disabled:text-foreground/35 disabled:border-foreground/6 disabled:hover:bg-foreground/[0.08] border border-foreground/10 transition-colors flex items-center gap-2"
          whileHover={isLaunching ? {} : { y: -1 }}
          whileTap={isLaunching ? {} : { y: 0 }}
          autoFocus
        >
          <Rocket className="w-4 h-4" />
          Launch Company
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

/* ─── The launch-in-progress screen ─────────────────────────────────────── */

function LaunchingView({
  companyName,
  progressItems,
  error,
  onRetry,
}: {
  companyName: string;
  progressItems: LaunchProgressItem[];
  error: string | null;
  onRetry?: () => void;
}) {
  const completedCount = progressItems.filter((i) => i.status === "completed" || i.status === "skipped").length;
  const totalCount = progressItems.length;
  const allDone = completedCount === totalCount && totalCount > 0;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <motion.div
      key="launching"
      className="h-full flex flex-col"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } }}
      exit={{ opacity: 0, x: 40 }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden customScrollbar2 pr-1">
        <div className="space-y-7">

          {/* Header */}
          <div className="text-center space-y-3">
            <div>
              <h1 className="text-[24px] font-medium text-foreground tracking-tight">
                {error
                  ? "Something went wrong"
                  : allDone
                    ? "You\u2019re all set!"
                    : `Launching ${companyName || "your company"}\u2026`}
              </h1>
              <p className="text-foreground/35 text-[13px] mt-1.5">
                {error
                  ? "One of the setup steps failed. You can retry from where it left off."
                  : allDone
                    ? "Everything is installed and configured."
                    : `Step ${Math.min(completedCount + 1, totalCount)} of ${totalCount}`}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="max-w-sm mx-auto">
            <div className="h-1 rounded-full bg-foreground/[0.12] overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${error ? "bg-red-500/80 dark:bg-red-400/60" : allDone ? "bg-emerald-500/80 dark:bg-emerald-400/70" : "bg-sky-500/80 dark:bg-sky-400/60"}`}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </div>
          </div>

          {/* Step list */}
          <div className="max-w-sm mx-auto space-y-1">
            {progressItems.map((item, i) => {
              const isActive = item.status === "running";
              const isDone = item.status === "completed";
              const isFailed = item.status === "failed";

              return (
                <motion.div
                  key={item.key}
                  className={`
                    rounded-xl px-3.5 py-3 transition-colors duration-300
                    ${isActive ? "bg-foreground/[0.05] border border-sky-500/25 dark:border-sky-400/15" : "border border-transparent"}
                    ${isFailed ? "bg-red-500/[0.08] dark:bg-red-500/[0.06] border border-red-500/25 dark:border-red-400/15" : ""}
                  `}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.35, ease: EASE }}
                >
                  <div className="flex items-center gap-3">
                    <StepIcon status={item.status} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13px] font-medium ${isDone ? "text-foreground/50" : isFailed ? "text-red-600 dark:text-red-300/90" : isActive ? "text-foreground/90" : "text-foreground/30"}`}>
                        {item.label}
                      </div>
                    </div>
                    {isActive && <ElapsedTimer key={item.key} />}
                  </div>
                  {item.detail && (
                    <div
                      className={`pl-7 pt-1 text-[11px] ${isFailed ? "text-red-600/70 dark:text-red-300/60" : "text-foreground/40"}`}
                    >
                      {item.detail}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error + retry — pinned below the scroll area so it's always visible */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="mt-4 pt-4 border-t border-foreground/8 flex flex-col items-center gap-3 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            <p className="text-[13px] text-red-600/80 dark:text-red-300/70">{error}</p>
            {onRetry && (
              <motion.button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-foreground bg-foreground/[0.06] hover:bg-foreground/[0.10] border border-foreground/10 hover:border-foreground/20 transition-all"
                whileHover={{ y: -1 }}
                whileTap={{ y: 0 }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Try again
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default function GuidedStep4({
  companyName,
  agentName,
  runtime,
  provider,
  isLaunching = false,
  error = null,
  progressItems = [],
  onBack,
  onComplete,
  onRetry,
}: GuidedStep4Props) {
  const hasLaunched = isLaunching || progressItems.length > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !hasLaunched) onComplete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasLaunched, onComplete]);

  const summaryItems = useMemo(() => [
    { icon: Building2, label: "Company", value: companyName },
    { icon: Bot, label: "Agent", value: agentName },
    { icon: Rocket, label: "Runtime", value: runtime || "Not selected" },
    { icon: Monitor, label: "Provider", value: provider || "Not configured" },
  ], [companyName, agentName, runtime, provider]);

  return (
    <AnimatePresence mode="wait">
      {hasLaunched ? (
        <LaunchingView
          companyName={companyName}
          progressItems={progressItems}
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <ConfirmationView
          summaryItems={summaryItems}
          isLaunching={isLaunching}
          onBack={onBack}
          onComplete={onComplete}
        />
      )}
    </AnimatePresence>
  );
}
