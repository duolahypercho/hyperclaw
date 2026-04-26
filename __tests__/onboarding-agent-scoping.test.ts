import { describe, expect, it } from "vitest";
import {
  buildAgentScopedRuntimeChannelConfigs,
  buildOnboardingAgentProvisionTargets,
  isOnboardingAgentProvisionTargetPresent,
} from "$/components/Onboarding/onboarding-agent-scoping";

describe("onboarding agent scoping", () => {
  it("assigns the first channel-capable runtime profile to the existing main agent", () => {
    const targets = buildOnboardingAgentProvisionTargets([
      {
        runtime: "openclaw",
        name: "doraemon",
        description: "Pocket operator.",
      },
    ]);

    expect(targets).toMatchObject([
      {
        agentId: "main",
        baseId: "doraemon",
        isMainAgent: true,
      },
    ]);
  });

  it("stamps onboarding channel config with the owning agent id and name", () => {
    const configs = buildAgentScopedRuntimeChannelConfigs(
      [
        {
          runtime: "openclaw",
          name: "doraemon",
          description: "Pocket operator.",
        },
      ],
      [
        {
          runtime: "openclaw",
          channels: [
            {
              channel: "telegram",
              target: "12345",
              botToken: "bot-token",
              appToken: "",
            },
          ],
        },
      ],
    );

    expect(configs).toEqual([
      {
        runtime: "openclaw",
        agentId: "main",
        agentName: "doraemon",
        channels: [
          {
            channel: "telegram",
            target: "12345",
            botToken: "bot-token",
            appToken: "",
          },
        ],
      },
    ]);
  });

  it("keeps same-runtime additional agents on separate channel config keys", () => {
    const configs = buildAgentScopedRuntimeChannelConfigs(
      [
        {
          runtime: "openclaw",
          name: "doraemon",
          description: "Pocket operator.",
        },
        {
          runtime: "openclaw",
          name: "nobita",
          description: "Handles human follow-up.",
        },
      ],
      [
        {
          runtime: "openclaw",
          agentId: "main",
          agentName: "doraemon",
          channels: [
            { channel: "telegram", target: "1", botToken: "a", appToken: "" },
          ],
        },
        {
          runtime: "openclaw",
          agentId: "nobita",
          agentName: "nobita",
          channels: [
            { channel: "telegram", target: "2", botToken: "b", appToken: "" },
          ],
        },
      ],
    );

    expect(configs.map((config) => `${config.runtime}:${config.agentId}:${config.agentName}`)).toEqual([
      "openclaw:main:doraemon",
      "openclaw:nobita:nobita",
    ]);
  });

  it("does not reuse the OpenClaw main id for Hermes during onboarding", () => {
    const targets = buildOnboardingAgentProvisionTargets([
      {
        runtime: "openclaw",
        name: "orin",
        description: "Routes inbound customer traffic.",
      },
      {
        runtime: "hermes",
        name: "rell",
        description: "Remembers and learns skills.",
      },
    ]);

    expect(targets.map((target) => `${target.profile.runtime}:${target.agentId}:${target.isMainAgent}`)).toEqual([
      "openclaw:main:true",
      "hermes:rell:false",
    ]);
  });

  it("uses a slugged profile id for Hermes-only onboarding", () => {
    const targets = buildOnboardingAgentProvisionTargets([
      {
        runtime: "hermes",
        name: "rell",
        description: "Remembers and learns skills.",
      },
    ]);

    expect(targets.map((target) => `${target.profile.runtime}:${target.agentId}:${target.isMainAgent}`)).toEqual([
      "hermes:rell:false",
    ]);
  });

  it("reserves the main id for OpenClaw even when profiles arrive out of order", () => {
    const targets = buildOnboardingAgentProvisionTargets([
      {
        runtime: "hermes",
        name: "main",
        description: "Remembers and learns skills.",
      },
      {
        runtime: "openclaw",
        name: "orin",
        description: "Routes inbound customer traffic.",
      },
    ]);

    expect(targets.map((target) => `${target.profile.runtime}:${target.agentId}`)).toEqual([
      "hermes:main-hermes",
      "openclaw:main",
    ]);
  });

  it("requires matching runtime metadata when confirming planned onboarding agents", () => {
    const [openClawTarget, hermesTarget] = buildOnboardingAgentProvisionTargets([
      {
        runtime: "openclaw",
        name: "orin",
        description: "Routes inbound customer traffic.",
      },
      {
        runtime: "hermes",
        name: "rell",
        description: "Remembers and learns skills.",
      },
    ]);

    const confirmedAgents = [
      { id: "main", runtime: "hermes" },
      { id: "rell", runtime: "hermes" },
    ];

    expect(isOnboardingAgentProvisionTargetPresent(openClawTarget, confirmedAgents)).toBe(false);
    expect(isOnboardingAgentProvisionTargetPresent(hermesTarget, confirmedAgents)).toBe(true);
    expect(isOnboardingAgentProvisionTargetPresent(hermesTarget, [{ id: "rell", runtime: "openclaw" }])).toBe(false);
  });

  it("does not let the profile slug stand in for OpenClaw main during confirmation", () => {
    const [openClawTarget] = buildOnboardingAgentProvisionTargets([
      {
        runtime: "openclaw",
        name: "orin",
        description: "Routes inbound customer traffic.",
      },
    ]);

    expect(isOnboardingAgentProvisionTargetPresent(openClawTarget, [{ id: "orin", runtime: "openclaw" }])).toBe(false);
  });

  it("allows id confirmation when a matched agent has no runtime metadata", () => {
    const [, hermesTarget] = buildOnboardingAgentProvisionTargets([
      {
        runtime: "openclaw",
        name: "orin",
        description: "Routes inbound customer traffic.",
      },
      {
        runtime: "hermes",
        name: "rell",
        description: "Remembers and learns skills.",
      },
    ]);

    expect(isOnboardingAgentProvisionTargetPresent(hermesTarget, [
      { id: "main", runtime: "openclaw" },
      { id: "rell" },
    ])).toBe(true);
  });

  it("keeps the legacy id-only confirmation path when runtimes are not reported", () => {
    const [openClawTarget] = buildOnboardingAgentProvisionTargets([
      {
        runtime: "openclaw",
        name: "orin",
        description: "Routes inbound customer traffic.",
      },
    ]);

    expect(isOnboardingAgentProvisionTargetPresent(openClawTarget, [{ id: "main" }])).toBe(true);
  });
});
