"use client";

import React from "react";
import { formatDistanceToNow } from "date-fns";
import type { AgentInfo } from "./useHyperclawOffice";

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 45,
  minWidth: 260,
  maxWidth: 320,
  background: "var(--pixel-bg)",
  border: "2px solid var(--pixel-border)",
  borderRadius: 0,
  padding: "10px 12px",
  boxShadow: "var(--pixel-shadow)",
};

const titleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#fff",
  margin: 0,
  border: "none",
  padding: 0,
};

const rowStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#fff",
  marginBottom: 6,
  lineHeight: 1.4,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255, 255, 255, 0.7)",
  marginRight: 6,
  display: "block",
  marginBottom: 2,
};

const taskLineStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "rgba(255, 255, 255, 0.9)",
  marginBottom: 2,
  paddingLeft: 8,
};

const mutedStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "rgba(255, 255, 255, 0.55)",
  marginLeft: 4,
};

interface AgentInfoPanelProps {
  agent: AgentInfo | null;
  onClose: () => void;
}

function formatAgo(ms: number): string {
  return formatDistanceToNow(ms, { addSuffix: true });
}

/** "in 5 minutes" / "in 2 hours" for upcoming tasks. */
function formatUpcoming(ms: number): string {
  const now = Date.now();
  if (ms <= now) return "now";
  return formatDistanceToNow(ms, { addSuffix: true });
}

export function AgentInfoPanel({ agent, onClose }: AgentInfoPanelProps) {
  if (!agent) return null;

  const displayName = agent.name || agent.id;
  const isWorking = agent.status === "working";
  const currentJobs = agent.currentWorkingJobs ?? [];
  const previousTasks = agent.previousTasks ?? [];
  const nextCrons = agent.nextComingCrons ?? [];

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, borderBottom: "1px solid var(--pixel-border)", paddingBottom: 6 }}>
        <span style={titleStyle}>{displayName}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: "20px",
            lineHeight: 1,
            padding: "0 2px",
            opacity: 0.8,
          }}
        >
          ×
        </button>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Status</span>
        <span style={{ color: isWorking ? "var(--pixel-status-active, #22c55e)" : "rgba(255,255,255,0.6)" }}>
          {isWorking ? "Working" : "Idle"}
        </span>
      </div>

      {isWorking && currentJobs.length > 0 && (
        <>
          <span style={labelStyle}>Current task(s)</span>
          {currentJobs.slice(0, 3).map((j) => (
            <div key={j.id} style={taskLineStyle}>
              {j.name}
            </div>
          ))}
        </>
      )}

      {previousTasks.length > 0 && (
        <>
          <span style={{ ...labelStyle, marginTop: 8 }}>Previous tasks</span>
          {previousTasks.slice(0, 3).map((t) => (
            <div key={t.id} style={taskLineStyle}>
              {t.name}
              <span style={mutedStyle}>{formatAgo(t.lastRunAtMs)}</span>
            </div>
          ))}
        </>
      )}

      {!isWorking && nextCrons.length > 0 && (
        <>
          <span style={{ ...labelStyle, marginTop: 8 }}>Upcoming</span>
          {nextCrons.slice(0, 3).map((c) => (
            <div key={c.id} style={taskLineStyle}>
              {c.name}
              <span style={mutedStyle}>
                {c.nextRunAtMs != null ? formatUpcoming(c.nextRunAtMs) : "—"}
              </span>
            </div>
          ))}
        </>
      )}

      <div style={{ ...rowStyle, marginBottom: 0, marginTop: 8, fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
        ID: {agent.id}
      </div>
    </div>
  );
}
