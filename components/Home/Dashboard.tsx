import React, { useState, useEffect, useCallback, useRef } from "react";
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { dashboardState } from "$/lib/dashboard-state";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Widget config storage keys
const WIDGET_CONFIGS_KEY = "dashboard-widget-configs";

// Helper to load widget configs from dashboardState cache
const loadWidgetConfigs = (): Record<string, Record<string, unknown>> => {
  try {
    const saved = dashboardState.get(WIDGET_CONFIGS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// Helper to save widget configs to dashboardState (SQLite)
const saveWidgetConfigs = (configs: Record<string, Record<string, unknown>>): void => {
  dashboardState.set(WIDGET_CONFIGS_KEY, JSON.stringify(configs));
};

// Widget types
export type WidgetType =
  | "music"
  | "chat"
  | "todo"
  | "pomodoro"
  | "clock"
  | "x"
  | "idea-validator"
  | "logs"
  | "kanban"
  | "crons"
  | "docs"
  | "pixel-office"
  | "usage"
  | "gateway-chat"
  | "agent-status";

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  icon: React.ReactNode;
  component: React.ComponentType<CustomProps>;
  defaultValue: {
    w: number;
    h: number;
    minW: number;
    minH: number;
    x: number;
    y: number;
  };
  isResizable?: boolean; // New prop to control resizability
  config?: Record<string, unknown>; // Widget-specific configuration
}

interface DashboardProps {
  widgets: Widget[];
  className?: string;
  visibleWidgets?: string[];
  onResetLayout?: () => void;
}

// Default layout configuration
const generateDefaultLayout = (widgets: Widget[]): Layout[] => {
  return widgets.map((widget, index) => ({
    i: widget.id,
    x:
      widget.defaultValue.x !== undefined
        ? widget.defaultValue.x
        : (index % 2) * 12, // Use custom x, fallback to auto-positioning
    y:
      widget.defaultValue.y !== undefined
        ? widget.defaultValue.y
        : Math.floor(index / 2) * 8, // Use custom y, fallback to auto-positioning
    w: widget.defaultValue.w,
    h: widget.defaultValue.h,
    minW: widget.defaultValue.minW,
    minH: widget.defaultValue.minH,
    isResizable: widget.isResizable !== false, // Default to true unless explicitly set to false
  }));
};

// Widget wrapper component
const WidgetWrapper: React.FC<CustomProps> = (props) => {
  const WidgetComponent = props.widget.component;
  return <WidgetComponent {...props} />;
};

// Static grid styles — extracted to avoid recreating on every render
const DashboardGridStyles = React.memo(() => (
  <>
    <style jsx global>{`
      /* Prevent text selection during drag/resize */
      .react-grid-item.react-draggable-dragging,
      .react-grid-item.resizing {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
      }
      .react-grid-item.react-draggable-dragging *,
      .react-grid-item.resizing * {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
      }
      /* In edit mode, disable text selection on the entire grid to prevent
         selection starting before the dragging class is applied */
      .dashboard-edit-mode {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
      }
      .react-grid-item[data-resizable="false"] .react-resizable-handle {
        display: none !important;
      }
      /* Prevent inner widget scroll from bubbling to the outer dashboard */
      .react-grid-item [data-radix-scroll-area-viewport],
      .react-grid-item .overflow-auto,
      .react-grid-item .overflow-y-auto,
      .react-grid-item .customScrollbar2 {
        overscroll-behavior: contain;
      }
    `}</style>
    <style jsx global>{`
      .react-grid-layout { position: relative; }
      .react-grid-item { transition: all 200ms ease; transition-property: left, top, width, height; }
      .react-grid-item.cssTransforms { transition-property: transform, width, height; }
      .react-grid-item.resizing { transition: none; z-index: 100; }
      .react-grid-item.react-draggable-dragging { transition: none; z-index: 100; }
      .react-grid-item.dropping { visibility: hidden; }
      .react-grid-item.react-grid-placeholder {
        background: hsl(var(--primary) / 0.2); opacity: 0.2; transition-duration: 100ms;
        z-index: 2; border-radius: 1rem; border: 2px dashed hsl(var(--primary));
      }
      .react-resizable-handle { position: absolute; width: 20px; height: 20px; }
      .react-resizable-handle-se { bottom: 0; right: 0; cursor: se-resize; }
      .react-resizable-handle::after {
        content: ""; position: absolute; right: 3px; bottom: 3px; width: 5px; height: 5px;
        border-right: 2px solid hsl(var(--muted-foreground) / 0.4);
        border-bottom: 2px solid hsl(var(--muted-foreground) / 0.4);
      }
    `}</style>
  </>
));
DashboardGridStyles.displayName = "DashboardGridStyles";

interface DashboardProps {
  widgets: Widget[];
  className?: string;
  visibleWidgets?: string[];
  onResetLayout?: () => void;
  isEditMode?: boolean; // New prop for edit mode
  onAddWidget?: (widget: Widget) => void; // Callback when a new widget is added
  onRemoveWidget?: (widgetId: string) => void; // Callback when a widget is removed
  onUpdateWidgetConfig?: (widgetId: string, config: Record<string, unknown>) => void; // Update widget config
}

export const Dashboard: React.FC<DashboardProps> = ({
  widgets,
  className,
  visibleWidgets,
  onResetLayout,
  isEditMode = false,
  onAddWidget,
  onRemoveWidget,
  onUpdateWidgetConfig,
}) => {
  // Parse a saved layout JSON string and merge with current widget defaults
  const mergeLayoutWithDefaults = useCallback((savedJson: string): { [key: string]: Layout[] } | null => {
    try {
      const parsedLayout = JSON.parse(savedJson);
      const mergedLayouts: { [key: string]: Layout[] } = {};
      const defaultLayouts = {
        lg: generateDefaultLayout(widgets),
        md: generateDefaultLayout(widgets),
        sm: generateDefaultLayout(widgets),
        xs: generateDefaultLayout(widgets),
      };
      Object.keys(defaultLayouts).forEach((breakpoint) => {
        const saved = parsedLayout[breakpoint] || [];
        const defaults = defaultLayouts[breakpoint as keyof typeof defaultLayouts];
        const savedMap = new Map<string, Layout>(saved.map((item: Layout) => [item.i, item]));
        mergedLayouts[breakpoint] = defaults.map((defaultItem: Layout) => {
          const savedItem = savedMap.get(defaultItem.i);
          return savedItem ? savedItem : defaultItem;
        });
      });
      return mergedLayouts;
    } catch {
      return null;
    }
  }, [widgets]);

  const [layouts, setLayouts] = useState<{ [key: string]: Layout[] }>(() => {
    // Read from in-memory cache (populated by dashboardState.hydrate())
    const savedLayout = dashboardState.get("dashboard-layout");
    if (savedLayout) {
      const merged = mergeLayoutWithDefaults(savedLayout);
      if (merged) return merged;
    }
    return {
      lg: generateDefaultLayout(widgets),
      md: generateDefaultLayout(widgets),
      sm: generateDefaultLayout(widgets),
      xs: generateDefaultLayout(widgets),
    };
  });

  // Widget configs state
  const [widgetConfigs, setWidgetConfigs] = useState<Record<string, Record<string, unknown>>>(() =>
    loadWidgetConfigs()
  );

  // Helper to get merged config for a widget (default + persisted)
  const getWidgetConfig = (widgetId: string, defaultConfig?: Record<string, unknown>): Record<string, unknown> => {
    return {
      ...defaultConfig,
      ...widgetConfigs[widgetId],
    };
  };

  // Save configs whenever they change
  useEffect(() => {
    saveWidgetConfigs(widgetConfigs);
  }, [widgetConfigs]);

  // Add a new widget instance with a unique ID
  const addWidgetInstance = useCallback((widgetTemplate: Widget, customConfig?: Record<string, unknown>) => {
    const timestamp = Date.now();
    const newId = `${widgetTemplate.id}-${timestamp}`;
    const newWidget: Widget = {
      ...widgetTemplate,
      id: newId,
      title: `${widgetTemplate.title} ${timestamp.toString().slice(-4)}`,
      config: customConfig || widgetTemplate.config,
    };

    // Add to widgets list
    if (onAddWidget) {
      onAddWidget(newWidget);
    }

    // Store the config
    if (customConfig) {
      setWidgetConfigs(prev => ({
        ...prev,
        [newId]: customConfig,
      }));
    }

    return newId;
  }, [onAddWidget]);

  // Update widget config
  const updateWidgetConfig = useCallback((widgetId: string, config: Record<string, unknown>) => {
    setWidgetConfigs(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        ...config,
      },
    }));
    if (onUpdateWidgetConfig) {
      onUpdateWidgetConfig(widgetId, config);
    }
  }, [onUpdateWidgetConfig]);

  // Remove widget and its config
  const removeWidgetInstance = useCallback((widgetId: string) => {
    setWidgetConfigs(prev => {
      const { [widgetId]: _, ...rest } = prev;
      return rest;
    });
    if (onRemoveWidget) {
      onRemoveWidget(widgetId);
    }
  }, [onRemoveWidget]);

  const [maximizedWidget, setMaximizedWidget] = useState<string | null>(null);

  // Handle new widgets being added without resetting existing layout
  // Only depends on widgets (not layouts) to avoid re-running on every layout change
  const prevWidgetIdsRef = useRef<string>(widgets.map((w) => w.id).join(","));
  useEffect(() => {
    const currentIds = widgets.map((w) => w.id).join(",");
    if (currentIds === prevWidgetIdsRef.current) return;
    prevWidgetIdsRef.current = currentIds;

    setLayouts((prevLayouts) => {
      const layoutWidgetIds = new Set(
        Object.values(prevLayouts)
          .flat()
          .map((l) => l.i)
      );
      const newWidgets = widgets.filter((w) => !layoutWidgetIds.has(w.id));
      if (newWidgets.length === 0) return prevLayouts;

      const updatedLayouts: { [key: string]: Layout[] } = {};
      Object.keys(prevLayouts).forEach((breakpoint) => {
        const existingLayouts = prevLayouts[breakpoint];
        const newLayouts = generateDefaultLayout(newWidgets);
        const maxY = Math.max(...existingLayouts.map((l) => l.y + l.h), 0);
        const adjustedNewLayouts = newLayouts.map((layout, index) => ({
          ...layout,
          y: maxY + index * 8,
        }));
        updatedLayouts[breakpoint] = [
          ...existingLayouts,
          ...adjustedNewLayouts,
        ];
      });
      return updatedLayouts;
    });
  }, [widgets]);

  // Save layout to SQLite whenever it changes (debounced)
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    layoutSaveTimerRef.current = setTimeout(() => {
      dashboardState.set("dashboard-layout", JSON.stringify(layouts));
    }, 500);
    return () => {
      if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    };
  }, [layouts]);

  const handleLayoutChange = (
    currentLayout: Layout[],
    allLayouts: { [key: string]: Layout[] }
  ) => {
    // Merge layouts to preserve hidden widgets and fix dimensions
    const mergedLayouts: { [key: string]: Layout[] } = {};

    Object.keys(allLayouts).forEach((breakpoint) => {
      // Get current visible layouts
      const visibleLayouts = allLayouts[breakpoint];

      // Get existing hidden widget layouts from previous state
      const hiddenLayouts = (layouts[breakpoint] || []).filter(
        (item) => !visibleLayouts.find((l) => l.i === item.i)
      );

      // Fix dimensions for visible layouts
      const fixedVisibleLayouts = visibleLayouts.map((layout) => {
        // Check if this layout has invalid dimensions (w: 1, h: 1 or w: 0, h: 0)
        if (!layout.w || !layout.h || layout.w <= 1 || layout.h <= 1) {
          // Try to get saved layout first
          const savedLayout = (layouts[breakpoint] || []).find(
            (l) => l.i === layout.i
          );

          // If saved layout exists and has valid dimensions, use it
          if (savedLayout && savedLayout.w > 1 && savedLayout.h > 1) {
            return {
              ...layout,
              w: savedLayout.w,
              h: savedLayout.h,
              minW: savedLayout.minW,
              minH: savedLayout.minH,
            };
          }

          // Otherwise, use widget defaults
          const widget = widgets.find((w) => w.id === layout.i);
          if (widget) {
            return {
              ...layout,
              w: widget.defaultValue.w,
              h: widget.defaultValue.h,
              minW: widget.defaultValue.minW,
              minH: widget.defaultValue.minH,
            };
          }
        }
        return layout;
      });

      // Merge both visible and hidden layouts
      mergedLayouts[breakpoint] = [...fixedVisibleLayouts, ...hiddenLayouts];
    });

    setLayouts(mergedLayouts);
  };

  const handleMaximize = (widgetId: string) => {
    setMaximizedWidget((prev) => (prev === widgetId ? null : widgetId));
  };

  // Filter widgets based on visibility and merge configs with persisted configs
  const displayedWidgets: Widget[] = (visibleWidgets
    ? widgets.filter((w) => visibleWidgets.includes(w.id))
    : widgets).map((widget) => ({
      ...widget,
      config: getWidgetConfig(widget.id, widget.config),
    }));

  // If a widget is maximized, show only that widget
  if (maximizedWidget) {
    const baseWidget = widgets.find((w) => w.id === maximizedWidget);
    if (!baseWidget) return null;

    // Merge config for maximized widget
    const widget: Widget = {
      ...baseWidget,
      config: getWidgetConfig(baseWidget.id, baseWidget.config),
    };

    return (
      <div className={cn("h-full w-full p-4", className)}>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full w-full"
        >
          <WidgetWrapper
            widget={widget}
            isMaximized={true}
            onMaximize={() => handleMaximize(widget.id)}
            isEditMode={isEditMode}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full w-full overflow-auto customScrollbar2",
        isEditMode && "dashboard-edit-mode",
        className
      )}
      style={{ overscrollBehavior: "contain" }}
    >
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 24, md: 20, sm: 12, xs: 8 }}
        rowHeight={60}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".cursor-move"
        containerPadding={[16, 16]}
        margin={[16, 16]}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        compactType="vertical"
        preventCollision={false}
      >
        {displayedWidgets.map((widget) => (
          <div
            key={widget.id}
            data-resizable={widget.isResizable !== false && isEditMode}
          >
            <WidgetWrapper
              widget={widget}
              isMaximized={false}
              onMaximize={() => handleMaximize(widget.id)}
              isEditMode={isEditMode}
            />
          </div>
        ))}
      </ResponsiveGridLayout>

      <DashboardGridStyles />
    </div>
  );
};
