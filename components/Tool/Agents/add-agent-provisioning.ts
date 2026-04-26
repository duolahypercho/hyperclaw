import type { AgentUserProfile } from "$/lib/agent-templates";
import { mergeRuntimeChannelConfigs } from "$/components/ensemble/views/team-channel-config-state";
import type {
  OnboardingChannelConfig,
  OnboardingRuntimeChannelConfig,
  OnboardingChannelSupportedRuntime,
} from "$/components/Onboarding/onboarding-agent-scoping";

export type AddAgentProvisionInput = {
  agentId: string;
  runtime: string;
  name: string;
  role: string;
  description: string;
  emoji: string;
  avatarDataUri?: string | null;
  mainModel?: string;
  companyName?: string;
  companyDescription?: string;
  runtimeChannelConfigs?: OnboardingRuntimeChannelConfig[];
  agentChannelConfigs?: OnboardingRuntimeChannelConfig[];
  userProfile?: AgentUserProfile;
};

export type AddAgentProvisionPayload = {
  agentId: string;
  runtime: string;
  name: string;
  role: string;
  description: string;
  emojiEnabled: boolean;
  emoji: string;
  avatarDataUri: string;
  mainModel: string;
  companyName: string;
  companyDescription: string;
  runtimeChannelConfigs: OnboardingRuntimeChannelConfig[];
  agentChannelConfigs: OnboardingRuntimeChannelConfig[];
  userName: string;
  userEmail: string;
  userAboutMe: string;
};

export type AgentIdentityUpdatePayload = {
  agentId: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  runtime: string;
  avatarData?: string;
};

export type AgentProvisionBridgeAction =
  | "onboarding-provision-agent"
  | "openclaw-doctor-fix";

export type AgentProvisionBridgeInvoke = (
  action: AgentProvisionBridgeAction,
  body?: AddAgentProvisionPayload,
) => Promise<unknown>;

export type AgentProvisionResult = {
  success?: boolean;
  error?: string;
  message?: string;
  stderr?: string;
  stdout?: string;
  detail?: string;
};

export type AgentProvisionRetryInfo = {
  failedAttempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
  value: unknown;
};

export type AgentChannelProvisionPayloadFields = Pick<
  AddAgentProvisionInput,
  "runtimeChannelConfigs" | "agentChannelConfigs"
>;

export type BuildScopedAgentChannelConfigInput = {
  runtime: string;
  agentId: string;
  agentName: string;
  channels: OnboardingChannelConfig[];
};

const SENSITIVE_TOKEN_PATTERNS = [
  /\b(?:xox[baprs]|xapp)-[A-Za-z0-9-]+\b/g,
  /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g,
  /\b((?:bot|app|api|access|refresh)[_-]?token\s*[:=]\s*)\S+/gi,
];

export function scrubSensitiveTokens(value: string): string {
  return SENSITIVE_TOKEN_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, (match, prefix?: string) => (
      typeof prefix === "string" && prefix ? `${prefix}[REDACTED]` : "[REDACTED]"
    )),
    value,
  );
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function supportsAgentChannelSetup(runtime: string): runtime is OnboardingChannelSupportedRuntime {
  return runtime === "openclaw" || runtime === "hermes";
}

function hasChannelConfig(channel: OnboardingChannelConfig): boolean {
  return !!(
    clean(channel.target) ||
    clean(channel.botToken) ||
    clean(channel.appToken)
  );
}

function getErrorMessage(value: unknown): string {
  if (typeof value === "string") return scrubSensitiveTokens(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = [
      value instanceof Error ? value.message : undefined,
      record.error,
      value instanceof Error ? undefined : record.message,
      record.stderr,
      record.stdout,
      record.detail,
    ]
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .map(scrubSensitiveTokens)
      .filter(Boolean);

    return Array.from(new Set(parts)).join(" ");
  }
  return "";
}

export function isOpenClawConfigMutationConflict(value: unknown): boolean {
  const message = getErrorMessage(value);
  return /ConfigMutationConflictError|config changed since last load/i.test(message);
}

export function isOpenClawRecoverableConfigInvalid(value: unknown): boolean {
  const message = getErrorMessage(value);
  return (
    /Config invalid/i.test(message) &&
    /unknown channel id/i.test(message) &&
    /openclaw doctor --fix/i.test(message)
  );
}

export function isOpenClawBindingTimeoutAfterSuccess(value: unknown): boolean {
  const message = getErrorMessage(value);
  return (
    /command timed out|timed out after/i.test(message) &&
    /OpenClaw agent binding failed|failed to bind OpenClaw agent|openclaw\.json/i.test(message) &&
    /Added bindings:\s*-/i.test(message)
  );
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSuccessfulResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as AgentProvisionResult).success === true;
}

function exhaustedConflictResult(value: unknown): AgentProvisionResult {
  const message = getErrorMessage(value);
  return {
    success: false,
    error: message
      ? `OpenClaw agent provisioning failed after retrying config mutation conflicts. Last error: ${message}`
      : "OpenClaw agent provisioning failed after retrying config mutation conflicts.",
  };
}

export function buildAddAgentProvisionPayload(
  input: AddAgentProvisionInput,
): AddAgentProvisionPayload {
  const emoji = clean(input.emoji);
  const userProfile = input.userProfile;

  return {
    agentId: input.agentId,
    runtime: input.runtime,
    name: clean(input.name),
    role: clean(input.role),
    description: clean(input.description),
    emojiEnabled: !!emoji,
    emoji,
    avatarDataUri: clean(input.avatarDataUri),
    mainModel: input.mainModel === "__default__" ? "" : clean(input.mainModel),
    companyName: clean(input.companyName),
    companyDescription: clean(input.companyDescription),
    runtimeChannelConfigs: input.runtimeChannelConfigs ?? [],
    agentChannelConfigs: input.agentChannelConfigs ?? [],
    userName: clean(userProfile?.name?.trim() || userProfile?.username),
    userEmail: clean(userProfile?.email),
    userAboutMe: clean(userProfile?.about),
  };
}

export function buildScopedAgentChannelConfigs(
  input: BuildScopedAgentChannelConfigInput,
): OnboardingRuntimeChannelConfig[] {
  if (!supportsAgentChannelSetup(input.runtime)) return [];

  const channels = input.channels
    .filter(hasChannelConfig)
    .map((channel) => ({
      channel: channel.channel,
      target: clean(channel.target),
      botToken: clean(channel.botToken),
      appToken: clean(channel.appToken),
    }));

  if (channels.length === 0) return [];

  return [{
    runtime: input.runtime,
    agentId: clean(input.agentId),
    agentName: clean(input.agentName),
    channels,
  }];
}

export function buildChannelProvisionPayloadFields(
  runtime: string,
  scopedChannelConfigs: OnboardingRuntimeChannelConfig[],
): AgentChannelProvisionPayloadFields {
  return {
    runtimeChannelConfigs: runtime === "openclaw" ? scopedChannelConfigs : [],
    agentChannelConfigs: runtime === "hermes" ? scopedChannelConfigs : [],
  };
}

export function buildGuidedChannelStateWithAgentConfigs(
  rawState: string | null,
  scopedChannelConfigs: OnboardingRuntimeChannelConfig[],
): string {
  let parsed: {
    runtimeChannelConfigs?: OnboardingRuntimeChannelConfig[];
    agentChannelConfigs?: OnboardingRuntimeChannelConfig[];
    [key: string]: unknown;
  } = {};

  if (rawState) {
    try {
      parsed = JSON.parse(rawState) as typeof parsed;
    } catch {
      parsed = {};
    }
  }

  const merged = mergeRuntimeChannelConfigs(
    mergeRuntimeChannelConfigs(
      parsed.agentChannelConfigs ?? [],
      parsed.runtimeChannelConfigs ?? [],
    ),
    scopedChannelConfigs,
  );

  return JSON.stringify({
    ...parsed,
    runtimeChannelConfigs: merged,
    agentChannelConfigs: merged,
  });
}

export function buildAgentIdentityUpdatePayload(
  input: AddAgentProvisionInput,
): AgentIdentityUpdatePayload {
  const avatarData = clean(input.avatarDataUri);
  return {
    agentId: input.agentId,
    name: clean(input.name),
    emoji: clean(input.emoji),
    role: clean(input.role),
    description: clean(input.description),
    runtime: clean(input.runtime),
    ...(avatarData ? { avatarData } : {}),
  };
}

export async function provisionAgentWithConfigConflictRetry(
  invoke: AgentProvisionBridgeInvoke,
  payload: AddAgentProvisionPayload,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    onRetry?: (info: AgentProvisionRetryInfo) => void;
  } = {},
): Promise<AgentProvisionResult> {
  // Only OpenClaw writes through the config mutation path that can report this
  // optimistic conflict. Other runtimes should fail fast with their original error.
  // A successful doctor repair earns one extra provisioning attempt so a
  // repair on the final normal attempt can still retry the original action.
  let maxAttempts = payload.runtime === "openclaw"
    ? Math.max(1, options.maxAttempts ?? 3)
    : 1;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let repairedInvalidConfig = false;

  const repairInvalidConfig = async (value: unknown): Promise<AgentProvisionResult | null> => {
    if (
      payload.runtime !== "openclaw" ||
      repairedInvalidConfig ||
      !isOpenClawRecoverableConfigInvalid(value)
    ) {
      return null;
    }

    repairedInvalidConfig = true;

    try {
      const repairResult = await invoke("openclaw-doctor-fix");
      if (isSuccessfulResult(repairResult)) {
        maxAttempts += 1;
        return null;
      }

      const originalMessage = getErrorMessage(value);
      const repairMessage = getErrorMessage(repairResult);
      return {
        success: false,
        error: [
          "OpenClaw config repair failed while preparing agent provisioning.",
          originalMessage ? `Original error: ${originalMessage}` : "",
          repairMessage ? `Repair error: ${repairMessage}` : "Repair error: unknown error",
        ].filter(Boolean).join(" "),
      };
    } catch (repairError) {
      const originalMessage = getErrorMessage(value);
      const repairMessage = getErrorMessage(repairError);
      return {
        success: false,
        error: [
          "OpenClaw config repair failed while preparing agent provisioning.",
          originalMessage ? `Original error: ${originalMessage}` : "",
          repairMessage ? `Repair error: ${repairMessage}` : "Repair error: unknown error",
        ].filter(Boolean).join(" "),
      };
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await invoke("onboarding-provision-agent", payload) as AgentProvisionResult;
      if (result?.success) return result;
      if (payload.runtime === "openclaw" && isOpenClawBindingTimeoutAfterSuccess(result)) {
        return {
          success: true,
          detail: "OpenClaw agent binding completed before the connector timed out.",
        };
      }

      const wasRepaired = repairedInvalidConfig;
      const repairFailure = await repairInvalidConfig(result);
      if (repairFailure) return repairFailure;
      if (!wasRepaired && repairedInvalidConfig && isOpenClawRecoverableConfigInvalid(result)) {
        continue;
      }

      const isConflict = isOpenClawConfigMutationConflict(result);
      const shouldRetry =
        attempt < maxAttempts &&
        isConflict;

      if (!shouldRetry) {
        return isConflict ? exhaustedConflictResult(result) : result;
      }

      const delayMs = baseDelayMs * attempt;
      options.onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
        value: result,
      });
      await wait(delayMs);
    } catch (error) {
      if (payload.runtime === "openclaw" && isOpenClawBindingTimeoutAfterSuccess(error)) {
        return {
          success: true,
          detail: "OpenClaw agent binding completed before the connector timed out.",
        };
      }

      const wasRepaired = repairedInvalidConfig;
      const repairFailure = await repairInvalidConfig(error);
      if (repairFailure) return repairFailure;
      if (!wasRepaired && repairedInvalidConfig && isOpenClawRecoverableConfigInvalid(error)) {
        continue;
      }

      const isConflict = isOpenClawConfigMutationConflict(error);
      const shouldRetry =
        attempt < maxAttempts &&
        isConflict;

      if (!shouldRetry) {
        if (isConflict) return exhaustedConflictResult(error);
        return {
          success: false,
          error: getErrorMessage(error) || "Agent provisioning failed.",
        };
      }

      const delayMs = baseDelayMs * attempt;
      options.onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
        value: error,
      });
      await wait(delayMs);
    }
  }

  return { success: false, error: "OpenClaw agent provisioning failed after retrying config mutation conflicts." };
}
