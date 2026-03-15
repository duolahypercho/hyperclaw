"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { OfficeState } from "./office/engine/officeState";
import type { OfficeLayout, ToolActivity } from "./office/types";
import { createDefaultLayout, deserializeLayout, migrateLayoutColors } from "./office/layout/layoutSerializer";
import { getPresetById } from "./layoutPresets";
import { useOfficeEngine } from "./officeEngineConfig";
import { usePixelOffice } from "./provider/pixelOfficeProvider";
import type { EmployeeCronJob, EmployeePreviousTask } from "./provider/pixelOfficeProvider";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { SubagentCharacter } from "./office/types";
import { LAYOUT_STORAGE_KEY, DEFAULT_LAYOUT_STORAGE_KEY, HAS_USER_LAYOUT_KEY } from "./officeStateSingleton";

export type { SubagentCharacter };

export interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  partOfGroup?: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  status: string;
  currentTask?: string;
  /** Jobs that ran within 10 mins (working). */
  currentWorkingJobs?: { id: string; name: string; schedule: string; agentId?: string }[];
  /** Jobs that ran before (outside 10 min), for "X ago" display. */
  previousTasks?: EmployeePreviousTask[];
  /** Upcoming jobs with nextRunAtMs for "in X" display. */
  nextComingCrons?: EmployeeCronJob[];
}

export interface HyperclawOfficeState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  /** Resolve bridge agent (name, status, currentTask) for a character id. */
  getAgentByCharacterId: (charId: number) => AgentInfo | null;
}

function buildEngineConfig(): import("./officeEngineConfig").OfficeEngineConfig {
  return {
    assetBasePath: "/pixel-office",
    getInitialLayout: async (): Promise<OfficeLayout> => {
      try {
        const r = (await bridgeInvoke("read-office-layout")) as { success?: boolean; layout?: OfficeLayout };
        if (r?.success && r.layout) {
          if (typeof localStorage !== "undefined") localStorage.setItem(HAS_USER_LAYOUT_KEY, "1");
          return migrateLayoutColors(r.layout);
        }
      } catch {
        // fallback to localStorage / preset
      }
      try {
        const saved = typeof localStorage !== "undefined" && localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (saved) {
          const layout = deserializeLayout(saved);
          if (layout) {
            if (typeof localStorage !== "undefined") localStorage.setItem(HAS_USER_LAYOUT_KEY, "1");
            return layout;
          }
        }
        const defaultSaved = typeof localStorage !== "undefined" && localStorage.getItem(DEFAULT_LAYOUT_STORAGE_KEY);
        if (defaultSaved) {
          const layout = deserializeLayout(defaultSaved);
          if (layout) return layout;
        }
        return getPresetById("default") || createDefaultLayout();
      } catch {
        return getPresetById("default") || createDefaultLayout();
      }
    },
  };
}

export function useHyperclawOffice(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void
): HyperclawOfficeState {
  const {
    agents: bridgeAgents,
    statuses: bridgeStatuses,
    currentTasks: bridgeCurrentTasks,
    currentWorkingJobsByAgent,
    previousTasksByAgent,
    nextComingCronsByAgent,
  } = usePixelOffice();
  const config = useMemo(() => buildEngineConfig(), []);
  const { layoutReady } = useOfficeEngine(getOfficeState, config, onLayoutLoaded);
  const [agents, setAgents] = useState<number[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const bridgeIdToCharId = useRef<Map<string, number>>(new Map());
  const nextCharId = useRef(0);

  // Sync bridge agents -> office characters
  useEffect(() => {
    if (!layoutReady) return;
    const os = getOfficeState();
    const current = bridgeAgents;
    const map = bridgeIdToCharId.current;
    const toRemove: number[] = [];
    for (const [bridgeId, charId] of map) {
      if (!current.some((a) => a.id === bridgeId)) {
        toRemove.push(charId);
      }
    }
    for (const charId of toRemove) {
      os.removeAgent(charId);
      for (const [bid, cid] of map) {
        if (cid === charId) {
          map.delete(bid);
          break;
        }
      }
    }
    const charIds: number[] = [];
    const newStatuses: Record<number, string> = {};
    for (const agent of current) {
      let charId = map.get(agent.id);
      if (charId === undefined) {
        charId = nextCharId.current++;
        map.set(agent.id, charId);
        os.addAgent(charId, undefined, undefined, undefined, true);
      }
      charIds.push(charId);
      const status = bridgeStatuses[agent.id] ?? "idle";
      // Active (working) → sit at chair and type at laptop; idle → wander around the office.
      os.setAgentActive(charId, status === "working");
      newStatuses[charId] = status;
    }
    setAgents(charIds);
    setAgentStatuses((prev) => {
      const next = { ...prev };
      for (const charId of toRemove) delete next[charId];
      Object.assign(next, newStatuses);
      return next;
    });
  }, [layoutReady, bridgeAgents, bridgeStatuses, getOfficeState]);

  const getAgentByCharacterId = useCallback(
    (charId: number): AgentInfo | null => {
      // Resolve bridge agent id from character id (direct lookup so the panel always shows the clicked agent's task)
      const map = bridgeIdToCharId.current;
      let bridgeId: string | undefined;
      for (const [bid, cid] of map) {
        if (cid === charId) {
          bridgeId = bid;
          break;
        }
      }
      if (bridgeId == null) return null;
      const agent = bridgeAgents.find((a) => a.id === bridgeId);
      if (!agent) return null;
      return {
        id: agent.id,
        name: agent.name || agent.id,
        status: bridgeStatuses[agent.id] ?? "idle",
        currentTask: bridgeCurrentTasks[agent.id],
        currentWorkingJobs: currentWorkingJobsByAgent[agent.id],
        previousTasks: previousTasksByAgent[agent.id],
        nextComingCrons: nextComingCronsByAgent[agent.id],
      };
    },
    [bridgeAgents, bridgeStatuses, bridgeCurrentTasks, currentWorkingJobsByAgent, previousTasksByAgent, nextComingCronsByAgent]
  );

  return {
    agents,
    selectedAgent: null,
    agentTools: {},
    agentStatuses,
    subagentTools: {},
    subagentCharacters: [],
    layoutReady,
    loadedAssets: undefined,
    getAgentByCharacterId,
  };
}
