"use client";

import React from "react";
import { formatDistanceToNow } from "date-fns";
import { getAgent } from "../agents";

interface ActivityRowProps {
  ts?: number;
  agentId?: string;
  message?: string;
  meta?: React.ReactNode;
}

function relTime(ts: number | undefined): string {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: false });
  } catch {
    return "—";
  }
}

export function ActivityRow({ ts, agentId, message, meta }: ActivityRowProps) {
  const agent = getAgent(agentId || "");
  return (
    <div className="ens-row">
      <div className="when">{relTime(ts)}</div>
      <div className="min-w-0">
        <div className="who truncate">
          {agent && <b className="mr-1">{agent.name}</b>}
          {message || "activity"}
        </div>
      </div>
      <div className="meta">{meta || ""}</div>
    </div>
  );
}
