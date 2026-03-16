import { Widget } from "$/components/Home/Dashboard";

export interface CustomProps {
  widget: Widget;
  isMaximized: boolean;
  onMaximize: () => void;
  isEditMode: boolean;
  /** Persist widget-specific config to dashboardState (SQLite) so it syncs across devices. */
  onConfigChange?: (config: Record<string, unknown>) => void;
}
