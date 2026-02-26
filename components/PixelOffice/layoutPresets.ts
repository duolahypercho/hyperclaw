import type { OfficeLayout } from "./office/types";
import { migrateLayoutColors } from "./office/layout/layoutSerializer";

import defaultTemplateRaw from "./pixel-office-layout1.json";

const defaultTemplate = migrateLayoutColors(defaultTemplateRaw as OfficeLayout);

export interface LayoutPreset {
  id: string;
  name: string;
  layout: OfficeLayout;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "default",
    name: "Default",
    layout: defaultTemplate,
  },
  {
    id: "Hyperclaw Office",
    name: "Hyperclaw Office",
    layout: defaultTemplate,
  }
];

export function getPresetById(id: string): OfficeLayout | null {
  const preset = LAYOUT_PRESETS.find((p) => p.id === id);
  return preset ? preset.layout : null;
}
