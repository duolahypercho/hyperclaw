"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/components/ui/use-toast";
import { dashboardState } from "$/lib/dashboard-state";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { EnsembleAgentView } from "../hooks/useEnsembleAgents";
import {
  buildAgentChannelConfigPatch,
  channelConfigKey,
  mergeRuntimeChannelConfigs,
  normalizeRuntimeChannelConfigForStorage,
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
        className={`w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3 py-2 pr-9 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[36px] font-mono ${className ?? ""}`}
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
}

export default function TeamChannelConfig({ agents, saveRef, onDirtyChange, hideButton }: TeamChannelConfigProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<RuntimeChannelConfigDraft[]>([]);
  const [baseline, setBaseline] = useState<string>("[]");
  const [openChannel, setOpenChannel] = useState("");
  const [openGuide, setOpenGuide] = useState("");

  const activeAgents = getActiveChannelAgents(agents);
  const activeAgentKey = activeAgents.map((agent) => `${agent.kind}:${agent.id}`).join("|");

  useEffect(() => {
    const saved = loadRuntimeChannelConfigs();
    const initial = activeAgents.map((agent) => {
      const savedForAgent = selectRuntimeChannelConfigForAgent(saved, agent, activeAgents);
      return initRuntimeConfig(agent.kind, savedForAgent, agent);
    });
    setConfigs(initial);
    setBaseline(JSON.stringify(initial));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentKey]);

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
      }) as { success?: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || "Failed to save channel config.");
      }
      const agentConfigWrites = nextConfigs
        .filter((cfg): cfg is RuntimeChannelConfigDraft & { agentId: string } => !!cfg.agentId)
        .map((cfg) => ({
          agentId: cfg.agentId,
          agentName: cfg.agentName || cfg.agentId,
          promise: bridgeInvoke("update-agent-config", {
            agentId: cfg.agentId,
            config: buildAgentChannelConfigPatch(cfg),
          }),
        }));
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
    <div className="space-y-8 pb-8">
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

      {configs.map((runtimeCfg) => (
        <div key={channelConfigKey(runtimeCfg)} className="space-y-3">
          <div className="text-[13px] font-medium text-foreground/60 uppercase tracking-wider">
            {runtimeCfg.agentName || runtimeLabel[runtimeCfg.runtime]}
          </div>

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
              const status = hasToken && hasTarget ? "Ready" : hasToken ? "Token set" : hasTarget ? "ID set" : "Not set";
              const itemKey = `${channelConfigKey(runtimeCfg)}:${ch.channel}`;
              const guideKey = `guide:${itemKey}`;

              return (
                <AccordionItem
                  key={ch.channel}
                  value={itemKey}
                  className="rounded-xl border border-solid border-primary/10 bg-foreground/[0.04] px-3"
                >
                  <AccordionTrigger className="py-2.5 hover:no-underline">
                    <div className="flex w-full items-center gap-2 pr-2 text-left min-w-0">
                      <span className="text-[13px] font-medium text-foreground/85 shrink-0">
                        {meta.label}
                      </span>
                      <span className={`truncate text-[11px] min-w-0 ${hasToken && hasTarget ? "text-emerald-400/60" : "text-foreground/30"}`}>
                        {status}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pt-1">
                    <div className="space-y-2.5 pb-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] text-foreground/50">{meta.label} setup</span>
                        <a
                          href={meta.docs[runtimeCfg.runtime]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-foreground/40 hover:text-foreground/80 transition-colors"
                        >
                          Docs
                        </a>
                      </div>

                      {credFields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[11px] text-foreground/40">
                            {field.label}
                            {field.required && <span className="text-red-400/60 ml-0.5">*</span>}
                          </label>
                          <SecretInput
                            value={ch[field.key]}
                            onChange={(v) => updateChannel(runtimeCfg.agentId, ch.channel, { [field.key]: v })}
                            placeholder={field.placeholder}
                          />
                          <p className="text-[10px] text-foreground/20">{field.hint}</p>
                        </div>
                      ))}

                      <div className="space-y-1">
                        <label className="text-[11px] text-foreground/40">
                          {meta.targetLabel[runtimeCfg.runtime]}
                        </label>
                        <input
                          type="text"
                          value={ch.target}
                          onChange={(e) => updateChannel(runtimeCfg.agentId, ch.channel, { target: e.target.value })}
                          placeholder={meta.targetPlaceholder[runtimeCfg.runtime]}
                          maxLength={CHANNEL_TARGET_MAX_LENGTH}
                          className="w-full bg-foreground/[0.06] border border-solid border-primary/10 rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors min-h-[36px]"
                        />
                        <p className="text-[10px] text-foreground/20">
                          {meta.targetHint[runtimeCfg.runtime]}
                        </p>
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
