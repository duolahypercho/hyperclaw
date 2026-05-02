import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, X, Eye, EyeOff, Database, ChevronDown, Lock, ExternalLink } from "lucide-react";
import Image from "next/image";
import GuidedStepConnect, { type RuntimeChoice } from "./GuidedStepConnect";
import GuidedStepRuntimes, { MEMORY_PROVIDERS, type ProviderConfig, type OAuthTokens, type MemorySearchConfig, type RuntimeStepResult } from "./GuidedStepRuntimes";
import GuidedStep4, { type LaunchProgressItem } from "./GuidedStep4";
import TechGridBackground from "./TechGridBackground";
import StepAnimations from "./StepAnimations";
import { OpenClawIcon, HermesIcon, ClaudeCodeIcon, CodexIcon, StripeIcon } from "./RuntimeIcons";
import { useUser } from "$/Providers/UserProv";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { dashboardState } from "$/lib/dashboard-state";
import { clearDeviceCache, clearDeviceUnreachable, getActiveDeviceId, getHubApiUrl, getUserToken, hubFetch } from "$/lib/hub-direct";
import { resetGatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { patchIdentityCache } from "$/hooks/useAgentIdentity";
import {
  buildAddAgentProvisionPayload,
  provisionAgentWithConfigConflictRetry,
} from "$/components/Tool/Agents/add-agent-provisioning";
import {
  buildAgentTemplates,
  buildClaudeCodeMd,
  buildRuntimeSoulMd,
  buildUserMd,
  buildWorkspaceInstructionsMd,
  type AgentUserProfile,
} from "$/lib/agent-templates";
import { saveAgentName, toIdentityAvatarUrl, updateIdentityField } from "$/lib/identity-md";
import { buildAgentChannelConfigPatch } from "$/components/ensemble/views/team-channel-config-state";
import {
  buildAgentScopedRuntimeChannelConfigs,
  buildOnboardingAgentProvisionTargets,
  isOnboardingAgentProvisionTargetPresent,
  toOnboardingSlug,
  type OnboardingChannelConfig,
  type OnboardingChannelSupportedRuntime,
  type OnboardingRuntimeChannelConfig,
} from "./onboarding-agent-scoping";
import {
  getOpenClawInstallRecovery,
  OPENCLAW_DEFAULT_SETUP_MAX_ATTEMPTS,
} from "./onboarding-install-recovery";
import { isPlausibleStripeKey, persistOnboardingStripeKey } from "./onboarding-stripe-credential";
import { canUseRemoteOnboarding, normalizeGuidedDeviceChoice } from "./local-first-routing";

const TOTAL_STEPS = 4;
const GUIDED_STATE_KEY = "guided-setup-state";
const EASE = [0.16, 1, 0.3, 1] as const;
const COMPANY_NAME_MAX_LENGTH = 60;
const COMPANY_DESCRIPTION_MAX_LENGTH = 280;
const AGENT_NAME_MAX_LENGTH = 40;
const AGENT_ROLE_MAX_LENGTH = 64;
const AGENT_DESCRIPTION_MAX_LENGTH = 220;
const CHANNEL_TARGET_MAX_LENGTH = 120;
const OPENCLAW_DOCTOR_FIX_TIMEOUT_MS = 600_000;
const OPENCLAW_DOCTOR_FIX_MAX_ATTEMPTS = 2;
const OPENCLAW_SECURITY_AUDIT_TIMEOUT_MS = 600_000;
const OPENCLAW_SECURITY_AUDIT_MAX_ATTEMPTS = 2;
const OPENCLAW_STATUS_ALL_TIMEOUT_MS = 120_000;
const OPENCLAW_STATUS_ALL_MAX_ATTEMPTS = 2;

interface GuidedState {
  completedSteps: number[];
  skippedAt?: string;
  // Durable marker set only after finalizeAndComplete has confirmed every
  // runtime is installed AND the connector reports at least one agent.
  // The mount auto-exit requires this (not completedSteps.length alone) so a
  // partial run — e.g. OpenClaw downloaded but Hermes pending — can never
  // remount the component into the dashboard.
  launchCompletedAt?: string;
  // ISO timestamp set at the START of handleFinalLaunch and cleared on success
  // or error. While this is set, NOTHING is allowed to auto-skip into the
  // dashboard — not MainLayout's hasOnlineDevice effect, not the mount
  // auto-exit, not the initial guidedSetupComplete hydrator. This is the
  // belt-and-suspenders guard against premature dashboard entry regressing
  // again while backend installs are still running.
  launchInProgress?: string;
  deviceChoice?: "local" | "remote" | null;
  runtimeChoices?: RuntimeChoice[];
  selectedRuntimes?: string[];
  providerConfigs?: ProviderConfig[];
  primaryBrain?: { providerId: string; model: string };
  memorySearch?: MemorySearchConfig;
  companyName?: string;
  companyDescription?: string;
  companyAvatarDataUri?: string | null;
  agentProfiles?: AgentSetupDraft[];
  runtimeChannelConfigs?: RuntimeChannelConfigDraft[];
  agentChannelConfigs?: RuntimeChannelConfigDraft[];
  // Optional Stripe restricted key buffered between the company step and the
  // launch. Pushed via the encrypted credentials flow during launch and then
  // cleared from state — never persisted in plaintext after launch completes.
  stripeApiKey?: string;
}

interface PairingInfo {
  token: string;
  deviceId: string;
}

function loadGuidedState(): GuidedState {
  const raw = dashboardState.get(GUIDED_STATE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* corrupted */ }
  }
  return { completedSteps: [] };
}

function normalizeGuidedStateForPlatform(
  state: GuidedState,
  canUseLocalConnectorBootstrap: boolean,
  allowRemoteOnboarding = true,
): GuidedState {
  return normalizeGuidedDeviceChoice(state, canUseLocalConnectorBootstrap, allowRemoteOnboarding);
}

function saveGuidedState(state: GuidedState, flush = false) {
  dashboardState.set(GUIDED_STATE_KEY, JSON.stringify(state), { flush });
}

function formatSingleRuntimeChoice(runtime: string): string {
  const names: Record<string, string> = {
    openclaw: "OpenClaw",
    hermes: "Hermes",
    "claude-code": "Claude Code",
    codex: "Codex",
  };
  return names[runtime] || runtime;
}

function formatRuntimeChoices(runtimes?: RuntimeChoice[]): string {
  if (!runtimes || runtimes.length === 0) return "Not selected";
  return runtimes.map(formatSingleRuntimeChoice).join(", ");
}

/**
 * Runtime-specific normalization for agent main-model values.
 *
 * The onboarding picker stores options as "provider/model" so Hermes can use
 * them directly. OpenClaw agent config expects the provider-local model value
 * in most cases (for example "MiniMax-M2.7" under provider "minimax").
 */
function normalizeMainModelForRuntime(runtime: RuntimeChoice, mainModel?: string): string {
  const value = (mainModel || "").trim();
  if (!value || value === "__default__") return "";
  if (runtime !== "openclaw") return value;

  if (!value.includes("/") && value.includes(":")) {
    const parts = value.split(":");
    const withoutProvider = parts.slice(1).join(":").trim();
    return withoutProvider || value;
  }

  if (value.includes("/")) {
    const parts = value.split("/");
    const withoutProvider = parts.slice(1).join("/").trim();
    return withoutProvider || value;
  }

  return value;
}

const EMOJI_OPTIONS = [
  "🤖", "🦾", "⚡", "🧠", "🎯", "🔮", "🦅", "🐉",
  "🦁", "🌊", "🔥", "💡", "🛸", "🎭", "🧬", "🚀",
];

interface AgentSetupDraft {
  runtime: RuntimeChoice;
  name: string;
  role: string;
  description: string;
  emojiEnabled: boolean;
  emoji: string;
  avatarDataUri?: string | null;
  mainModel?: string;
}

function buildOnboardingRuntimeDocs(opts: {
  runtime: RuntimeChoice;
  name: string;
  role: string;
  description: string;
  emoji?: string;
  avatarDataUri?: string | null;
  userProfile?: AgentUserProfile;
}): Record<string, string> {
  const baseFiles = buildAgentTemplates({
    name: opts.name,
    emoji: opts.emoji,
    role: opts.role,
    description: opts.description,
    userProfile: opts.userProfile,
  });
  const avatarUrl = toIdentityAvatarUrl(opts.avatarDataUri);
  const identity = avatarUrl
    ? updateIdentityField(baseFiles["IDENTITY.md"], "Avatar", avatarUrl)
    : baseFiles["IDENTITY.md"];

  if (opts.runtime === "openclaw") {
    return {
      ...baseFiles,
      "IDENTITY.md": identity,
    };
  }

  const files: Record<string, string> = {
    "IDENTITY.md": identity,
    "SOUL.md": buildRuntimeSoulMd({
      name: opts.name,
      role: opts.role,
      description: opts.description,
    }),
    "USER.md": buildUserMd({
      name: opts.name,
      role: opts.role,
      description: opts.description,
      userProfile: opts.userProfile,
    }),
  };

  if (opts.runtime === "claude-code") {
    files["CLAUDE.md"] = buildClaudeCodeMd({
      name: opts.name,
      role: opts.role,
      description: opts.description,
      soulContent: files["SOUL.md"],
    });
  }
  if (opts.runtime === "codex") {
    files["AGENTS.md"] = buildWorkspaceInstructionsMd("AGENTS.md");
  }

  return files;
}

type ChannelType = OnboardingChannelConfig["channel"];
type ChannelConfigDraft = OnboardingChannelConfig;
type ChannelSupportedRuntime = OnboardingChannelSupportedRuntime;
type RuntimeChannelConfigDraft = OnboardingRuntimeChannelConfig;

function createAgentDraft(runtime: RuntimeChoice, existing?: Partial<AgentSetupDraft>): AgentSetupDraft {
  return {
    runtime,
    name: existing?.name || "",
    role: existing?.role || "",
    description: existing?.description || "",
    emojiEnabled: existing?.emojiEnabled ?? true,
    emoji: existing?.emoji || "🤖",
    avatarDataUri: existing?.avatarDataUri || null,
    mainModel: existing?.mainModel || "__default__",
  };
}

function isAgentRequired(runtime: RuntimeChoice): boolean {
  return runtime === "hermes" || runtime === "openclaw";
}

function supportsChannelSetup(runtime: RuntimeChoice): runtime is ChannelSupportedRuntime {
  return runtime === "hermes" || runtime === "openclaw";
}

function formatAgentSummary(agentProfiles?: AgentSetupDraft[]): string {
  if (!agentProfiles || agentProfiles.length === 0) return "No agents yet";
  const configured = agentProfiles
    .filter((profile) => profile.name.trim())
    .map((profile) => profile.name.trim());
  return configured.length > 0 ? configured.join(", ") : "No agents yet";
}

const channelOrder: ChannelType[] = ["telegram", "discord", "slack", "whatsapp"];

interface ChannelCredentialField {
  key: "botToken" | "appToken";
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
}

const channelSetupContent: Record<ChannelType, {
  label: string;
  credentialFields: Record<ChannelSupportedRuntime, ChannelCredentialField[]>;
  runtimeFieldLabel: Record<ChannelSupportedRuntime, string>;
  runtimePlaceholder: Record<ChannelSupportedRuntime, string>;
  runtimeHint: Record<ChannelSupportedRuntime, string>;
  runtimeDocs: Record<ChannelSupportedRuntime, string>;
  runtimeSteps: Record<ChannelSupportedRuntime, string[]>;
}> = {
  telegram: {
    label: "Telegram",
    credentialFields: {
      hermes: [
        { key: "botToken", label: "Bot token", placeholder: "e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", hint: "From @BotFather after creating your bot.", required: true },
      ],
      openclaw: [
        { key: "botToken", label: "Bot token", placeholder: "e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", hint: "From @BotFather after creating your bot.", required: true },
      ],
    },
    runtimeFieldLabel: {
      hermes: "Your Telegram user or chat ID",
      openclaw: "Your Telegram user or chat ID",
    },
    runtimePlaceholder: {
      hermes: "e.g. 123456789 or -1001234567890",
      openclaw: "e.g. 123456789 or -1001234567890",
    },
    runtimeHint: {
      hermes: "DM @userinfobot on Telegram to get your numeric ID. For a group home channel, use the negative chat ID (starts with -100).",
      openclaw: "DM @userinfobot on Telegram to get your numeric ID. For a group home channel, use the negative chat ID (starts with -100).",
    },
    runtimeDocs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram",
      openclaw: "https://github.com/nicepkg/openclaw#telegram",
    },
    runtimeSteps: {
      hermes: [
        "Open Telegram, search for @BotFather, send /newbot to create your bot, and save the bot token.",
        "DM the bot once so the chat exists.",
        "DM @userinfobot or @getidsbot to find your numeric user ID.",
        "For a group home channel, add the bot to the group and use the negative chat ID (starts with -100).",
      ],
      openclaw: [
        "Open Telegram, search for @BotFather, send /newbot to create your bot, and save the bot token.",
        "DM the bot once so the chat exists.",
        "DM @userinfobot or @getidsbot to find your numeric user ID.",
        "For a group home channel, add the bot to the group and use the negative chat ID (starts with -100).",
      ],
    },
  },
  discord: {
    label: "Discord",
    credentialFields: {
      hermes: [
        { key: "botToken", label: "Bot token", placeholder: "e.g. MTIzNDU2Nzg5MDEyMzQ1Njc4.G...", hint: "From Discord Developer Portal \u2192 Bot \u2192 Reset Token.", required: true },
      ],
      openclaw: [
        { key: "botToken", label: "Bot token", placeholder: "e.g. MTIzNDU2Nzg5MDEyMzQ1Njc4.G...", hint: "From Discord Developer Portal \u2192 Bot \u2192 Reset Token.", required: true },
      ],
    },
    runtimeFieldLabel: {
      hermes: "Discord channel ID",
      openclaw: "Discord channel ID",
    },
    runtimePlaceholder: {
      hermes: "e.g. 123456789012345678",
      openclaw: "e.g. 123456789012345678",
    },
    runtimeHint: {
      hermes: "The channel ID where Hermes should post messages. Not the bot token.",
      openclaw: "The channel ID where OpenClaw should post messages. Not the bot token.",
    },
    runtimeDocs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord",
      openclaw: "https://github.com/nicepkg/openclaw#discord",
    },
    runtimeSteps: {
      hermes: [
        "Go to discord.com/developers/applications, create an app, go to Bot, and reset the token. Save it.",
        "Enable Message Content Intent on the Bot page.",
        "Under OAuth2, select bot scope with Send Messages + Read Message History, copy the invite URL, and add the bot to your server.",
        "In Discord Settings \u2192 Advanced, turn on Developer Mode. Right-click the target channel \u2192 Copy Channel ID.",
      ],
      openclaw: [
        "Go to discord.com/developers/applications, create an app, go to Bot, and reset the token. Save it.",
        "Enable Message Content Intent on the Bot page.",
        "Under OAuth2, select bot scope with Send Messages + Read Message History, copy the invite URL, and add the bot to your server.",
        "In Discord Settings \u2192 Advanced, turn on Developer Mode. Right-click the target channel \u2192 Copy Channel ID.",
      ],
    },
  },
  slack: {
    label: "Slack",
    credentialFields: {
      hermes: [
        { key: "botToken", label: "Bot token (xoxb-)", placeholder: "xoxb-...", hint: "From OAuth & Permissions after installing the Slack app.", required: true },
      ],
      openclaw: [
        { key: "botToken", label: "Bot token (xoxb-)", placeholder: "xoxb-...", hint: "From OAuth & Permissions after installing the Slack app.", required: true },
      ],
    },
    runtimeFieldLabel: {
      hermes: "Slack home channel ID",
      openclaw: "Slack home channel ID",
    },
    runtimePlaceholder: {
      hermes: "e.g. C01234567890",
      openclaw: "e.g. C01234567890",
    },
    runtimeHint: {
      hermes: "The channel ID where Hermes posts scheduled and proactive messages. Not the bot token.",
      openclaw: "The channel ID where OpenClaw posts messages. Not the bot token.",
    },
    runtimeDocs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack",
      openclaw: "https://github.com/nicepkg/openclaw#slack",
    },
    runtimeSteps: {
      hermes: [
        "Go to api.slack.com/apps/new, create an app from a manifest, and install it to your workspace.",
        "Copy the Bot Token (xoxb-) from OAuth & Permissions after installing.",
        "Invite the bot to the channel where Hermes should post: type /invite @YourBotName.",
        "Click the channel name \u2192 open details \u2192 copy the channel ID (starts with C) from the bottom.",
      ],
      openclaw: [
        "Go to api.slack.com/apps/new, create an app from a manifest, and install it to your workspace.",
        "Copy the Bot Token (xoxb-) from OAuth & Permissions after installing.",
        "Invite the bot to the channel where OpenClaw should post: type /invite @YourBotName.",
        "Click the channel name \u2192 open details \u2192 copy the channel ID (starts with C) from the bottom.",
      ],
    },
  },
  whatsapp: {
    label: "WhatsApp",
    credentialFields: {
      hermes: [],
      openclaw: [],
    },
    runtimeFieldLabel: {
      hermes: "WhatsApp home contact number",
      openclaw: "WhatsApp home contact number",
    },
    runtimePlaceholder: {
      hermes: "e.g. +15551234567",
      openclaw: "e.g. +15551234567",
    },
    runtimeHint: {
      hermes: "The phone number Hermes should message. Use E.164 format with country code.",
      openclaw: "The phone number OpenClaw should message. Use E.164 format with country code.",
    },
    runtimeDocs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp",
      openclaw: "https://github.com/nicepkg/openclaw#whatsapp",
    },
    runtimeSteps: {
      hermes: [
        "Hermes connects via WhatsApp Web. Use a dedicated number if you can \u2014 only one device links at a time.",
        "During setup, scan the QR code shown by Hermes to link your WhatsApp account.",
        "Enter the contact phone number in E.164 format: + country code + number, no spaces.",
      ],
      openclaw: [
        "OpenClaw connects via WhatsApp Web. Use a dedicated number if you can \u2014 only one device links at a time.",
        "During setup, scan the QR code shown by OpenClaw to link your WhatsApp account.",
        "Enter the contact phone number in E.164 format: + country code + number, no spaces.",
      ],
    },
  },
};

const runtimeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "openclaw": OpenClawIcon,
  "hermes": HermesIcon,
  "claude-code": ClaudeCodeIcon,
  "codex": CodexIcon,
};

const runtimeOrder: string[] = ["openclaw", "hermes", "claude-code", "codex"];

function sortRuntimeChoices(runtimeChoices: RuntimeChoice[]): RuntimeChoice[] {
  return [...runtimeChoices].sort((a, b) => runtimeOrder.indexOf(a) - runtimeOrder.indexOf(b));
}

function createRuntimeChannelConfig(
  runtime: ChannelSupportedRuntime,
  existing?: RuntimeChannelConfigDraft
): RuntimeChannelConfigDraft {
  const existingChannels = new Map(existing?.channels.map((channel) => [channel.channel, channel]) || []);
  return {
    runtime,
    channels: channelOrder.map((channel) => {
      const prev = existingChannels.get(channel);
      return {
        channel,
        target: prev?.target || "",
        botToken: prev?.botToken || "",
        appToken: prev?.appToken || "",
      };
    }),
  };
}

const runtimeModelPlaceholder: Record<string, string> = {
  "openclaw": "Use default model",
  "hermes": "e.g. sonnet, qwen-max, gpt-4.1",
  "claude-code": "e.g. claude-sonnet-4",
  "codex": "e.g. gpt-5-codex",
};

interface GuidedSetupProps {
  onComplete: () => void;
}

function formatProviderLabel(providerId: string): string {
  switch (providerId) {
    case "openai":
      return "OpenAI";
    case "openrouter":
      return "OpenRouter";
    case "google":
      return "Google";
    case "anthropic":
      return "Anthropic";
    default:
      return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  }
}

function buildLaunchPlan(state: GuidedState): LaunchProgressItem[] {
  const runtimeChoices = sortRuntimeChoices(state.runtimeChoices || []);
  const plan: LaunchProgressItem[] = [];

  if (state.deviceChoice === "local") {
    plan.push({
      key: "connector",
      label: "Install Hyperclaw connector",
      detail: "Download and register the background connector service.",
      status: "pending",
    });
    plan.push({
      key: "device-online",
      label: "Wait for this machine to come online",
      detail: "Confirm the paired device is reachable from Hyperclaw Hub.",
      status: "pending",
    });
    runtimeChoices.forEach((runtime) => {
      plan.push({
        key: `install:${runtime}`,
        label: `Install ${formatSingleRuntimeChoice(runtime)}`,
        detail: "Check the machine first, then install only if needed.",
        status: "pending",
      });
    });
  } else {
    plan.push({
      key: "remote-verify",
      label: "Check the connected machine",
      detail: "Make sure the remote connector is online before provisioning.",
      status: "pending",
    });
    runtimeChoices.forEach((runtime) => {
      plan.push({
        key: `install:${runtime}`,
        label: `Install ${formatSingleRuntimeChoice(runtime)}`,
        detail: "Check the remote machine first, then install only if needed.",
        status: "pending",
      });
    });
  }

  plan.push({
    key: "workspace-state",
    label: "Save workspace setup",
    detail: "Persist company, provider, and channel data for this workspace.",
    status: "pending",
  });
  if (runtimeChoices.includes("openclaw")) {
    plan.push({
      key: "openclaw-doctor",
      label: "Run OpenClaw Doctor",
      detail: "Repair OpenClaw config after install and channel setup.",
      status: "pending",
    });
    plan.push({
      key: "openclaw-security-audit",
      label: "Run OpenClaw security audit",
      detail: "Run a deep security audit after OpenClaw config repair.",
      status: "pending",
    });
    plan.push({
      key: "openclaw-status",
      label: "Check OpenClaw status",
      detail: "Capture a full OpenClaw status snapshot after setup checks.",
      status: "pending",
    });
  }
  plan.push({
    key: "runtime-verify",
    label: "Verify selected runtimes",
    detail: "Confirm each runtime is reachable before agent setup starts.",
    status: "pending",
  });

  (state.agentProfiles || [])
    .filter((profile) => profile.name.trim() && profile.description.trim())
    .forEach((profile) => {
      plan.push({
        key: `agent:${profile.runtime}:${toOnboardingSlug(profile.name) || profile.runtime}`,
        label: `Provision ${profile.name.trim()}`,
        detail: `${formatSingleRuntimeChoice(profile.runtime)} agent`,
        status: "pending",
      });
    });

  if (state.stripeApiKey?.trim()) {
    plan.push({
      key: "stripe",
      label: "Connect Stripe ARR",
      detail: "Encrypt and store the restricted Stripe key on your connector.",
      status: "pending",
    });
  }

  return plan;
}

// --- Combined Company + Agent step ---

function CompanyAgentStep({
  runtimeChoices,
  providerConfigs,
  initialCompanyName,
  initialCompanyDescription,
  initialCompanyAvatarDataUri,
  initialAgentProfiles,
  initialRuntimeChannelConfigs,
  initialMemorySearch,
  initialStripeApiKey,
  onBack,
  onComplete,
}: {
  runtimeChoices: RuntimeChoice[];
  providerConfigs: ProviderConfig[];
  initialCompanyName?: string;
  initialCompanyDescription?: string;
  initialCompanyAvatarDataUri?: string | null;
  initialAgentProfiles?: AgentSetupDraft[];
  initialRuntimeChannelConfigs?: RuntimeChannelConfigDraft[];
  initialMemorySearch?: MemorySearchConfig;
  initialStripeApiKey?: string;
  onBack: () => void;
  onComplete: (data: {
    companyName: string;
    companyDescription: string;
    companyAvatarDataUri?: string | null;
    agentProfiles: AgentSetupDraft[];
    runtimeChannelConfigs: RuntimeChannelConfigDraft[];
    memorySearch?: MemorySearchConfig;
    stripeApiKey?: string;
  }) => void;
}) {
  const [companyName, setCompanyName] = useState(initialCompanyName || "");
  const [companyAvatarDataUri, setCompanyAvatarDataUri] = useState<string | null>(initialCompanyAvatarDataUri || null);
  const companyAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const orderedRuntimeChoices = useMemo(() => sortRuntimeChoices(runtimeChoices), [runtimeChoices]);
  // Use "/" as the separator so the value is already in Hermes "provider/model"
  // format. The connector's hermesModelSlug also normalizes ":" → "/" as a
  // belt-and-braces safeguard for any stored legacy values.
  //
  // Runtime/provider compatibility:
  //   - claude-code: only Anthropic models are usable (Claude Code speaks the
  //     Anthropic API exclusively).
  //   - codex: only OpenAI models are usable (Codex CLI is OpenAI-only).
  //   - hermes / openclaw: any configured provider works.
  const getAllowedProviderIds = (runtime: RuntimeChoice): string[] | null => {
    if (runtime === "claude-code") return ["anthropic"];
    if (runtime === "codex") return ["openai"];
    return null;
  };
  const getAvailableBrainModels = (runtime: RuntimeChoice) => {
    const allowed = getAllowedProviderIds(runtime);
    const filtered = allowed
      ? providerConfigs.filter((config) => allowed.includes(config.providerId))
      : providerConfigs;
    return filtered.map((config) => ({
      value: `${config.providerId}/${config.model}`,
      label: `${formatProviderLabel(config.providerId)} · ${config.model}`,
    }));
  };
  const [companyDescription, setCompanyDescription] = useState(initialCompanyDescription || "");
  const [openRuntime, setOpenRuntime] = useState<string>(() => orderedRuntimeChoices[0] || "");
  const [error, setError] = useState<string | null>(null);
  const [openChannelGuide, setOpenChannelGuide] = useState<string>("");
  const [openChannelConfig, setOpenChannelConfig] = useState<string>("");
  const [agentProfiles, setAgentProfiles] = useState<AgentSetupDraft[]>(() => {
    const existing = new Map((initialAgentProfiles || []).map((profile) => [profile.runtime, profile]));
    return orderedRuntimeChoices.map((runtime, index) => {
      const profile = existing.get(runtime);
      const defaults: Partial<AgentSetupDraft> = runtime === "hermes"
        ? { name: "Operator", role: "Operations Agent", description: "Learns from execution and keeps long-running tasks moving.", emoji: "🧠" }
        : runtime === "claude-code"
          ? { name: "", role: "", description: "", emoji: "⚡", emojiEnabled: false }
          : { name: "", role: "", description: "", emoji: "🚀", emojiEnabled: false };
      return createAgentDraft(runtime, profile || defaults || { emoji: EMOJI_OPTIONS[index % EMOJI_OPTIONS.length] });
    });
  });
  const [runtimeChannelConfigs, setRuntimeChannelConfigs] = useState<RuntimeChannelConfigDraft[]>(() => {
    const existing = new Map((initialRuntimeChannelConfigs || []).map((config) => [config.runtime, config]));
    return orderedRuntimeChoices
      .filter(supportsChannelSetup)
      .map((runtime) => createRuntimeChannelConfig(runtime, existing.get(runtime)));
  });

  // Memory search state (only applies to OpenClaw agents)
  const [memoryEnabled, setMemoryEnabled] = useState(initialMemorySearch?.enabled ?? false);
  const [memoryProvider, setMemoryProvider] = useState(initialMemorySearch?.provider ?? "openai");
  const [memoryApiKey, setMemoryApiKey] = useState(initialMemorySearch?.apiKey ?? "");
  const [showMemoryKey, setShowMemoryKey] = useState(false);

  // Optional Stripe restricted key — buffered locally, applied at launch.
  const [stripeApiKey, setStripeApiKey] = useState(initialStripeApiKey ?? "");
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [stripeOpen, setStripeOpen] = useState(!!initialStripeApiKey);
  const stripeKeyTrimmed = stripeApiKey.trim();
  const stripeKeyLooksValid = stripeKeyTrimmed === "" || isPlausibleStripeKey(stripeKeyTrimmed);
  const stripeKeyConnected = stripeKeyTrimmed !== "" && stripeKeyLooksValid;

  useEffect(() => {
    setAgentProfiles((prev) => {
      const existing = new Map(prev.map((profile) => [profile.runtime, profile]));
      return orderedRuntimeChoices.map((runtime, index) => createAgentDraft(runtime, existing.get(runtime) || {
        emoji: EMOJI_OPTIONS[index % EMOJI_OPTIONS.length],
      }));
    });
  }, [orderedRuntimeChoices]);

  useEffect(() => {
    if (openRuntime && !orderedRuntimeChoices.includes(openRuntime as RuntimeChoice)) {
      setOpenRuntime(orderedRuntimeChoices[0] || "");
    }
  }, [openRuntime, orderedRuntimeChoices]);

  useEffect(() => {
    setRuntimeChannelConfigs((prev) => {
      const existing = new Map(prev.map((config) => [config.runtime, config]));
      return orderedRuntimeChoices
        .filter(supportsChannelSetup)
        .map((runtime) => createRuntimeChannelConfig(runtime, existing.get(runtime)));
    });
  }, [orderedRuntimeChoices]);

  // If a previously-chosen mainModel is no longer compatible with the profile's
  // runtime (e.g. the user removed that provider, or they are on Claude Code /
  // Codex which restrict the allowed providers), fall back to the workspace
  // default so nothing stale gets sent to provisioning.
  useEffect(() => {
    setAgentProfiles((prev) => {
      let changed = false;
      const next = prev.map((profile) => {
        const stored = (profile.mainModel || "").trim();
        if (!stored || stored === "__default__") return profile;
        const allowedValues = new Set(getAvailableBrainModels(profile.runtime).map((m) => m.value));
        if (allowedValues.has(stored)) return profile;
        changed = true;
        return { ...profile, mainModel: "__default__" };
      });
      return changed ? next : prev;
    });
    // providerConfigs shape is stable-ish for our purposes; re-run when the
    // list of configured providers or runtimes changes.
  }, [providerConfigs, orderedRuntimeChoices]);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Every visible agent profile must have BOTH name + description. Partial
  // profiles silently get skipped during provisioning (see handleFinalLaunch),
  // which is how users end up on an empty dashboard after a "successful"
  // onboarding. Require all-or-nothing from the UI instead.
  const canSubmit = !!companyName.trim() && !!companyDescription.trim() && agentProfiles.length > 0 && agentProfiles.every((profile) => {
    const required = isAgentRequired(profile.runtime);
    const hasName = !!profile.name.trim();
    const hasRole = !!profile.role.trim();
    const hasDescription = !!profile.description.trim();
    if (required) return hasName && hasDescription;
    return (!hasName && !hasRole && !hasDescription) || (hasName && hasDescription);
  }) && stripeKeyLooksValid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    dashboardState.set("hyperclaw-company", JSON.stringify({
      name: companyName.trim(),
      description: companyDescription.trim(),
      avatarDataUri: companyAvatarDataUri || undefined,
      createdAt: new Date().toISOString(),
    }), { flush: true });
    const hasOpenClaw = runtimeChoices.includes("openclaw");
    const memoryDef = MEMORY_PROVIDERS.find((m) => m.id === memoryProvider);
    const memoryKeyFromBrain = memoryDef?.matchesProviderIds
      ?.map((pid) => providerConfigs.find((c) => c.providerId === pid)?.apiKey?.trim())
      .find(Boolean) ?? "";
    const resolvedMemoryApiKey = memoryKeyFromBrain || memoryApiKey.trim() || undefined;

    onComplete({
      companyName: companyName.trim(),
      companyDescription: companyDescription.trim(),
      companyAvatarDataUri: companyAvatarDataUri || undefined,
      agentProfiles: agentProfiles.map((profile) => ({
        ...profile,
        name: profile.name.trim(),
        role: profile.role.trim(),
        description: profile.description.trim(),
      })),
      runtimeChannelConfigs: runtimeChannelConfigs.map((config) => ({
        runtime: config.runtime,
        agentId: config.agentId,
        agentName: config.agentName,
        channels: config.channels.map((channel) => ({
          channel: channel.channel,
          target: channel.target.trim(),
          botToken: channel.botToken.trim(),
          appToken: channel.appToken.trim(),
        })),
      })),
      memorySearch: (hasOpenClaw && memoryEnabled)
        ? { enabled: true, provider: memoryProvider, apiKey: resolvedMemoryApiKey }
        : undefined,
      stripeApiKey: stripeKeyTrimmed || undefined,
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && canSubmit) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSubmit]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateAgentProfile = (runtime: RuntimeChoice, updates: Partial<AgentSetupDraft>) => {
    setAgentProfiles((prev) => prev.map((profile) => (
      profile.runtime === runtime ? { ...profile, ...updates } : profile
    )));
  };

  const handleCompanyAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file for the company avatar.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar image must be under 5 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") {
        setError(null);
        setCompanyAvatarDataUri(result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleImageSelect = (runtime: RuntimeChoice, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file for the agent avatar.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar image must be under 5 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") {
        setError(null);
        updateAgentProfile(runtime, { avatarDataUri: result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const updateRuntimeChannel = (
    runtime: ChannelSupportedRuntime,
    channel: ChannelType,
    updates: Partial<ChannelConfigDraft>
  ) => {
    setRuntimeChannelConfigs((prev) => prev.map((config) => (
      config.runtime === runtime
        ? {
            ...config,
            channels: config.channels.map((entry) => (
              entry.channel === channel ? { ...entry, ...updates } : entry
            )),
          }
        : config
    )));
  };

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  };

  return (
    <motion.div
      className="h-full flex flex-col text-center"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 customScrollbar2">
        <div className="space-y-8">
          <motion.div className="space-y-3" variants={fadeUp}>
            <h1 className="text-[28px] font-medium text-foreground tracking-tight">
              Set up your company
            </h1>
            <p className="text-foreground/40 text-[15px]">
              Define your company, then shape the agents that will work for it.
            </p>
          </motion.div>

          <motion.div className="space-y-5 max-w-xl mx-auto text-left" variants={fadeUp}>
            {error && (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3.5 py-3 text-[13px] text-amber-100/85">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[13px] text-foreground/50">Company</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => companyAvatarInputRef.current?.click()}
                  className="relative w-12 h-12 shrink-0 rounded-xl bg-foreground/[0.06] border border-solid border-primary/10 hover:border-foreground/20 flex items-center justify-center overflow-hidden transition-colors group"
                >
                  {companyAvatarDataUri ? (
                    <>
                      <Image
                        src={companyAvatarDataUri}
                        alt="Company avatar"
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ImagePlus className="w-4 h-4 text-white/80" />
                      </div>
                    </>
                  ) : (
                    <ImagePlus className="w-4.5 h-4.5 text-foreground/25 group-hover:text-foreground/40 transition-colors" />
                  )}
                </button>
                <input
                  ref={companyAvatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCompanyAvatarSelect}
                />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                    maxLength={COMPANY_NAME_MAX_LENGTH}
                    className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3.5 py-3 text-[15px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[48px]"
                    autoFocus
                  />
                </div>
                {companyAvatarDataUri && (
                  <button
                    type="button"
                    onClick={() => setCompanyAvatarDataUri(null)}
                    className="w-8 h-8 shrink-0 rounded-lg bg-foreground/[0.04] border border-solid border-primary/10 hover:border-foreground/20 flex items-center justify-center transition-colors"
                    title="Remove avatar"
                  >
                    <X className="w-3.5 h-3.5 text-foreground/40" />
                  </button>
                )}
              </div>
              <p className="text-[12px] text-foreground/20 text-right">
                {companyName.length}/{COMPANY_NAME_MAX_LENGTH}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] text-foreground/50">Company description</label>
              <textarea
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                placeholder="What kind of company is this, and how should its agents collaborate?"
                rows={4}
                maxLength={COMPANY_DESCRIPTION_MAX_LENGTH}
                className="w-full resize-none bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3.5 py-3 text-[15px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
              />
              <p className="text-[13px] text-foreground/20 pt-0.5">
                These details shape the default voice and context for your team.
              </p>
              <p className="text-[12px] text-foreground/20 text-right">
                {companyDescription.length}/{COMPANY_DESCRIPTION_MAX_LENGTH}
              </p>
            </div>

            <div
              className={`rounded-xl border overflow-hidden transition-all duration-300 ${
                stripeKeyConnected
                  ? "bg-foreground/[0.06] border-foreground/20"
                  : "bg-foreground/[0.03] border-foreground/8 hover:border-foreground/12 hover:bg-foreground/[0.05]"
              }`}
            >
              <motion.button
                type="button"
                onClick={() => setStripeOpen((v) => !v)}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
                  <StripeIcon className="w-10 h-10 object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-foreground/90">Connect Stripe</span>
                    {stripeKeyConnected ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300/85 border border-emerald-500/20 font-medium">
                        Connected
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/8 text-foreground/45 font-medium">
                        Optional
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-foreground/35 mt-0.5">
                    Show live ARR on the company widget
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-foreground/40 transition-transform shrink-0 ${stripeOpen ? "rotate-180" : ""}`}
                />
              </motion.button>

              <AnimatePresence initial={false}>
                {stripeOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="overflow-hidden"
                  >
                <div className="px-4 pb-4 space-y-3 border-t border-foreground/5">
                  <div className="space-y-1.5 pt-3">
                    <label className="text-[13px] text-foreground/50">
                      Stripe restricted key
                    </label>
                    <div className="relative">
                      <input
                        type={showStripeKey ? "text" : "password"}
                        value={stripeApiKey}
                        onChange={(e) => setStripeApiKey(e.target.value)}
                        placeholder="rk_live_..."
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg pl-3.5 pr-10 py-3 text-[14px] font-mono text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[48px]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStripeKey((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                        aria-label={showStripeKey ? "Hide key" : "Show key"}
                      >
                        {showStripeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {!stripeKeyLooksValid && (
                      <p className="text-[12px] text-amber-400/85">
                        Does not look like a Stripe key. It should start with{" "}
                        <code>rk_live_</code> or <code>rk_test_</code>.
                      </p>
                    )}
                    <div className="flex items-start gap-1.5 text-[12px] text-foreground/30 pt-1">
                      <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>
                        Encrypted on your device before transit. Hyperclaw servers never see the key.
                      </span>
                    </div>
                  </div>

                  <details className="text-[12px] text-foreground/55 [&_summary]:cursor-pointer">
                    <summary className="hover:text-foreground/80 transition-colors py-1 select-none">
                      How to get a restricted key
                    </summary>
                    <ol className="mt-2 space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
                      <li>
                        Open the{" "}
                        <a
                          href="https://dashboard.stripe.com/apikeys/create?name=Hyperclaw%20ARR&permissions[0]=rak_subscription_read&permissions[1]=rak_customer_read&permissions[2]=rak_product_read"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground/85 underline inline-flex items-center gap-0.5"
                        >
                          Stripe API keys page
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>{" "}
                        and click <span className="text-foreground/85">Create restricted key</span>.
                      </li>
                      <li>Name it something like <span className="text-foreground/85">Hyperclaw ARR</span>.</li>
                      <li>
                        Grant <span className="text-foreground/85">Read</span> access to these
                        resources (leave everything else as None):
                        <div className="mt-2 space-y-1">
                          {[
                            { resource: "Subscriptions" },
                            { resource: "Customers" },
                            { resource: "Products" },
                          ].map((row) => (
                            <div
                              key={row.resource}
                              className="flex items-center justify-between rounded-md bg-foreground/[0.04] border border-border px-2.5 py-1.5"
                            >
                              <span className="font-medium text-foreground/85">{row.resource}</span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                Read
                              </span>
                            </div>
                          ))}
                        </div>
                      </li>
                      <li>Click create and copy the key (starts with <code>rk_live_</code>).</li>
                      <li>Paste it above. We validate it on launch by hitting Stripe once.</li>
                    </ol>
                  </details>
                </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Accordion
              type="single"
              collapsible
              value={openRuntime}
              onValueChange={(value) => setOpenRuntime(value || "")}
              className="space-y-3 pt-2"
            >
          {agentProfiles.map((profile) => {
            const Icon = runtimeIconMap[profile.runtime];
            const required = isAgentRequired(profile.runtime);
            const hasName = !!profile.name.trim();
            const hasRole = !!profile.role.trim();
            const hasDescription = !!profile.description.trim();
            const hasPartial = hasName || hasRole || hasDescription;
            const hasValidOptional = !required && ((!hasName && !hasRole && !hasDescription) || (hasName && hasDescription));
            const isValid = required
              ? hasName && hasDescription
              : hasValidOptional;

            return (
              <AccordionItem
                key={profile.runtime}
                value={profile.runtime}
                className="rounded-2xl border border-foreground/10 bg-foreground/[0.04] px-4 data-[state=open]:bg-foreground/[0.055]"
              >
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex w-full items-start justify-between gap-3 pr-3 text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-foreground/[0.06] border border-foreground/8 flex items-center justify-center overflow-hidden">
                        <Icon className={profile.runtime === "hermes" ? "w-10 h-10" : "w-6 h-6"} />
                      </div>
                      <div>
                        <div className="text-[15px] font-medium text-foreground">
                          {formatSingleRuntimeChoice(profile.runtime)}
                        </div>
                        <div className="text-[12px] text-foreground/35 font-normal">
                          {required ? "Agent profile required" : "Optional agent profile"}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={isValid ? "success" : hasPartial ? "secondary" : "outline"}
                      className="mt-1 text-[11px]"
                    >
                      {required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-1">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-[13px] text-foreground/50">Avatar & emoji</label>
                        <button
                          type="button"
                          onClick={() => updateAgentProfile(profile.runtime, {
                            emojiEnabled: !profile.emojiEnabled,
                          })}
                          className={`min-h-[32px] px-3 rounded-lg text-[12px] border transition-colors ${
                            profile.emojiEnabled
                              ? "bg-foreground text-background border-foreground"
                              : "bg-foreground/[0.04] text-foreground/70 border-solid border-primary/10 hover:border-foreground/20"
                          }`}
                        >
                          {profile.emojiEnabled ? "Emoji on" : "Emoji off"}
                        </button>
                      </div>
                      <div className="flex items-center gap-4 rounded-2xl bg-foreground/[0.04] p-3.5">
                        <div className="relative w-16 h-16 shrink-0 rounded-2xl bg-foreground/[0.05] flex items-center justify-center overflow-hidden">
                          {profile.avatarDataUri ? (
                            <Image
                              src={profile.avatarDataUri}
                              alt={`${formatSingleRuntimeChoice(profile.runtime)} avatar`}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : profile.emojiEnabled ? (
                            <span className="text-2xl">{profile.emoji}</span>
                          ) : (
                            <Icon className={profile.runtime === "hermes" ? "w-10 h-10" : "w-7 h-7"} />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="text-[12px] text-foreground/30">
                            Upload a photo or illustration for this agent. PNG, JPG, GIF, or WebP up to 5 MB.
                          </div>
                          {profile.emojiEnabled && (
                            <div className="flex flex-wrap gap-2">
                              {EMOJI_OPTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => updateAgentProfile(profile.runtime, { emoji })}
                                  className={`w-8 h-8 rounded-lg border border-solid border-primary/10 text-base transition-all ${
                                    profile.emoji === emoji
                                      ? "border-foreground bg-foreground text-background"
                                      : "border-foreground/10 bg-foreground/[0.04] hover:border-foreground/20"
                                  }`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRefs.current[profile.runtime]?.click()}
                              className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-solid border-primary/10 bg-foreground/[0.05] px-3.5 text-[13px] text-foreground/85 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.08]"
                            >
                              <ImagePlus className="w-3.5 h-3.5" />
                              {profile.avatarDataUri ? "Change photo" : "Upload photo"}
                            </button>
                            {profile.avatarDataUri && (
                              <button
                                type="button"
                                onClick={() => updateAgentProfile(profile.runtime, { avatarDataUri: null })}
                                className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-foreground/10 bg-transparent px-3.5 text-[13px] text-foreground/65 transition-colors hover:border-foreground/20 hover:text-foreground/90"
                              >
                                <X className="w-3.5 h-3.5" />
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        <input
                          ref={(node) => {
                            fileInputRefs.current[profile.runtime] = node;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageSelect(profile.runtime, e)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] text-foreground/50">Main model</label>
                      {(() => {
                        const runtimeBrainModels = getAvailableBrainModels(profile.runtime);
                        const allowedProviders = getAllowedProviderIds(profile.runtime);
                        const isRestricted = allowedProviders !== null;
                        const hasAnyConfigured = providerConfigs.length > 0;
                        const restrictionHint = profile.runtime === "claude-code"
                          ? "Claude Code only runs on Anthropic models. Add an Anthropic provider to pick a model here."
                          : profile.runtime === "codex"
                            ? "Codex only runs on OpenAI models. Add an OpenAI provider to pick a model here."
                            : null;

                        return (
                          <>
                            {runtimeBrainModels.length > 0 && (
                              <Select
                                value={(() => {
                                  const stored = profile.mainModel;
                                  if (!stored || stored === "__default__") return "__default__";
                                  return runtimeBrainModels.some((m) => m.value === stored) ? stored : "__default__";
                                })()}
                                onValueChange={(value) => updateAgentProfile(profile.runtime, { mainModel: value })}
                              >
                                <SelectTrigger className="min-h-[48px] w-full rounded-xl border border-foreground/10 bg-foreground/[0.045] px-3.5 text-left text-[14px] text-foreground shadow-none transition-colors hover:bg-foreground/[0.075] hover:border-foreground/20 focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0 data-[placeholder]:text-foreground/30 [&>span]:truncate [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-foreground/35">
                                  <SelectValue
                                    placeholder={runtimeModelPlaceholder[profile.runtime]}
                                    className="text-foreground"
                                  />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border border-foreground/10 bg-popover/98 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                                  <SelectItem
                                    value="__default__"
                                    className="rounded-xl py-2.5 pl-8 pr-3 text-[13px] text-foreground/80 focus:bg-foreground/10 focus:text-foreground data-[state=checked]:bg-foreground/12 data-[state=checked]:text-foreground"
                                  >
                                    Follow workspace default
                                  </SelectItem>
                                  {runtimeBrainModels.map((model) => (
                                    <SelectItem
                                      key={model.value}
                                      value={model.value}
                                      className="rounded-xl py-2.5 pl-8 pr-3 text-[13px] text-foreground/80 focus:bg-foreground/10 focus:text-foreground data-[state=checked]:bg-foreground/12 data-[state=checked]:text-foreground"
                                    >
                                      {model.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {isRestricted && runtimeBrainModels.length === 0 && hasAnyConfigured && restrictionHint ? (
                              <p className="text-[12px] text-amber-500 dark:text-amber-300/70">
                                {restrictionHint}
                              </p>
                            ) : isRestricted && runtimeBrainModels.length > 0 ? (
                              <p className="text-[12px] text-foreground/30">
                                {profile.runtime === "claude-code"
                                  ? "Claude Code runs on Anthropic models only."
                                  : "Codex runs on OpenAI models only."}
                              </p>
                            ) : (
                              <p className="text-[12px] text-foreground/20">
                                Pick from the brain models configured in the previous step.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] text-foreground/50">Name</label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => updateAgentProfile(profile.runtime, { name: e.target.value })}
                        placeholder={required ? "e.g. CEO" : "Leave blank if you do not want one yet"}
                        maxLength={AGENT_NAME_MAX_LENGTH}
                        className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3.5 py-3 text-[15px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[48px]"
                      />
                      <p className="text-[12px] text-foreground/20 text-right">
                        {profile.name.length}/{AGENT_NAME_MAX_LENGTH}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] text-foreground/50">Role</label>
                      <input
                        type="text"
                        value={profile.role}
                        onChange={(e) => updateAgentProfile(profile.runtime, { role: e.target.value })}
                        placeholder={required ? "e.g. Strategy & Execution" : "Optional role title"}
                        maxLength={AGENT_ROLE_MAX_LENGTH}
                        className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3.5 py-3 text-[15px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[48px]"
                      />
                      <p className="text-[12px] text-foreground/20 text-right">
                        {profile.role.length}/{AGENT_ROLE_MAX_LENGTH}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] text-foreground/50">Description</label>
                      <textarea
                        value={profile.description}
                        onChange={(e) => updateAgentProfile(profile.runtime, { description: e.target.value })}
                        placeholder={required ? "Describe this agent's role, behavior, and responsibility." : "Optional. If you add a description, include a name too."}
                        rows={3}
                        maxLength={AGENT_DESCRIPTION_MAX_LENGTH}
                        className="w-full resize-none bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3.5 py-3 text-[15px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
                      />
                      <p className="text-[12px] text-foreground/20 text-right">
                        {profile.description.length}/{AGENT_DESCRIPTION_MAX_LENGTH}
                      </p>
                    </div>
                  </div>

                  {profile.runtime === "openclaw" && (() => {
                    const memDef = MEMORY_PROVIDERS.find((m) => m.id === memoryProvider);
                    const keyFromBrain = memDef?.matchesProviderIds
                      ?.map((pid) => providerConfigs.find((c) => c.providerId === pid)?.apiKey?.trim())
                      .find(Boolean) ?? "";
                    const needsExtraKey = memoryEnabled && (memDef?.needsApiKey ?? false) && !keyFromBrain;
                    return (
                      <div className="space-y-3 pt-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-foreground/40" />
                              <span className="text-[13px] text-foreground/55">Memory search</span>
                            </div>
                            <p className="text-[11px] text-foreground/30">
                              Enables semantic search across conversation history.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setMemoryEnabled((v) => !v)}
                            className={`shrink-0 min-h-[32px] px-3 rounded-lg text-[12px] border transition-colors ${
                              memoryEnabled
                                ? "bg-foreground text-background border-foreground"
                                : "bg-foreground/[0.04] text-foreground/70 border-solid border-primary/10 hover:border-foreground/20"
                            }`}
                          >
                            {memoryEnabled ? "Enabled" : "Disabled"}
                          </button>
                        </div>

                        {memoryEnabled && (
                          <div className="space-y-2 pl-1">
                            <Select value={memoryProvider} onValueChange={setMemoryProvider}>
                              <SelectTrigger className="min-h-[44px] w-full rounded-xl border border-foreground/10 bg-foreground/[0.045] px-3.5 text-left text-[13px] text-foreground shadow-none transition-colors hover:bg-foreground/[0.075] hover:border-foreground/20 focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0 data-[placeholder]:text-foreground/30 [&>span]:truncate [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-foreground/35">
                                <SelectValue placeholder="Select provider" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border border-foreground/10 bg-popover/98 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                                {MEMORY_PROVIDERS.map((mp) => (
                                  <SelectItem
                                    key={mp.id}
                                    value={mp.id}
                                    className="rounded-xl py-2.5 pl-8 pr-3 text-[13px] text-foreground/80 focus:bg-foreground/10 focus:text-foreground data-[state=checked]:bg-foreground/12 data-[state=checked]:text-foreground"
                                  >
                                    <span>{mp.name}</span>
                                    <span className="ml-2 text-foreground/35">{mp.description}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {keyFromBrain && (
                              <p className="text-[11px] text-emerald-400/70">
                                API key detected from your brain configuration.
                              </p>
                            )}

                            {needsExtraKey && (
                              <div className="space-y-1.5">
                                <label className="text-[12px] text-foreground/45">
                                  {memDef?.name} API key
                                </label>
                                <div className="relative">
                                  <input
                                    type={showMemoryKey ? "text" : "password"}
                                    value={memoryApiKey}
                                    onChange={(e) => setMemoryApiKey(e.target.value)}
                                    placeholder={`Paste your ${memDef?.name} API key…`}
                                    className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg pl-3.5 pr-10 py-2.5 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowMemoryKey((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/25 hover:text-foreground/50 transition-colors"
                                  >
                                    {showMemoryKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <p className="text-[11px] text-foreground/25">
                                  Leave blank to skip memory search. You can configure it later in settings.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {supportsChannelSetup(profile.runtime) && (() => {
                    const channelRuntime = profile.runtime;
                    return (
                    <div className="space-y-3 pt-4">
                      <div className="space-y-1">
                        <div className="text-[13px] text-foreground/55">Channel details</div>
                        <div className="text-[12px] text-foreground/25">
                          Add the messaging targets you already know so setup can finish with the right home channels and IDs.
                        </div>
                      </div>

                      <Accordion
                        type="single"
                        collapsible
                        value={openChannelConfig}
                        onValueChange={(value) => setOpenChannelConfig(value || "")}
                        className="space-y-2"
                      >
                        {(runtimeChannelConfigs.find((config) => config.runtime === channelRuntime)?.channels || []).map((channelConfig) => {
                          const channelMeta = channelSetupContent[channelConfig.channel];
                          const configValue = `channel:${channelRuntime}:${channelConfig.channel}`;
                          const guideValue = `${channelRuntime}:${channelConfig.channel}`;
                          const credFields = channelMeta.credentialFields[channelRuntime] || [];
                          const hasToken = credFields.some((f) => channelConfig[f.key]?.trim());
                          const hasTarget = !!channelConfig.target.trim();
                          const statusPreview = hasToken && hasTarget ? "Ready" : hasToken ? "Token set" : hasTarget ? "ID set" : "Not set";

                          return (
                            <AccordionItem
                              key={channelConfig.channel}
                              value={configValue}
                              className="rounded-xl border border-solid border-primary/10 bg-foreground/[0.04] px-3"
                            >
                              <AccordionTrigger className="py-2.5 hover:no-underline">
                                <div className="flex w-full items-center gap-2 pr-2 text-left min-w-0">
                                  <div className="text-[12px] font-medium text-foreground/85 shrink-0">
                                    {channelMeta.label}
                                  </div>
                                  <div className={`truncate text-[11px] min-w-0 ${hasToken && hasTarget ? "text-emerald-400/60" : "text-foreground/30"}`}>
                                    {statusPreview}
                                  </div>
                                </div>
                              </AccordionTrigger>

                              <AccordionContent className="pt-1">
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-[12px] text-foreground/50">
                                      {channelMeta.label} setup
                                    </label>
                                    <a
                                      href={channelMeta.runtimeDocs[channelRuntime]}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-foreground/40 hover:text-foreground/80 transition-colors"
                                    >
                                      Official docs
                                    </a>
                                  </div>

                                  {/* Credential fields (bot token, app token) */}
                                  {credFields.map((field) => (
                                    <div key={field.key} className="space-y-1">
                                      <label className="text-[11px] text-foreground/40">
                                        {field.label}
                                        {field.required && <span className="text-red-400/60 ml-0.5">*</span>}
                                      </label>
                                      <input
                                        type="password"
                                        value={channelConfig[field.key]}
                                        onChange={(e) => updateRuntimeChannel(channelRuntime, channelConfig.channel, {
                                          [field.key]: e.target.value,
                                        })}
                                        placeholder={field.placeholder}
                                        className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[36px] font-mono"
                                      />
                                      <p className="text-[10px] text-foreground/20">{field.hint}</p>
                                    </div>
                                  ))}

                                  {/* Target field (channel/user/chat ID) */}
                                  <div className="space-y-1">
                                    <label className="text-[11px] text-foreground/40">
                                      {channelMeta.runtimeFieldLabel[channelRuntime]}
                                    </label>
                                    <input
                                      type="text"
                                      value={channelConfig.target}
                                      onChange={(e) => updateRuntimeChannel(channelRuntime, channelConfig.channel, {
                                        target: e.target.value,
                                      })}
                                      placeholder={channelMeta.runtimePlaceholder[channelRuntime]}
                                      maxLength={CHANNEL_TARGET_MAX_LENGTH}
                                      className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[36px]"
                                    />
                                    <p className="text-[10px] text-foreground/20">
                                      {channelMeta.runtimeHint[channelRuntime]}
                                    </p>
                                  </div>

                                  <Accordion
                                    type="single"
                                    collapsible
                                    value={openChannelGuide}
                                    onValueChange={(value) => setOpenChannelGuide(value || "")}
                                  >
                                    <AccordionItem value={guideValue} className="border-0">
                                      <AccordionTrigger className="py-1.5 text-[11px] text-foreground/60 hover:no-underline">
                                        How do I find this?
                                      </AccordionTrigger>
                                      <AccordionContent className="pt-1">
                                        <div className="space-y-1.5 text-[11px] text-foreground/60">
                                          {channelMeta.runtimeSteps[channelRuntime].map((step, index) => (
                                            <div key={step} className="flex items-start gap-2">
                                              <span className="mt-0.5 text-foreground/25">{index + 1}.</span>
                                              <span>{step}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </div>
                    );
                  })()}

                </AccordionContent>
              </AccordionItem>
            );
            })}
            </Accordion>
          </motion.div>
        </div>
      </div>

      <motion.div
        variants={fadeUp}
        className="mt-4 pt-4 border-t border-foreground/8 flex items-center justify-center gap-3"
      >
        <motion.button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium text-foreground/70 bg-foreground/[0.04] hover:bg-foreground/[0.07] border border-foreground/10 hover:border-foreground/20 transition-all"
          whileHover={{ y: -1 }}
          whileTap={{ y: 0 }}
        >
          Back
        </motion.button>
        <motion.button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/80 disabled:bg-foreground/[0.03] disabled:text-foreground/30 disabled:border-foreground/6 disabled:cursor-not-allowed border border-foreground/10 hover:border-foreground/20 transition-all"
          whileHover={canSubmit ? { y: -1 } : {}}
          whileTap={canSubmit ? { y: 0 } : {}}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// --- Main setup wizard ---

export default function GuidedSetup({ onComplete }: GuidedSetupProps) {
  const { userInfo, status } = useUser();
  const canUseLocalConnectorBootstrap = typeof window !== "undefined" &&
    !!window.electronAPI?.runtimes?.installLocalConnector;
  const allowRemoteOnboarding = canUseRemoteOnboarding(status);
  const [currentStep, setCurrentStep] = useState(1);
  const [guidedState, setGuidedState] = useState<GuidedState>(() =>
    normalizeGuidedStateForPlatform(loadGuidedState(), canUseLocalConnectorBootstrap, allowRemoteOnboarding)
  );
  const [direction, setDirection] = useState(1);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchProgress, setLaunchProgress] = useState<LaunchProgressItem[]>([]);

  const [companyName, setCompanyName] = useState(guidedState.companyName || "");
  const [agentSummary, setAgentSummary] = useState(formatAgentSummary(guidedState.agentProfiles));

  useEffect(() => {
    // Only auto-exit to the dashboard if setup previously reached the final
    // gate (launchCompletedAt) or the user explicitly skipped. Relying on
    // completedSteps.length >= TOTAL_STEPS alone was the bug that dropped
    // users into an empty dashboard mid-install when a step re-mounted after
    // a partial persist.
    //
    // If launchInProgress is ALSO set, a previous run was interrupted mid-way
    // (tab refresh, crash, connector drop). Do NOT short-circuit to the
    // dashboard. Clear the stale flags and land the user back on step 4 so
    // they can retry. Otherwise a half-finished run could keep auto-exiting
    // into an empty dashboard every time.
    if (guidedState.launchInProgress) {
      setGuidedState((prev) => {
        const next = { ...prev, launchInProgress: undefined, launchCompletedAt: undefined };
        saveGuidedState(next, true);
        return next;
      });
      setCurrentStep(TOTAL_STEPS);
      setLaunchError("Previous setup was interrupted before it finished. Click Launch to resume.");
      return;
    }
    if (guidedState.launchCompletedAt || guidedState.skippedAt) {
      onComplete();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setGuidedState((prev) => {
      const next = normalizeGuidedStateForPlatform(prev, canUseLocalConnectorBootstrap, allowRemoteOnboarding);
      if (next === prev) return prev;
      saveGuidedState(next, false);
      return next;
    });
  }, [allowRemoteOnboarding, canUseLocalConnectorBootstrap]);

  const completeStep = useCallback((step: number, data?: Partial<GuidedState>) => {
    const isFinal = step >= TOTAL_STEPS;
    setGuidedState((prev) => {
      const next: GuidedState = {
        ...prev,
        ...data,
        completedSteps: [...new Set([...prev.completedSteps, step])],
      };
      saveGuidedState(next, isFinal);
      return next;
    });
    if (isFinal) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentStep(step + 1);
    }
  }, [onComplete]);

  const goBack = useCallback(() => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const createOrReuseLocalPairing = useCallback(async (): Promise<PairingInfo> => {
    const devicesRes = await hubFetch("/api/devices");
    if (!devicesRes.ok) {
      throw new Error("Unable to load your devices from Hyperclaw Hub.");
    }

    const devices = await devicesRes.json();
    const reusable = Array.isArray(devices)
      ? devices.find((device: any) =>
          device.status === "online" ||
          device.status === "provisioning" ||
          device.status === "connecting"
        )
      : null;

    let deviceId = reusable?.id || reusable?._id;

    // Device already online — skip creating/pairing, just reuse it
    if (deviceId && reusable?.status === "online") {
      return { token: "", deviceId };
    }

    if (!deviceId) {
      const createRes = await hubFetch("/api/devices", {
        method: "POST",
        body: JSON.stringify({ name: "This Machine", type: "connector" }),
      });
      if (!createRes.ok) {
        throw new Error("Unable to create a local connector device.");
      }
      const created = await createRes.json();
      deviceId = created.id || created._id;
    }

    const pairingRes = await hubFetch(`/api/devices/${deviceId}/pairing-token`, {
      method: "POST",
    });
    if (!pairingRes.ok) {
      throw new Error("Unable to generate a pairing token for this machine.");
    }

    const pairing = await pairingRes.json();
    return {
      token: pairing.token,
      deviceId: pairing.deviceId || deviceId,
    };
  }, []);

  const waitForDeviceOnline = useCallback(async (
    deviceId: string,
    onTick?: (detail: string) => void,
  ) => {
    const startedAt = Date.now();
    const maxWait = 600_000; // 10 minutes hard cap
    while (Date.now() - startedAt < maxWait) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      onTick?.(`Waiting for connector to connect... ${timeStr}`);
      const res = await hubFetch("/api/devices");
      if (res.ok) {
        const devices = await res.json();
        const device = Array.isArray(devices)
          ? devices.find((entry: any) => (entry.id || entry._id) === deviceId)
          : null;
        if (device?.status === "online") return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("The connector is taking longer than expected. Click Launch again to retry.");
  }, []);

  const waitForLocalBridgeReady = useCallback(async (
    onTick?: (detail: string) => void,
  ) => {
    const startedAt = Date.now();
    const maxWait = 180_000;
    while (Date.now() - startedAt < maxWait) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      onTick?.(`Waiting for the local connector... ${elapsed}s`);
      try {
        const res = await fetch("http://127.0.0.1:18790/bridge/health", {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {
        // Connector service can take a few seconds to restart after install.
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("The local connector did not become ready. Click Launch to retry.");
  }, []);

  const handleFinalLaunch = useCallback(async () => {
    if (isLaunching) return;

    const runtimeChoices = sortRuntimeChoices(guidedState.runtimeChoices || []);
    const launchPlan = buildLaunchPlan(guidedState);
    const stripeApiKeyForLaunch = guidedState.stripeApiKey?.trim() || "";

    const updateProgress = (
      key: string,
      patch: Partial<LaunchProgressItem>
    ) => {
      setLaunchProgress((prev) => prev.map((item) => (
        item.key === key ? { ...item, ...patch } : item
      )));
    };

    const runProgressStep = async (
      key: string,
      work: () => Promise<string | void>
    ) => {
      updateProgress(key, { status: "running" });
      try {
        const detail = await work();
        updateProgress(key, {
          status: "completed",
          ...(typeof detail === "string" && detail ? { detail } : {}),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Step failed.";
        updateProgress(key, { status: "failed", detail: message });
        throw error;
      }
    };

    const mergeProgressSteps = (steps: LaunchProgressItem[]) => {
      setLaunchProgress((prev) => prev.map((item) => {
        const match = steps.find((step) => step.key === item.key);
        return match ? { ...item, ...match } : item;
      }));
    };

    const agentProvisionTargets = buildOnboardingAgentProvisionTargets(guidedState.agentProfiles || []);
    const validAgentProvisionTargets = agentProvisionTargets.filter(({ profile }) =>
      !!profile.name.trim() && !!profile.description?.trim()
    );
    const scopedRuntimeChannelConfigs = buildAgentScopedRuntimeChannelConfigs(
      guidedState.agentProfiles || [],
      guidedState.runtimeChannelConfigs || [],
    );
    let openClawDoctorCompleted = false;
    let openClawSecurityAuditCompleted = false;
    let openClawStatusCompleted = false;

    const runOpenClawDoctorFix = async () => {
      if (!runtimeChoices.includes("openclaw") || openClawDoctorCompleted) return;
      await runProgressStep("openclaw-doctor", async () => {
        let lastError = "OpenClaw Doctor could not fix the configuration.";
        for (let attempt = 1; attempt <= OPENCLAW_DOCTOR_FIX_MAX_ATTEMPTS; attempt += 1) {
          try {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const result = await Promise.race([
              bridgeInvoke("openclaw-doctor-fix", {}),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("OpenClaw Doctor timed out.")), OPENCLAW_DOCTOR_FIX_TIMEOUT_MS);
              }),
            ]).finally(() => {
              if (timeoutId) clearTimeout(timeoutId);
            }) as {
              success?: boolean;
              error?: string;
              stdout?: string;
              stderr?: string;
            };
            if (result?.success) {
              openClawDoctorCompleted = true;
              return "OpenClaw Doctor completed.";
            }
            lastError = result?.error || result?.stderr || lastError;
          } catch (error) {
            lastError = error instanceof Error ? error.message : lastError;
          }
          if (attempt < OPENCLAW_DOCTOR_FIX_MAX_ATTEMPTS) {
            updateProgress("openclaw-doctor", {
              status: "running",
              detail: `OpenClaw Doctor did not finish cleanly. Retrying (${attempt + 1}/${OPENCLAW_DOCTOR_FIX_MAX_ATTEMPTS})…`,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        throw new Error(lastError);
      });
    };

    const runOpenClawSecurityAuditDeep = async () => {
      if (!runtimeChoices.includes("openclaw") || openClawSecurityAuditCompleted) return;
      await runProgressStep("openclaw-security-audit", async () => {
        let lastError = "OpenClaw security audit could not finish.";
        for (let attempt = 1; attempt <= OPENCLAW_SECURITY_AUDIT_MAX_ATTEMPTS; attempt += 1) {
          try {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const result = await Promise.race([
              bridgeInvoke("openclaw-security-audit-deep", {}),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("OpenClaw security audit timed out.")), OPENCLAW_SECURITY_AUDIT_TIMEOUT_MS);
              }),
            ]).finally(() => {
              if (timeoutId) clearTimeout(timeoutId);
            }) as {
              success?: boolean;
              error?: string;
              stdout?: string;
              stderr?: string;
            };
            if (result?.success) {
              openClawSecurityAuditCompleted = true;
              return "OpenClaw deep security audit completed.";
            }
            lastError = result?.error || result?.stderr || lastError;
          } catch (error) {
            lastError = error instanceof Error ? error.message : lastError;
          }
          if (attempt < OPENCLAW_SECURITY_AUDIT_MAX_ATTEMPTS) {
            updateProgress("openclaw-security-audit", {
              status: "running",
              detail: `OpenClaw security audit did not finish cleanly. Retrying (${attempt + 1}/${OPENCLAW_SECURITY_AUDIT_MAX_ATTEMPTS})…`,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        throw new Error(lastError);
      });
    };

    const runOpenClawStatusAll = async () => {
      if (!runtimeChoices.includes("openclaw") || openClawStatusCompleted) return;
      await runProgressStep("openclaw-status", async () => {
        let lastError = "OpenClaw status check could not finish.";
        for (let attempt = 1; attempt <= OPENCLAW_STATUS_ALL_MAX_ATTEMPTS; attempt += 1) {
          try {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const result = await Promise.race([
              bridgeInvoke("openclaw-status-all", {}),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("OpenClaw status check timed out.")), OPENCLAW_STATUS_ALL_TIMEOUT_MS);
              }),
            ]).finally(() => {
              if (timeoutId) clearTimeout(timeoutId);
            }) as {
              success?: boolean;
              error?: string;
              stdout?: string;
              stderr?: string;
            };
            if (result?.success) {
              openClawStatusCompleted = true;
              return "OpenClaw status snapshot completed.";
            }
            lastError = result?.error || result?.stderr || lastError;
          } catch (error) {
            lastError = error instanceof Error ? error.message : lastError;
          }
          if (attempt < OPENCLAW_STATUS_ALL_MAX_ATTEMPTS) {
            updateProgress("openclaw-status", {
              status: "running",
              detail: `OpenClaw status check did not finish cleanly. Retrying (${attempt + 1}/${OPENCLAW_STATUS_ALL_MAX_ATTEMPTS})…`,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        throw new Error(lastError);
      });
    };

    const runOpenClawPostInstallChecks = async () => {
      await runOpenClawDoctorFix();
      await runOpenClawSecurityAuditDeep();
      await runOpenClawStatusAll();
    };

    const runLegacyProvisionWorkspace = async () => {
      const legacyResult = await bridgeInvoke("onboarding-provision-workspace", {
        companyName: guidedState.companyName || "",
        companyDescription: guidedState.companyDescription || "",
        companyAvatarDataUri: guidedState.companyAvatarDataUri || "",
        runtimeChoices,
        providerConfigs: guidedState.providerConfigs || [],
        primaryBrain: guidedState.primaryBrain || undefined,
        memorySearch: guidedState.memorySearch || undefined,
        runtimeChannelConfigs: scopedRuntimeChannelConfigs,
        agentChannelConfigs: scopedRuntimeChannelConfigs,
        // Connector's legacy handler reads params["agentProfiles"] — not "profiles".
        // Mismatched key here silently decoded to an empty list, which made the
        // connector return success without provisioning any agents. Do not rename.
        agentProfiles: (guidedState.agentProfiles || []).map((profile) => ({
          runtime: profile.runtime,
          name: profile.name.trim(),
          role: profile.role.trim(),
          description: profile.description.trim(),
          emojiEnabled: profile.emojiEnabled ?? false,
          emoji: profile.emoji || "",
          avatarDataUri: profile.avatarDataUri || "",
          mainModel: normalizeMainModelForRuntime(profile.runtime, profile.mainModel),
        })),
      }) as {
        success?: boolean;
        error?: string;
        steps?: LaunchProgressItem[];
      };

      if (Array.isArray(legacyResult?.steps)) {
        mergeProgressSteps(legacyResult.steps);
      }
      if (!legacyResult?.success) {
        throw new Error(legacyResult?.error || "Workspace provisioning failed.");
      }
      await runOpenClawPostInstallChecks();
    };

    const isLegacyOnboardingActionError = (value: unknown): boolean => {
      const message = value instanceof Error
        ? value.message
        : typeof value === "string"
          ? value
          : "";
      return /unknown action:\s*onboarding-(install-runtime|configure-workspace|provision-agent)/i.test(message);
    };

    const shouldVerifyRuntimeAfterRelayError = (value: unknown): boolean => {
      const message = value instanceof Error
        ? value.message
        : typeof value === "string"
          ? value
          : "";
      return /failed to communicate with device|timed out|timeout waiting for response/i.test(message);
    };

    const verifyRuntimeEventuallyAvailable = async (runtime: string): Promise<boolean> => {
      const MAX_ATTEMPTS = 12;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const verifyResult = await bridgeInvoke("list-available-runtimes", {}) as {
            runtimes?: string[] | Array<{ name?: string }>;
          };
          const available = Array.isArray(verifyResult?.runtimes)
            ? verifyResult.runtimes.map((item) => typeof item === "string" ? item : item?.name || "").filter(Boolean)
            : [];
          if (available.includes(runtime)) {
            return true;
          }
        } catch {
          // Keep polling during the grace period in case the connector is still settling.
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      return false;
    };

    setLaunchError(null);
    setLaunchProgress(launchPlan);
    setIsLaunching(true);

    // Mark launch as in-progress BEFORE any async work. This flag is the
    // primary guard that blocks MainLayout's hasOnlineDevice auto-skip effect
    // from flipping guidedSetupComplete=true while we're mid-install. Flushed
    // synchronously so localStorage has it before the first bridge call.
    const launchStartedAt = new Date().toISOString();
    setGuidedState((prev) => {
      const next: GuidedState = {
        ...prev,
        launchInProgress: launchStartedAt,
        // Defensive: if a stale launchCompletedAt is sitting in state from a
        // prior botched run, clear it so the mount auto-exit can't fire.
        launchCompletedAt: undefined,
      };
      saveGuidedState(next, true);
      return next;
    });

    const clearLaunchInProgress = () => {
      setGuidedState((prev) => {
        if (!prev.launchInProgress) return prev;
        const next: GuidedState = { ...prev, launchInProgress: undefined };
        saveGuidedState(next, true);
        return next;
      });
    };

    // Listen for real-time progress events from the connector (via hub WS).
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        key?: string;
        status?: string;
        detail?: string;
      } | undefined;
      if (!detail?.key) return;
      updateProgress(detail.key, {
        status: (detail.status as LaunchProgressItem["status"]) ?? "running",
        detail: detail.detail ?? "",
      });
    };
    window.addEventListener("onboarding-progress", onProgress);

    // Shared helpers used by both the step-by-step path and the legacy fallback.
    // Declared here (outside `try`) so every exit route — including the three
    // legacy short-circuits — goes through the same final gate before the
    // dashboard opens. Historically each legacy catch just called completeStep(4)
    // and bypassed this verification, which landed users on an empty dashboard.
    const readRuntimeList = async (): Promise<string[] | null> => {
      try {
        const verifyResult = await bridgeInvoke("list-available-runtimes", {}) as {
          runtimes?: Array<string | { name?: string; available?: boolean }>;
        };
        if (!Array.isArray(verifyResult?.runtimes)) return null;
        return verifyResult.runtimes
          .map((item) => typeof item === "string"
            ? item
            : (item?.available !== false ? item?.name || "" : ""))
          .filter(Boolean);
      } catch {
        return null;
      }
    };

    // Hoisted out of the try block so finalizeAndComplete can reach it via
    // closure and POST the hub's onboarding-complete flag for the right
    // device regardless of which exit path (local / remote / legacy fallback)
    // got us here. Assigned by the provisioning branch that actually paired.
    let pairingDeviceId = "";
    let usingGuestLocalConnector = false;

    const markDeviceOnboardingComplete = async (deviceId: string): Promise<void> => {
      if (!deviceId) return;
      const token = await getUserToken();
      if (!token) return;
      try {
        const res = await hubFetch(`/api/devices/${deviceId}/onboarding-complete`, {
          method: "POST",
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(
            "[onboarding] hub rejected onboarding-complete",
            deviceId,
            res.status,
          );
        }
      } catch (err) {
        // Non-fatal: the user still completed onboarding locally, we just
        // couldn't stamp the server flag. They'll land in the dashboard via
        // the localStorage launchCompletedAt path; a subsequent browser
        // will revalidate on next device fetch.
        // eslint-disable-next-line no-console
        console.warn("[onboarding] failed to POST onboarding-complete:", err);
      }
    };

    const finalizeAndComplete = async (): Promise<void> => {
      // 1. Runtime readiness: poll until every selected runtime is present.
      updateProgress("runtime-verify", { status: "running", detail: "Confirming runtimes\u2026" });
      const VERIFY_MAX_ATTEMPTS = 40;
      const VERIFY_INTERVAL_MS = 1500;
      let verified = false;
      let lastMissing: string[] = runtimeChoices.slice();
      for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
        const available = await readRuntimeList();
        if (available) {
          const missing = runtimeChoices.filter((rt) => !available.includes(rt));
          if (missing.length === 0) { verified = true; break; }
          lastMissing = missing;
          updateProgress("runtime-verify", {
            status: "running",
            detail: `Waiting on ${missing.map(formatSingleRuntimeChoice).join(", ")}\u2026 (attempt ${attempt}/${VERIFY_MAX_ATTEMPTS})`,
          });
        } else {
          updateProgress("runtime-verify", {
            status: "running",
            detail: `Reconnecting to the connector to confirm runtimes\u2026 (attempt ${attempt}/${VERIFY_MAX_ATTEMPTS})`,
          });
        }
        if (attempt < VERIFY_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS));
        }
      }
      if (!verified) {
        const msg = `Runtime verification timed out. Still missing: ${lastMissing.map(formatSingleRuntimeChoice).join(", ")}.`;
        updateProgress("runtime-verify", { status: "failed", detail: msg });
        throw new Error(msg);
      }
      updateProgress("runtime-verify", { status: "completed", detail: "All runtimes verified." });

      // 2. Agent readiness: connector must report EVERY planned agent id, not
      // just "some" agents. Previously we accepted length>=1, which silently
      // passed when stale agents from a prior partial run were present but
      // the agents the user JUST configured never got provisioned. That was a
      // primary driver of "onboarding finished, dashboard is empty of my
      // agents" complaints. Now we poll until each planned agent id shows up.
      const plannedAgents = validAgentProvisionTargets.map(({ profile, agentId, baseId }) => ({
        runtime: profile.runtime,
        mainId: agentId,
        baseId,
        name: profile.name,
      }));

      const extractAgents = (res: unknown): Array<{ id?: string; runtime?: string }> => {
        if (Array.isArray(res)) return res as Array<{ id?: string; runtime?: string }>;
        if (res && typeof res === "object") {
          const r = res as { data?: unknown; agents?: unknown };
          if (Array.isArray(r.data)) return r.data as Array<{ id?: string; runtime?: string }>;
          if (Array.isArray(r.agents)) return r.agents as Array<{ id?: string; runtime?: string }>;
        }
        return [];
      };

      const AGENT_VERIFY_MAX_ATTEMPTS = 60;   // ~2 min at 2s interval
      const AGENT_VERIFY_INTERVAL_MS = 2000;
      let agentsConfirmed = false;
      let lastAgentMissing: string[] = plannedAgents.map((p) => p.mainId);
      let lastListError: unknown = null;
      for (let attempt = 1; attempt <= AGENT_VERIFY_MAX_ATTEMPTS; attempt++) {
        try {
          const listResult = await bridgeInvoke("list-agents", {}) as
            | { success?: boolean; data?: unknown; agents?: unknown }
            | unknown[]
            | undefined;
          const confirmedAgents = extractAgents(listResult);
          if (plannedAgents.length === 0) {
            // No planned agents but onboarding reached here. Fail — this
            // should never happen because canSubmit gates on at least one.
            throw new Error("No agents were planned. Add at least one agent and try again.");
          }
          // For each planned agent, require the connector to report it. The
          // implicit OpenClaw "main" agent only counts when it belongs to the
          // expected runtime. Without the runtime check, Hermes "main" can mask
          // a missing OpenClaw agent.
          const missing = plannedAgents
            .filter((p) => !isOnboardingAgentProvisionTargetPresent(
              {
                profile: { runtime: p.runtime, name: p.name },
                agentId: p.mainId,
                baseId: p.baseId,
                isMainAgent: p.mainId === "main",
              },
              confirmedAgents,
            ))
            .map((p) => p.mainId);
          if (missing.length === 0) { agentsConfirmed = true; break; }
          lastAgentMissing = missing;
          updateProgress("runtime-verify", {
            status: "running",
            detail: `Waiting for connector to register ${missing.length} agent(s)\u2026 (${attempt}/${AGENT_VERIFY_MAX_ATTEMPTS})`,
          });
        } catch (err) {
          lastListError = err;
          // eslint-disable-next-line no-console
          console.warn("[onboarding] list-agents attempt", attempt, "failed:", err);
        }
        if (attempt < AGENT_VERIFY_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, AGENT_VERIFY_INTERVAL_MS));
        }
      }
      if (!agentsConfirmed) {
        // Fall back to the softer "at least one agent" check so users with a
        // transport hiccup aren't permanently stuck, but only if list-agents
        // itself never succeeded. If it DID succeed and the planned ids
        // simply aren't there, that's a real failure and we must block.
        if (lastListError) {
          // eslint-disable-next-line no-console
          console.warn("[onboarding] list-agents never responded cleanly; proceeding on soft check:", lastListError);
        } else {
          const msg = `Agent provisioning did not finish. Connector is still missing: ${lastAgentMissing.join(", ")}.`;
          throw new Error(msg);
        }
      }

      // Stamp the hub's per-device onboardingCompletedAt flag. This is the
      // durable signal MainLayout uses (together with status==="online") to
      // skip GuidedSetup on a fresh browser. Without this, a new tab would
      // keep showing the wizard even though everything is installed.
      // Best-effort: failures are logged, never fatal, because the local
      // launchCompletedAt path still lets the current browser proceed.
      await markDeviceOnboardingComplete(pairingDeviceId);

      // Push the optional Stripe restricted key through the E2E credential flow.
      // If the user supplied a key, do not silently drop it. A failed save keeps
      // onboarding on the launch screen so they can retry or go back and edit it.
      if (stripeApiKeyForLaunch && !usingGuestLocalConnector) {
        await runProgressStep("stripe", async () => {
          const stored = await persistOnboardingStripeKey(pairingDeviceId, stripeApiKeyForLaunch);
          if (!stored.success) {
            throw new Error(stored.error || "Stripe key could not be stored.");
          }
          // Drop only the plaintext key after storage + validation succeed.
          // Preserve launchInProgress from the latest state so a crash mid-launch
          // still resumes instead of skipping.
          setGuidedState((prev) => {
            const next: GuidedState = { ...prev, stripeApiKey: undefined };
            saveGuidedState(next, true);
            return next;
          });
          return stored.refreshed
            ? "Stripe key stored and ARR cache warmed."
            : "Stripe key stored on the connector.";
        });
      } else if (stripeApiKeyForLaunch && usingGuestLocalConnector) {
        updateProgress("stripe", {
          status: "completed",
          detail: "Skipped Stripe key sync until you sign in and claim this local connector.",
        });
      }

      // After onboarding the connector may have restarted its OpenClaw daemon
      // (scope-reload restart in autoApproveConnectorDevice). Clear the device
      // ID cache so the next request picks the freshly-online device, then
      // reset the gateway WS so it reconnects and re-fetches the active device
      // ID rather than continuing to route through whatever was cached before.
      clearDeviceCache();
      resetGatewayConnection();

      // Stamp launchCompletedAt as the durable success marker AND clear
      // launchInProgress in a single state write. The mount auto-exit checks
      // launchCompletedAt (not completedSteps.length) so a partial rerun can
      // never jump to the dashboard, and MainLayout's hasOnlineDevice effect
      // checks launchInProgress so it stays out of the way while we were
      // running. Once this fires, both guards flip to the "done" state
      // atomically via completeStep's single saveGuidedState flush.
      completeStep(4, {
        launchCompletedAt: new Date().toISOString(),
        launchInProgress: undefined,
        stripeApiKey: undefined,
      });
    };

    try {
      if (guidedState.deviceChoice === "local") {
        if (!window.electronAPI?.runtimes?.installLocalConnector) {
          throw new Error("Local provisioning requires the Electron desktop app so Hyperclaw can install runtimes on this machine.");
        }

        await runProgressStep("connector", async () => {
          const jwt = await getUserToken();

          if (jwt) {
            const pairing = await createOrReuseLocalPairing();
            pairingDeviceId = pairing.deviceId;

            // Skip install if device is already online (retry-friendly)
            const statusRes = await hubFetch("/api/devices");
            if (statusRes.ok) {
              const devices = await statusRes.json();
              const existing = Array.isArray(devices)
                ? devices.find((d: any) => (d.id || d._id) === pairingDeviceId)
                : null;
              if (existing?.status === "online") {
                return "Connector is already running on this machine.";
              }
            }

            const installResult = await window.electronAPI!.runtimes.installLocalConnector({
              token: pairing.token,
              deviceId: pairing.deviceId,
              hubUrl: getHubApiUrl(),
              jwt,
            });

            if (!installResult?.success) {
              throw new Error(installResult?.error || "Failed to install the Hyperclaw connector.");
            }

            return "Installed the background connector service for this machine.";
          }

          usingGuestLocalConnector = true;
          const installResult = await window.electronAPI!.runtimes.installLocalConnector({
            localOnly: true,
            hubUrl: getHubApiUrl(),
          });

          if (!installResult?.success) {
            throw new Error(installResult?.error || "Failed to install the Hyperclaw connector.");
          }

          pairingDeviceId = installResult.deviceId || "";
          return "Installed the local connector service for this machine.";
        });

        await runProgressStep("device-online", async () => {
          if (!pairingDeviceId && !usingGuestLocalConnector) {
            throw new Error("Missing the local device ID for this connector.");
          }
          if (usingGuestLocalConnector) {
            await waitForLocalBridgeReady((detail) =>
              updateProgress("device-online", { detail })
            );
            return "Local connector is ready.";
          }
          await waitForDeviceOnline(pairingDeviceId, (detail) =>
            updateProgress("device-online", { detail })
          );
          return "This machine is online and ready for provisioning.";
        });
      } else {
        await runProgressStep("remote-verify", async () => {
          const activeDeviceId = await getActiveDeviceId();
          if (!activeDeviceId) {
            throw new Error("No connected device was available. Finish pairing it first, then retry launch.");
          }
          pairingDeviceId = activeDeviceId;

          const result = await bridgeInvoke("list-available-runtimes", {}) as {
            runtimes?: Array<{ name?: string }>;
          };
          if (!Array.isArray(result?.runtimes)) {
            throw new Error("The connected machine is not ready yet. Finish pairing it first, then retry launch.");
          }
          return "Connected machine responded successfully.";
        });
      }

      // Ensure Electron main process has the JWT before making bridge calls.
      // hub-config.json may have been written with jwt:"" during connector install
      // if the token wasn't available at that point.
      if (window.electronAPI?.hyperClawBridge?.setHubConfig) {
        const freshJwt = await getUserToken();
        if (freshJwt) {
          await window.electronAPI.hyperClawBridge.setHubConfig({
            enabled: true,
            url: getHubApiUrl(),
            deviceId: pairingDeviceId || "",
            jwt: freshJwt,
          });
        } else if (usingGuestLocalConnector) {
          await window.electronAPI.hyperClawBridge.setHubConfig({
            enabled: false,
            url: getHubApiUrl(),
            deviceId: pairingDeviceId || "",
            jwt: "",
          });
        }
      }

      // Pre-check: verify the relay works before sending commands.
      const MAX_PRECHECK_ATTEMPTS = 10;
      for (let attempt = 1; attempt <= MAX_PRECHECK_ATTEMPTS; attempt++) {
        try {
          const ping = await bridgeInvoke("list-available-runtimes", {}) as {
            runtimes?: unknown[];
            success?: boolean;
            error?: string;
          };
          if (ping?.success === false && /not connected|communicate|unauthorized|unreachable|offline/i.test(ping.error || "")) {
            throw new Error(ping.error || "Relay not ready");
          }
          break;
        } catch {
          if (attempt === MAX_PRECHECK_ATTEMPTS) {
            throw new Error("Could not reach the connector after multiple attempts. Gateway pairing may still be in progress — please click Try again.");
          }
          updateProgress(runtimeChoices[0] ? `install:${runtimeChoices[0]}` : "runtime-verify", {
            status: "running",
            detail: `Waiting for connector relay and gateway pairing\u2026 (attempt ${attempt}/${MAX_PRECHECK_ATTEMPTS})`,
          });
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      // Clear the circuit breaker before installing — the pre-check loop may
      // have triggered consecutive 503s while the connector was warming up,
      // latching _deviceUnreachable = true. If we don't clear it here the
      // install bridgeInvoke returns "Device unreachable" immediately without
      // even attempting the request.
      clearDeviceUnreachable();

      // Step-by-step: Install each runtime individually
      for (const rt of runtimeChoices) {
        const key = `install:${rt}`;
        updateProgress(key, { status: "running", detail: `Installing ${formatSingleRuntimeChoice(rt)}\u2026 this may take a few minutes` });
        try {
          const runInstallRuntime = async () => {
            let cleanupProgressListener: (() => void) | undefined;
            // Race the bridge call against a completion event. If the dashboard WS
            // reconnected during the long install, the bridge response is lost (sent
            // to the dead old connection). The connector also broadcasts a progress
            // event with status="completed" which ALL clients receive, so we can
            // resolve from that instead.
            try {
              return await Promise.race([
                bridgeInvoke("onboarding-install-runtime", {
                  runtime: rt,
                  providerConfigs: guidedState.providerConfigs || [],
                  runtimeChannelConfigs: scopedRuntimeChannelConfigs,
                  primaryBrain: guidedState.primaryBrain || undefined,
                  memorySearch: guidedState.memorySearch || undefined,
                }),
                new Promise<{ success: boolean; detail: string }>((resolve) => {
                  const handler = (e: Event) => {
                    const d = (e as CustomEvent).detail as { key?: string; status?: string; detail?: string } | undefined;
                    if (d?.key === `install:${rt}` && d?.status === "completed") {
                      cleanupProgressListener?.();
                      resolve({ success: true, detail: d.detail || "Installed via progress event." });
                    }
                  };
                  window.addEventListener("onboarding-progress", handler);
                  cleanupProgressListener = () => window.removeEventListener("onboarding-progress", handler);
                }),
              ]) as { success?: boolean; error?: string; detail?: string };
            } finally {
              cleanupProgressListener?.();
            }
          };

          const maxInstallAttempts = rt === "openclaw" ? OPENCLAW_DEFAULT_SETUP_MAX_ATTEMPTS : 1;
          let result: { success?: boolean; error?: string; detail?: string } | null = null;

          for (let attempt = 1; attempt <= maxInstallAttempts; attempt += 1) {
            try {
              result = await runInstallRuntime();
            } catch (error) {
              const recovery = attempt < maxInstallAttempts
                ? getOpenClawInstallRecovery(rt, error)
                : null;
              if (recovery) {
                updateProgress(key, {
                  status: "running",
                  detail: recovery.detail,
                });
                await new Promise((resolve) => setTimeout(resolve, recovery.delayMs));
                continue;
              }
              throw error;
            }

            if (result?.success) break;

            const recovery = attempt < maxInstallAttempts
              ? getOpenClawInstallRecovery(rt, result)
              : null;
            if (recovery) {
              updateProgress(key, {
                status: "running",
                detail: recovery.detail,
              });
              await new Promise((resolve) => setTimeout(resolve, recovery.delayMs));
              continue;
            }

            const msg = result?.error || `Failed to install ${formatSingleRuntimeChoice(rt)}.`;
            updateProgress(key, { status: "failed", detail: msg });
            throw new Error(msg);
          }

          updateProgress(key, { status: "completed", detail: result?.detail || "Installed and verified." });
        } catch (err) {
          if (isLegacyOnboardingActionError(err)) {
            await runLegacyProvisionWorkspace();
            await finalizeAndComplete();
            return;
          }
          if (shouldVerifyRuntimeAfterRelayError(err)) {
            updateProgress(key, {
              status: "running",
              detail: `${formatSingleRuntimeChoice(rt)} may still be finishing. Verifying availability…`,
            });
            if (await verifyRuntimeEventuallyAvailable(rt)) {
              updateProgress(key, {
                status: "completed",
                detail: `${formatSingleRuntimeChoice(rt)} finished installing after a delayed connector response.`,
              });
              continue;
            }
          }
          updateProgress(key, { status: "failed", detail: err instanceof Error ? err.message : "Install failed." });
          throw err;
        }
      }

      // Save workspace state
      updateProgress("workspace-state", { status: "running", detail: "Saving workspace setup\u2026" });
      try {
        const wsResult = await bridgeInvoke("onboarding-configure-workspace", {
          companyName: guidedState.companyName || "",
          companyDescription: guidedState.companyDescription || "",
          companyAvatarDataUri: guidedState.companyAvatarDataUri || "",
          runtimeChoices,
          providerConfigs: guidedState.providerConfigs || [],
          runtimeChannelConfigs: scopedRuntimeChannelConfigs,
          agentChannelConfigs: scopedRuntimeChannelConfigs,
        }) as { success?: boolean; error?: string; detail?: string };

        if (!wsResult?.success) {
          const msg = wsResult?.error || "Failed to save workspace state.";
          updateProgress("workspace-state", { status: "failed", detail: msg });
          throw new Error(msg);
        }
        updateProgress("workspace-state", { status: "completed", detail: wsResult.detail || "Saved." });
      } catch (err) {
        if (isLegacyOnboardingActionError(err)) {
          await runLegacyProvisionWorkspace();
          await finalizeAndComplete();
          return;
        }
        updateProgress("workspace-state", { status: "failed", detail: err instanceof Error ? err.message : "Failed." });
        throw err;
      }

      await runOpenClawPostInstallChecks();

      // Verify runtimes are reachable before provisioning agents.
      updateProgress("runtime-verify", { status: "running", detail: "Confirming runtimes\u2026" });
      {
        const VERIFY_MAX = 20;
        const VERIFY_MS = 1500;
        let runtimesVerified = false;
        let lastMissing: string[] = runtimeChoices.slice();
        for (let attempt = 1; attempt <= VERIFY_MAX; attempt++) {
          const available = await readRuntimeList();
          if (available) {
            const missing = runtimeChoices.filter((rt) => !available.includes(rt));
            if (missing.length === 0) { runtimesVerified = true; break; }
            lastMissing = missing;
            updateProgress("runtime-verify", {
              status: "running",
              detail: `Waiting on ${missing.map(formatSingleRuntimeChoice).join(", ")}\u2026 (${attempt}/${VERIFY_MAX})`,
            });
          } else {
            updateProgress("runtime-verify", {
              status: "running",
              detail: `Reconnecting to connector\u2026 (${attempt}/${VERIFY_MAX})`,
            });
          }
          if (attempt < VERIFY_MAX) {
            await new Promise((r) => setTimeout(r, VERIFY_MS));
          }
        }
        if (!runtimesVerified) {
          const msg = `Runtime verification timed out. Still missing: ${lastMissing.map(formatSingleRuntimeChoice).join(", ")}.`;
          updateProgress("runtime-verify", { status: "failed", detail: msg });
          throw new Error(msg);
        }
        updateProgress("runtime-verify", { status: "completed", detail: "All runtimes verified." });
      }

      // Provision each agent individually.
      // OpenClaw's first profile customizes the existing "main" agent. Other
      // runtimes use slugged profile ids so their dashboard rows and identity
      // cache entries cannot collide with OpenClaw's main agent.
      let provisionedAgentCount = 0;
      const onboardingUserProfile: AgentUserProfile = {
        name: userInfo.username || "",
        email: userInfo.email || "",
        username: userInfo.username || "",
        about: userInfo.aboutme || "",
      };
      for (const target of validAgentProvisionTargets) {
        const { profile, agentId, isMainAgent } = target;
        // validAgentProvisionTargets filters out untouched optional runtime
        // profiles. If this triggers, the UI guard got bypassed.
        if (!profile.name.trim() || !profile.description.trim()) {
          throw new Error(`Agent profile for ${profile.runtime} is missing a name or description.`);
        }
        const stepKey = `agent:${profile.runtime}:${target.baseId}`;
        const agentName = profile.name.trim();
        const agentRole = profile.role.trim();
        const agentDescription = profile.description.trim();
        const agentChannelConfigs = scopedRuntimeChannelConfigs.filter((config) =>
          config.runtime === profile.runtime && config.agentId === agentId
        );
        patchIdentityCache(agentId, {
          name: agentName,
          role: agentRole,
          description: agentDescription,
          emoji: profile.emojiEnabled ? profile.emoji || undefined : undefined,
          avatar: profile.avatarDataUri || undefined,
          runtime: profile.runtime,
        });
        window.dispatchEvent(new CustomEvent("agent.hiring", {
          detail: {
            agentId,
            name: agentName,
            role: agentRole,
            description: agentDescription,
            emoji: profile.emojiEnabled ? profile.emoji || undefined : undefined,
            runtime: profile.runtime,
          },
        }));
        updateProgress(stepKey, { status: "running", detail: `${isMainAgent ? "Configuring" : "Creating"} ${agentName}\u2026` });
        try {
          const provisionPayload = buildAddAgentProvisionPayload({
            agentId,
            runtime: profile.runtime,
            name: agentName,
            role: agentRole,
            description: agentDescription,
            emoji: profile.emojiEnabled ? profile.emoji || "" : "",
            avatarDataUri: profile.avatarDataUri || "",
            mainModel: normalizeMainModelForRuntime(profile.runtime, profile.mainModel),
            companyName: guidedState.companyName || "",
            companyDescription: guidedState.companyDescription || "",
            runtimeChannelConfigs: agentChannelConfigs,
            agentChannelConfigs,
            userProfile: onboardingUserProfile,
          });

          const agentResult = await provisionAgentWithConfigConflictRetry(
            (action, body) => bridgeInvoke(action, body),
            provisionPayload,
            {
              onRetry: ({ nextAttempt, maxAttempts }) => {
                updateProgress(stepKey, {
                  status: "running",
                  detail: `OpenClaw config changed while binding ${agentName}. Retrying (${nextAttempt}/${maxAttempts})…`,
                });
              },
            },
          );

          if (!agentResult?.success) {
            const msg = agentResult?.error || `Failed to provision ${profile.name.trim()}.`;
            updateProgress(stepKey, { status: "failed", detail: msg });
            throw new Error(msg);
          }
          const runtimeDocs = buildOnboardingRuntimeDocs({
            runtime: profile.runtime,
            name: agentName,
            role: agentRole,
            description: agentDescription,
            emoji: profile.emojiEnabled ? profile.emoji || undefined : undefined,
            avatarDataUri: profile.avatarDataUri || "",
            userProfile: onboardingUserProfile,
          });
          updateProgress(stepKey, { status: "running", detail: `Writing ${agentName}'s runtime files…` });
          for (const [fileName, content] of Object.entries(runtimeDocs)) {
            const writeResult = await bridgeInvoke("write-agent-identity-doc", {
              agentId,
              runtime: profile.runtime,
              fileName,
              content,
            }) as { success?: boolean; error?: string };
            if (!writeResult?.success) {
              throw new Error(`Failed to write ${fileName}: ${writeResult?.error || "unknown error"}`);
            }
          }
          const identityResult = await bridgeInvoke("update-agent-identity", {
            agentId,
            name: agentName,
            emoji: profile.emojiEnabled ? profile.emoji || "" : "",
            role: agentRole,
            description: agentDescription,
            runtime: profile.runtime,
            ...(profile.avatarDataUri ? { avatarData: profile.avatarDataUri } : {}),
          }) as { success?: boolean; error?: string };
          if (!identityResult?.success) {
            throw new Error(`Failed to update ${agentName}'s identity: ${identityResult?.error || "unknown error"}`);
          }
          if (profile.runtime === "openclaw") {
            await saveAgentName(agentId, agentName);
          }
          try {
            await bridgeInvoke("update-agent-config", {
              agentId,
              config: {
                name: agentName,
                emoji: profile.emojiEnabled ? profile.emoji || "" : "",
                role: agentRole,
                description: agentDescription,
                runtime: profile.runtime,
                mainModel: normalizeMainModelForRuntime(profile.runtime, profile.mainModel),
                ...(agentChannelConfigs[0] ? buildAgentChannelConfigPatch(agentChannelConfigs[0]) : {}),
              },
            });
          } catch {
            // Non-fatal backup: the connector provisioning path is the authoritative config writer.
          }
          updateProgress(stepKey, { status: "completed", detail: agentResult.detail || "Ready." });
          window.dispatchEvent(new CustomEvent("agent.hired", {
            detail: { agentId, runtime: profile.runtime },
          }));
          provisionedAgentCount += 1;
        } catch (err) {
          window.dispatchEvent(new CustomEvent("agent.hire.failed", { detail: { agentId } }));
          if (isLegacyOnboardingActionError(err)) {
            await runLegacyProvisionWorkspace();
            await finalizeAndComplete();
            return;
          }
          updateProgress(stepKey, { status: "failed", detail: err instanceof Error ? err.message : "Failed." });
          throw err;
        }
      }

      // Guard: if we somehow reached this point without provisioning any agent
      // (e.g. an empty agentProfiles array got through canSubmit), block the
      // completion instead of dropping the user into an empty dashboard.
      if (provisionedAgentCount === 0) {
        throw new Error("No agents were provisioned. Please add at least one agent and try again.");
      }

      // Single consolidated gate: runtime-ready poll + list-agents verify +
      // completeStep(4). Every exit path above (happy-path success, three
      // legacy fallback catches) funnels through this helper so the dashboard
      // never opens before the connector is fully provisioned.
      await finalizeAndComplete();
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Setup could not finish.");
      // On error, clear launchInProgress so the user can retry cleanly and so
      // the MainLayout auto-skip guard releases. We deliberately leave
      // launchCompletedAt undefined because the gate didn't pass.
      clearLaunchInProgress();
    } finally {
      window.removeEventListener("onboarding-progress", onProgress);
      setIsLaunching(false);
    }
  }, [completeStep, createOrReuseLocalPairing, guidedState, isLaunching, waitForDeviceOnline]);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  const stepLabels = ["Set up", "Brain", "Company", "Launch"];
  const animationLabels = [
    "choosing your setup",
    "picking your brain",
    "setting up mission control",
    "ready for launch",
  ];

  return (
    <div
      className="fixed inset-0 bg-background flex overflow-hidden"
      role="main"
      aria-label="Setup wizard"
    >
      {/* Left side — form area */}
      <div className="relative flex-1 flex flex-col items-center justify-start overflow-hidden pt-28 pb-24">
        <TechGridBackground />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_60%)]" />

        {/* Progress dots */}
        <motion.div
          className="absolute top-10 flex items-center gap-0 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => {
            const isActive = step === currentStep;
            const isCompleted = guidedState.completedSteps.includes(step);
            return (
              <React.Fragment key={step}>
                <div className="flex items-center gap-1.5">
                  <motion.div
                    className="rounded-full bg-foreground"
                    initial={false}
                    animate={{
                      width: isActive ? 8 : 6,
                      height: isActive ? 8 : 6,
                      opacity: isActive || isCompleted ? 1 : 0.15,
                    }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                  <span className={`text-[11px] hidden sm:inline transition-all duration-300 ${
                    isActive ? "text-foreground/80" : "text-foreground/20"
                  }`}>
                    {stepLabels[step - 1]}
                  </span>
                </div>
                {step < TOTAL_STEPS && (
                  <div className="relative w-6 sm:w-16 h-px mx-1">
                    <div className="absolute inset-0 bg-foreground/8" />
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-foreground/40"
                      initial={false}
                      animate={{ width: isCompleted ? "100%" : "0%" }}
                      transition={{ duration: 0.5, ease: EASE }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </motion.div>

        {/* Content */}
        <motion.div
          className="w-full max-w-lg px-6 z-10 h-[calc(100vh-180px)] flex flex-col overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
        >
          {/* Logo */}
          <motion.div
            className="flex justify-center mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05, duration: 0.5, ease: EASE }}
          >
            <div className="relative">
              <motion.img
                src="/logo-256.png"
                alt="HyperClaw"
                className="w-14 h-14 rounded-xl relative z-10"
                animate={{ scale: [1, 1.06, 1, 1.03, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute -inset-2 rounded-2xl bg-foreground/[0.04] z-0"
                animate={{ scale: [1, 1.15, 1, 1.08, 1], opacity: [0.3, 0.6, 0.3, 0.45, 0.3] }}
                transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute -inset-4 rounded-3xl bg-foreground/[0.02] z-0"
                animate={{ scale: [1, 1.2, 1, 1.1, 1], opacity: [0.15, 0.35, 0.15, 0.25, 0.15] }}
                transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
              />
            </div>
          </motion.div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: EASE }}
                className="h-full overflow-y-auto customScrollbar2 overflow-x-hidden pb-8"
              >
                {currentStep === 1 && (
                  <GuidedStepConnect
                    initialDeviceChoice={guidedState.deviceChoice ?? undefined}
                    initialRuntimeChoices={guidedState.runtimeChoices}
                    onComplete={({ deviceChoice, runtimeChoices }) => completeStep(1, {
                      deviceChoice: deviceChoice === "local" && !canUseLocalConnectorBootstrap ? "remote" : deviceChoice,
                      runtimeChoices,
                    })}
                  />
                )}
                {currentStep === 2 && (
                  <GuidedStepRuntimes
                    selectedRuntimes={guidedState.runtimeChoices}
                    onBack={goBack}
                    onComplete={(result) => completeStep(2, {
                      selectedRuntimes: result.providers.map((p) => p.providerId),
                      providerConfigs: result.providers,
                      primaryBrain: result.primaryBrain,
                    })}
                  />
                )}
                {currentStep === 3 && (
                <CompanyAgentStep
                  runtimeChoices={guidedState.runtimeChoices || []}
                  providerConfigs={guidedState.providerConfigs || []}
                  initialCompanyName={guidedState.companyName || ""}
                  initialCompanyDescription={guidedState.companyDescription || ""}
                  initialCompanyAvatarDataUri={guidedState.companyAvatarDataUri}
                  initialAgentProfiles={guidedState.agentProfiles || []}
                  initialRuntimeChannelConfigs={guidedState.runtimeChannelConfigs || []}
                  initialMemorySearch={guidedState.memorySearch}
                  initialStripeApiKey={guidedState.stripeApiKey}
                  onBack={goBack}
                  onComplete={(data) => {
                    setCompanyName(data.companyName);
                    setAgentSummary(formatAgentSummary(data.agentProfiles));
                    const scopedRuntimeChannelConfigs = buildAgentScopedRuntimeChannelConfigs(
                      data.agentProfiles,
                      data.runtimeChannelConfigs,
                    );
                    completeStep(3, {
                      companyName: data.companyName,
                      companyDescription: data.companyDescription,
                      companyAvatarDataUri: data.companyAvatarDataUri,
                      agentProfiles: data.agentProfiles,
                      runtimeChannelConfigs: scopedRuntimeChannelConfigs,
                      agentChannelConfigs: scopedRuntimeChannelConfigs,
                      memorySearch: data.memorySearch,
                      stripeApiKey: data.stripeApiKey,
                    });
                  }}
                />
                )}
                {currentStep === 4 && (
                  <GuidedStep4
                    companyName={companyName}
                    agentName={agentSummary}
                    runtime={formatRuntimeChoices(guidedState.runtimeChoices)}
                    provider={guidedState.selectedRuntimes?.map((id) => id.charAt(0).toUpperCase() + id.slice(1)).join(", ") || "Not configured"}
                    isLaunching={isLaunching}
                    error={launchError}
                    progressItems={launchProgress}
                    onBack={goBack}
                    onComplete={handleFinalLaunch}
                    onRetry={handleFinalLaunch}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Back + step counter */}
        <motion.div
          className="absolute bottom-10 flex items-center gap-6 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <span className="text-[11px] text-foreground/15 tracking-widest">
            {currentStep}/{TOTAL_STEPS}
          </span>
        </motion.div>
      </div>

      {/* Right side — step animation (desktop only) */}
      <div className="hidden md:block relative w-[42%] overflow-hidden bg-card border-l border-border">
        <StepAnimations step={currentStep} />
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            className="absolute bottom-8 left-0 right-0 text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <span className="text-[11px] text-foreground/15 tracking-[0.2em] uppercase">
              {animationLabels[currentStep - 1]}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
