"use client";

import React from "react";
import { InteractApp } from "@OS/InteractApp";
import type { AppSchema } from "@OS/Layout/types";
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
      <UsageChart />
    </InteractApp>
  );
}
