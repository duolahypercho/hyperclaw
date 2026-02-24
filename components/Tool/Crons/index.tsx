"use client";

import React from "react";
import { motion } from "framer-motion";
import { Clock, Loader2, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import { InteractApp } from "@OS/InteractApp";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import { useCrons } from "./provider/cronsProvider";
import { MonthlyView } from "./views/MonthlyView";
import { WeeklyView } from "./views/WeeklyView";
import { AllJobsView } from "./views/AllJobsView";

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

function CronsEmptyState() {
  const router = useRouter();
  const { fetchBridgeCrons, bridgeLoading } = useCrons();

  return (
    <div className="flex items-center justify-center h-full p-8">
      <motion.div {...fadeUp} className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">OpenClaw Not Found</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          OpenClaw CLI is not installed or not in your PATH. Install it to manage cron jobs, or ensure the Hyperclaw bridge is running to view crons from this app.
        </p>
        <Button variant="outline" size="sm" onClick={fetchBridgeCrons} disabled={bridgeLoading} className="gap-1.5">
          {bridgeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Retry bridge
        </Button>
        <pre className="text-xs font-mono bg-background/60 border border-border/50 rounded-lg p-3 text-left text-muted-foreground">
          curl -fsSL https://openclaw.ai/install.sh | bash
        </pre>
        <Button variant="secondary" size="sm" onClick={() => router.push("/")} className="gap-1.5 mt-2">
          <Home className="w-3.5 h-3.5" />
          Back to home
        </Button>
      </motion.div>
    </div>
  );
}

function CronsContent() {
  const { appSchema, showEmptyState } = useCrons();

  if (showEmptyState) {
    return <CronsEmptyState />;
  }

  return (
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
  );
}

export default function Crons() {
  return (
    <CronsContent />
  );
}
