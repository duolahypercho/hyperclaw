"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Lightweight project info the SiteHeader needs to render the
 * "Hypercho / Mission Control / <project>" breadcrumb and the Edit action.
 *
 * Kept structural so this module doesn't take a hard dependency on the
 * bridge / project provider types.
 */
export interface MissionControlHeaderProject {
  id: string;
  name: string;
  emoji?: string;
}

/**
 * Lightweight contract for the action callbacks MissionControl publishes up
 * to the page-level SiteHeader. Lives on the provider so the toolbar can
 * render Refresh / Configure in the global header without MissionControl
 * needing to know about the page's app schema.
 */
export interface MissionControlHeaderActions {
  onRefresh?: () => void;
  onConfigure?: () => void;
  onFind?: () => void;
  /**
   * Toggle visibility of the right-hand Inspector panel from the SiteHeader.
   * MissionControl owns the open/closed state; the header just calls back.
   */
  onToggleInspector?: () => void;
  /** True when the Inspector is currently visible — drives the toggle button label/icon. */
  inspectorOpen?: boolean;
  /** True while the active workflow run is being re-fetched — used to spin the Refresh icon. */
  loadingRun?: boolean;
  /** Compact run status shown next to the Mission Control breadcrumb. */
  runStatus?: string;
  /** Latest cost estimate for the active run, formatted for display. */
  runCost?: string;
  /** Monthly spend estimate, formatted for display when available. */
  monthlyCost?: string;
  /** True when a run exists, used to enable/disable run-only controls. */
  hasActiveRun?: boolean;
}

interface MissionControlHeaderContextValue {
  activeProject: MissionControlHeaderProject | null;
  setActiveProject: (project: MissionControlHeaderProject | null) => void;
  actions: MissionControlHeaderActions;
  setActions: (actions: MissionControlHeaderActions) => void;
}

const MissionControlHeaderContext =
  createContext<MissionControlHeaderContextValue | null>(null);

export function MissionControlHeaderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeProject, setActiveProjectState] =
    useState<MissionControlHeaderProject | null>(null);
  const [actions, setActionsState] = useState<MissionControlHeaderActions>({});

  const setActiveProject = useCallback(
    (project: MissionControlHeaderProject | null) => {
      setActiveProjectState((prev) => {
        if (prev?.id === project?.id && prev?.name === project?.name) {
          return prev;
        }
        return project;
      });
    },
    [],
  );

  const setActions = useCallback((next: MissionControlHeaderActions) => {
    setActionsState((prev) => {
      if (
        prev.onRefresh === next.onRefresh &&
        prev.onConfigure === next.onConfigure &&
        prev.onFind === next.onFind &&
        prev.onToggleInspector === next.onToggleInspector &&
        prev.inspectorOpen === next.inspectorOpen &&
        prev.loadingRun === next.loadingRun &&
        prev.runStatus === next.runStatus &&
        prev.runCost === next.runCost &&
        prev.monthlyCost === next.monthlyCost &&
        prev.hasActiveRun === next.hasActiveRun
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ activeProject, setActiveProject, actions, setActions }),
    [activeProject, setActiveProject, actions, setActions],
  );

  return (
    <MissionControlHeaderContext.Provider value={value}>
      {children}
    </MissionControlHeaderContext.Provider>
  );
}

/**
 * Read + update the active mission-control project. Safe to call when no
 * provider is mounted — returns a no-op context, which keeps MissionControl
 * usable in isolation (e.g. embedded in storybook / tests).
 */
export function useMissionControlHeader(): MissionControlHeaderContextValue {
  const ctx = useContext(MissionControlHeaderContext);
  if (ctx) return ctx;
  return {
    activeProject: null,
    setActiveProject: () => {
      /* no-op outside provider */
    },
    actions: {},
    setActions: () => {
      /* no-op outside provider */
    },
  };
}
