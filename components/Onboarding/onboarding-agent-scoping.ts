export type OnboardingChannelSupportedRuntime = "hermes" | "openclaw";

export interface OnboardingAgentProfile {
  runtime: string;
  name: string;
  description?: string;
}

export interface OnboardingChannelConfig {
  channel: "telegram" | "discord" | "slack" | "whatsapp";
  target: string;
  botToken: string;
  appToken: string;
}

export interface OnboardingRuntimeChannelConfig {
  runtime: OnboardingChannelSupportedRuntime;
  agentId?: string;
  agentName?: string;
  channels: OnboardingChannelConfig[];
}

export interface OnboardingAgentProvisionTarget<TProfile extends OnboardingAgentProfile = OnboardingAgentProfile> {
  profile: TProfile;
  agentId: string;
  baseId: string;
  isMainAgent: boolean;
}

export interface OnboardingAgentPresence {
  id?: string;
  runtime?: string;
}

export function toOnboardingSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function supportsOnboardingChannelSetup(
  runtime: string,
): runtime is OnboardingChannelSupportedRuntime {
  return runtime === "hermes" || runtime === "openclaw";
}

function usesImplicitMainAgent(runtime: string): boolean {
  return runtime === "openclaw";
}

export function buildOnboardingAgentProvisionTargets<TProfile extends OnboardingAgentProfile>(
  profiles: TProfile[],
): Array<OnboardingAgentProvisionTarget<TProfile>> {
  const usedAgentIds = new Set<string>();
  const runtimeMainClaimed = new Set<string>();

  return profiles.map((profile) => {
    const runtimeHasDefault = usesImplicitMainAgent(profile.runtime);
    const baseId = toOnboardingSlug(profile.name) || profile.runtime;
    const runtimeSlug = toOnboardingSlug(profile.runtime) || "agent";
    let agentId: string;

    if (runtimeHasDefault && !runtimeMainClaimed.has(profile.runtime)) {
      agentId = "main";
      runtimeMainClaimed.add(profile.runtime);
    } else {
      agentId = baseId;
      if (agentId === "main" || usedAgentIds.has(agentId)) {
        agentId = `${baseId}-${runtimeSlug}`;
      }
      let suffix = 2;
      while (usedAgentIds.has(agentId)) {
        agentId = `${baseId}-${runtimeSlug}-${suffix}`;
        suffix++;
      }
    }

    usedAgentIds.add(agentId);
    return {
      profile,
      agentId,
      baseId,
      isMainAgent: runtimeHasDefault && agentId === "main",
    };
  });
}

export function buildAgentScopedRuntimeChannelConfigs<TProfile extends OnboardingAgentProfile>(
  profiles: TProfile[],
  configs: OnboardingRuntimeChannelConfig[],
): OnboardingRuntimeChannelConfig[] {
  const configsByRuntime = new Map<OnboardingChannelSupportedRuntime, OnboardingRuntimeChannelConfig>();
  const configsByRuntimeAndAgent = new Map<string, OnboardingRuntimeChannelConfig>();

  for (const config of configs) {
    if (config.agentId) {
      configsByRuntimeAndAgent.set(`${config.runtime}:${config.agentId}`, config);
    } else if (!configsByRuntime.has(config.runtime)) {
      configsByRuntime.set(config.runtime, config);
    }
  }

  return buildOnboardingAgentProvisionTargets(profiles)
    .filter(({ profile }) => (
      !!profile.name.trim() &&
      !!profile.description?.trim()
    ))
    .flatMap(({ profile, agentId }) => {
      const runtime = profile.runtime;
      if (!supportsOnboardingChannelSetup(runtime)) return [];

      const source =
        configsByRuntimeAndAgent.get(`${runtime}:${agentId}`) ??
        configsByRuntime.get(runtime);

      if (!source) return [];

      return [{
        ...source,
        runtime,
        agentId,
        agentName: profile.name.trim(),
        channels: source.channels.map((channel) => ({ ...channel })),
      }];
    });
}

export function isOnboardingAgentProvisionTargetPresent<TProfile extends OnboardingAgentProfile>(
  target: OnboardingAgentProvisionTarget<TProfile>,
  agents: OnboardingAgentPresence[],
): boolean {
  const expectedRuntime = target.profile.runtime;
  const expectedId = target.agentId;

  return agents.some((agent) => {
    const id = agent.id?.trim() ?? "";
    if (id !== expectedId) return false;
    const runtime = agent.runtime?.trim();
    if (!runtime) return true;
    return runtime === expectedRuntime;
  });
}
