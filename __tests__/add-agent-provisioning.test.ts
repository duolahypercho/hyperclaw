import { describe, expect, it } from "vitest";
import {
  buildGuidedChannelStateWithAgentConfigs,
  buildAgentIdentityUpdatePayload,
  buildAddAgentProvisionPayload,
  buildChannelProvisionPayloadFields,
  buildScopedAgentChannelConfigs,
  isOpenClawBindingTimeoutAfterSuccess,
  isOpenClawConfigMutationConflict,
  isOpenClawRecoverableConfigInvalid,
  provisionAgentWithConfigConflictRetry,
} from "$/components/Tool/Agents/add-agent-provisioning";

describe("buildAddAgentProvisionPayload", () => {
  it("builds the same backend provisioning payload used by onboarding", () => {
    const payload = buildAddAgentProvisionPayload({
      agentId: "doraemon",
      runtime: "openclaw",
      name: "Doraemon",
      role: "Pocket operator",
      description: "Pulls the right tool from the future.",
      emoji: "D",
      avatarDataUri: "data:image/png;base64,abc",
      mainModel: "gpt-4.1",
      runtimeChannelConfigs: [{
        runtime: "openclaw",
        agentId: "doraemon",
        agentName: "Doraemon",
        channels: [{
          channel: "slack",
          target: "C123",
          botToken: "FAKE_SLACK_BOT_TOKEN",
          appToken: "FAKE_SLACK_APP_TOKEN",
        }],
      }],
      agentChannelConfigs: [{
        runtime: "openclaw",
        agentId: "doraemon",
        agentName: "Doraemon",
        channels: [{
          channel: "slack",
          target: "C123",
          botToken: "FAKE_SLACK_BOT_TOKEN",
          appToken: "FAKE_SLACK_APP_TOKEN",
        }],
      }],
      userProfile: {
        name: "Ziwen Xu",
        email: "ziwen@example.com",
        username: "ziwen",
        about: "Building Hyperclaw.",
      },
    });

    expect(payload).toEqual({
      agentId: "doraemon",
      runtime: "openclaw",
      name: "Doraemon",
      role: "Pocket operator",
      description: "Pulls the right tool from the future.",
      emojiEnabled: true,
      emoji: "D",
      avatarDataUri: "data:image/png;base64,abc",
      mainModel: "gpt-4.1",
      companyName: "",
      companyDescription: "",
      runtimeChannelConfigs: [{
        runtime: "openclaw",
        agentId: "doraemon",
        agentName: "Doraemon",
        channels: [{
          channel: "slack",
          target: "C123",
          botToken: "FAKE_SLACK_BOT_TOKEN",
          appToken: "FAKE_SLACK_APP_TOKEN",
        }],
      }],
      agentChannelConfigs: [{
        runtime: "openclaw",
        agentId: "doraemon",
        agentName: "Doraemon",
        channels: [{
          channel: "slack",
          target: "C123",
          botToken: "FAKE_SLACK_BOT_TOKEN",
          appToken: "FAKE_SLACK_APP_TOKEN",
        }],
      }],
      userName: "Ziwen Xu",
      userEmail: "ziwen@example.com",
      userAboutMe: "Building Hyperclaw.",
    });
  });

  it("normalizes empty optional fields so the backend does not get stale values", () => {
    const payload = buildAddAgentProvisionPayload({
      agentId: "nobita",
      runtime: "codex",
      name: "Nobita",
      role: "  ",
      description: "",
      emoji: "",
      avatarDataUri: null,
      mainModel: "__default__",
    });

    expect(payload).toMatchObject({
      agentId: "nobita",
      runtime: "codex",
      name: "Nobita",
      role: "",
      description: "",
      emojiEnabled: false,
      emoji: "",
      avatarDataUri: "",
      mainModel: "",
      companyName: "",
      companyDescription: "",
      runtimeChannelConfigs: [],
      agentChannelConfigs: [],
      userName: "",
      userEmail: "",
      userAboutMe: "",
    });
  });
});

describe("buildScopedAgentChannelConfigs", () => {
  it("scopes configured OpenClaw channel drafts to the new agent", () => {
    expect(buildScopedAgentChannelConfigs({
      runtime: "openclaw",
      agentId: "ops-agent",
      agentName: "Ops Agent",
      channels: [
        { channel: "telegram", target: " 891861452 ", botToken: " bot-token ", appToken: "" },
        { channel: "discord", target: " ", botToken: "", appToken: "" },
      ],
    })).toEqual([{
      runtime: "openclaw",
      agentId: "ops-agent",
      agentName: "Ops Agent",
      channels: [{
        channel: "telegram",
        target: "891861452",
        botToken: "bot-token",
        appToken: "",
      }],
    }]);
  });

  it("keeps Hermes channel drafts scoped separately from OpenClaw", () => {
    expect(buildScopedAgentChannelConfigs({
      runtime: "hermes",
      agentId: "support-agent",
      agentName: "Support Agent",
      channels: [
        { channel: "telegram", target: "12345", botToken: "hermes-token", appToken: "" },
      ],
    })).toEqual([{
      runtime: "hermes",
      agentId: "support-agent",
      agentName: "Support Agent",
      channels: [{
        channel: "telegram",
        target: "12345",
        botToken: "hermes-token",
        appToken: "",
      }],
    }]);
  });

  it("does not build channel config for runtimes without channel setup", () => {
    expect(buildScopedAgentChannelConfigs({
      runtime: "codex",
      agentId: "codex-agent",
      agentName: "Codex Agent",
      channels: [
        { channel: "telegram", target: "12345", botToken: "token", appToken: "" },
      ],
    })).toEqual([]);
  });

  it("returns no config when every channel draft is empty", () => {
    expect(buildScopedAgentChannelConfigs({
      runtime: "openclaw",
      agentId: "ops-agent",
      agentName: "Ops Agent",
      channels: [
        { channel: "telegram", target: "", botToken: "", appToken: "" },
      ],
    })).toEqual([]);
  });
});

describe("buildChannelProvisionPayloadFields", () => {
  const scopedConfig = [{
    runtime: "openclaw" as const,
    agentId: "ops-agent",
    agentName: "Ops Agent",
    channels: [{
      channel: "telegram" as const,
      target: "891861452",
      botToken: "FAKE_TELEGRAM_BOT_TOKEN",
      appToken: "",
    }],
  }];

  it("sends OpenClaw channel config only through runtime channel fields", () => {
    expect(buildChannelProvisionPayloadFields("openclaw", scopedConfig)).toEqual({
      runtimeChannelConfigs: scopedConfig,
      agentChannelConfigs: [],
    });
  });

  it("sends Hermes channel config only through agent channel fields", () => {
    expect(buildChannelProvisionPayloadFields("hermes", [{
      ...scopedConfig[0],
      runtime: "hermes",
    }])).toEqual({
      runtimeChannelConfigs: [],
      agentChannelConfigs: [{
        ...scopedConfig[0],
        runtime: "hermes",
      }],
    });
  });

  it("sends no channel configs for non-channel runtimes", () => {
    expect(buildChannelProvisionPayloadFields("claude-code", scopedConfig)).toEqual({
      runtimeChannelConfigs: [],
      agentChannelConfigs: [],
    });
  });
});

describe("buildGuidedChannelStateWithAgentConfigs", () => {
  it("persists add-agent channel configs into the runtime config list read by AgentProfile", () => {
    const raw = JSON.stringify({
      completedSteps: [1, 2, 3, 4],
      runtimeChannelConfigs: [{
        runtime: "openclaw",
        agentId: "main",
        agentName: "OpenClaw Main",
        channels: [{
          channel: "telegram",
          target: "111",
          botToken: "open-token",
          appToken: "",
        }],
      }],
    });
    const next = JSON.parse(buildGuidedChannelStateWithAgentConfigs(raw, [{
      runtime: "hermes",
      agentId: "main-hermes",
      agentName: "Hermes Main",
      channels: [{
        channel: "telegram",
        target: "222",
        botToken: "hermes-token",
        appToken: "",
      }],
    }]));

    expect(next.completedSteps).toEqual([1, 2, 3, 4]);
    expect(next.runtimeChannelConfigs.map((config: { runtime: string; agentId?: string }) => `${config.runtime}:${config.agentId}`)).toEqual([
      "openclaw:main",
      "hermes:main-hermes",
    ]);
  });

  it("starts a fresh guided state when the previous channel state is unreadable", () => {
    const next = JSON.parse(buildGuidedChannelStateWithAgentConfigs("not-json", [{
      runtime: "openclaw",
      agentId: "main",
      agentName: "OpenClaw Main",
      channels: [{
        channel: "telegram",
        target: "111",
        botToken: "open-token",
        appToken: "",
      }],
    }]));

    expect(next.runtimeChannelConfigs).toEqual([{
      runtime: "openclaw",
      agentId: "main",
      agentName: "OpenClaw Main",
      channels: [{
        channel: "telegram",
        target: "111",
        botToken: "open-token",
        appToken: "",
      }],
    }]);
  });

  it("keeps the latest runtime channel config when stale legacy agent config exists", () => {
    const raw = JSON.stringify({
      runtimeChannelConfigs: [{
        runtime: "openclaw",
        agentId: "main",
        agentName: "OpenClaw Main",
        channels: [{
          channel: "telegram",
          target: "fresh",
          botToken: "fresh-token",
          appToken: "",
        }],
      }],
      agentChannelConfigs: [{
        runtime: "openclaw",
        agentId: "main",
        agentName: "OpenClaw Main",
        channels: [{
          channel: "telegram",
          target: "stale",
          botToken: "stale-token",
          appToken: "",
        }],
      }],
    });

    const next = JSON.parse(buildGuidedChannelStateWithAgentConfigs(raw, [{
      runtime: "hermes",
      agentId: "main-hermes",
      agentName: "Hermes Main",
      channels: [{
        channel: "telegram",
        target: "222",
        botToken: "hermes-token",
        appToken: "",
      }],
    }]));

    expect(next.runtimeChannelConfigs.find((config: { runtime: string; agentId?: string }) => (
      config.runtime === "openclaw" && config.agentId === "main"
    )).channels[0].target).toBe("fresh");
  });
});

describe("buildAgentIdentityUpdatePayload", () => {
  it("persists agent identity metadata even when no avatar was uploaded", () => {
    const payload = buildAgentIdentityUpdatePayload({
      agentId: "nobita",
      runtime: "codex",
      name: " Nobita ",
      role: " Engineer ",
      description: " Writes code. ",
      emoji: " C ",
      avatarDataUri: null,
    });

    expect(payload).toEqual({
      agentId: "nobita",
      runtime: "codex",
      name: "Nobita",
      role: "Engineer",
      description: "Writes code.",
      emoji: "C",
    });
  });

  it("includes avatar data only when an avatar was uploaded", () => {
    const payload = buildAgentIdentityUpdatePayload({
      agentId: "doraemon",
      runtime: "openclaw",
      name: "Doraemon",
      role: "Pocket operator",
      description: "Pulls the right tool from the future.",
      emoji: "D",
      avatarDataUri: "data:image/png;base64,abc",
    });

    expect(payload).toEqual({
      agentId: "doraemon",
      name: "Doraemon",
      emoji: "D",
      role: "Pocket operator",
      description: "Pulls the right tool from the future.",
      runtime: "openclaw",
      avatarData: "data:image/png;base64,abc",
    });
  });
});

describe("provisionAgentWithConfigConflictRetry", () => {
  const openClawPayload = () => buildAddAgentProvisionPayload({
    agentId: "main",
    runtime: "openclaw",
    name: "Doraemon",
    role: "Pocket operator",
    description: "Pulls the right tool from the future.",
    emoji: "D",
  });

  it("retries OpenClaw config mutation conflicts", async () => {
    let calls = 0;

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          return {
            success: false,
            error: "failed to bind OpenClaw agent main: stderr: ConfigMutationConflictError: config changed since last load",
          };
        }
        return { success: true, detail: "Ready." };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(calls).toBe(2);
    expect(result).toEqual({ success: true, detail: "Ready." });
  });

  it("retries when the bridge throws an OpenClaw config mutation conflict", async () => {
    let calls = 0;

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("ConfigMutationConflictError: config changed since last load");
        }
        return { success: true, detail: "Ready." };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(calls).toBe(2);
    expect(result).toEqual({ success: true, detail: "Ready." });
  });

  it("returns a clear failure after exhausting config mutation retries", async () => {
    let calls = 0;

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        calls += 1;
        return {
          success: false,
          error: "ConfigMutationConflictError: config changed since last load",
        };
      },
      openClawPayload(),
      { baseDelayMs: 0, maxAttempts: 2 },
    );

    expect(calls).toBe(2);
    expect(result.success).toBe(false);
    expect(result.error).toContain("OpenClaw agent provisioning failed after retrying config mutation conflicts");
    expect(result.error).toContain("ConfigMutationConflictError");
  });

  it("returns a clear failure after exhausting thrown config mutation retries", async () => {
    let calls = 0;

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        calls += 1;
        throw new Error("ConfigMutationConflictError: config changed since last load");
      },
      openClawPayload(),
      { baseDelayMs: 0, maxAttempts: 2 },
    );

    expect(calls).toBe(2);
    expect(result.success).toBe(false);
    expect(result.error).toContain("OpenClaw agent provisioning failed after retrying config mutation conflicts");
    expect(result.error).toContain("ConfigMutationConflictError");
  });

  it("treats OpenClaw timeout responses as success when stdout confirms bindings were added", async () => {
    let calls = 0;

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        calls += 1;
        return {
          success: false,
          error: "OpenClaw agent binding failed: failed to bind OpenClaw agent main: error: command timed out after 3m0s",
          stdout: "Updated ~/.openclaw/openclaw.json\nAdded bindings:\n- telegram accountId=891861452",
        };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(calls).toBe(1);
    expect(result).toEqual({
      success: true,
      detail: "OpenClaw agent binding completed before the connector timed out.",
    });
  });

  it("treats thrown OpenClaw timeout errors as success when attached stdout confirms bindings were added", async () => {
    const error = new Error("OpenClaw agent binding failed: failed to bind OpenClaw agent main: error: command timed out after 3m0s") as Error & {
      stdout?: string;
    };
    error.stdout = "Updated ~/.openclaw/openclaw.json\nAdded bindings:\n- telegram accountId=891861452";

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        throw error;
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(result).toEqual({
      success: true,
      detail: "OpenClaw agent binding completed before the connector timed out.",
    });
  });

  it("does not treat non-OpenClaw timeout responses as successful binding", async () => {
    const payload = buildAddAgentProvisionPayload({
      agentId: "codex",
      runtime: "codex",
      name: "Codex",
      role: "Engineer",
      description: "Writes code.",
      emoji: "C",
    });

    const result = await provisionAgentWithConfigConflictRetry(
      async () => ({
        success: false,
        error: "OpenClaw agent binding failed: failed to bind OpenClaw agent main: error: command timed out after 3m0s",
        stdout: "Added bindings:\n- telegram accountId=891861452",
      }),
      payload,
      { baseDelayMs: 0 },
    );

    expect(result.success).toBe(false);
  });

  it("repairs recoverable OpenClaw config-invalid errors with doctor and retries provisioning", async () => {
    const calls: string[] = [];

    const result = await provisionAgentWithConfigConflictRetry(
      async (action) => {
        calls.push(action);
        if (action === "openclaw-doctor-fix") {
          return { success: true, detail: "Installed missing channel plugin deps." };
        }
        if (calls.filter((entry) => entry === "onboarding-provision-agent").length === 1) {
          return {
            success: false,
            error: "Config invalid\nFile: ~/.openclaw/openclaw.json\nProblem:\n  - channels.telegram: unknown channel id: telegram\n\nRun: openclaw doctor --fix",
          };
        }
        return { success: true, detail: "Ready." };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(calls).toEqual([
      "onboarding-provision-agent",
      "openclaw-doctor-fix",
      "onboarding-provision-agent",
    ]);
    expect(result).toEqual({ success: true, detail: "Ready." });
  });

  it("still retries provisioning when config repair happens on the final normal attempt", async () => {
    const calls: string[] = [];

    const result = await provisionAgentWithConfigConflictRetry(
      async (action) => {
        calls.push(action);
        if (action === "openclaw-doctor-fix") {
          return { success: true, detail: "Installed missing channel plugin deps." };
        }

        const provisionAttempts = calls.filter((entry) => entry === "onboarding-provision-agent").length;
        if (provisionAttempts < 3) {
          return {
            success: false,
            error: "ConfigMutationConflictError: config changed since last load",
          };
        }
        if (provisionAttempts === 3) {
          return {
            success: false,
            error: "Config invalid\nFile: ~/.openclaw/openclaw.json\nProblem:\n  - channels.telegram: unknown channel id: telegram\n\nRun: openclaw doctor --fix",
          };
        }
        return { success: true, detail: "Ready." };
      },
      openClawPayload(),
      { baseDelayMs: 0, maxAttempts: 3 },
    );

    expect(calls).toEqual([
      "onboarding-provision-agent",
      "onboarding-provision-agent",
      "onboarding-provision-agent",
      "openclaw-doctor-fix",
      "onboarding-provision-agent",
    ]);
    expect(result).toEqual({ success: true, detail: "Ready." });
  });

  it("repairs recoverable OpenClaw config-invalid errors when provisioning throws", async () => {
    const calls: string[] = [];

    const result = await provisionAgentWithConfigConflictRetry(
      async (action) => {
        calls.push(action);
        if (action === "openclaw-doctor-fix") {
          return { success: true, detail: "Installed missing channel plugin deps." };
        }
        if (calls.filter((entry) => entry === "onboarding-provision-agent").length === 1) {
          throw new Error("Config invalid\nFile: ~/.openclaw/openclaw.json\nProblem:\n  - channels.telegram: unknown channel id: telegram\n\nRun: openclaw doctor --fix");
        }
        return { success: true, detail: "Ready." };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(calls).toEqual([
      "onboarding-provision-agent",
      "openclaw-doctor-fix",
      "onboarding-provision-agent",
    ]);
    expect(result).toEqual({ success: true, detail: "Ready." });
  });

  it("returns the doctor failure when recoverable OpenClaw config repair fails", async () => {
    const result = await provisionAgentWithConfigConflictRetry(
      async (action) => {
        if (action === "openclaw-doctor-fix") {
          return { success: false, error: "could not install bundled plugin deps" };
        }
        return {
          success: false,
          error: "Config invalid\nProblem:\n  - channels.telegram: unknown channel id: telegram\nRun: openclaw doctor --fix",
        };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("OpenClaw config repair failed");
    expect(result.error).toContain("unknown channel id: telegram");
    expect(result.error).toContain("could not install bundled plugin deps");
  });

  it("returns the doctor failure when the OpenClaw config repair command throws", async () => {
    const result = await provisionAgentWithConfigConflictRetry(
      async (action) => {
        if (action === "openclaw-doctor-fix") {
          throw new Error("spawn failed");
        }
        return {
          success: false,
          error: "Config invalid\nProblem:\n  - channels.telegram: unknown channel id: telegram\nRun: openclaw doctor --fix",
        };
      },
      openClawPayload(),
      { baseDelayMs: 0 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("OpenClaw config repair failed");
    expect(result.error).toContain("unknown channel id: telegram");
    expect(result.error).toContain("spawn failed");
  });

  it("does not retry non-OpenClaw provisioning failures", async () => {
    const payload = buildAddAgentProvisionPayload({
      agentId: "codex",
      runtime: "codex",
      name: "Codex",
      role: "Engineer",
      description: "Writes code.",
      emoji: "C",
    });
    let calls = 0;

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        calls += 1;
        return {
          success: false,
          error: "ConfigMutationConflictError: config changed since last load",
        };
      },
      payload,
      { baseDelayMs: 0 },
    );

    expect(calls).toBe(1);
    expect(result.success).toBe(false);
  });

  it("returns sanitized non-OpenClaw thrown provisioning failures", async () => {
    const payload = buildAddAgentProvisionPayload({
      agentId: "hermes",
      runtime: "hermes",
      name: "Hermes",
      role: "Researcher",
      description: "Answers support messages.",
      emoji: "H",
    });

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        throw new Error("Hermes profile env failed for token 1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi");
      },
      payload,
      { baseDelayMs: 0 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("[REDACTED]");
    expect(result.error).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  });

  it("redacts Slack app tokens from thrown provisioning failures", async () => {
    const payload = buildAddAgentProvisionPayload({
      agentId: "hermes",
      runtime: "hermes",
      name: "Hermes",
      role: "Researcher",
      description: "Answers support messages.",
      emoji: "H",
    });

    const result = await provisionAgentWithConfigConflictRetry(
      async () => {
        throw new Error("Slack Socket Mode failed for token xapp-1-A1B2C3D4-E5F6G7H8");
      },
      payload,
      { baseDelayMs: 0 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("[REDACTED]");
    expect(result.error).not.toContain("xapp-1-A1B2C3D4");
  });

  it("detects connector conflict messages from failed responses", () => {
    expect(isOpenClawConfigMutationConflict({
      error: "OpenClaw agent binding failed: failed to bind OpenClaw agent main: stderr: ConfigMutationConflictError: config changed since last load",
    })).toBe(true);
  });

  it("detects recoverable config-invalid channel registration failures", () => {
    expect(isOpenClawRecoverableConfigInvalid({
      error: "Config invalid\nFile: ~/.openclaw/openclaw.json\nProblem:\n  - channels.telegram: unknown channel id: telegram\n\nRun: openclaw doctor --fix",
    })).toBe(true);
  });

  it("detects timeout-after-success messages from connector stdout", () => {
    expect(isOpenClawBindingTimeoutAfterSuccess({
      error: "OpenClaw agent binding failed: failed to bind OpenClaw agent main: error: command timed out after 3m0s",
      stdout: "Updated ~/.openclaw/openclaw.json\nAdded bindings:\n- telegram accountId=891861452",
    })).toBe(true);
  });

  it("does not detect plain timeout messages without binding success output", () => {
    expect(isOpenClawBindingTimeoutAfterSuccess({
      error: "OpenClaw agent binding failed: failed to bind OpenClaw agent main: error: command timed out after 3m0s",
      stdout: "Updated ~/.openclaw/openclaw.json",
    })).toBe(false);
  });
});
