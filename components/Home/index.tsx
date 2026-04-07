import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Dashboard, Widget } from "./Dashboard";
import {
  LogsWidget,
  KanbanWidget,
  CronsWidget,
  DocsWidget,
  PixelOfficeWidget,
  UsageWidget,
  GatewayChatWidget,
  StatusWidget,
  ChannelDashboardWidget,
  IntelligenceWidget,
  AgentChatPanel,
  AgentChatWidget,
  OPEN_AGENT_PANEL_EVENT,
} from "$/components/Home/widgets";
import { useOS } from "@OS/Provider/OSProv";
import { dashboardState } from "$/lib/dashboard-state";

// ── Layout Preset Definitions ─────────────────────────────
// Each preset defines which widgets are visible and their grid positions.
// All presets use the same 24-col grid with 60px row height.

export type LayoutPresetId = "default" | "focus" | "ops";

export interface LayoutPreset {
  id: LayoutPresetId;
  name: string;
  description: string;
  widgetIds: string[];
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Agents, chat & tasks",
    widgetIds: ["agent-status", "agent-chat", "kanban"],
  },
  {
    id: "focus",
    name: "Focus",
    description: "Full-screen chat with status sidebar",
    widgetIds: ["agent-status", "agent-chat"],
  },
  {
    id: "ops",
    name: "Ops",
    description: "Monitoring, logs, crons & usage",
    widgetIds: ["agent-status", "logs", "crons", "usage"],
  },
];

// Per-preset grid positions (24-col, 60px row height)
const PRESET_POSITIONS: Record<LayoutPresetId, Record<string, { w: number; h: number; x: number; y: number }>> = {
  default: {
    "agent-status":    { w: 6,  h: 10, x: 0,  y: 0 },
    "agent-chat":      { w: 18, h: 10, x: 6,  y: 0 },
    "kanban":          { w: 24, h: 8,  x: 0,  y: 10 },
  },
  focus: {
    "agent-status":    { w: 6,  h: 12, x: 0,  y: 0 },
    "agent-chat":      { w: 18, h: 12, x: 6,  y: 0 },
  },
  ops: {
    "agent-status":    { w: 6,  h: 7,  x: 0,  y: 0 },
    "logs":            { w: 18, h: 7,  x: 6,  y: 0 },
    "crons":           { w: 12, h: 5,  x: 0,  y: 7 },
    "usage":           { w: 12, h: 5,  x: 12, y: 7 },
  },
};

// Min sizes for all widgets
const WIDGET_MIN_SIZES: Record<string, { minW: number; minH: number }> = {
  "agent-status":    { minW: 4, minH: 3 },
  "agent-chat":      { minW: 6, minH: 4 },
  "gateway-chat-1":  { minW: 6, minH: 4 },
  "kanban":          { minW: 8, minH: 6 },
  "logs":            { minW: 6, minH: 3 },
  "usage":           { minW: 6, minH: 3 },
  "crons":           { minW: 6, minH: 3 },
  "docs":            { minW: 4, minH: 3 },
  "pixel-office":    { minW: 4, minH: 3 },
  "intelligence":    { minW: 4, minH: 3 },
};

const ACTIVE_PRESET_KEY = "dashboard-active-preset";

export default function Home() {
  const { toolAbstracts } = useOS();

  // ── Agent Chat Panel state ──
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelAgentId, setPanelAgentId] = useState("main");
  const [panelSessionKey, setPanelSessionKey] = useState<string | undefined>();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const agentId = detail?.agentId as string | undefined;
      if (!agentId) return;
      setPanelAgentId(agentId);
      setPanelSessionKey(detail?.sessionKey as string | undefined);
      setPanelOpen(true);
    };
    window.addEventListener(OPEN_AGENT_PANEL_EVENT, handler);
    return () => window.removeEventListener(OPEN_AGENT_PANEL_EVENT, handler);
  }, []);

  // Active preset — persisted in dashboardState
  const [activePresetId, setActivePresetId] = useState<LayoutPresetId>(() => {
    const saved = dashboardState.get(ACTIVE_PRESET_KEY) as LayoutPresetId | null;
    if (saved && LAYOUT_PRESETS.some((p) => p.id === saved)) return saved;
    return "default";
  });

  // Clear stale saved layout if preset widget IDs changed (e.g. gateway-chat-1 → agent-chat).
  // This ensures the new widget shows up without requiring a manual preset switch.
  useEffect(() => {
    const savedLayout = dashboardState.get("dashboard-layout");
    if (!savedLayout) return;
    try {
      const parsed = JSON.parse(savedLayout);
      const lgLayout: Array<{ i: string }> = parsed?.lg || [];
      const savedIds = new Set(lgLayout.map((item) => item.i));
      const preset = LAYOUT_PRESETS.find((p) => p.id === activePresetId) || LAYOUT_PRESETS[0];
      const hasMissing = preset.widgetIds.some((id) => !savedIds.has(id));
      if (hasMissing) {
        dashboardState.remove("dashboard-layout");
        setResetKey((k) => k + 1);
      }
    } catch { /* ignore corrupt layout */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force Dashboard remount when switching presets
  const [resetKey, setResetKey] = useState(0);

  // Listen for preset switch events from navbar
  useEffect(() => {
    const handler = (e: Event) => {
      const presetId = (e as CustomEvent).detail?.presetId as LayoutPresetId;
      if (!presetId || !LAYOUT_PRESETS.some((p) => p.id === presetId)) return;
      setActivePresetId(presetId);
      dashboardState.set(ACTIVE_PRESET_KEY, presetId);
      // Clear saved layout so the new preset positions take effect
      dashboardState.remove("dashboard-layout");
      setResetKey((k) => k + 1);
    };
    window.addEventListener("dashboard-preset-switch", handler);
    return () => window.removeEventListener("dashboard-preset-switch", handler);
  }, []);

  // Find tool definitions from OSProv
  const todoTool = toolAbstracts.find((t) => t.id === "todo-list");
  const cronsTool = toolAbstracts.find((t) => t.id === "crons");
  const docsTool = toolAbstracts.find((t) => t.id === "docs");
  const pixelOfficeTool = toolAbstracts.find((t) => t.id === "pixel-office");
  const usageTool = toolAbstracts.find((t) => t.id === "usage");
  const intelTool = toolAbstracts.find((t) => t.id === "intelligence");

  // All possible widgets — superset that presets select from
  const allWidgets: Widget[] = useMemo(
    () => [
      {
        id: "agent-status",
        type: "agent-status",
        title: "Agent Status",
        icon: null,
        component: StatusWidget,
        defaultValue: { w: 6, h: 7, minW: 4, minH: 3, x: 0, y: 0 },
      },
      {
        id: "agent-chat",
        type: "agent-chat",
        title: "Agent Chat",
        icon: null,
        component: AgentChatWidget,
        defaultValue: { w: 18, h: 12, minW: 6, minH: 4, x: 6, y: 0 },
      },
      {
        id: "gateway-chat-1",
        type: "gateway-chat",
        title: "Chat",
        icon: null,
        component: GatewayChatWidget,
        defaultValue: { w: 18, h: 12, minW: 6, minH: 4, x: 6, y: 0 },
      },
      {
        id: "kanban",
        type: "kanban",
        title: "Kanban Board",
        icon: todoTool?.icon || null,
        component: KanbanWidget,
        defaultValue: { w: 6, h: 5, minW: 4, minH: 4, x: 0, y: 7 },
      },
      {
        id: "logs",
        type: "logs",
        title: "Logs",
        icon: null,
        component: LogsWidget,
        defaultValue: { w: 12, h: 5, minW: 6, minH: 3, x: 0, y: 12 },
      },
      {
        id: usageTool?.id || "usage",
        type: "usage",
        title: usageTool?.name || "Token Usage",
        icon: usageTool?.icon || null,
        component: UsageWidget,
        defaultValue: { w: 12, h: 5, minW: 6, minH: 3, x: 12, y: 12 },
      },
      {
        id: "crons",
        type: "crons",
        title: "Cron Jobs",
        icon: cronsTool?.icon || null,
        component: CronsWidget,
        defaultValue: { w: 8, h: 5, minW: 6, minH: 3, x: 0, y: 17 },
      },
      {
        id: "docs",
        type: "docs",
        title: "Docs",
        icon: docsTool?.icon || null,
        component: DocsWidget,
        defaultValue: { w: 8, h: 5, minW: 4, minH: 3, x: 8, y: 17 },
      },
      {
        id: pixelOfficeTool?.id || "pixel-office",
        type: "pixel-office",
        title: pixelOfficeTool?.name || "AI Agent Office",
        icon: pixelOfficeTool?.icon || null,
        component: PixelOfficeWidget,
        defaultValue: { w: 8, h: 5, minW: 4, minH: 3, x: 16, y: 17 },
      },
      {
        id: intelTool?.id || "intelligence",
        type: "intelligence",
        title: intelTool?.name || "Intelligence",
        icon: intelTool?.icon || null,
        component: IntelligenceWidget,
        defaultValue: { w: 8, h: 5, minW: 4, minH: 3, x: 0, y: 22 },
      },
    ],
    [todoTool, cronsTool, docsTool, pixelOfficeTool, usageTool, intelTool]
  );

  // Resolve active preset into the widget list with correct positions
  const activePreset = LAYOUT_PRESETS.find((p) => p.id === activePresetId) || LAYOUT_PRESETS[0];
  const positions = PRESET_POSITIONS[activePreset.id];

  const widgets = useMemo(() => {
    return activePreset.widgetIds
      .map((id) => {
        const widget = allWidgets.find((w) => w.id === id);
        if (!widget) return null;
        const pos = positions[id];
        const mins = WIDGET_MIN_SIZES[id] || { minW: 4, minH: 3 };
        if (pos) {
          return {
            ...widget,
            defaultValue: { ...pos, ...mins },
          };
        }
        return widget;
      })
      .filter(Boolean) as Widget[];
  }, [activePreset, allWidgets, positions]);

  return (
    <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
      <div
        className="flex-1 overflow-auto customScrollbar2 bg-card/70 backdrop-blur-xl"
        data-dashboard="true"
      >
        <Dashboard key={resetKey} widgets={widgets} />
      </div>

      {/* Floating agent chat panel — opens when clicking an agent from StatusWidget */}
      <AgentChatPanel
        open={panelOpen}
        agentId={panelAgentId}
        sessionKey={panelSessionKey}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
}
