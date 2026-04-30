import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

const REPAIR_COOLDOWN_MS = 5 * 60 * 1000;
const REPAIR_STORAGE_PREFIX = "hyperclaw:agentic-stack:repair:";

export type AgenticStackAdapterName =
  | "claude-code"
  | "codex"
  | "cursor"
  | "hermes"
  | "openclaw";

export type AgenticStackMergePolicy =
  | "overwrite"
  | "skip_if_exists"
  | "merge_or_alert";

export interface AgenticStackFileStatus {
  src: string;
  dst: string;
  mergePolicy: AgenticStackMergePolicy;
  installed: boolean;
  targetPath: string;
}

export interface AgenticStackAdapterStatus {
  name: AgenticStackAdapterName;
  description: string;
  installed: boolean;
  files: AgenticStackFileStatus[];
  filesAlerted?: string[];
  installedAt?: string;
  brainRootPrimitive?: string;
  postInstall?: string[];
  skillsLink?: {
    target: string;
    dst: string;
    fallback?: string;
  };
}

export interface AgenticStackLogEntry {
  time: string;
  level: "info" | "warning" | "error" | string;
  message: string;
}

export interface AgenticStackStatus {
  success?: boolean;
  error?: string;
  targetRoot?: string;
  brainRoot?: string;
  brainPresent?: boolean;
  installState?: string;
  adapters?: AgenticStackAdapterStatus[];
  logs?: AgenticStackLogEntry[];
}

export interface AgenticStackDoctor {
  success?: boolean;
  error?: string;
  targetRoot?: string;
  ok?: boolean;
  warnings?: string[];
  adapters?: AgenticStackAdapterStatus[];
  logs?: AgenticStackLogEntry[];
}

export interface AgenticStackParams {
  agentId: string;
  runtime?: string;
  projectPath?: string;
  targetRoot?: string;
  stackRoot?: string;
}

export function normalizeAgenticStackRuntime(runtime?: string): AgenticStackAdapterName | null {
  if (!runtime) return "openclaw";
  if (runtime === "code") return "claude-code";
  if (
    runtime === "claude-code" ||
    runtime === "codex" ||
    runtime === "cursor" ||
    runtime === "hermes" ||
    runtime === "openclaw"
  ) {
    return runtime;
  }
  return null;
}

function payload(params: AgenticStackParams, adapter?: string) {
  return {
    agentId: params.agentId,
    runtime: params.runtime,
    projectPath: params.projectPath,
    targetRoot: params.targetRoot,
    stackRoot: params.stackRoot,
    ...(adapter ? { adapter } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBridgeResponse<T extends AgenticStackStatus | AgenticStackDoctor>(
  response: unknown,
): T {
  if (!isRecord(response)) {
    return { success: false, error: "Malformed bridge response" } as T;
  }
  return response as T;
}

function getLastRepairAttempt(repairKey: string): number {
  if (typeof window === "undefined") return 0;
  const value = window.sessionStorage.getItem(`${REPAIR_STORAGE_PREFIX}${repairKey}`);
  const timestamp = value ? Number(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function setLastRepairAttempt(repairKey: string, timestamp: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${REPAIR_STORAGE_PREFIX}${repairKey}`, String(timestamp));
}

export async function getAgenticStackStatus(params: AgenticStackParams): Promise<AgenticStackStatus> {
  return normalizeBridgeResponse<AgenticStackStatus>(
    await bridgeInvoke("agentic-stack-status", payload(params)),
  );
}

export async function listAgenticStackAdapters(params: AgenticStackParams): Promise<AgenticStackStatus> {
  return normalizeBridgeResponse<AgenticStackStatus>(
    await bridgeInvoke("agentic-stack-adapter-list", payload(params)),
  );
}

export async function addAgenticStackAdapter(
  params: AgenticStackParams,
  adapter: string,
): Promise<AgenticStackStatus> {
  return normalizeBridgeResponse<AgenticStackStatus>(
    await bridgeInvoke("agentic-stack-adapter-add", payload(params, adapter)),
  );
}

export async function removeAgenticStackAdapter(
  params: AgenticStackParams,
  adapter: string,
): Promise<AgenticStackStatus> {
  return normalizeBridgeResponse<AgenticStackStatus>(
    await bridgeInvoke("agentic-stack-adapter-remove", payload(params, adapter)),
  );
}

export async function runAgenticStackDoctor(params: AgenticStackParams): Promise<AgenticStackDoctor> {
  return normalizeBridgeResponse<AgenticStackDoctor>(
    await bridgeInvoke("agentic-stack-doctor", payload(params)),
  );
}

export async function ensureAgenticStackAdapter(
  params: AgenticStackParams,
  options: { force?: boolean } = {},
): Promise<AgenticStackStatus> {
  const adapter = normalizeAgenticStackRuntime(params.runtime);
  if (!adapter) {
    return { success: false, error: `Unsupported agentic-stack runtime: ${params.runtime ?? "unknown"}` };
  }
  const scopedParams = { ...params, runtime: adapter };
  const repairKey = `${params.agentId}:${adapter}:${params.targetRoot ?? params.projectPath ?? ""}`;
  const status = await getAgenticStackStatus(scopedParams);
  if (status.success === false || status.error) return status;
  const installed = status.adapters?.some((item) => item.name === adapter && item.installed) ?? false;
  if (!installed) {
    const result = await addAgenticStackAdapter(scopedParams, adapter);
    setLastRepairAttempt(repairKey, Date.now());
    return result;
  }
  const doctor = await runAgenticStackDoctor(scopedParams);
  if (doctor.success === false || doctor.error) {
    return {
      success: false,
      error: doctor.error ?? "Agentic stack doctor failed",
      logs: doctor.logs,
    };
  }
  const needsRepair = options.force === true || doctor.ok === false || (doctor.warnings?.length ?? 0) > 0;
  if (!needsRepair) {
    return {
      ...status,
      logs: [...(status.logs ?? []), ...(doctor.logs ?? [])],
    };
  }
  const now = Date.now();
  if (!options.force) {
    const lastRepair = getLastRepairAttempt(repairKey);
    if (now - lastRepair < REPAIR_COOLDOWN_MS) {
      return {
        ...status,
        error: undefined,
        logs: [...(status.logs ?? []), ...(doctor.logs ?? [])],
      };
    }
  }
  setLastRepairAttempt(repairKey, now);
  const repaired = await addAgenticStackAdapter(scopedParams, adapter);
  return {
    ...repaired,
    logs: [...(status.logs ?? []), ...(doctor.logs ?? []), ...(repaired.logs ?? [])],
  };
}
