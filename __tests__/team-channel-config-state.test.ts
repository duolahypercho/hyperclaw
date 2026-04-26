import { describe, expect, it } from "vitest";
import {
  buildAgentChannelConfigPatch,
  channelConfigKey,
  getProfileChannelConfigAgents,
  mergeRuntimeChannelConfigs,
  normalizeRuntimeChannelConfigForStorage,
  selectRuntimeChannelConfigForAgent,
} from "$/components/ensemble/views/team-channel-config-state";
import type { EnsembleAgentView } from "$/components/ensemble/hooks/useEnsembleAgents";

const agent = (id: string, kind: "openclaw" | "hermes", name = id): EnsembleAgentView => ({
  id,
  name,
  emoji: name.charAt(0).toUpperCase(),
  title: kind,
  department: "Team",
  identity: "",
  kind,
  runtimeLabel: kind === "openclaw" ? "OpenClaw" : "Hermes",
  real: true,
});

describe("team channel config state", () => {
  it("selects the saved channel config for the exact runtime agent", () => {
    const openClawMain = {
      runtime: "openclaw" as const,
      agentId: "main",
      agentName: "Main Agent",
      channels: [{ channel: "telegram" as const, target: "111", botToken: "open-token", appToken: "" }],
    };
    const hermesMain = {
      runtime: "hermes" as const,
      agentId: "main-hermes",
      agentName: "Hermes Main",
      channels: [{ channel: "telegram" as const, target: "222", botToken: "hermes-token", appToken: "" }],
    };

    expect(selectRuntimeChannelConfigForAgent(
      [openClawMain, hermesMain],
      agent("main-hermes", "hermes", "Hermes Main"),
      [agent("main", "openclaw", "Main Agent"), agent("main-hermes", "hermes", "Hermes Main")],
    )).toEqual(hermesMain);
  });

  it("keeps OpenClaw and Hermes configs on separate keys even when both use main-like names", () => {
    expect(channelConfigKey({ runtime: "openclaw", agentId: "main" })).toBe("openclaw:main");
    expect(channelConfigKey({ runtime: "hermes", agentId: "main-hermes" })).toBe("hermes:main-hermes");
  });

  it("merges add-agent channel configs into guided setup state for profile config reads", () => {
    const existing = {
      runtime: "openclaw" as const,
      agentId: "main",
      agentName: "Main Agent",
      channels: [{ channel: "telegram" as const, target: "111", botToken: "open-token", appToken: "" }],
    };
    const incomingHermes = {
      runtime: "hermes" as const,
      agentId: "main-hermes",
      agentName: "Hermes Main",
      channels: [{ channel: "telegram" as const, target: "222", botToken: "hermes-token", appToken: "" }],
    };

    expect(mergeRuntimeChannelConfigs([existing], [incomingHermes])).toEqual([existing, incomingHermes]);
  });

  it("builds the per-agent config patch with normalized channel information", () => {
    const config = {
      runtime: "hermes" as const,
      agentId: " main-hermes ",
      agentName: " Hermes Main ",
      channels: [{
        channel: "telegram" as const,
        target: " 222 ",
        botToken: " hermes-token ",
        appToken: " ",
      }],
    };

    const normalized = normalizeRuntimeChannelConfigForStorage(config);

    expect(normalized).toEqual({
      runtime: "hermes",
      agentId: "main-hermes",
      agentName: "Hermes Main",
      channels: [{
        channel: "telegram",
        target: "222",
        botToken: "hermes-token",
        appToken: "",
      }],
    });
    expect(buildAgentChannelConfigPatch(config)).toEqual({
      runtime: "hermes",
      channels: normalized.channels,
      channelConfig: normalized,
    });
  });

  it("uses the resolved profile agent when the live ensemble list is missing it", () => {
    expect(getProfileChannelConfigAgents([], agent("main-hermes", "hermes", "Hermes Main"))).toEqual([{
      ...agent("main-hermes", "hermes", "Hermes Main"),
      real: true,
    }]);
  });

  it("prefers the live ensemble agent when it is available", () => {
    const liveAgent = agent("main", "openclaw", "OpenClaw Main");

    expect(getProfileChannelConfigAgents(
      [liveAgent],
      { ...liveAgent, name: "Stale fallback", real: false },
    )).toEqual([liveAgent]);
  });
});
