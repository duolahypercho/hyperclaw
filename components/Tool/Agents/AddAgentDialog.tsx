"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ImagePlus, X, LibraryBig, Cable, MessageCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { ensureAgenticStackAdapter } from "$/lib/agentic-stack-client";
import { dashboardState } from "$/lib/dashboard-state";
import {
  readOpenClawConfig,
  getAvailableModels,
  saveAgentModel,
  toIdentityAvatarUrl,
  updateIdentityField,
} from "$/lib/identity-md";
import {
  buildSoulMd as buildOpenClawSoulMd,
  buildClaudeCodeMd,
  buildRuntimeSoulMd,
  buildUserMd as buildAgentUserMd,
  buildAgentTemplates,
  buildWorkspaceInstructionsMd,
  type AgentUserProfile,
} from "$/lib/agent-templates";
import { patchIdentityCache, removeIdentityCache } from "$/hooks/useAgentIdentity";
import { OpenClawIcon, HermesIcon, ClaudeCodeIcon, CodexIcon } from "$/components/Onboarding/RuntimeIcons";
import { SoulTemplateGallery } from "$/components/Onboarding/SoulTemplateGallery";
import {
  findBySlug,
  loadSoulTemplates,
  renderTemplateForRuntime,
  type SoulTemplate,
} from "$/lib/soul-templates";
import {
  buildAddAgentProvisionPayload,
  buildAgentIdentityUpdatePayload,
  buildChannelProvisionPayloadFields,
  buildGuidedChannelStateWithAgentConfigs,
  buildScopedAgentChannelConfigs,
  provisionAgentWithConfigConflictRetry,
  scrubSensitiveTokens,
} from "./add-agent-provisioning";
import { buildAgentChannelConfigPatch } from "$/components/ensemble/views/team-channel-config-state";
import type { OnboardingChannelConfig } from "$/components/Onboarding/onboarding-agent-scoping";
import type { WorkflowTemplateAgentBlueprint } from "$/lib/workflow-templates";

/* ── Runtime definitions ─────────────────────────────────────────── */

type RuntimeOption = {
  id: string;
  label: string;
  description: string;
  idNote: string;
};

const RUNTIMES: RuntimeOption[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "Multi-channel gateway (WhatsApp, Slack, Discord…)",
    idNote: "Letters, numbers, underscores, hyphens, dots only.",
  },
  {
    id: "hermes",
    label: "Hermes",
    description: "Self-improving agent framework",
    idNote: "Used as the Hermes profile name.",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Agentic coding assistant with custom instructions",
    idNote: "Profile folder with CLAUDE.md and memory.",
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI coding agent with sandboxed execution",
    idNote: "Profile folder with AGENTS.md instructions.",
  },
];

const RUNTIME_ICONS: Record<string, React.ReactNode> = {
  "openclaw":    <OpenClawIcon className="w-5 h-5" />,
  "hermes":      <HermesIcon className="w-5 h-5" />,
  "claude-code": <ClaudeCodeIcon className="w-5 h-5" />,
  "codex":       <CodexIcon className="w-5 h-5" />,
};

const RUNTIME_ICONS_LG: Record<string, React.ReactNode> = {
  "openclaw":    <OpenClawIcon className="w-6 h-6" />,
  "hermes":      <HermesIcon className="w-6 h-6" />,
  "claude-code": <ClaudeCodeIcon className="w-6 h-6" />,
  "codex":       <CodexIcon className="w-6 h-6" />,
};

const EMOJI_OPTIONS = [
  "🤖", "🦾", "⚡", "🧠", "🎯", "🔮", "🦅", "🐉",
  "🦁", "🌊", "🔥", "💡", "🛸", "🎭", "🧬", "🦞",
  "💻", "🔍", "✍️", "🎨", "📊", "🚀", "🔧", "🛡️",
];

const CHANNEL_OPTIONS: Array<{
  id: OnboardingChannelConfig["channel"];
  label: string;
  helper: string;
  targetLabel: string;
  targetPlaceholder: string;
  botTokenLabel: string;
  botTokenPlaceholder: string;
  appTokenLabel?: string;
  appTokenPlaceholder?: string;
}> = [
  {
    id: "telegram",
    label: "Telegram",
    helper: "Bot chats, team rooms, or direct operator handoffs.",
    targetLabel: "Chat or user ID",
    targetPlaceholder: "e.g. 891861452",
    botTokenLabel: "Bot token",
    botTokenPlaceholder: "123456:ABC...",
  },
  {
    id: "discord",
    label: "Discord",
    helper: "Route messages from a guild channel into this agent.",
    targetLabel: "Channel ID",
    targetPlaceholder: "e.g. 121234567890",
    botTokenLabel: "Bot token",
    botTokenPlaceholder: "Discord bot token",
  },
  {
    id: "slack",
    label: "Slack",
    helper: "Connect a workspace channel with bot and app credentials.",
    targetLabel: "Channel ID",
    targetPlaceholder: "e.g. C0123ABCDE",
    botTokenLabel: "Bot token",
    botTokenPlaceholder: "xoxb-...",
    appTokenLabel: "App token",
    appTokenPlaceholder: "xapp-...",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    helper: "Use the OpenClaw/Hermes-compatible WhatsApp account target.",
    targetLabel: "Phone or account ID",
    targetPlaceholder: "e.g. +15551234567",
    botTokenLabel: "Access token",
    botTokenPlaceholder: "Optional provider token",
  },
];

/* ── ID slug helper ──────────────────────────────────────────────── */

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function createDefaultChannelDrafts(): OnboardingChannelConfig[] {
  return CHANNEL_OPTIONS.map((channel) => ({
    channel: channel.id,
    target: "",
    botToken: "",
    appToken: "",
  }));
}

function supportsAgentChannels(runtime: string | null): runtime is "openclaw" | "hermes" {
  return runtime === "openclaw" || runtime === "hermes";
}

function getStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getSessionUserProfile(user: unknown): AgentUserProfile | undefined {
  if (!user || typeof user !== "object") return undefined;
  const record = user as Record<string, unknown>;
  const firstName = getStringField(record, "Firstname");
  const lastName = getStringField(record, "Lastname");
  const name = [firstName, lastName].filter(Boolean).join(" ") || getStringField(record, "name");
  const profile: AgentUserProfile = {
    name,
    email: getStringField(record, "email"),
    username: getStringField(record, "username"),
    // "aboutme" is not in the next-auth session shape; profile bio must come
    // from UserProv or a separate API call — omit for now to avoid empty field.
    about: undefined,
  };
  return Object.values(profile).some(Boolean) ? profile : undefined;
}

/* ── Personality file builders ───────────────────────────────────── */

// OpenClaw: IDENTITY.md metadata block (distinct from lib/agent-templates buildIdentityMd,
// which generates the full 7-file workspace set for OpenClaw agents)
function buildLocalIdentityMd(opts: {
  name: string;
  emoji: string;
  role: string;
  description: string;
}): string {
  const lines: string[] = [];
  lines.push(`- **Name:** ${opts.name}`);
  if (opts.emoji) lines.push(`- **Emoji:** ${opts.emoji}`);
  if (opts.role.trim()) lines.push(`- **Role:** ${opts.role.trim()}`);
  const header = lines.join("\n");
  if (opts.description.trim()) {
    return `${header}\n\n---\n\n${opts.description.trim()}\n`;
  }
  return `${header}\n`;
}

// Claude Code: CLAUDE.md carries workspace rules; SOUL.md carries persona.
function buildClaudeMd(opts: {
  name: string;
  emoji: string;
  role: string;
  description: string;
  projectPath?: string;
  soulContent: string;
}): string {
  return buildClaudeCodeMd(opts);
}

// Codex: AGENTS.md carries workspace rules; SOUL.md carries persona.
function buildCodexAgentsMd(opts: {
  name: string;
  emoji: string;
  role: string;
  description: string;
}): string {
  return `${buildWorkspaceInstructionsMd("AGENTS.md").trimEnd()}

---

## Agent Identity

${buildLocalIdentityMd(opts).trimEnd()}
`;
}

/* ── Props ───────────────────────────────────────────────────────── */

export interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (
    agentId: string,
    runtime: string,
    displayName: string,
    details?: { role?: string; description?: string },
  ) => void;
  existingAgents?: Array<{ id: string; name: string; runtime?: string }>;
  /** Pre-select a runtime when the dialog opens */
  initialRuntime?: string;
  initialName?: string;
  initialRole?: string;
  initialDescription?: string;
  initialEmoji?: string;
  initialSoulContent?: string;
  initialWorkspaceInstructions?: string;
  initialUserNotes?: string;
  initialSkills?: string[];
  initialSoulTemplateSlug?: string;
  initialAgentBlueprint?: WorkflowTemplateAgentBlueprint;
}

/* ── Component ───────────────────────────────────────────────────── */

interface RuntimeAvailability {
  name: string;
  available: boolean;
  message?: string;
}

export function AddAgentDialog({
  open,
  onOpenChange,
  onSuccess,
  existingAgents = [],
  initialRuntime,
  initialName,
  initialRole,
  initialDescription,
  initialEmoji,
  initialSoulContent,
  initialWorkspaceInstructions,
  initialUserNotes,
  initialSkills,
  initialSoulTemplateSlug,
  initialAgentBlueprint,
}: AddAgentDialogProps) {
  const { data: session } = useSession();
  const preferredInitialRuntime = useMemo(
    () => initialRuntime ?? initialAgentBlueprint?.runtime ?? null,
    [initialRuntime, initialAgentBlueprint?.runtime],
  );
  const [selectedRuntime, setSelectedRuntime] = useState<string | null>(preferredInitialRuntime);
  const [activeTab, setActiveTab] = useState("agent");
  const [displayName, setDisplayName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("🤖");
  const [customEmoji, setCustomEmoji] = useState("");
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("__default__");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [projectPath, setProjectPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runtimeAvailability, setRuntimeAvailability] = useState<Record<string, boolean>>({});
  const [loadingRuntimes, setLoadingRuntimes] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [stashedTemplate, setStashedTemplate] = useState<SoulTemplate | null>(null);
  const [activeChannel, setActiveChannel] = useState<OnboardingChannelConfig["channel"]>("telegram");
  const [channelDrafts, setChannelDrafts] = useState<OnboardingChannelConfig[]>(() => createDefaultChannelDrafts());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runtime = useMemo(
    () => RUNTIMES.find((r) => r.id === selectedRuntime) ?? RUNTIMES[0],
    [selectedRuntime]
  );

  const agentId = useMemo(() => toSlug(displayName), [displayName]);
  const activeEmoji = customEmoji.trim() || selectedEmoji;
  const channelSetupEnabled = supportsAgentChannels(selectedRuntime);
  const configuredChannelCount = useMemo(
    () => channelDrafts.filter((channel) => (
      channel.target.trim() ||
      channel.botToken.trim() ||
      channel.appToken.trim()
    )).length,
    [channelDrafts],
  );
  const userProfile = useMemo(
    () => getSessionUserProfile(session?.user),
    [session?.user],
  );

  useEffect(() => {
    if (activeTab === "channels" && !channelSetupEnabled) {
      setActiveTab("agent");
    }
  }, [activeTab, channelSetupEnabled]);

  // Apply workflow-provided agent blueprints when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const blueprint = initialAgentBlueprint;
    const nextRuntime = preferredInitialRuntime;
    if (nextRuntime) {
      setSelectedRuntime(nextRuntime);
    }
    const nextName = initialName ?? blueprint?.defaultName;
    if (nextName) setDisplayName(nextName);
    const nextRole = initialRole ?? blueprint?.role;
    if (nextRole) setRole(nextRole);
    const nextDescription = initialDescription ?? blueprint?.description;
    if (nextDescription) setDescription(nextDescription);
    const nextEmoji = initialEmoji ?? blueprint?.emoji;
    if (nextEmoji) {
      setSelectedEmoji(nextEmoji);
      setCustomEmoji("");
    }

    const slug = initialSoulTemplateSlug ?? blueprint?.soulTemplateSlug;
    if (!slug) {
      setStashedTemplate(null);
      return;
    }

    let cancelled = false;
    loadSoulTemplates()
      .then((catalog) => {
        if (cancelled) return;
        setStashedTemplate(findBySlug(catalog, slug) ?? null);
      })
      .catch(() => {
        if (!cancelled) setStashedTemplate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    preferredInitialRuntime,
    initialName,
    initialRole,
    initialDescription,
    initialEmoji,
    initialSoulTemplateSlug,
    initialAgentBlueprint,
  ]);

  // Fetch available runtimes and models when sheet opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Fetch runtime availability from connector
    setLoadingRuntimes(true);
    bridgeInvoke("list-available-runtimes", {})
      .then((result) => {
        if (cancelled) return;
        const res = result as { runtimes?: RuntimeAvailability[] };
        if (res?.runtimes) {
          const availability: Record<string, boolean> = {};
          for (const rt of res.runtimes) {
            availability[rt.name] = rt.available;
          }
          setRuntimeAvailability(availability);

          // Auto-select first available runtime only when the caller did not prefill one.
          const firstAvailable = RUNTIMES.find((r) => availability[r.id]);
          if (firstAvailable && !preferredInitialRuntime) {
            setSelectedRuntime((current) => current ?? firstAvailable.id);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: assume all are available if check fails
        const fallback: Record<string, boolean> = {};
        for (const r of RUNTIMES) fallback[r.id] = true;
        setRuntimeAvailability(fallback);
        if (!preferredInitialRuntime) setSelectedRuntime((current) => current ?? "openclaw");
      })
      .finally(() => {
        if (!cancelled) setLoadingRuntimes(false);
      });

    // Fetch available models for OpenClaw
    readOpenClawConfig()
      .then((config) => {
        if (cancelled) return;
        if (config) setAvailableModels(getAvailableModels(config));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, preferredInitialRuntime]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") setAvatarDataUri(result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const reset = useCallback(() => {
    setDisplayName("");
    setSelectedEmoji("🤖");
    setCustomEmoji("");
    setAvatarDataUri(null);
    setRole("");
    setDescription("");
    setModel("__default__");
    setAvailableModels([]);
    setProjectPath("");
    setError(null);
    setSelectedRuntime(null);
    setActiveTab("agent");
    setActiveChannel("telegram");
    setChannelDrafts(createDefaultChannelDrafts());
    setRuntimeAvailability({});
    setLoadingRuntimes(true);
    setStashedTemplate(null);
  }, []);

  const updateChannelDraft = useCallback((
    channelId: OnboardingChannelConfig["channel"],
    field: keyof Pick<OnboardingChannelConfig, "target" | "botToken" | "appToken">,
    value: string,
  ) => {
    setChannelDrafts((current) => current.map((channel) => (
      channel.channel === channelId ? { ...channel, [field]: value } : channel
    )));
  }, []);

  /**
   * Apply a template picked from the gallery to the form fields. We stash
   * the full template so the submit flow can render runtime-specific content
   * via `renderTemplateForRuntime`. Users can still edit every field before
   * submitting.
   */
  const applyTemplate = useCallback((template: SoulTemplate) => {
    setStashedTemplate(template);
    setDisplayName(template.name);
    setRole(template.role);
    setDescription(template.description);
    if (template.emoji) {
      setSelectedEmoji(template.emoji);
      setCustomEmoji("");
    }
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = useCallback(() => {
    setError(null);

    if (!selectedRuntime) {
      setError("Please select a runtime");
      return;
    }

    const name = displayName.trim();
    if (!name) { setError("Agent name is required"); return; }
    const id = toSlug(name);
    if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
      setError("Name must start with a letter or number");
      return;
    }

    // Duplicate check: compare against existing agents for the same runtime.
    const isDuplicate = existingAgents.some((a) => a.runtime === selectedRuntime && a.id === id);
    if (isDuplicate) {
      setError(`An agent named "${name}" already exists for the ${selectedRuntime} runtime`);
      return;
    }

    // Populate identity cache now so avatar renders the moment the row appears.
    patchIdentityCache(id, {
      name,
      emoji: activeEmoji,
      role,
      description,
      runtime: selectedRuntime,
      ...(avatarDataUri ? { avatar: avatarDataUri } : {}),
    });

    // Close dialog immediately and signal StatusWidget to show the Hiring badge.
    window.dispatchEvent(new CustomEvent("agent.hiring", {
      detail: { agentId: id, name, emoji: activeEmoji, role, description, runtime: selectedRuntime },
    }));
    onSuccess?.(id, selectedRuntime, name, { role, description });
    handleOpenChange(false);

    // Fire bridge calls in the background.
    // Build the actual files the agent should wake up with. SOUL.md stays the
    // persona file; AGENTS.md / CLAUDE.md stay runtime startup rules.
    const prefilledSoulContent =
      initialSoulContent ??
      initialAgentBlueprint?.soulContent ??
      initialAgentBlueprint?.systemPrompt;
    const soulContent = prefilledSoulContent
      ? prefilledSoulContent
      : stashedTemplate
      ? renderTemplateForRuntime(
          stashedTemplate,
          selectedRuntime as "openclaw" | "hermes" | "claude-code" | "codex",
          { name, emoji: activeEmoji, role, description },
        )
      : selectedRuntime === "openclaw"
        ? buildOpenClawSoulMd({ name, role, description })
        : buildRuntimeSoulMd({ name, role, description });
    const baseIdentityContent = buildLocalIdentityMd({ name, emoji: activeEmoji, role, description });
    const avatarUrl = toIdentityAvatarUrl(avatarDataUri);
    const identityContent = avatarUrl
      ? updateIdentityField(baseIdentityContent, "Avatar", avatarUrl)
      : baseIdentityContent;
    const skillsNote =
      (initialSkills ?? initialAgentBlueprint?.skills ?? []).length > 0
        ? `\n\n## Workflow Skills\n${(initialSkills ?? initialAgentBlueprint?.skills ?? [])
            .map((skill) => `- ${skill}`)
            .join("\n")}`
        : "";
    const workflowNotes = initialUserNotes ?? initialAgentBlueprint?.userNotes;
    const userContent = `${buildAgentUserMd({
      name,
      role,
      description,
      userProfile,
    }).trimEnd()}${workflowNotes ? `\n\n## Workflow Notes\n${workflowNotes}` : ""}${skillsNote}\n`;

    const prefilledWorkspaceInstructions =
      initialWorkspaceInstructions ??
      initialAgentBlueprint?.workspaceInstructions;
    const blueprintFiles = initialAgentBlueprint?.files ?? {};
    const codexAgentsContent =
      blueprintFiles["AGENTS.md"] ??
      prefilledWorkspaceInstructions ??
      buildCodexAgentsMd({ name, emoji: activeEmoji, role, description });
    const claudeInstructionContent =
      blueprintFiles["CLAUDE.md"] ??
      prefilledWorkspaceInstructions ??
      buildClaudeMd({ name, emoji: activeEmoji, role, description, projectPath, soulContent });
    const baseOpenClawFiles = buildAgentTemplates({
      name,
      emoji: activeEmoji,
      role,
      description,
      soulContent,
      userProfile,
    });
    const openClawFiles = avatarUrl && baseOpenClawFiles["IDENTITY.md"]
      ? {
          ...baseOpenClawFiles,
          ...(prefilledWorkspaceInstructions
            ? {
                "AGENTS.md": prefilledWorkspaceInstructions,
                "CLAUDE.md": prefilledWorkspaceInstructions,
              }
            : {}),
          ...blueprintFiles,
          "IDENTITY.md": updateIdentityField(baseOpenClawFiles["IDENTITY.md"], "Avatar", avatarUrl),
        }
      : {
          ...baseOpenClawFiles,
          ...(prefilledWorkspaceInstructions
            ? {
                "AGENTS.md": prefilledWorkspaceInstructions,
                "CLAUDE.md": prefilledWorkspaceInstructions,
              }
            : {}),
          ...blueprintFiles,
        };
    const scopedChannelConfigs = buildScopedAgentChannelConfigs({
      runtime: selectedRuntime,
      agentId: id,
      agentName: name,
      channels: channelDrafts,
    });
    if (scopedChannelConfigs.length > 0) {
      dashboardState.set(
        "guided-setup-state",
        buildGuidedChannelStateWithAgentConfigs(
          dashboardState.get("guided-setup-state"),
          scopedChannelConfigs,
        ),
        { flush: true },
      );
    }
    const channelProvisionFields = buildChannelProvisionPayloadFields(
      selectedRuntime,
      scopedChannelConfigs,
    );

    const provisionPayload = buildAddAgentProvisionPayload({
      agentId: id,
      runtime: selectedRuntime,
      name,
      role,
      description,
      emoji: activeEmoji,
      avatarDataUri,
      mainModel: model,
      ...channelProvisionFields,
      userProfile,
    });
    const identityUpdatePayload = buildAgentIdentityUpdatePayload({
      agentId: id,
      runtime: selectedRuntime,
      name,
      role,
      description,
      emoji: activeEmoji,
      avatarDataUri,
    });

    const run = async () => {
      try {
        type BridgeResult = { success?: boolean; error?: string };

        const ensureSuccess = (res: unknown, label: string): BridgeResult => {
          const r = res as BridgeResult;
          if (!r?.success) {
            throw new Error(`${label}: ${r?.error ?? "unknown error"}`);
          }
          return r;
        };

        const writeRuntimeDoc = async (fileName: string, content: string) => {
          ensureSuccess(
            await bridgeInvoke("write-agent-identity-doc", {
              agentId: id,
              runtime: selectedRuntime,
              fileName,
              content,
            }),
            `write ${fileName}`,
          );
        };

        const provisionResult = await provisionAgentWithConfigConflictRetry(
          (action, body) => bridgeInvoke(action, body),
          provisionPayload,
        );
        ensureSuccess(provisionResult, "provision agent");

        if (selectedRuntime === "openclaw" && model && model !== "__default__") {
          await saveAgentModel(id, model);
        }

        try {
          await bridgeInvoke("update-agent-config", {
            agentId: id,
            config: {
              role,
              description,
              runtime: selectedRuntime,
              ...(model && model !== "__default__" ? { mainModel: model } : {}),
              ...(scopedChannelConfigs[0] ? buildAgentChannelConfigPatch(scopedChannelConfigs[0]) : {}),
              ...(selectedRuntime === "claude-code" && projectPath.trim()
                ? { projectPath: projectPath.trim() }
                : {}),
            },
          });
        } catch {
          // Non-fatal — identity files and the local cache still carry this metadata.
        }
        if (selectedRuntime === "openclaw") {
          await Promise.all(
            Object.entries(openClawFiles).map(([fileName, content]) =>
              writeRuntimeDoc(fileName, content),
            ),
          );
        } else {
          await Promise.all([
            writeRuntimeDoc("IDENTITY.md", identityContent),
            writeRuntimeDoc("SOUL.md", soulContent),
            writeRuntimeDoc("USER.md", userContent),
            selectedRuntime === "codex"
              ? writeRuntimeDoc("AGENTS.md", codexAgentsContent)
              : Promise.resolve(),
            selectedRuntime === "claude-code"
              ? writeRuntimeDoc("CLAUDE.md", claudeInstructionContent)
              : Promise.resolve(),
          ]);
        }
        ensureSuccess(
          await bridgeInvoke("update-agent-identity", identityUpdatePayload),
          "update agent identity",
        );
        window.dispatchEvent(new CustomEvent("agent.hired", {
          detail: { agentId: id, runtime: selectedRuntime },
        }));
        window.dispatchEvent(new CustomEvent("agent.file.changed"));
        // Fire-and-forget: install the agentic-stack workspace block so
        // the runtime can find the shared brain on its first run.
        // Errors are surfaced later inside the agent's Adapter tab.
        void ensureAgenticStackAdapter({
          agentId: id,
          runtime: selectedRuntime,
          projectPath,
        }).catch((err) => {
          console.warn(
            "[AddAgentDialog] ensureAgenticStackAdapter failed:",
            err instanceof Error ? err.message : err,
          );
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[AddAgentDialog] Failed to hire agent:", scrubSensitiveTokens(message));
        removeIdentityCache(id);
        window.dispatchEvent(new CustomEvent("agent.hire.failed", { detail: { agentId: id } }));
      }
    };

    void run();
  }, [displayName, selectedRuntime, activeEmoji, avatarDataUri, role, description, model, projectPath, channelDrafts, onSuccess, handleOpenChange, existingAgents, stashedTemplate, userProfile, initialSoulContent, initialWorkspaceInstructions, initialUserNotes, initialSkills, initialAgentBlueprint]);

  return (
    <>
    <SoulTemplateGallery
      open={galleryOpen}
      onOpenChange={setGalleryOpen}
      onSelect={applyTemplate}
    />
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              {selectedRuntime && RUNTIME_ICONS_LG[selectedRuntime]}
              {!selectedRuntime && <Sparkles className="w-6 h-6" />}
            </div>
            <div>
              <SheetTitle>New Agent</SheetTitle>
              <SheetDescription className="mt-0.5">
                Add an agent to your team
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2 bg-muted/40">
              <TabsTrigger value="agent">Agent</TabsTrigger>
              <TabsTrigger value="channels" disabled={!channelSetupEnabled}>
                Channels
                {configuredChannelCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                    {configuredChannelCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <TabsContent value="agent" className="mt-0 space-y-6">

          {/* Start from template */}
          <div>
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="group w-full flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/60 transition-all px-4 py-3 text-left"
            >
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                <LibraryBig className="w-5 h-5" />
              </span>
              <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-xs font-medium text-foreground">
                  {stashedTemplate ? `Using: ${stashedTemplate.name}` : "Start from a template"}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {stashedTemplate
                    ? "Form prefilled — edit anything below, or pick another."
                    : "Browse curated SOUL.md personalities — no prompt engineering needed."}
                </span>
              </span>
              <span className="text-[10px] text-primary font-medium shrink-0">
                {stashedTemplate ? "Change" : "Browse"}
              </span>
            </button>
            {stashedTemplate && (
              <button
                type="button"
                onClick={() => setStashedTemplate(null)}
                className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear template
              </button>
            )}
          </div>

          {/* Runtime */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Runtime</Label>
            {loadingRuntimes ? (
              <div className="h-[140px] flex items-center justify-center text-sm text-muted-foreground">
                Checking installed runtimes…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {RUNTIMES.map((r) => {
                  const isAvailable = runtimeAvailability[r.id] ?? false;
                  const isSelected = selectedRuntime === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => isAvailable && setSelectedRuntime(r.id)}
                      disabled={!isAvailable}
                      title={!isAvailable ? `${r.label} is not installed` : undefined}
                      className={[
                        "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all border relative",
                        !isAvailable
                          ? "border-border/30 bg-muted/10 opacity-50 cursor-not-allowed"
                          : isSelected
                            ? "border-primary/60 bg-primary/8 ring-1 ring-primary/30"
                            : "border-border/50 bg-muted/20 hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <span className={[
                        "leading-none mt-0.5 shrink-0",
                        isAvailable ? "text-foreground/70" : "text-muted-foreground/40",
                      ].join(" ")}>
                        {RUNTIME_ICONS[r.id]}
                      </span>
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className={[
                          "text-xs font-medium truncate",
                          !isAvailable && "text-muted-foreground/60",
                        ].filter(Boolean).join(" ")}>
                          {r.label}
                        </span>
                        <span className={[
                          "text-[10px] leading-tight line-clamp-2",
                          isAvailable ? "text-muted-foreground" : "text-muted-foreground/40",
                        ].join(" ")}>
                          {isAvailable ? r.description : "Not installed"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="add-agent-name" className="text-xs uppercase tracking-wider text-muted-foreground">
              Name
            </Label>
            <Input
              id="add-agent-name"
              placeholder={selectedRuntime === "openclaw" ? "e.g. my-assistant" : "e.g. My Research Agent"}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
              autoComplete="off"
              autoFocus
              disabled={false}
            />
            {agentId && (
              <p className="text-[10px] text-muted-foreground">
                ID: <code className="bg-muted/50 px-1 rounded font-mono">{agentId}</code>
                {" · "}{runtime.idNote}
              </p>
            )}
          </div>

          {/* Avatar image */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ImagePlus className="w-3 h-3" />
              Avatar photo
              <span className="text-muted-foreground/50 normal-case tracking-normal">optional</span>
            </Label>
            <div className="flex items-center gap-4">
              {/* Preview circle */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-16 h-16 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center overflow-hidden hover:border-primary/50 transition-all group shrink-0"
              >
                {avatarDataUri ? (
                  <img src={avatarDataUri} alt="Agent avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl select-none">{activeEmoji}</span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-[14px]">
                  <ImagePlus className="w-5 h-5 text-white" />
                </div>
              </button>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs h-7 px-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 transition-colors flex items-center gap-1.5 text-foreground/80"
                  >
                    <ImagePlus className="w-3 h-3" />
                    {avatarDataUri ? "Change photo" : "Upload photo"}
                  </button>
                  {avatarDataUri && (
                    <button
                      type="button"
                      onClick={() => setAvatarDataUri(null)}
                      className="text-xs h-7 px-2 rounded-lg border border-border/40 hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors text-muted-foreground flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  PNG, JPEG, WebP · max 5 MB<br />
                  Falls back to emoji if no photo.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          {/* Emoji */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              {avatarDataUri ? "Fallback emoji" : "Emoji"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { setSelectedEmoji(e); setCustomEmoji(""); }}
                  className={[
                    "w-10 h-10 text-xl rounded-xl flex items-center justify-center transition-all border",
                    selectedEmoji === e && !customEmoji
                      ? "bg-primary/15 ring-1 ring-primary/60 scale-110 border-primary/40"
                      : "border-border/40 bg-muted hover:bg-muted/80 hover:scale-105",
                  ].join(" ")}
                  disabled={false}
                >
                  {e}
                </button>
              ))}
            </div>
            <Input
              placeholder="Or type any emoji…"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              className="h-9 w-40"
              disabled={false}
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-agent-role" className="text-xs uppercase tracking-wider text-muted-foreground">
                Role
              </Label>
              <span className="text-xs text-muted-foreground/50">optional</span>
            </div>
            <Input
              id="add-agent-role"
              placeholder="e.g. Code & Automation"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={false}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-agent-desc" className="text-xs uppercase tracking-wider text-muted-foreground">
                Description
              </Label>
              <span className="text-xs text-muted-foreground/50">optional</span>
            </div>
            <Textarea
              id="add-agent-desc"
              placeholder="What does this agent do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={false}
            />
          </div>

          {/* Project Path (Claude Code only — scopes sessions to this directory) */}
          {selectedRuntime === "claude-code" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="add-agent-project" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Project Path
                </Label>
                <span className="text-xs text-muted-foreground/50">optional</span>
              </div>
              <Input
                id="add-agent-project"
                placeholder="e.g. /Users/you/Code/my-project"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                disabled={false}
              />
              <p className="text-[10px] text-muted-foreground leading-tight">
                Point to an existing project directory.<br />
                If empty, sessions are isolated to this agent automatically.
              </p>
            </div>
          )}

          {/* Model (OpenClaw only — stored in openclaw.json) */}
          {selectedRuntime === "openclaw" && availableModels.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Model</Label>
                <span className="text-xs text-muted-foreground/50">optional</span>
              </div>
              <Select value={model} onValueChange={setModel} disabled={false}>
                <SelectTrigger>
                  <SelectValue placeholder="Use OpenClaw default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">— Use default model —</SelectItem>
                  {availableModels.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          </TabsContent>

          <TabsContent value="channels" className="mt-0 space-y-5">
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
                  <Cable className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Add channels while hiring
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {selectedRuntime === "hermes"
                      ? "Hermes receives these channel secrets for its profile environment, so each agent can keep its own .env-style credentials."
                      : "OpenClaw receives these as channel credentials and binds them to the new agent account during provisioning."}
                  </p>
                </div>
              </div>
            </div>

            {!channelSetupEnabled ? (
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm text-muted-foreground">
                Channel setup is available for OpenClaw and Hermes agents.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNEL_OPTIONS.map((channel) => {
                    const draft = channelDrafts.find((item) => item.channel === channel.id);
                    const configured = !!(
                      draft?.target.trim() ||
                      draft?.botToken.trim() ||
                      draft?.appToken.trim()
                    );
                    const selected = activeChannel === channel.id;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setActiveChannel(channel.id)}
                        className={[
                          "rounded-xl border px-3 py-2.5 text-left transition-all",
                          selected
                            ? "border-primary/60 bg-primary/10 ring-1 ring-primary/25"
                            : "border-border/50 bg-muted/20 hover:bg-muted/40",
                        ].join(" ")}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <MessageCircle className="h-3.5 w-3.5 text-primary/80" />
                            {channel.label}
                          </span>
                          {configured && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Configured" />
                          )}
                        </span>
                        <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">
                          {channel.helper}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {CHANNEL_OPTIONS.map((channel) => {
                  if (channel.id !== activeChannel) return null;
                  const draft = channelDrafts.find((item) => item.channel === channel.id);
                  if (!draft) return null;

                  return (
                    <motion.div
                      key={channel.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 rounded-2xl border border-border/50 bg-card/40 p-4"
                    >
                      <div>
                        <Label
                          htmlFor={`add-agent-${channel.id}-target`}
                          className="text-xs uppercase tracking-wider text-muted-foreground"
                        >
                          {channel.targetLabel}
                        </Label>
                        <Input
                          id={`add-agent-${channel.id}-target`}
                          value={draft.target}
                          onChange={(event) => updateChannelDraft(channel.id, "target", event.target.value)}
                          placeholder={channel.targetPlaceholder}
                          className="mt-2"
                          autoComplete="off"
                        />
                      </div>

                      <div>
                        <Label
                          htmlFor={`add-agent-${channel.id}-token`}
                          className="text-xs uppercase tracking-wider text-muted-foreground"
                        >
                          {channel.botTokenLabel}
                        </Label>
                        <Input
                          id={`add-agent-${channel.id}-token`}
                          value={draft.botToken}
                          onChange={(event) => updateChannelDraft(channel.id, "botToken", event.target.value)}
                          placeholder={channel.botTokenPlaceholder}
                          className="mt-2"
                          type="password"
                          autoComplete="new-password"
                        />
                      </div>

                      {channel.appTokenLabel && (
                        <div>
                          <Label
                            htmlFor={`add-agent-${channel.id}-app-token`}
                            className="text-xs uppercase tracking-wider text-muted-foreground"
                          >
                            {channel.appTokenLabel}
                          </Label>
                          <Input
                            id={`add-agent-${channel.id}-app-token`}
                            value={draft.appToken}
                            onChange={(event) => updateChannelDraft(channel.id, "appToken", event.target.value)}
                            placeholder={channel.appTokenPlaceholder}
                            className="mt-2"
                            type="password"
                            autoComplete="new-password"
                          />
                        </div>
                      )}

                      <p className="rounded-xl bg-muted/25 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                        Agent account:{" "}
                        <code className="rounded bg-background/70 px-1 font-mono">
                          {agentId || "set-name-first"}
                        </code>
                        {selectedRuntime === "hermes"
                          ? " · saved into the Hermes profile environment during provisioning."
                          : " · used for the OpenClaw channel account/binding during provisioning."}
                      </p>
                    </motion.div>
                  );
                })}
              </>
            )}
          </TabsContent>
        </div>
        </Tabs>

        <SheetFooter className="px-6 py-4 border-t border-border flex flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={false}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!displayName.trim() || !agentId || !selectedRuntime}
            className="flex-1"
          >
            {selectedRuntime ? `Add to ${runtime.label}` : "Select a runtime"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    </>
  );
}
