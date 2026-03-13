"use client";

import React from "react";
import { InteractApp } from "@OS/InteractApp";
import type { AppSchema } from "@OS/Layout/types";
import UsageFilters from "./components/UsageFilters";
import UsageChart from "./components/UsageChart";
import UsageInsights from "./components/UsageInsights";
import ActivityMosaic from "./components/ActivityMosaic";
import SessionsList from "./components/SessionsList";
import SessionDetail from "./components/SessionDetail";
import { useUsage } from "./provider/usageProvider";

const appSchema: AppSchema = {
  header: {
    title: "Gateway Usage & Cost",
    centerUI: {
      type: "breadcrumbs",
      breadcrumbs: [{ label: "OpenClaw gateway" }],
      className: "text-base font-semibold text-foreground",
    },
  },
  sidebar: undefined,
};

function UsageContent() {
  const ctx = useUsage();
  const hasSessionSelected = ctx.selectedSessions.length === 1;

  return (
    <>
      <section className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Usage</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          See where tokens go, when sessions spike, and what drives cost.
        </p>
      </section>
      <UsageFilters />
      <div className="mt-4 space-y-4">
        <UsageChart />
        <ActivityMosaic />
        <UsageInsights />
        <div className={hasSessionSelected ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : ""}>
          <SessionsList />
          {hasSessionSelected && <SessionDetail />}
        </div>
      </div>
    </>
  );
}

export default function Usage() {
  return (
    <InteractApp appSchema={appSchema} className="p-4">
      <UsageContent />
    </InteractApp>
  );
}
