import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Maximize2, Settings, MousePointerClick, ArrowRight } from "lucide-react";
import { Dashboard, Widget } from "./Dashboard";
import { DashboardHeader } from "./DashboardHeader";
import {
  PomodoroWidget,
  ClockWidget,
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
} from "$/components/Home/widgets";
import { useOS, useFloatingChatOS } from "@OS/Provider/OSProv";
import { cn } from "@/lib/utils";
import { dashboardState } from "$/lib/dashboard-state";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { OPEN_AGENT_CHAT_EVENT } from "$/components/Home/widgets/StatusWidget";

// Component registry for dynamic-only widget types (not in the template array).
// This lets dynamically-added instances resolve their component without being
// a default template widget that shows up in the toggle list.
const DYNAMIC_WIDGET_COMPONENTS: Record<string, React.FC<any>> = {
  "gateway-chat": GatewayChatWidget,
  "channel-dashboard": ChannelDashboardWidget,
};

const ONBOARDING_KEY = "dashboard-onboarding-done";

// Default layout for dynamically-created chat widgets
const CHAT_WIDGET_DEFAULTS = {
  type: "gateway-chat" as const,
  defaultValue: { w: 8, h: 6, minW: 6, minH: 4, x: 0, y: 0 },
  config: { agentId: undefined, sessionKey: undefined },
};

// Default layout for dynamically-created announce channel widgets
const ANNOUNCE_WIDGET_DEFAULTS = {
  type: "channel-dashboard" as const,
  defaultValue: { w: 12, h: 6, minW: 8, minH: 4, x: 0, y: 0 },
  config: { selectedCronIds: [], soundEnabled: false },
};

type StoredWidget = {
  id: string;
  type: string;
  title: string;
  defaultValue?: {
    w: number;
    h: number;
    minW: number;
    minH: number;
    x: number;
    y: number;
  };
  config?: Record<string, unknown>;
  isResizable?: boolean;
};

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const { toolAbstracts } = useOS();
  const { dashboardReady } = useOpenClawContext();
  const { openChat } = useFloatingChatOS();

  // Listen for "Open in Chat" events from announce/status widgets
  useEffect(() => {
    const handler = (e: Event) => {
      const agentId = (e as CustomEvent).detail?.agentId;
      const sessionKey = (e as CustomEvent).detail?.sessionKey;
      if (agentId) openChat(agentId, sessionKey);
    };
    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handler);
  }, [openChat]);

  // Find tool definitions from OSProv
  const todoTool = toolAbstracts.find((t) => t.id === "todo-list");
  const pomodoroTool = toolAbstracts.find((t) => t.id === "pomodoro");
  const cronsTool = toolAbstracts.find((t) => t.id === "crons");
  const docsTool = toolAbstracts.find((t) => t.id === "docs");
  const pixelOfficeTool = toolAbstracts.find((t) => t.id === "pixel-office");
  const usageTool = toolAbstracts.find((t) => t.id === "usage");
  const intelTool = toolAbstracts.find((t) => t.id === "intelligence");

  // Memoize widget components to maintain provider state
  // NOTE: gateway-chat is NOT here — it's dynamic-only (created via "Add Chat Widget")
  const widgets: Widget[] = useMemo(
    () => [
      {
        id: "clock",
        type: "clock",
        title: "Clock",
        icon: null,
        component: ClockWidget,
        defaultValue: { w: 7, h: 3, minW: 5, minH: 3, x: 7, y: 14 },
      },
      {
        id: pomodoroTool?.id || "pomodoro",
        type: "pomodoro",
        title: pomodoroTool?.name || "Pomodoro Timer",
        icon: pomodoroTool?.icon || null,
        component: PomodoroWidget,
        defaultValue: { w: 7, h: 4, minW: 5, minH: 4, x: 0, y: 32 },
      },
      {
        id: "logs",
        type: "logs",
        title: "Logs",
        icon: null,
        component: LogsWidget,
        defaultValue: { w: 8, h: 12, minW: 6, minH: 4, x: 16, y: 17 },
      },
      {
        id: "kanban",
        type: "kanban",
        title: "Kanban Board",
        icon: todoTool?.icon || null,
        component: KanbanWidget,
        defaultValue: { w: 18, h: 10, minW: 8, minH: 4, x: 0, y: 0 },
      },
      {
        id: "crons",
        type: "crons",
        title: "Cron Jobs",
        icon: cronsTool?.icon || null,
        component: CronsWidget,
        defaultValue: { w: 6, h: 4, minW: 6, minH: 3, x: 18, y: 0 },
      },
      {
        id: "docs",
        type: "docs",
        title: "Docs",
        icon: docsTool?.icon || null,
        component: DocsWidget,
        defaultValue: { w: 6, h: 4, minW: 4, minH: 3, x: 0, y: 32 },
      },
      {
        id: pixelOfficeTool?.id || "pixel-office",
        type: "pixel-office",
        title: pixelOfficeTool?.name || "AI Agent Office",
        icon: pixelOfficeTool?.icon || null,
        component: PixelOfficeWidget,
        defaultValue: { w: 6, h: 4, minW: 4, minH: 3, x: 18, y: 0 },
      },
      {
        id: usageTool?.id || "usage",
        type: "usage",
        title: usageTool?.name || "Token Usage",
        icon: usageTool?.icon || null,
        component: UsageWidget,
        defaultValue: { w: 24, h: 3, minW: 6, minH: 3, x: 0, y: 17 },
      },
      {
        id: "agent-status",
        type: "agent-status",
        title: "Agent Status",
        icon: null,
        component: StatusWidget,
        defaultValue: { w: 6, h: 6, minW: 4, minH: 3, x: 18, y: 4 },
      },
      {
        id: intelTool?.id || "intelligence",
        type: "intelligence",
        title: intelTool?.name || "Intelligence",
        icon: intelTool?.icon || null,
        component: IntelligenceWidget,
        defaultValue: { w: 6, h: 4, minW: 4, minH: 3, x: 6, y: 32 },
      },
    ],
    [todoTool, pomodoroTool, cronsTool, docsTool, pixelOfficeTool, usageTool, intelTool]
  );

  // State for visible widgets (reads from in-memory cache, hydrated from SQLite)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    const saved = dashboardState.get("dashboard-visible-widgets");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse visible widgets:", e);
      }
    }
    // Default: core widgets + 3 chats + 3 announce channels
    return [
      "kanban", "pixel-office", "usage", "agent-status",
      "gateway-chat-1", "gateway-chat-2", "gateway-chat-3",
      "channel-dashboard-1", "channel-dashboard-2", "channel-dashboard-3",
    ];
  });

  // Onboarding: show welcome overlay on first visit
  const [showOnboarding, setShowOnboarding] = useState(false);

  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [showHeader, setShowHeader] = useState(false);

  // State for forcing Dashboard reset
  const [resetKey, setResetKey] = useState(0);
  const [channelWidgetConfigsJson, setChannelWidgetConfigsJson] = useState(
    () => dashboardState.get("dashboard-widget-configs") || "{}"
  );
  const editSnapshotRef = useRef<{
    layout: string | null;
    visibleWidgets: string | null;
    widgetInstances: string | null;
    widgetConfigs: string | null;
  } | null>(null);

  const widgetConfigs = useMemo(
    () => safeParseJson<Record<string, Record<string, unknown>>>(channelWidgetConfigsJson, {}),
    [channelWidgetConfigsJson]
  );

  // Default dynamic widget instances for fresh installs (3 chats + 3 announce channels)
  const DEFAULT_WIDGET_INSTANCES: StoredWidget[] = [
    { id: "gateway-chat-1", type: "gateway-chat", title: "Chat 1", defaultValue: { w: 8, h: 12, minW: 6, minH: 4, x: 0, y: 20 }, config: {} },
    { id: "gateway-chat-2", type: "gateway-chat", title: "Chat 2", defaultValue: { w: 8, h: 12, minW: 6, minH: 4, x: 8, y: 20 }, config: {} },
    { id: "gateway-chat-3", type: "gateway-chat", title: "Chat 3", defaultValue: { w: 8, h: 12, minW: 6, minH: 4, x: 16, y: 20 }, config: {} },
    { id: "channel-dashboard-1", type: "channel-dashboard", title: "Announce 1", defaultValue: { w: 8, h: 7, minW: 8, minH: 4, x: 0, y: 10 }, config: { selectedCronIds: [], soundEnabled: false } },
    { id: "channel-dashboard-2", type: "channel-dashboard", title: "Announce 2", defaultValue: { w: 8, h: 7, minW: 8, minH: 4, x: 8, y: 10 }, config: { selectedCronIds: [], soundEnabled: false } },
    { id: "channel-dashboard-3", type: "channel-dashboard", title: "Announce 3", defaultValue: { w: 8, h: 7, minW: 8, minH: 4, x: 16, y: 10 }, config: { selectedCronIds: [], soundEnabled: false } },
  ];

  // State for dynamically added widget instances
  const [storedWidgetInstances, setStoredWidgetInstances] = useState<StoredWidget[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = dashboardState.get("dashboard-widget-instances");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_WIDGET_INSTANCES;
      }
    }
    return DEFAULT_WIDGET_INSTANCES;
  });

  // Re-read persisted state once dashboardState is hydrated.
  // useState initializers run before hydration completes, so they may
  // return defaults. This effect syncs state with the real SQLite data.
  const [hydratedOnce, setHydratedOnce] = useState(false);
  useEffect(() => {
    if (!dashboardReady || hydratedOnce) return;
    setHydratedOnce(true);

    console.log("[Home] Dashboard hydrated (data:", dashboardState.isHydratedWithData() + ")");

    const savedVisible = dashboardState.get("dashboard-visible-widgets");
    if (savedVisible) {
      try {
        setVisibleWidgets(JSON.parse(savedVisible));
      } catch {}
    }

    const savedInstances = dashboardState.get("dashboard-widget-instances");
    if (savedInstances) {
      try {
        setStoredWidgetInstances(JSON.parse(savedInstances));
      } catch {}
    }

    setChannelWidgetConfigsJson(dashboardState.get("dashboard-widget-configs") || "{}");

    // Show onboarding if user hasn't seen it yet
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) {
        setShowOnboarding(true);
      }
    } catch {}
  }, [dashboardReady, hydratedOnce]);

  // Save widget instances to SQLite whenever they change — but only AFTER hydration.
  // Skip the initial fire to avoid overwriting backend data with defaults when
  // hydration fails at startup but saves succeed shortly after (race condition).
  const widgetInstancesBaselineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydratedOnce) return;
    const json = JSON.stringify(storedWidgetInstances);
    if (widgetInstancesBaselineRef.current === null) {
      widgetInstancesBaselineRef.current = json;
      return;
    }
    if (json === widgetInstancesBaselineRef.current) return;
    widgetInstancesBaselineRef.current = json;
    dashboardState.set("dashboard-widget-instances", json);
  }, [storedWidgetInstances, hydratedOnce]);

  // Helper to get widget component from type — checks templates first, then dynamic registry
  const getWidgetComponent = useCallback((type: string) => {
    const w = widgets.find(w => w.type === type);
    if (w) return w.component;
    return DYNAMIC_WIDGET_COMPONENTS[type] ?? null;
  }, [widgets]);

  // Get all widgets (templates + instances with resolved components)
  const allWidgets = useMemo(() => {
    // First, get templates
    const templateWidgets = widgets.map(template => {
      const instance = storedWidgetInstances.find(s => s.id === template.id);
      if (instance) {
        return {
          ...template,
          ...instance,
          component: template.component,
        };
      }
      return template;
    });

    // Then add any stored instances that don't have matching templates (new chat widgets)
    const additionalInstances = storedWidgetInstances
      .filter(s => !widgets.find(w => w.id === s.id))
      .map(s => {
        const component = getWidgetComponent(s.type);
        if (!component) return null;
        return {
          ...s,
          component,
          icon: null,
        };
      })
      .filter(Boolean);

    return [...templateWidgets, ...(additionalInstances as typeof widgets)];
  }, [getWidgetComponent, widgets, storedWidgetInstances]);

  // Handler for adding a new widget instance
  const handleAddWidget = (newWidget: typeof widgets[0]) => {
    const stored: StoredWidget = {
      id: newWidget.id,
      type: newWidget.type,
      title: newWidget.title,
      defaultValue: newWidget.defaultValue,
      config: newWidget.config,
      isResizable: newWidget.isResizable,
    };
    setStoredWidgetInstances(prev => [...prev, stored]);
    setVisibleWidgets(prev => [...prev, newWidget.id]);
    setResetKey(k => k + 1);
  };

  // Handler for removing a widget instance
  const handleRemoveWidget = (widgetId: string) => {
    const isInstance = !widgets.find(w => w.id === widgetId);
    if (isInstance) {
      setStoredWidgetInstances(prev => prev.filter(w => w.id !== widgetId));
    }
    setVisibleWidgets(prev => prev.filter(id => id !== widgetId));
  };

  // Persist visible widgets to SQLite whenever they change — gated on hydration.
  // Track the baseline to avoid saving defaults that would overwrite real backend data
  // when hydration initially fails (e.g. session not loaded yet) but saves succeed later.
  const visibleWidgetsBaselineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydratedOnce) return;
    const json = JSON.stringify(visibleWidgets);
    if (visibleWidgetsBaselineRef.current === null) {
      // First fire after hydration — record baseline, don't save
      visibleWidgetsBaselineRef.current = json;
      return;
    }
    if (json === visibleWidgetsBaselineRef.current) return;
    visibleWidgetsBaselineRef.current = json;
    dashboardState.set("dashboard-visible-widgets", json);
  }, [visibleWidgets, hydratedOnce]);

  // Listen for layout-applied event (from navbar LayoutSwitcher)
  useEffect(() => {
    const handleLayoutApplied = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.visibleWidgets) {
        setVisibleWidgets(detail.visibleWidgets);
      }
      // Restore widget instances (added chat widgets etc.) from the applied layout
      if (detail?.widgetInstances) {
        try {
          const parsed = JSON.parse(detail.widgetInstances);
          setStoredWidgetInstances(Array.isArray(parsed) ? parsed : []);
        } catch {
          setStoredWidgetInstances([]);
        }
      }
      // Force dashboard remount so it picks up the new grid layout + configs
      setResetKey((k) => k + 1);
    };

    window.addEventListener("dashboard-layout-applied", handleLayoutApplied);
    return () => window.removeEventListener("dashboard-layout-applied", handleLayoutApplied);
  }, []);

  // Listen for late rehydration — if dashboard state arrived after initial mount,
  // re-read from cache and remount the dashboard.
  useEffect(() => {
    const handleRehydrated = () => {
      const savedVisible = dashboardState.get("dashboard-visible-widgets");
      if (savedVisible) {
        try {
          const parsed = JSON.parse(savedVisible);
          setVisibleWidgets(parsed);
          // Update baseline so the save effect recognises this as the new "hydrated" value
          visibleWidgetsBaselineRef.current = JSON.stringify(parsed);
        } catch {}
      }
      const savedInstances = dashboardState.get("dashboard-widget-instances");
      if (savedInstances) {
        try {
          const parsed = JSON.parse(savedInstances);
          setStoredWidgetInstances(Array.isArray(parsed) ? parsed : []);
          widgetInstancesBaselineRef.current = savedInstances;
        } catch {}
      }
      setChannelWidgetConfigsJson(dashboardState.get("dashboard-widget-configs") || "{}");
      setResetKey((k) => k + 1);
    };

    window.addEventListener("dashboard-state-rehydrated", handleRehydrated);
    return () => window.removeEventListener("dashboard-state-rehydrated", handleRehydrated);
  }, []);

  const handleToggleWidget = (widgetId: string) => {
    setVisibleWidgets((prev) =>
      prev.includes(widgetId)
        ? prev.filter((id) => id !== widgetId)
        : [...prev, widgetId]
    );
  };

  const handleResetLayout = () => {
    // Clear persisted state
    dashboardState.remove("dashboard-layout");
    dashboardState.remove("dashboard-visible-widgets");

    // Reset visible widgets to show all
    setVisibleWidgets(widgets.map((w) => w.id));

    // Trigger a key change to force Dashboard to reinitialize
    setResetKey((prev) => prev + 1);
  };

  const handleWidgetConfigUpdate = useCallback((widgetId: string, config: Record<string, unknown>) => {
    if (!widgetId.startsWith("channel-dashboard-")) return;
    setChannelWidgetConfigsJson((prev) => {
      const parsed = safeParseJson<Record<string, Record<string, unknown>>>(prev, {});
      return JSON.stringify({
        ...parsed,
        [widgetId]: {
          ...parsed[widgetId],
          ...config,
        },
      });
    });
  }, []);

  const getWidgetDisplayTitle = useCallback((widget: { id: string; type: string; title: string }) => {
    if (widget.type !== "channel-dashboard") return widget.title;
    const customTitle = widgetConfigs[widget.id]?.customTitle;
    return typeof customTitle === "string" && customTitle.trim() ? customTitle : widget.title;
  }, [widgetConfigs]);

  const beginEditMode = useCallback(() => {
    editSnapshotRef.current = {
      layout: dashboardState.get("dashboard-layout"),
      visibleWidgets: dashboardState.get("dashboard-visible-widgets"),
      widgetInstances: dashboardState.get("dashboard-widget-instances"),
      widgetConfigs: dashboardState.get("dashboard-widget-configs"),
    };
    setIsEditMode(true);
    setShowHeader(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
  }, []);

  const dismissOnboardingAndEdit = useCallback(() => {
    setShowOnboarding(false);
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    beginEditMode();
  }, [beginEditMode]);

  const saveEditMode = useCallback(() => {
    editSnapshotRef.current = null;
    setIsEditMode(false);
    setShowHeader(false);
  }, []);

  const cancelEditMode = useCallback(() => {
    const snapshot = editSnapshotRef.current;
    const defaultVisibleWidgets = widgets.map((w) => w.id);
    const restoredVisibleWidgets = snapshot?.visibleWidgets
      ? (() => {
          try {
            return JSON.parse(snapshot.visibleWidgets);
          } catch {
            return defaultVisibleWidgets;
          }
        })()
      : defaultVisibleWidgets;
    const restoredWidgetInstances = snapshot?.widgetInstances
      ? (() => {
          try {
            const parsed = JSON.parse(snapshot.widgetInstances);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

    if (snapshot?.layout) {
      dashboardState.set("dashboard-layout", snapshot.layout);
    } else {
      dashboardState.remove("dashboard-layout");
    }

    if (snapshot?.visibleWidgets) {
      dashboardState.set("dashboard-visible-widgets", snapshot.visibleWidgets);
      visibleWidgetsBaselineRef.current = snapshot.visibleWidgets;
    } else {
      dashboardState.remove("dashboard-visible-widgets");
      visibleWidgetsBaselineRef.current = JSON.stringify(defaultVisibleWidgets);
    }

    if (snapshot?.widgetInstances) {
      dashboardState.set("dashboard-widget-instances", snapshot.widgetInstances);
      widgetInstancesBaselineRef.current = snapshot.widgetInstances;
    } else {
      dashboardState.remove("dashboard-widget-instances");
      widgetInstancesBaselineRef.current = JSON.stringify([]);
    }

    if (snapshot?.widgetConfigs) {
      dashboardState.set("dashboard-widget-configs", snapshot.widgetConfigs);
      setChannelWidgetConfigsJson(snapshot.widgetConfigs);
    } else {
      dashboardState.remove("dashboard-widget-configs");
      setChannelWidgetConfigsJson("{}");
    }

    setVisibleWidgets(restoredVisibleWidgets);
    setStoredWidgetInstances(restoredWidgetInstances);
    editSnapshotRef.current = null;
    setIsEditMode(false);
    setShowHeader(false);
    setResetKey((prev) => prev + 1);
  }, [widgets]);

  const handleToggleEditMode = useCallback(() => {
    if (isEditMode) {
      saveEditMode();
      return;
    }
    beginEditMode();
  }, [beginEditMode, isEditMode, saveEditMode]);

  const handleEditModeAction = useCallback((action?: string) => {
    if (action === "cancel") {
      cancelEditMode();
      return;
    }
    if (action === "save") {
      saveEditMode();
      return;
    }
    if (action === "enter") {
      if (!isEditMode) beginEditMode();
      return;
    }

    if (isEditMode) {
      cancelEditMode();
      return;
    }

    beginEditMode();
  }, [beginEditMode, cancelEditMode, isEditMode, saveEditMode]);

  useEffect(() => {
    if (!isEditMode) {
      editSnapshotRef.current = null;
    }
  }, [isEditMode]);

  // Listen for edit mode toggle from Sidebar
  useEffect(() => {
    const handleEditModeToggle = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      handleEditModeAction(action);
    };

    window.addEventListener(
      "dashboard-edit-mode-toggle",
      handleEditModeToggle as EventListener
    );

    return () => {
      window.removeEventListener(
        "dashboard-edit-mode-toggle",
        handleEditModeToggle as EventListener
      );
    };
  }, [handleEditModeAction]);

  // Don't render until BOTH hydration is complete AND state is synced.
  // useState initializers run before hydration, so they get stale defaults.
  // The hydration effect above corrects state — wait for that before mounting Dashboard.
  if (!dashboardReady || !hydratedOnce) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center bg-background/80 backdrop-blur-xl">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
      {showHeader && (
        <DashboardHeader
          visibleWidgets={visibleWidgets}
          onToggleWidget={handleToggleWidget}
          onResetLayout={handleResetLayout}
          availableWidgets={allWidgets.map((w) => ({
            id: w.id,
            type: w.type as any,
            title: getWidgetDisplayTitle(w),
          }))}
          isEditMode={isEditMode}
          onToggleEditMode={handleToggleEditMode}
          onAddChatWidget={() => {
            const newId = `gateway-chat-${Date.now()}`;
            handleAddWidget({
              id: newId,
              type: CHAT_WIDGET_DEFAULTS.type,
              title: `Chat ${Date.now().toString().slice(-4)}`,
              icon: null,
              component: GatewayChatWidget,
              defaultValue: CHAT_WIDGET_DEFAULTS.defaultValue,
              config: {},
            });
          }}
          onAddAnnounceWidget={() => {
            const newId = `channel-dashboard-${Date.now()}`;
            handleAddWidget({
              id: newId,
              type: ANNOUNCE_WIDGET_DEFAULTS.type,
              title: `Announce ${Date.now().toString().slice(-4)}`,
              icon: null,
              component: ChannelDashboardWidget,
              defaultValue: ANNOUNCE_WIDGET_DEFAULTS.defaultValue,
              config: ANNOUNCE_WIDGET_DEFAULTS.config,
            });
          }}
        />
      )}
      <div
        className={cn(
          "flex-1 overflow-auto customScrollbar2 bg-background/80 backdrop-blur-xl",
          isEditMode && "select-none"
        )}
        data-dashboard="true"
      >
        <Dashboard
          key={resetKey}
          widgets={allWidgets as any}
          visibleWidgets={visibleWidgets}
          onResetLayout={handleResetLayout}
          isEditMode={isEditMode}
          onAddWidget={handleAddWidget}
          onRemoveWidget={handleRemoveWidget}
          onUpdateWidgetConfig={handleWidgetConfigUpdate}
        />
      </div>

      {/* First-time onboarding overlay */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={dismissOnboarding}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="max-w-md w-full mx-4 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl p-6 space-y-5"
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Welcome to your Dashboard</h2>
                <p className="text-sm text-muted-foreground">
                  Your command center is fully customizable. Here&apos;s how:
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <GripVertical className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Drag to rearrange</p>
                    <p className="text-xs text-muted-foreground">Grab any widget and move it where you want</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Maximize2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Resize from corners</p>
                    <p className="text-xs text-muted-foreground">Drag the bottom-right corner to make widgets bigger or smaller</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Settings className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Show or hide widgets</p>
                    <p className="text-xs text-muted-foreground">Use Edit Layout to toggle widgets, add chats, or reset the layout</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <MousePointerClick className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Auto-saved</p>
                    <p className="text-xs text-muted-foreground">Every change you make is saved automatically</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={dismissOnboarding}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-border/50 hover:bg-muted/50 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={dismissOnboardingAndEdit}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  Customize Now
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
