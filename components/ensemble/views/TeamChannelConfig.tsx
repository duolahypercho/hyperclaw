"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Hash, Loader2, MessageCircle, Phone, Send, type LucideIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/components/ui/use-toast";
import { dashboardState } from "$/lib/dashboard-state";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { cn } from "$/utils";
import type { EnsembleAgentView } from "../hooks/useEnsembleAgents";
import {
  buildAgentChannelConfigPatch,
  channelConfigKey,
  mergeRuntimeChannelConfigs,
  normalizeRuntimeChannelConfigForStorage,
  readAgentChannelConfig,
  selectRuntimeChannelConfigForAgent,
  type ChannelConfigDraft,
  type ChannelSupportedRuntime,
  type ChannelType,
  type RuntimeChannelConfigDraft,
} from "./team-channel-config-state";

// ─── Types (mirrored from GuidedSetup) ────────────────────────────────────────

interface GuidedStatePatch {
  runtimeChannelConfigs?: RuntimeChannelConfigDraft[];
  agentChannelConfigs?: RuntimeChannelConfigDraft[];
  runtimeChoices?: unknown[];
  providerConfigs?: unknown[];
}

// ─── Static content ───────────────────────────────────────────────────────────

const channelOrder: ChannelType[] = ["telegram", "discord", "slack", "whatsapp"];

const GUIDED_STATE_KEY = "guided-setup-state";
const CHANNEL_TARGET_MAX_LENGTH = 120;

interface ChannelCredentialField {
  key: "botToken" | "appToken";
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
}

const channelContent: Record<ChannelType, {
  label: string;
  credentialFields: Record<ChannelSupportedRuntime, ChannelCredentialField[]>;
  targetLabel: Record<ChannelSupportedRuntime, string>;
  targetPlaceholder: Record<ChannelSupportedRuntime, string>;
  targetHint: Record<ChannelSupportedRuntime, string>;
  docs: Record<ChannelSupportedRuntime, string>;
  steps: Record<ChannelSupportedRuntime, string[]>;
}> = {
  telegram: {
    label: "Telegram",
    credentialFields: {
      hermes: [{ key: "botToken", label: "Bot token", placeholder: "e.g. 123456:ABC-DEF...", hint: "From @BotFather after creating your bot.", required: true }],
      openclaw: [{ key: "botToken", label: "Bot token", placeholder: "e.g. 123456:ABC-DEF...", hint: "From @BotFather after creating your bot.", required: true }],
    },
    targetLabel: { hermes: "Your Telegram user or chat ID", openclaw: "Your Telegram user or chat ID" },
    targetPlaceholder: { hermes: "e.g. 123456789 or -1001234567890", openclaw: "e.g. 123456789 or -1001234567890" },
    targetHint: {
      hermes: "DM @userinfobot on Telegram to get your numeric ID. For a group home channel, use the negative chat ID (starts with -100).",
      openclaw: "DM @userinfobot on Telegram to get your numeric ID. For a group home channel, use the negative chat ID (starts with -100).",
    },
    docs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram",
      openclaw: "https://github.com/nicepkg/openclaw#telegram",
    },
    steps: {
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
      hermes: [{ key: "botToken", label: "Bot token", placeholder: "e.g. MTIzNDU2...", hint: "From Discord Developer Portal → Bot → Reset Token.", required: true }],
      openclaw: [{ key: "botToken", label: "Bot token", placeholder: "e.g. MTIzNDU2...", hint: "From Discord Developer Portal → Bot → Reset Token.", required: true }],
    },
    targetLabel: { hermes: "Discord channel ID", openclaw: "Discord channel ID" },
    targetPlaceholder: { hermes: "e.g. 123456789012345678", openclaw: "e.g. 123456789012345678" },
    targetHint: {
      hermes: "The channel ID where Hermes should post messages.",
      openclaw: "The channel ID where OpenClaw should post messages.",
    },
    docs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord",
      openclaw: "https://github.com/nicepkg/openclaw#discord",
    },
    steps: {
      hermes: [
        "Go to discord.com/developers/applications, create an app, go to Bot, and reset the token. Save it.",
        "Enable Message Content Intent on the Bot page.",
        "Under OAuth2, select bot scope with Send Messages + Read Message History, copy the invite URL, and add the bot to your server.",
        "In Discord Settings → Advanced, turn on Developer Mode. Right-click the target channel → Copy Channel ID.",
      ],
      openclaw: [
        "Go to discord.com/developers/applications, create an app, go to Bot, and reset the token. Save it.",
        "Enable Message Content Intent on the Bot page.",
        "Under OAuth2, select bot scope with Send Messages + Read Message History, copy the invite URL, and add the bot to your server.",
        "In Discord Settings → Advanced, turn on Developer Mode. Right-click the target channel → Copy Channel ID.",
      ],
    },
  },
  slack: {
    label: "Slack",
    credentialFields: {
      hermes: [{ key: "botToken", label: "Bot token (xoxb-)", placeholder: "xoxb-...", hint: "From OAuth & Permissions after installing the Slack app.", required: true }],
      openclaw: [{ key: "botToken", label: "Bot token (xoxb-)", placeholder: "xoxb-...", hint: "From OAuth & Permissions after installing the Slack app.", required: true }],
    },
    targetLabel: { hermes: "Slack home channel ID", openclaw: "Slack home channel ID" },
    targetPlaceholder: { hermes: "e.g. C01234567890", openclaw: "e.g. C01234567890" },
    targetHint: {
      hermes: "The channel ID where Hermes posts scheduled and proactive messages.",
      openclaw: "The channel ID where OpenClaw posts messages.",
    },
    docs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack",
      openclaw: "https://github.com/nicepkg/openclaw#slack",
    },
    steps: {
      hermes: [
        "Go to api.slack.com/apps/new, create an app from a manifest, and install it to your workspace.",
        "Copy the Bot Token (xoxb-) from OAuth & Permissions after installing.",
        "Invite the bot to the channel: type /invite @YourBotName.",
        "Click the channel name → open details → copy the channel ID (starts with C) from the bottom.",
      ],
      openclaw: [
        "Go to api.slack.com/apps/new, create an app from a manifest, and install it to your workspace.",
        "Copy the Bot Token (xoxb-) from OAuth & Permissions after installing.",
        "Invite the bot to the channel: type /invite @YourBotName.",
        "Click the channel name → open details → copy the channel ID (starts with C) from the bottom.",
      ],
    },
  },
  whatsapp: {
    label: "WhatsApp",
    credentialFields: { hermes: [], openclaw: [] },
    targetLabel: { hermes: "WhatsApp home contact number", openclaw: "WhatsApp home contact number" },
    targetPlaceholder: { hermes: "e.g. +15551234567", openclaw: "e.g. +15551234567" },
    targetHint: {
      hermes: "The phone number Hermes should message. Use E.164 format with country code.",
      openclaw: "The phone number OpenClaw should message. Use E.164 format with country code.",
    },
    docs: {
      hermes: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp",
      openclaw: "https://github.com/nicepkg/openclaw#whatsapp",
    },
    steps: {
      hermes: [
        "Hermes connects via WhatsApp Web. Use a dedicated number if you can — only one device links at a time.",
        "During setup, scan the QR code shown by Hermes to link your WhatsApp account.",
        "Enter the contact phone number in E.164 format: + country code + number, no spaces.",
      ],
      openclaw: [
        "OpenClaw connects via WhatsApp Web. Use a dedicated number if you can — only one device links at a time.",
        "During setup, scan the QR code shown by OpenClaw to link your WhatsApp account.",
        "Enter the contact phone number in E.164 format: + country code + number, no spaces.",
      ],
    },
  },
};

const runtimeLabel: Record<ChannelSupportedRuntime, string> = {
  hermes: "Hermes",
  openclaw: "OpenClaw",
};

const channelIcons: Record<ChannelType, LucideIcon> = {
  telegram: Send,
  discord: Hash,
  slack: MessageCircle,
  whatsapp: Phone,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadRuntimeChannelConfigs(): RuntimeChannelConfigDraft[] {
  const state = loadGuidedStatePatch();
  return mergeRuntimeChannelConfigs(
    state.agentChannelConfigs || [],
    state.runtimeChannelConfigs || [],
  );
}

function loadGuidedStatePatch(): GuidedStatePatch {
  try {
    const raw = dashboardState.get(GUIDED_STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GuidedStatePatch;
  } catch {
    return {};
  }
}

function saveRuntimeChannelConfigsToState(configs: RuntimeChannelConfigDraft[]) {
  try {
    const raw = dashboardState.get(GUIDED_STATE_KEY);
    const parsed: GuidedStatePatch = raw ? JSON.parse(raw) : {};
    const agentConfigKeys = new Set(configs.map(channelConfigKey));
    const runtimeChannelConfigs = Array.isArray(parsed.runtimeChannelConfigs)
      ? parsed.runtimeChannelConfigs.filter((config) => (
          !config.agentId || !agentConfigKeys.has(channelConfigKey(config))
        ))
      : [];
    dashboardState.set(
      GUIDED_STATE_KEY,
      JSON.stringify({ ...parsed, runtimeChannelConfigs, agentChannelConfigs: configs }),
      { flush: true },
    );
  } catch (err) {
    console.error("[TeamChannelConfig] Failed to save channel config state:", err);
    throw err;
  }
}

function initRuntimeConfig(
  runtime: ChannelSupportedRuntime,
  existing?: RuntimeChannelConfigDraft,
  agent?: Pick<EnsembleAgentView, "id" | "name">
): RuntimeChannelConfigDraft {
  const existingMap = new Map(existing?.channels.map((c) => [c.channel, c]) || []);
  return {
    runtime,
    agentId: agent?.id || existing?.agentId,
    agentName: agent?.name || existing?.agentName,
    channels: channelOrder.map((ch) => {
      const prev = existingMap.get(ch);
      return { channel: ch, target: prev?.target || "", botToken: prev?.botToken || "", appToken: prev?.appToken || "" };
    }),
  };
}

function getActiveChannelAgents(agents: EnsembleAgentView[]): Array<EnsembleAgentView & { kind: ChannelSupportedRuntime }> {
  return agents
    .filter((a): a is EnsembleAgentView & { kind: ChannelSupportedRuntime } => a.kind === "openclaw" || a.kind === "hermes")
    .sort((a, b) => {
      const runtimeOrder: ChannelSupportedRuntime[] = ["openclaw", "hermes"];
      const runtimeDelta = runtimeOrder.indexOf(a.kind) - runtimeOrder.indexOf(b.kind);
      return runtimeDelta || a.name.localeCompare(b.name);
    });
}

function normalizeOpenClawAccounts(accountsValue: unknown): Record<string, unknown>[] {
  const accounts = Array.isArray(accountsValue)
    ? accountsValue
    : accountsValue && typeof accountsValue === "object"
      ? Object.entries(accountsValue as Record<string, unknown>).map(([accountId, account]) => (
          account && typeof account === "object"
            ? { ...(account as Record<string, unknown>), accountId }
            : account
        ))
      : [];
  return accounts
    .map((account) => account && typeof account === "object" ? account as Record<string, unknown> : null)
    .filter((account): account is Record<string, unknown> => !!account);
}

function bindingChannel(binding: unknown): ChannelType | undefined {
  if (typeof binding === "string") {
    const channel = binding.split(":", 1)[0];
    return channelOrder.includes(channel as ChannelType) ? channel as ChannelType : undefined;
  }
  if (binding && typeof binding === "object") {
    const channel = (binding as Record<string, unknown>).channel;
    return channelOrder.includes(channel as ChannelType) ? channel as ChannelType : undefined;
  }
  return undefined;
}

function firstStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function bindingTarget(binding: unknown): string {
  if (typeof binding === "string") {
    return binding.includes(":") ? binding.split(":", 2)[1]?.trim() || "" : "";
  }
  if (binding && typeof binding === "object") {
    return firstStringValue(binding as Record<string, unknown>, ["target", "chatId", "userId", "account", "id"]);
  }
  return "";
}

function rootBindingChannel(binding: unknown): ChannelType | undefined {
  if (!binding || typeof binding !== "object") return undefined;
  const record = binding as Record<string, unknown>;
  const match = (record.match && typeof record.match === "object" ? record.match : {}) as Record<string, unknown>;
  const channel = match.channel;
  return channelOrder.includes(channel as ChannelType) ? channel as ChannelType : undefined;
}

function rootBindingTarget(binding: unknown): string {
  if (!binding || typeof binding !== "object") return "";
  const record = binding as Record<string, unknown>;
  const match = (record.match && typeof record.match === "object" ? record.match : {}) as Record<string, unknown>;
  return firstStringValue(match, ["accountId", "target", "chatId", "userId", "account", "id"]);
}

function readOpenClawChannelConnectionState(config: unknown): Partial<Record<ChannelType, { enabled: boolean; accountCount: number; botToken: string; target: string; boundAgentIds: string[] }>> {
  const root = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;
  const channelRoot = (root.channels && typeof root.channels === "object" ? root.channels : {}) as Record<string, unknown>;
  const agentRoot = (root.agents && typeof root.agents === "object" ? root.agents : {}) as Record<string, unknown>;
  const agentList = Array.isArray(agentRoot.list) ? agentRoot.list : [];
  const rootBindings = Array.isArray(root.bindings) ? root.bindings : [];
  const states: Partial<Record<ChannelType, { enabled: boolean; accountCount: number; botToken: string; target: string; boundAgentIds: string[] }>> = {};

  for (const channel of channelOrder) {
    const record = (channelRoot[channel] && typeof channelRoot[channel] === "object"
      ? channelRoot[channel]
      : {}) as Record<string, unknown>;
    const accounts = normalizeOpenClawAccounts(record.accounts);
    const firstAccount = accounts[0] || {};
    const accountTarget = firstStringValue(firstAccount, ["target", "chatId", "userId", "accountId", "account", "id"]);
    const matchingBindings = agentList
      .map((agent) => agent && typeof agent === "object" ? agent as Record<string, unknown> : null)
      .filter((agent): agent is Record<string, unknown> => !!agent)
      .map((agent) => {
        const bindings = Array.isArray(agent.bindings) ? agent.bindings : (
          Array.isArray(agent.channels) ? agent.channels : []
        );
        const binding = bindings.find((item) => bindingChannel(item) === channel);
        return binding ? { agentId: typeof agent.id === "string" ? agent.id : "", binding } : null;
      })
      .filter((item): item is { agentId: string; binding: unknown } => !!item);
    const matchingRootBindings = rootBindings
      .map((binding) => binding && typeof binding === "object" ? binding as Record<string, unknown> : null)
      .filter((binding): binding is Record<string, unknown> => !!binding && rootBindingChannel(binding) === channel)
      .filter((binding) => {
        const target = rootBindingTarget(binding);
        return !accountTarget || !target || target === accountTarget;
      })
      .map((binding) => ({
        agentId: typeof binding.agentId === "string" ? binding.agentId : "",
        binding,
      }))
      .filter((item) => item.agentId);
    const boundAgentIds = [...matchingBindings, ...matchingRootBindings]
      .map((item) => item.agentId)
      .filter(Boolean);
    if (record.enabled === true || accounts.length > 0) {
      const boundTarget = firstStringValue(
        Object.fromEntries([
          ...matchingBindings.map((item) => [item.agentId, bindingTarget(item.binding)]),
          ...matchingRootBindings.map((item) => [item.agentId, rootBindingTarget(item.binding)]),
        ]),
        boundAgentIds,
      );
      states[channel] = {
        enabled: record.enabled === true,
        accountCount: accounts.length,
        botToken: firstStringValue(firstAccount, ["botToken", "token"]),
        target: accountTarget || boundTarget,
        boundAgentIds,
      };
    }
  }

  return states;
}

function openClawChannelBelongsToAgent(
  runtimeCfg: RuntimeChannelConfigDraft,
  state: { accountCount: number; boundAgentIds: string[] } | undefined,
): boolean {
  if (runtimeCfg.runtime !== "openclaw" || !state || state.accountCount === 0) return false;
  if (state.boundAgentIds.length > 0) return state.boundAgentIds.includes(runtimeCfg.agentId || "");
  return runtimeCfg.agentId === "main";
}

function hydrateOpenClawChannels(
  configs: RuntimeChannelConfigDraft[],
  states: Partial<Record<ChannelType, { enabled: boolean; accountCount: number; botToken: string; target: string; boundAgentIds: string[] }>>,
): RuntimeChannelConfigDraft[] {
  return configs.map((config) => {
    if (config.runtime !== "openclaw") return config;
    return {
      ...config,
      channels: config.channels.map((channel) => {
        const state = states[channel.channel];
        if (!openClawChannelBelongsToAgent(config, state)) return channel;
        return {
          ...channel,
          botToken: channel.botToken || state?.botToken || "",
          target: channel.target || state?.target || "",
        };
      }),
    };
  });
}

// ─── Sub-component: token input with show/hide ────────────────────────────────

function SecretInput({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-foreground/[0.035] border border-solid border-primary/10 rounded-lg px-3 py-2 pr-9 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[36px] font-mono ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/25 hover:text-foreground/50 transition-colors"
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TeamChannelConfigProps {
  agents: EnsembleAgentView[];
  /** When provided, parent can trigger save by calling saveRef.current(). */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** Called whenever the dirty state changes. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Hide the standalone Save button (used when parent owns the save trigger). */
  hideButton?: boolean;
  /** Rendered inside a parent accordion/card. */
  embedded?: boolean;
}

export default function TeamChannelConfig({ agents, saveRef, onDirtyChange, hideButton, embedded = false }: TeamChannelConfigProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<RuntimeChannelConfigDraft[]>([]);
  const [baseline, setBaseline] = useState<string>("[]");
  const [openChannel, setOpenChannel] = useState("");
  const [openGuide, setOpenGuide] = useState("");
  const [openClawChannelState, setOpenClawChannelState] = useState<Partial<Record<ChannelType, { enabled: boolean; accountCount: number; botToken: string; target: string; boundAgentIds: string[] }>>>({});
  const lastInitKeyRef = useRef("");

  const activeAgents = useMemo(() => getActiveChannelAgents(agents), [agents]);
  const activeAgentKey = useMemo(
    () => activeAgents.map((agent) => `${agent.kind}:${agent.id}`).join("|"),
    [activeAgents],
  );

  useEffect(() => {
    if (lastInitKeyRef.current === activeAgentKey) return;
    lastInitKeyRef.current = activeAgentKey;
    const saved = mergeRuntimeChannelConfigs(
      loadRuntimeChannelConfigs(),
      activeAgents.map(readAgentChannelConfig).filter((config): config is RuntimeChannelConfigDraft => !!config),
    );
    const initial = activeAgents.map((agent) => {
      const savedForAgent = selectRuntimeChannelConfigForAgent(saved, agent, activeAgents);
      return initRuntimeConfig(agent.kind, savedForAgent, agent);
    });
    setConfigs(initial);
    setBaseline(JSON.stringify(initial));
    bridgeInvoke("get-openclaw-doc", { relativePath: "openclaw.json" })
      .then((res) => {
        const payload = res as { success?: boolean; content?: string; error?: string };
        let parsed: unknown = null;
        if (payload?.success && typeof payload.content === "string") {
          try {
            parsed = JSON.parse(payload.content);
          } catch {
            parsed = null;
          }
        }
        const openClawState = parsed ? readOpenClawChannelConnectionState(parsed) : {};
        setOpenClawChannelState(openClawState);
        setConfigs((prev) => {
          const hydrated = hydrateOpenClawChannels(prev, openClawState);
          setBaseline(JSON.stringify(hydrated));
          return hydrated;
        });
      })
      .catch(() => {});
  }, [activeAgentKey, activeAgents, agents.length]);

  const isDirty = JSON.stringify(configs) !== baseline;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const updateChannel = useCallback((
    agentId: string | undefined,
    channel: ChannelType,
    updates: Partial<ChannelConfigDraft>
  ) => {
    setConfigs((prev) => prev.map((cfg) =>
      cfg.agentId !== agentId ? cfg : {
        ...cfg,
        channels: cfg.channels.map((ch) =>
          ch.channel !== channel ? ch : { ...ch, ...updates }
        ),
      }
    ));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const nextConfigs = configs.map(normalizeRuntimeChannelConfigForStorage);
      const mergedConfigs = mergeRuntimeChannelConfigs(loadRuntimeChannelConfigs(), nextConfigs);
      const guidedState = loadGuidedStatePatch();
      // Connector versions have read both field names; keep both populated so
      // profile saves work across OpenClaw and Hermes installs.
      const result = await bridgeInvoke("onboarding-configure-workspace", {
        companyName: "",
        companyDescription: "",
        companyAvatarDataUri: "",
        runtimeChoices: guidedState.runtimeChoices || [],
        providerConfigs: guidedState.providerConfigs || [],
        runtimeChannelConfigs: mergedConfigs,
        agentChannelConfigs: mergedConfigs,
        applyAgentChannelConfigs: nextConfigs,
      }) as { success?: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || "Failed to save channel config.");
      }
      const agentConfigWrites = nextConfigs
        .filter((cfg): cfg is RuntimeChannelConfigDraft & { agentId: string } => !!cfg.agentId)
        .map((cfg) => {
          const patch = buildAgentChannelConfigPatch(cfg);
          return {
            agentId: cfg.agentId,
            agentName: cfg.agentName || cfg.agentId,
            patch,
            promise: bridgeInvoke("update-agent-config", {
            agentId: cfg.agentId,
            config: patch,
          }),
          };
        });
      const agentConfigResults = await Promise.allSettled(agentConfigWrites.map((write) => write.promise));
      const failedAgentNames = agentConfigResults
        .map((result, index) => result.status === "rejected" ? agentConfigWrites[index]?.agentName : "")
        .filter(Boolean);
      if (failedAgentNames.length > 0) {
        throw new Error(`Failed to save channel config for ${failedAgentNames.join(", ")}.`);
      }
      saveRuntimeChannelConfigsToState(mergedConfigs);
      setConfigs(nextConfigs);
      setBaseline(JSON.stringify(nextConfigs));
      toast({ title: "Saved", description: "Agent channel configuration updated." });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save channel config.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [configs, toast]);

  // Expose save to parent via ref
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
  }, [saveRef, handleSave]);

  if (activeAgents.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[14px] text-foreground/35">
          No channel-capable agents configured yet.
        </p>
        <p className="mt-1 text-[12px] text-foreground/20">
          Hire an OpenClaw or Hermes agent to configure messaging channels.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", !embedded && "pb-8")}>
      {!embedded && (
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[15px] font-medium text-foreground/85">Channels</h2>
            <p className="mt-0.5 text-[13px] text-foreground/40">
              Configure messaging channels for this agent. Agents that share a runtime keep separate channel settings.
            </p>
          </div>
          {!hideButton && (
            <button
              type="button"
              className="ens-btn accent flex items-center gap-1.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      )}

      {configs.map((runtimeCfg) => (
        <div key={channelConfigKey(runtimeCfg)} className="space-y-2.5">
          <Accordion
            type="single"
            collapsible
            value={openChannel}
            onValueChange={(v) => setOpenChannel(v || "")}
            className="space-y-2"
          >
            {runtimeCfg.channels.map((ch) => {
              const meta = channelContent[ch.channel];
              const credFields = meta.credentialFields[runtimeCfg.runtime] ?? [];
              const hasToken = credFields.some((f) => ch[f.key].trim());
              const hasTarget = !!ch.target.trim();
              const openClawConnection = runtimeCfg.runtime === "openclaw" ? openClawChannelState[ch.channel] : undefined;
              const hasOpenClawAccount = !!openClawConnection && openClawConnection.accountCount > 0;
              const isImplicitMainConnection = runtimeCfg.runtime === "openclaw" && runtimeCfg.agentId === "main" && hasOpenClawAccount && openClawConnection.boundAgentIds.length === 0;
              const isExplicitlyBoundConnection = !!openClawConnection?.boundAgentIds.includes(runtimeCfg.agentId || "");
              const isOpenClawConnectedForAgent = isImplicitMainConnection || isExplicitlyBoundConnection;
              const connectedOpenClawConnection = isOpenClawConnectedForAgent ? openClawConnection : undefined;
              const displayedToken = isOpenClawConnectedForAgent && openClawConnection?.botToken ? openClawConnection.botToken : "";
              const displayedTarget = isOpenClawConnectedForAgent && openClawConnection?.target ? openClawConnection.target : "";
              const effectiveHasToken = hasToken || !!displayedToken;
              const effectiveHasTarget = hasTarget || !!displayedTarget;
              const statusReady = (effectiveHasToken && effectiveHasTarget) || isOpenClawConnectedForAgent;
              const status = connectedOpenClawConnection
                ? connectedOpenClawConnection.accountCount > 0
                  ? `Connected (${connectedOpenClawConnection.accountCount})`
                  : "Enabled"
                : hasToken && hasTarget ? "Ready" : hasToken ? "Token set" : hasTarget ? "ID set" : "Not set";
              const itemKey = `${channelConfigKey(runtimeCfg)}:${ch.channel}`;
              const guideKey = `guide:${itemKey}`;
              const ChannelIcon = channelIcons[ch.channel];

              return (
                <AccordionItem
                  key={ch.channel}
                  value={itemKey}
                  className="rounded-xl border border-solid border-primary/10 bg-background/45 px-3 shadow-sm"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex w-full min-w-0 items-start justify-between gap-3 pr-2 text-left">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon className="h-3.5 w-3.5 shrink-0 text-primary/60 stroke-[1.8]" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {meta.label}
                          </span>
                        </div>
                        <p className="truncate text-[11px] font-normal leading-5 text-muted-foreground/70">
                          {meta.targetLabel[runtimeCfg.runtime]}
                        </p>
                      </div>
                      <span className={cn(
                        "mt-1 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        statusReady
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                          : "border-primary/10 bg-foreground/[0.035] text-muted-foreground/60"
                      )}>
                        {status}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pt-0">
                    <div className="space-y-3 pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] leading-5 text-muted-foreground/70">{meta.label} setup</span>
                        <a
                          href={meta.docs[runtimeCfg.runtime]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground/80"
                        >
                          Docs
                        </a>
                      </div>

                      {credFields.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                            {field.label}
                            {field.required && <span className="text-red-400/60 ml-0.5">*</span>}
                          </label>
                          {runtimeCfg.runtime === "openclaw" && field.key === "botToken" && isOpenClawConnectedForAgent && displayedToken && !ch[field.key].trim() && (
                            <p className="text-[10px] text-emerald-400/45">
                              Loaded from OpenClaw. Editing this field will replace the stored token when saved.
                            </p>
                          )}
                          <SecretInput
                            value={ch[field.key]}
                            onChange={(v) => updateChannel(runtimeCfg.agentId, ch.channel, { [field.key]: v })}
                            placeholder={field.placeholder}
                          />
                          <p className="text-[10px] text-muted-foreground/45">{field.hint}</p>
                        </div>
                      ))}

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                          {meta.targetLabel[runtimeCfg.runtime]}
                        </label>
                        <input
                          type="text"
                          value={ch.target}
                          onChange={(e) => updateChannel(runtimeCfg.agentId, ch.channel, { target: e.target.value })}
                          placeholder={meta.targetPlaceholder[runtimeCfg.runtime]}
                          maxLength={CHANNEL_TARGET_MAX_LENGTH}
                          className="w-full bg-foreground/[0.035] border border-solid border-primary/10 rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[36px]"
                        />
                        {runtimeCfg.runtime === "openclaw" && isOpenClawConnectedForAgent && !displayedTarget ? (
                          <p className="text-[10px] text-amber-300/45">
                            OpenClaw has a {meta.label} account token saved, but no target ID is saved in config.
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/45">
                            {meta.targetHint[runtimeCfg.runtime]}
                          </p>
                        )}
                      </div>

                      <Accordion
                        type="single"
                        collapsible
                        value={openGuide}
                        onValueChange={(v) => setOpenGuide(v || "")}
                      >
                        <AccordionItem value={guideKey} className="border-0">
                          <AccordionTrigger className="py-1.5 text-[11px] text-foreground/60 hover:no-underline">
                            How do I find this?
                          </AccordionTrigger>
                          <AccordionContent className="pt-1">
                            <div className="space-y-1.5 text-[11px] text-foreground/60">
                              {meta.steps[runtimeCfg.runtime].map((step, i) => (
                                <div key={step} className="flex items-start gap-2">
                                  <span className="mt-0.5 text-foreground/25">{i + 1}.</span>
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
      ))}
    </div>
  );
}
