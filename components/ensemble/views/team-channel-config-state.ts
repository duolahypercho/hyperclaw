import type {
  OnboardingChannelConfig,
  OnboardingChannelSupportedRuntime,
  OnboardingRuntimeChannelConfig,
} from "$/components/Onboarding/onboarding-agent-scoping";
import type { EnsembleAgentView } from "../hooks/useEnsembleAgents";

export type ChannelType = OnboardingChannelConfig["channel"];
export type ChannelConfigDraft = OnboardingChannelConfig;
export type ChannelSupportedRuntime = OnboardingChannelSupportedRuntime;
export type RuntimeChannelConfigDraft = OnboardingRuntimeChannelConfig;
type ChannelConfigAgentSource = Pick<
  EnsembleAgentView,
  "id" | "name" | "emoji" | "title" | "department" | "identity" | "kind" | "runtimeLabel" | "config" | "avatarData" | "status"
> & { real?: boolean };

export function channelConfigKey(config: Pick<RuntimeChannelConfigDraft, "runtime" | "agentId">): string {
  return `${config.runtime}:${config.agentId || "__runtime__"}`;
}

export function mergeRuntimeChannelConfigs(
  existing: RuntimeChannelConfigDraft[],
  incoming: RuntimeChannelConfigDraft[],
): RuntimeChannelConfigDraft[] {
  const merged = new Map<string, RuntimeChannelConfigDraft>();

  for (const config of existing) {
    merged.set(channelConfigKey(config), cloneRuntimeChannelConfig(config));
  }

  for (const config of incoming) {
    merged.set(channelConfigKey(config), cloneRuntimeChannelConfig(config));
  }

  return Array.from(merged.values());
}

export function normalizeRuntimeChannelConfigForStorage(
  config: RuntimeChannelConfigDraft,
): RuntimeChannelConfigDraft {
  return {
    runtime: config.runtime,
    agentId: config.agentId?.trim() || undefined,
    agentName: config.agentName?.trim() || undefined,
    channels: config.channels.map((channel) => ({
      channel: channel.channel,
      target: (channel.target ?? "").trim(),
      botToken: (channel.botToken ?? "").trim(),
      appToken: (channel.appToken ?? "").trim(),
    })),
  };
}

export function buildAgentChannelConfigPatch(config: RuntimeChannelConfigDraft): Record<string, unknown> {
  const normalized = normalizeRuntimeChannelConfigForStorage(config);
  return {
    runtime: normalized.runtime,
    // Keep both shapes: `channels` is convenient for simple config readers,
    // `channelConfig` preserves runtime + agent metadata for exact routing.
    channels: normalized.channels,
    channelConfig: normalized,
  };
}

export function readAgentChannelConfig(
  agent: Pick<EnsembleAgentView, "id" | "name" | "kind" | "config">,
): RuntimeChannelConfigDraft | undefined {
  if (agent.kind !== "openclaw" && agent.kind !== "hermes") return undefined;

  const source = isRecord(agent.config?.channelConfig)
    ? agent.config.channelConfig
    : undefined;

  if (source && source.runtime === agent.kind && Array.isArray(source.channels)) {
    return normalizeRuntimeChannelConfigForStorage({
      runtime: agent.kind,
      agentId: typeof source.agentId === "string" ? source.agentId : agent.id,
      agentName: typeof source.agentName === "string" ? source.agentName : agent.name,
      channels: source.channels.map(normalizeChannelFromUnknown).filter(isChannelConfigDraft),
    });
  }

  if (Array.isArray(agent.config?.channels)) {
    const channels = agent.config.channels.map(normalizeChannelFromUnknown).filter(isChannelConfigDraft);
    if (channels.length > 0) {
      return normalizeRuntimeChannelConfigForStorage({
        runtime: agent.kind,
        agentId: agent.id,
        agentName: agent.name,
        channels,
      });
    }
  }

  return undefined;
}

export function selectRuntimeChannelConfigForAgent(
  configs: RuntimeChannelConfigDraft[],
  agent: Pick<EnsembleAgentView, "id" | "name" | "kind">,
  activeAgents: Array<Pick<EnsembleAgentView, "id" | "kind">>,
): RuntimeChannelConfigDraft | undefined {
  if (agent.kind !== "openclaw" && agent.kind !== "hermes") return undefined;

  const runtimeConfigs = configs.filter((config) => config.runtime === agent.kind);
  const exactById = runtimeConfigs.find((config) => config.agentId === agent.id);
  if (exactById) return cloneRuntimeChannelConfig(exactById);

  const exactByName = runtimeConfigs.find((config) => config.agentName === agent.name);
  if (exactByName) return cloneRuntimeChannelConfig(exactByName);

  const runtimeOnly = runtimeConfigs.find((config) => !config.agentId);
  if (!runtimeOnly) return undefined;

  const sameRuntimeActiveAgents = activeAgents.filter((active) => active.kind === agent.kind);
  return sameRuntimeActiveAgents.length <= 1 ? cloneRuntimeChannelConfig(runtimeOnly) : undefined;
}

export function getProfileChannelConfigAgents(
  agents: EnsembleAgentView[],
  profileAgent: ChannelConfigAgentSource | undefined,
): EnsembleAgentView[] {
  if (!profileAgent || (profileAgent.kind !== "openclaw" && profileAgent.kind !== "hermes")) return [];

  const existing = agents.find((agent) => agent.id === profileAgent.id);
  if (existing) return [existing];

  return [{
    id: profileAgent.id,
    name: profileAgent.name,
    emoji: profileAgent.emoji,
    title: profileAgent.title,
    department: profileAgent.department,
    identity: profileAgent.identity,
    kind: profileAgent.kind,
    runtimeLabel: profileAgent.runtimeLabel,
    config: profileAgent.config,
    avatarData: profileAgent.avatarData,
    status: profileAgent.status,
    real: profileAgent.real ?? false,
  }];
}

function cloneRuntimeChannelConfig(config: RuntimeChannelConfigDraft): RuntimeChannelConfigDraft {
  return {
    ...config,
    channels: config.channels.map((channel) => ({ ...channel })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeChannelFromUnknown(value: unknown): ChannelConfigDraft | null {
  if (!isRecord(value)) return null;
  const channel = value.channel;
  if (channel !== "telegram" && channel !== "discord" && channel !== "slack" && channel !== "whatsapp") {
    return null;
  }
  return {
    channel,
    target: typeof value.target === "string" ? value.target : "",
    botToken: typeof value.botToken === "string" ? value.botToken : "",
    appToken: typeof value.appToken === "string" ? value.appToken : "",
  };
}

function isChannelConfigDraft(value: ChannelConfigDraft | null): value is ChannelConfigDraft {
  return value !== null;
}
