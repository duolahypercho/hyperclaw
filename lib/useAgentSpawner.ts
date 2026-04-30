import { useCallback } from "react";

interface SpawnAgentParams {
  taskId: string;
  agentId: string;
  taskTitle: string;
  taskDescription?: string;
  document?: string;
  context?: Record<string, unknown>;
}

interface SpawnResult {
  success: boolean;
  error?: string;
  stdout?: string;
  taskId: string;
  agentId: string;
}

// Standalone function that can be called from anywhere
export async function spawnAgentForTask(params: SpawnAgentParams): Promise<SpawnResult> {
  try {
    const { hubCommand } = await import("$/lib/hub-direct");
    const result = await hubCommand({ action: "spawn-agent-for-task", ...params });
    return result as SpawnResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to spawn agent",
      taskId: params.taskId,
      agentId: params.agentId
    };
  }
}

// Hook version for React components that want to use it with useCallback
export function useAgentSpawner() {
  const spawn = useCallback(async (params: SpawnAgentParams): Promise<SpawnResult> => {
    return spawnAgentForTask(params);
  }, []);

  return { spawnAgentForTask: spawn };
}

// Agent spawning is always available via hub
export function isAgentSpawnAvailable(): boolean {
  return typeof window !== "undefined";
}
