import React, { useState, useEffect } from "react";
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

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
  | "usage";

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

interface DashboardProps {
  widgets: Widget[];
  className?: string;
  visibleWidgets?: string[];
  onResetLayout?: () => void;
  isEditMode?: boolean; // New prop for edit mode
}

export const Dashboard: React.FC<DashboardProps> = ({
  widgets,
  className,
  visibleWidgets,
  onResetLayout,
  isEditMode = false,
}) => {
  const [layouts, setLayouts] = useState<{ [key: string]: Layout[] }>(() => {
    // Load saved layout from localStorage
    const savedLayout = localStorage.getItem("dashboard-layout");

    if (savedLayout) {
      try {
        const parsedLayout = JSON.parse(savedLayout);
        // If we have saved layout, use it and merge with any new widgets
        const mergedLayouts: { [key: string]: Layout[] } = {};

        // Get default layouts for current widgets
        const defaultLayouts = {
          lg: generateDefaultLayout(widgets),
          md: generateDefaultLayout(widgets),
          sm: generateDefaultLayout(widgets),
          xs: generateDefaultLayout(widgets),
        };

        Object.keys(defaultLayouts).forEach((breakpoint) => {
          const saved = parsedLayout[breakpoint] || [];
          const defaults =
            defaultLayouts[breakpoint as keyof typeof defaultLayouts];

          // Create a map of saved layouts by widget id
          const savedMap = new Map<string, Layout>(
            saved.map((item: Layout) => [item.i, item])
          );

          // Merge: use saved layout if exists, otherwise use default
          mergedLayouts[breakpoint] = defaults.map((defaultItem: Layout) => {
            const savedItem = savedMap.get(defaultItem.i);
            return savedItem ? savedItem : defaultItem;
          });
        });

        return mergedLayouts;
      } catch (e) {
        console.error("Failed to parse saved layout:", e);
      }
    }

    // Return default layout only if no saved layout exists
    const defaultLayouts = {
      lg: generateDefaultLayout(widgets),
      md: generateDefaultLayout(widgets),
      sm: generateDefaultLayout(widgets),
      xs: generateDefaultLayout(widgets),
    };
    return defaultLayouts;
  });

  const [maximizedWidget, setMaximizedWidget] = useState<string | null>(null);

  // Handle new widgets being added without resetting existing layout
  useEffect(() => {
    const layoutWidgetIds = new Set(
      Object.values(layouts)
        .flat()
        .map((l) => l.i)
    );

    // Check if there are new widgets that don't have layout entries
    const newWidgets = widgets.filter((w) => !layoutWidgetIds.has(w.id));

    if (newWidgets.length > 0) {
      // Add default layouts for new widgets
      setLayouts((prevLayouts) => {
        const updatedLayouts: { [key: string]: Layout[] } = {};

        Object.keys(prevLayouts).forEach((breakpoint) => {
          const existingLayouts = prevLayouts[breakpoint];
          const newLayouts = generateDefaultLayout(newWidgets);

          // Find the next available position for new widgets
          const maxY = Math.max(...existingLayouts.map((l) => l.y + l.h), 0);
          const adjustedNewLayouts = newLayouts.map((layout, index) => ({
            ...layout,
            y: maxY + index * 8, // Stack new widgets vertically
          }));

          updatedLayouts[breakpoint] = [
            ...existingLayouts,
            ...adjustedNewLayouts,
          ];
        });

        return updatedLayouts;
      });
    }
  }, [widgets, layouts]);

  // Save layout to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("dashboard-layout", JSON.stringify(layouts));
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

  // Filter widgets based on visibility
  const displayedWidgets = visibleWidgets
    ? widgets.filter((w) => visibleWidgets.includes(w.id))
    : widgets;

  // If a widget is maximized, show only that widget
  if (maximizedWidget) {
    const widget = widgets.find((w) => w.id === maximizedWidget);
    if (!widget) return null;

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
      className={cn("h-full w-full overflow-auto customScrollbar2", className)}
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

      {/* Custom styles for react-grid-layout */}
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

        /* Hide resize handle for non-resizable widgets */
        .react-grid-item[data-resizable="false"] .react-resizable-handle {
          display: none !important;
        }
      `}</style>

      <style jsx global>{`
        .react-grid-layout {
          position: relative;
        }

        .react-grid-item {
          transition: all 200ms ease;
          transition-property: left, top, width, height;
        }

        .react-grid-item.cssTransforms {
          transition-property: transform, width, height;
        }

        .react-grid-item.resizing {
          transition: none;
          z-index: 100;
        }

        .react-grid-item.react-draggable-dragging {
          transition: none;
          z-index: 100;
        }

        .react-grid-item.dropping {
          visibility: hidden;
        }

        .react-grid-item.react-grid-placeholder {
          background: hsl(var(--primary) / 0.2);
          opacity: 0.2;
          transition-duration: 100ms;
          z-index: 2;
          border-radius: 1rem;
          border: 2px dashed hsl(var(--primary));
        }

        .react-resizable-handle {
          position: absolute;
          width: 20px;
          height: 20px;
        }

        .react-resizable-handle-se {
          bottom: 0;
          right: 0;
          cursor: se-resize;
        }

        .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 5px;
          height: 5px;
          border-right: 2px solid hsl(var(--muted-foreground) / 0.4);
          border-bottom: 2px solid hsl(var(--muted-foreground) / 0.4);
        }
      `}</style>
    </div>
  );
};
