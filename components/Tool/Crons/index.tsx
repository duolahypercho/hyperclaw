"use client";

import React from "react";
import { motion } from "framer-motion";
import { Clock, Loader2 } from "lucide-react";
import { OpenClawSetupPrompt } from "$/components/shared/OpenClawSetupPrompt";
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
  const { fetchBridgeCrons, bridgeLoading, bridgeError } = useCrons();

  return (
    <div className="flex items-center justify-center h-full min-h-[320px] p-8">
      <OpenClawSetupPrompt
        icon={<Clock className="w-8 h-8 text-primary" />}
        title="Connect OpenClaw"
        description="Schedule and manage recurring tasks with OpenClaw’s cron system. Create automated workflows that run on your schedule."
        error={bridgeError}
        onRetry={fetchBridgeCrons}
        retrying={bridgeLoading}
        size="lg"
      />
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
