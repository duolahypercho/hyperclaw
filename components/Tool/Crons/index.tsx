"use client";

import React from "react";
import { motion } from "framer-motion";
import { Clock, Loader2, Home, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import { InteractApp } from "@OS/InteractApp";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import { useCrons } from "./provider/cronsProvider";
import { MonthlyView } from "./views/MonthlyView";
import { WeeklyView } from "./views/WeeklyView";
import { AllJobsView } from "./views/AllJobsView";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: "easeOut" },
};

function CronsLoadingGate() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[280px] gap-4 p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
        <p className="text-sm font-medium text-foreground">Loading cron jobs</p>
        <p className="text-xs text-muted-foreground max-w-xs text-center">
          Checking OpenClaw and fetching schedules…
        </p>
      </motion.div>
    </div>
  );
}

function CronsEmptyState() {
  const router = useRouter();
  const { fetchBridgeCrons, bridgeLoading } = useCrons();

  return (
    <div className="flex items-center justify-center h-full min-h-[320px] p-8">
      <motion.div
        {...fadeUp}
        className="max-w-md w-full text-center space-y-6"
      >
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto ring-1 ring-border/50">
          <Clock className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            No cron jobs available
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            OpenClaw CLI isn’t installed or not in your PATH. Install it to create and manage cron jobs, or use the Hyperclaw bridge to view jobs from another instance.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBridgeCrons}
            disabled={bridgeLoading}
            className="gap-2"
          >
            {bridgeLoading ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0" />
            )}
            {bridgeLoading ? "Checking bridge…" : "Try bridge"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/")}
            className="gap-2"
          >
            <Home className="w-4 h-4 shrink-0" />
            Back to home
          </Button>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            Install OpenClaw
          </p>
          <pre className="text-xs font-mono text-foreground/90 overflow-x-auto">
            curl -fsSL https://openclaw.ai/install.sh | bash
          </pre>
        </div>
      </motion.div>
    </div>
  );
}

function CronsContent() {
  const {
    appSchema,
    showEmptyState,
    bridgeLoading,
    errors,
    jobsForList,
  } = useCrons();

  // Only wait for the bridge (get-crons = one file read). Don't block on useOpenClaw at all.
  const initialLoading = bridgeLoading && jobsForList.length === 0;

  if (initialLoading) {
    return <CronsLoadingGate />;
  }

  if (showEmptyState) {
    return <CronsEmptyState />;
  }

  const hasError = errors?.cron || errors?.status;

  return (
    <div className="flex flex-col h-full">
      {hasError && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="shrink-0 px-4 pt-3"
        >
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
          >
            <p className="text-sm font-medium text-destructive">Couldn’t load some data</p>
            <p className="text-xs text-destructive/90 mt-0.5">
              {[errors.cron, errors.status].filter(Boolean).join(" · ")}
            </p>
          </div>
        </motion.div>
      )}
      <div className="flex-1 min-h-0">
        <InteractApp appSchema={appSchema} className="p-0">
          <InteractContent value="weekly">
            <WeeklyView />
          </InteractContent>
          <InteractContent value="monthly">
            <MonthlyView />
          </InteractContent>
          <InteractContent value="all">
            <AllJobsView />
          </InteractContent>
        </InteractApp>
      </div>
    </div>
  );
}

export default function Crons() {
  return (
    <CronsContent />
  );
}
