/**
 * CEO Heartbeat — utilities for parsing structured CEO output
 * and applying task mutations to the board.
 */
import type { CEOHeartbeatResult, CEOHeartbeatConfig } from "$/types/electron";
import { dashboardState } from "./dashboard-state";

const DEFAULT_CONFIG: CEOHeartbeatConfig = {
  enabled: false,
  intervalMs: 30 * 60 * 1000,
  runtime: "openclaw",
  agentId: "hyperclaw",
  maxTasksPerBeat: 5,
  goals: [],
};

/** Load CEO heartbeat config from dashboard state */
export function loadHeartbeatConfig(): CEOHeartbeatConfig {
  const raw = dashboardState.get("ceo-heartbeat-config");
  if (!raw) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Save CEO heartbeat config to dashboard state */
export function saveHeartbeatConfig(config: Partial<CEOHeartbeatConfig>): void {
  const current = loadHeartbeatConfig();
  const merged = { ...current, ...config };
  dashboardState.set("ceo-heartbeat-config", JSON.stringify(merged), { flush: true });
}

/**
 * Parse a CEO heartbeat response. The CEO is instructed to return a JSON block
 * with createTasks, updateTasks, and notes fields.
 *
 * Handles:
 *  - Pure JSON response
 *  - Markdown-wrapped JSON (```json ... ```)
 *  - Mixed text with embedded JSON block
 */
export function parseHeartbeatResult(raw: string): CEOHeartbeatResult | null {
  if (!raw?.trim()) return null;

  // Try pure JSON first
  try {
    const parsed = JSON.parse(raw.trim());
    if (isHeartbeatResult(parsed)) return parsed;
  } catch {
    // Not pure JSON, try extracting
  }

  // Try extracting from markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (isHeartbeatResult(parsed)) return parsed;
    } catch {
      // Invalid JSON in code block
    }
  }

  // Try finding any JSON object in the text
  const jsonMatch = raw.match(/\{[\s\S]*"(?:createTasks|updateTasks|notes)"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isHeartbeatResult(parsed)) return parsed;
    } catch {
      // Malformed JSON
    }
  }

  return null;
}

function isHeartbeatResult(obj: unknown): obj is CEOHeartbeatResult {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    "createTasks" in o ||
    "updateTasks" in o ||
    "notes" in o
  );
}

/**
 * Apply CEO heartbeat mutations to the task board.
 * Returns a summary of what was applied.
 */
export async function applyHeartbeatMutations(
  result: CEOHeartbeatResult,
  config: CEOHeartbeatConfig,
  addTask: (task: {
    title: string;
    description?: string;
    assignedAgentId?: string;
    originKind: "ceo_heartbeat";
    originId?: string;
    projectId?: string;
  }) => Promise<void>,
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<void>,
): Promise<{ created: number; updated: number; capped: boolean }> {
  let created = 0;
  let updated = 0;
  let capped = false;

  // Create tasks (capped at maxTasksPerBeat)
  if (result.createTasks?.length) {
    const toCreate = result.createTasks.slice(0, config.maxTasksPerBeat);
    capped = result.createTasks.length > config.maxTasksPerBeat;

    for (const t of toCreate) {
      await addTask({
        title: t.title,
        description: t.description,
        assignedAgentId: t.assigneeAgentId,
        originKind: "ceo_heartbeat",
        originId: `heartbeat-${Date.now()}`,
        projectId: t.projectId,
      });
      created++;
    }
  }

  // Update existing tasks
  if (result.updateTasks?.length) {
    for (const u of result.updateTasks) {
      const patch: Record<string, unknown> = {};
      if (u.status) patch.status = u.status;
      if (u.priority) patch.priority = u.priority;
      if (u.assigneeAgentId) patch.assigneeAgentId = u.assigneeAgentId;
      if (Object.keys(patch).length > 0) {
        await updateTask(u.id, patch);
        updated++;
      }
    }
  }

  return { created, updated, capped };
}
