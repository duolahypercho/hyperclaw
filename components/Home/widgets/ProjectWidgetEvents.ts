"use client";

export const OPEN_PROJECT_PANEL_EVENT = "open-project-panel";

export function dispatchOpenProjectPanel(projectId: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_PROJECT_PANEL_EVENT, { detail: { projectId } })
  );
}
