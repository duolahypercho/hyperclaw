import React, { useState, useEffect, useMemo } from "react";
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
} from "$/components/Home/widgets";
import { useOS } from "@OS/Provider/OSProv";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function Home() {
  const { toolAbstracts, osSettings, updateOSSettings } = useOS();
  const { toast } = useToast();
  // Removed dialog-related state as we now show dashboard immediately

  // Find tool definitions from OSProv
  const todoTool = toolAbstracts.find((t) => t.id === "todo-list");
  const pomodoroTool = toolAbstracts.find((t) => t.id === "pomodoro");
  const cronsTool = toolAbstracts.find((t) => t.id === "crons");
  const docsTool = toolAbstracts.find((t) => t.id === "docs");
  const pixelOfficeTool = toolAbstracts.find((t) => t.id === "pixel-office");
  const usageTool = toolAbstracts.find((t) => t.id === "usage");

  // Memoize widget components to maintain provider state
  const widgets: Widget[] = useMemo(
    () => [
      {
        id: "clock",
        type: "clock",
        title: "Clock",
        icon: null,
        component: ClockWidget,
        defaultValue: { w: 7, h: 3, minW: 5, minH: 3, x: 7, y: 3 },
      },
      {
        id: pomodoroTool?.id || "pomodoro",
        type: "pomodoro",
        title: pomodoroTool?.name || "Pomodoro Timer",
        icon: pomodoroTool?.icon || null,
        component: PomodoroWidget,
        defaultValue: { w: 7, h: 4, minW: 5, minH: 4, x: 0, y: 3 },
      },
      {
        id: "logs",
        type: "logs",
        title: "Logs",
        icon: null,
        component: LogsWidget,
        defaultValue: { w: 8, h: 5, minW: 6, minH: 4, x: 14, y: 6 },
      },
      {
        id: "kanban",
        type: "kanban",
        title: "Kanban Board",
        icon: todoTool?.icon || null,
        component: KanbanWidget,
        defaultValue: { w: 12, h: 5, minW: 8, minH: 4, x: 0, y: 11 },
      },
      {
        id: "crons",
        type: "crons",
        title: "Cron Jobs",
        icon: cronsTool?.icon || null,
        component: CronsWidget,
        defaultValue: { w: 8, h: 4, minW: 6, minH: 3, x: 14, y: 11 },
      },
      {
        id: "docs",
        type: "docs",
        title: "Docs",
        icon: docsTool?.icon || null,
        component: DocsWidget,
        defaultValue: { w: 6, h: 4, minW: 4, minH: 3, x: 0, y: 15 },
      },
      {
        id: pixelOfficeTool?.id || "pixel-office",
        type: "pixel-office",
        title: pixelOfficeTool?.name || "AI Agent Office",
        icon: pixelOfficeTool?.icon || null,
        component: PixelOfficeWidget,
        defaultValue: { w: 6, h: 4, minW: 4, minH: 3, x: 6, y: 15 },
      },
      {
        id: usageTool?.id || "usage",
        type: "usage",
        title: usageTool?.name || "Token Usage",
        icon: usageTool?.icon || null,
        component: UsageWidget,
        defaultValue: { w: 8, h: 3, minW: 6, minH: 3, x: 12, y: 15 },
      },
{
        id: "agent-status",
        type: "agent-status",
        title: "Agent Status",
        icon: null,
        component: StatusWidget,
        defaultValue: { w: 6, h: 4, minW: 4, minH: 3, x: 14, y: 0 },
      },
      {
        id: "gateway-chat",
        type: "gateway-chat",
        title: "AI Assistant",
        icon: null,
        component: GatewayChatWidget,
        defaultValue: { w: 8, h: 6, minW: 6, minH: 4, x: 0, y: 0 },
        config: { agentId: undefined, sessionKey: undefined }, // Default - uses first available agent
      },
      // Additional chat widgets can be enabled by users in edit mode
      // Each can connect to a different agent or session via their config
    ],
    [todoTool, pomodoroTool, cronsTool, docsTool, pixelOfficeTool, usageTool]
  );

  // State for visible widgets
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    const saved = localStorage.getItem("dashboard-visible-widgets");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse visible widgets:", e);
      }
    }
    return widgets.map((w) => w.id); // All visible by default
  });

  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [showHeader, setShowHeader] = useState(false);

  // State for storing original state when entering edit mode
  const [editModeSnapshot, setEditModeSnapshot] = useState<{
    visibleWidgets: string[];
    layout: string;
  } | null>(null);

  // State for forcing Dashboard reset
  const [resetKey, setResetKey] = useState(0);

  // Minimal type for stored widget data (without component function)
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

  // State for dynamically added widget instances - load from localStorage
  const [storedWidgetInstances, setStoredWidgetInstances] = useState<StoredWidget[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("dashboard-widget-instances");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Save widget instances to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("dashboard-widget-instances", JSON.stringify(storedWidgetInstances));
  }, [storedWidgetInstances]);

  // Helper to get widget component from type
  const getWidgetComponent = (type: string) => {
    const w = widgets.find(w => w.type === type);
    return w?.component;
  };

  // Get all widgets (templates + instances with resolved components)
  const allWidgets = useMemo(() => {
    // First, get templates
    const templateWidgets = widgets.map(template => {
      const instance = storedWidgetInstances.find(s => s.id === template.id);
      if (instance) {
        // Merge instance data with template (but keep template's component)
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
  }, [widgets, storedWidgetInstances]);

  // Handler for adding a new widget instance
  const handleAddWidget = (newWidget: typeof widgets[0]) => {
    // Store only the serializable parts
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
    // Trigger a layout update
    setResetKey(k => k + 1);
  };

  // Handler for removing a widget instance
  const handleRemoveWidget = (widgetId: string) => {
    // Only remove if it's an instance (not a template)
    const isInstance = !widgets.find(w => w.id === widgetId);
    if (isInstance) {
      setStoredWidgetInstances(prev => prev.filter(w => w.id !== widgetId));
      setVisibleWidgets(prev => prev.filter(id => id !== widgetId));
    }
  };

  // Listen for edit mode toggle from Sidebar
  useEffect(() => {
    const handleEditModeToggle = () => {
      setIsEditMode((prev) => {
        if (!prev) {
          // Entering edit mode - store current state
          const currentLayout = localStorage.getItem("dashboard-layout");
          setEditModeSnapshot({
            visibleWidgets: [...visibleWidgets],
            layout: currentLayout || "",
          });
          setShowHeader(true);
        } else {
          // Exiting edit mode - save visible widgets to localStorage and clear snapshot
          localStorage.setItem(
            "dashboard-visible-widgets",
            JSON.stringify(visibleWidgets)
          );
          setEditModeSnapshot(null);
          setShowHeader(false);
        }
        return !prev;
      });
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
  }, [visibleWidgets]);

  // Listen for layout-applied event (from navbar LayoutSwitcher)
  useEffect(() => {
    const handleLayoutApplied = () => {
      // Re-read visible widgets from localStorage (just written by applyLayout)
      const saved = localStorage.getItem("dashboard-visible-widgets");
      if (saved) {
        try { setVisibleWidgets(JSON.parse(saved)); } catch {}
      }
      // Force dashboard remount so it picks up the new grid layout + configs
      setResetKey((k) => k + 1);
    };

    window.addEventListener("dashboard-layout-applied", handleLayoutApplied);
    return () => window.removeEventListener("dashboard-layout-applied", handleLayoutApplied);
  }, []);

  const handleToggleWidget = (widgetId: string) => {
    setVisibleWidgets((prev) =>
      prev.includes(widgetId)
        ? prev.filter((id) => id !== widgetId)
        : [...prev, widgetId]
    );
  };

  const handleResetLayout = () => {
    // Clear localStorage
    localStorage.removeItem("dashboard-layout");
    localStorage.removeItem("dashboard-visible-widgets");

    // Reset visible widgets to show all
    setVisibleWidgets(widgets.map((w) => w.id));

    // Trigger a key change to force Dashboard to reinitialize
    setResetKey((prev) => prev + 1);
  };

  const handleToggleEditMode = () => {
    setIsEditMode((prev) => {
      if (!prev) {
        // Entering edit mode - store current state
        const currentLayout = localStorage.getItem("dashboard-layout");
        setEditModeSnapshot({
          visibleWidgets: [...visibleWidgets],
          layout: currentLayout || "",
        });
        setShowHeader(true);
      } else {
        // Exiting edit mode - save visible widgets to localStorage and clear snapshot
        localStorage.setItem(
          "dashboard-visible-widgets",
          JSON.stringify(visibleWidgets)
        );
        setEditModeSnapshot(null);
        setShowHeader(false);
      }
      return !prev;
    });
  };

  const handleCancelEdit = () => {
    if (editModeSnapshot) {
      // Restore original state
      setVisibleWidgets(editModeSnapshot.visibleWidgets);

      if (editModeSnapshot.layout) {
        localStorage.setItem("dashboard-layout", editModeSnapshot.layout);
      } else {
        localStorage.removeItem("dashboard-layout");
      }

      // Restore visible widgets to localStorage (revert to snapshot)
      localStorage.setItem(
        "dashboard-visible-widgets",
        JSON.stringify(editModeSnapshot.visibleWidgets)
      );

      // Force Dashboard to reinitialize with restored layout
      setResetKey((prev) => prev + 1);

      // Clear snapshot and exit edit mode
      setEditModeSnapshot(null);
      setIsEditMode(false);
      setShowHeader(false);
    }
  };

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
            title: w.title,
          }))}
          isEditMode={isEditMode}
          onToggleEditMode={handleToggleEditMode}
          onCancelEdit={handleCancelEdit}
          onAddChatWidget={() => {
            // Add a new gateway-chat widget instance
            const chatWidgetTemplate = widgets.find(w => w.type === "gateway-chat");
            if (chatWidgetTemplate) {
              const newId = `gateway-chat-${Date.now()}`;
              const newWidget = {
                ...chatWidgetTemplate,
                id: newId,
                title: `Chat ${Date.now().toString().slice(-4)}`,
                config: {}, // Fresh config - no preset agent or session
              };
              handleAddWidget(newWidget);
            }
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
        />
      </div>
    </div>
  );
}
