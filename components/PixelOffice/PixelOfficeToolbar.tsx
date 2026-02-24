"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { HyperclawSettingsModal } from "./HyperclawSettingsModal";
import type { OfficeLayout } from "./office/types";

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 10,
  zIndex: "var(--pixel-controls-z)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  background: "var(--pixel-bg)",
  border: "2px solid var(--pixel-border)",
  borderRadius: 0,
  padding: "4px 6px",
  boxShadow: "var(--pixel-shadow)",
};

const btnBase: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: "24px",
  color: "var(--pixel-text)",
  background: "var(--pixel-btn-bg)",
  border: "2px solid transparent",
  borderRadius: 0,
  cursor: "pointer",
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "var(--pixel-active-bg)",
  border: "2px solid var(--pixel-accent)",
};

interface PixelOfficeToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  getLayout: () => OfficeLayout;
  onApplyLayout: (layout: OfficeLayout) => void;
  /** Used by Cozy Office preset (one room per agent). */
  agentCount?: number;
}

export function PixelOfficeToolbar({
  isEditMode,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  getLayout,
  onApplyLayout,
  agentCount = 2,
}: PixelOfficeToolbarProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div style={panelStyle}>
      <button
        onClick={() => router.push("/Tool/OpenClaw")}
        onMouseEnter={() => setHovered("agent")}
        onMouseLeave={() => setHovered(null)}
        style={{
          ...btnBase,
          padding: "5px 12px",
          background:
            hovered === "agent"
              ? "var(--pixel-agent-hover-bg)"
              : "var(--pixel-agent-bg)",
          border: "2px solid var(--pixel-agent-border)",
          color: "var(--pixel-agent-text)",
        }}
        title="Open OpenClaw to manage team and agents"
      >
        + Agent
      </button>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered("edit")}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background:
                  hovered === "edit" ? "var(--pixel-btn-hover-bg)" : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered("settings")}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background:
                    hovered === "settings"
                      ? "var(--pixel-btn-hover-bg)"
                      : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <HyperclawSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
          getLayout={getLayout}
          onApplyLayout={onApplyLayout}
          agentCount={agentCount}
        />
      </div>
    </div>
  );
}
