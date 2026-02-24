"use client";

import React from "react";
import type { AgentInfo } from "./useHyperclawOffice";

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 45,
  minWidth: 220,
  maxWidth: 280,
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
  fontSize: "16px",
  color: "#fff",
  marginBottom: 4,
  lineHeight: 1.35,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255, 255, 255, 0.7)",
  marginRight: 6,
};

interface AgentInfoPanelProps {
  agent: AgentInfo | null;
  onClose: () => void;
}

export function AgentInfoPanel({ agent, onClose }: AgentInfoPanelProps) {
  if (!agent) return null;

  const displayName = agent.name || agent.id;

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
      {agent.currentTask != null && agent.currentTask !== "" && (
        <div style={rowStyle}>
          <span style={labelStyle}>Task:</span>
          <span style={{ color: "#fff" }}>{agent.currentTask}</span>
        </div>
      )}
      <div style={{ ...rowStyle, marginBottom: 0, marginTop: 4, fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>
        ID: {agent.id}
      </div>
    </div>
  );
}
