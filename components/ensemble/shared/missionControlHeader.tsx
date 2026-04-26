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

interface MissionControlHeaderContextValue {
  activeProject: MissionControlHeaderProject | null;
  setActiveProject: (project: MissionControlHeaderProject | null) => void;
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

  const value = useMemo(
    () => ({ activeProject, setActiveProject }),
    [activeProject, setActiveProject],
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
  };
}
