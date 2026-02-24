"use client";

import React, { useState, useRef } from "react";
import type { OfficeLayout } from "./office/types";
import { isSoundEnabled, setSoundEnabled } from "./notificationSound";
import { LAYOUT_PRESETS, getPresetById, createCozyOfficeLayout } from "./layoutPresets";
import { deserializeLayout } from "./office/layout/layoutSerializer";

const LAYOUT_STORAGE_KEY = "pixel-office-layout";
const PRESET_STORAGE_KEY = "pixel-office-preset";
const SOUND_STORAGE_KEY = "pixel-office-sound";

const menuItemBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "6px 10px",
  fontSize: "22px",
  color: "rgba(255, 255, 255, 0.8)",
  background: "transparent",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  textAlign: "left",
};

export function loadSoundPreference(): boolean {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(SOUND_STORAGE_KEY);
  return v === null ? true : v === "1";
}

export function saveSoundPreference(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "1" : "0");
  } catch {}
}

interface HyperclawSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  getLayout: () => OfficeLayout;
  onApplyLayout: (layout: OfficeLayout) => void;
  /** Used to size Cozy Office (one room per agent). */
  agentCount?: number;
}

export function HyperclawSettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  getLayout,
  onApplyLayout,
  agentCount = 2,
}: HyperclawSettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [soundLocal, setSoundLocal] = useState(loadSoundPreference());
  const [presetId, setPresetId] = useState<string>(() => {
    if (typeof localStorage === "undefined") return LAYOUT_PRESETS[0].id;
    return localStorage.getItem(PRESET_STORAGE_KEY) || LAYOUT_PRESETS[0].id;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = () => {
    const layout = getLayout();
    const blob = new Blob([JSON.stringify(layout, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pixel-office-layout.json";
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const layout = deserializeLayout(text);
        if (layout) {
          onApplyLayout(layout);
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(LAYOUT_STORAGE_KEY, text);
            localStorage.removeItem(PRESET_STORAGE_KEY);
          }
          onClose();
        }
      } catch {
        // ignore
      }
    };
    reader.readAsText(file);
  };

  const handlePresetChange = (id: string) => {
    setPresetId(id);
    const layout =
      id === "cozy"
        ? createCozyOfficeLayout(agentCount)
        : getPresetById(id);
    if (layout) {
      onApplyLayout(layout);
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
        localStorage.setItem(PRESET_STORAGE_KEY, id);
      } catch {}
      onClose();
    }
  };

  const handleSoundToggle = () => {
    const newVal = !isSoundEnabled();
    setSoundEnabled(newVal);
    saveSoundPreference(newVal);
    setSoundLocal(newVal);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 49,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          background: "var(--pixel-bg)",
          border: "2px solid var(--pixel-border)",
          borderRadius: 0,
          padding: "4px",
          boxShadow: "var(--pixel-shadow)",
          minWidth: 260,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 10px",
            borderBottom: "1px solid var(--pixel-border)",
            marginBottom: "4px",
          }}
        >
          <span style={{ fontSize: "24px", color: "rgba(255, 255, 255, 0.9)" }}>
            Settings
          </span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered("close")}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === "close" ? "rgba(255, 255, 255, 0.08)" : "transparent",
              border: "none",
              borderRadius: 0,
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>

        <div style={{ padding: "4px 10px", marginBottom: 4 }}>
          <label
            style={{
              display: "block",
              fontSize: "18px",
              color: "rgba(255, 255, 255, 0.7)",
              marginBottom: 4,
            }}
          >
            Layout preset
          </label>
          <select
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "20px",
              background: "var(--pixel-btn-bg)",
              border: "2px solid var(--pixel-border)",
              borderRadius: 0,
              color: "var(--pixel-text)",
              cursor: "pointer",
            }}
          >
            {LAYOUT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleExport}
          onMouseEnter={() => setHovered("export")}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === "export" ? "rgba(255, 255, 255, 0.08)" : "transparent",
          }}
        >
          Export Layout
        </button>
        <button
          onClick={handleImport}
          onMouseEnter={() => setHovered("import")}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === "import" ? "rgba(255, 255, 255, 0.08)" : "transparent",
          }}
        >
          Import Layout
        </button>
        <button
          onClick={handleSoundToggle}
          onMouseEnter={() => setHovered("sound")}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === "sound" ? "rgba(255, 255, 255, 0.08)" : "transparent",
          }}
        >
          <span>Sound Notifications</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: "2px solid rgba(255, 255, 255, 0.5)",
              borderRadius: 0,
              background: soundLocal ? "rgba(90, 140, 255, 0.8)" : "transparent",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              lineHeight: 1,
              color: "#fff",
            }}
          >
            {soundLocal ? "✓" : ""}
          </span>
        </button>
        <button
          onClick={onToggleDebugMode}
          onMouseEnter={() => setHovered("debug")}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === "debug" ? "rgba(255, 255, 255, 0.08)" : "transparent",
          }}
        >
          <span>Debug View</span>
          {isDebugMode && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "rgba(90, 140, 255, 0.8)",
                flexShrink: 0,
              }}
            />
          )}
        </button>
      </div>
    </>
  );
}
