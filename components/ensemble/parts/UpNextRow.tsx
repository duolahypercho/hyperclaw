"use client";

import React from "react";
import { Clock } from "lucide-react";
import type { CronJobParsed } from "../hooks";

interface UpNextRowProps {
  cron: CronJobParsed;
}

export function UpNextRow({ cron }: UpNextRowProps) {
  return (
    <div className="ens-row">
      <div className="when">
        <Clock size={12} style={{ marginRight: 4, display: "inline" }} />
        {cron.nextRun || cron.schedule}
      </div>
      <div className="min-w-0">
        <div className="who truncate" style={{ fontWeight: 500 }}>{cron.name}</div>
        <div className="meta truncate">{cron.schedule}</div>
      </div>
      <div />
    </div>
  );
}
