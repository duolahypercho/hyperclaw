import { Widget } from "$/components/Home/Dashboard";

export interface CustomProps {
  widget: Widget;
  isMaximized: boolean;
  onMaximize: () => void;
  isEditMode: boolean;
}
