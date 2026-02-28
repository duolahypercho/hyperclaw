"use client";

import React from "react";
import { InteractApp } from "@OS/InteractApp";
import type { AppSchema } from "@OS/Layout/types";
import UsageFilters from "./components/UsageFilters";
import UsageChart from "./components/UsageChart";

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

export default function Usage() {
  return (
    <InteractApp appSchema={appSchema} className="p-4">
      <section className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Usage</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          See where tokens go, when sessions spike, and what drives cost.
        </p>
      </section>
      <UsageFilters />
      <div className="mt-4">
        <UsageChart />
      </div>
    </InteractApp>
  );
}
