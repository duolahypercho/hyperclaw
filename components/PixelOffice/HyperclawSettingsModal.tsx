"use client";

import React, { useState, useRef, useEffect } from "react";
import type { OfficeLayout } from "./office/types";
import { isSoundEnabled, setSoundEnabled } from "./notificationSound";
import { LAYOUT_PRESETS, getPresetById } from "./layoutPresets";
import { deserializeLayout } from "./office/layout/layoutSerializer";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

const PRESET_STATE_KEY = "office-preset-id";
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
  /** If provided, called before replacing layout (preset/import). Return false to cancel. */
  confirmBeforeReplaceLayout?: () => boolean | Promise<boolean>;
  /** Restore the layout that was replaced by the last preset/import. */
  onRestorePrevious?: () => void;
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
  confirmBeforeReplaceLayout,
  onRestorePrevious,
  agentCount = 2,
}: HyperclawSettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [soundLocal, setSoundLocal] = useState(loadSoundPreference());
  const [presetId, setPresetId] = useState<string>(LAYOUT_PRESETS[0].id);

  useEffect(() => {
    if (!isOpen) return;
    bridgeInvoke("get-app-state", { keys: [PRESET_STATE_KEY] })
      .then((res: any) => {
        const id = res?.data?.[PRESET_STATE_KEY];
        if (id) setPresetId(id);
      })
      .catch(() => {});
  }, [isOpen]);
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
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const layout = deserializeLayout(text);
        if (layout) {
          const ok = confirmBeforeReplaceLayout ? await Promise.resolve(confirmBeforeReplaceLayout()) : true;
          if (!ok) return;
          onApplyLayout(layout);
          onClose();
        }
      } catch {
        // ignore
      }
    };
    reader.readAsText(file);
  };

  const handlePresetChange = async (id: string) => {
    const layout = getPresetById(id);
    if (!layout) return;
    const ok = confirmBeforeReplaceLayout ? await Promise.resolve(confirmBeforeReplaceLayout()) : true;
    if (!ok) return;
    setPresetId(id);
    onApplyLayout(layout);
    bridgeInvoke("save-app-state", { entries: { [PRESET_STATE_KEY]: id } }).catch(() => {});
    onClose();
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
          {onRestorePrevious && (
            <button
              type="button"
              onClick={() => {
                onRestorePrevious();
                onClose();
              }}
              style={{ ...menuItemBase, marginBottom: 8, width: "100%" }}
            >
              Restore previous layout
            </button>
          )}
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
