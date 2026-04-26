/**
 * Shared utilities for reading/writing IDENTITY.md files.
 *
 * IDENTITY.md format:
 *   - **Name:** ...
 *   - **Creature:** ...
 *   - **Vibe:** ...
 *   - **Emoji:** ...
 *   - **Avatar:** ...
 *   - **Role:** ...      (optional)
 *
 *   ---
 *
 *   (description content)
 */

import { bridgeInvoke } from "./hyperclaw-bridge-client";

/** Parse a field value from the IDENTITY.md header (above ---). */
export function parseIdentityField(content: string | null, field: string): string {
  if (!content) return "";
  // Only search the header section (above the --- divider)
  const dividerIdx = content.indexOf("\n---");
  const header = dividerIdx !== -1 ? content.slice(0, dividerIdx) : content;
  const regex = new RegExp(
    `^[-*\\s]*\\**${field}:?\\**\\s*:?\\s*(.+?)\\s*$`,
    "im"
  );
  const match = header.match(regex);
  return match ? match[1].replace(/^\*+|\*+$/g, "").trim() : "";
}

/** Update (or insert) a header field in IDENTITY.md content. */
export function updateIdentityField(content: string, field: string, value: string): string {
  // Use [^\S\n] (horizontal whitespace only) so the capture never grabs a newline.
  const regex = new RegExp(
    `^([\\-*]*[^\\S\\n]*\\**${field}:?\\**[^\\S\\n]*:?[^\\S\\n]*).*$`,
    "im"
  );
  if (regex.test(content)) {
    return content.replace(regex, `$1${value}`);
  }
  const dividerIdx = content.indexOf("\n---");
  if (dividerIdx !== -1) {
    return (
      content.slice(0, dividerIdx) +
      `\n- **${field}:** ${value}` +
      content.slice(dividerIdx)
    );
  }
  const trimmed = content.trimEnd();
  return trimmed + (trimmed ? "\n" : "") + `- **${field}:** ${value}\n`;
}

export const DEFAULT_IDENTITY_AVATAR_URL = "/avatar.png";

/**
 * IDENTITY.md is long-lived agent metadata, not image storage. Uploaded avatars
 * still travel as data URIs for preview/provisioning, but the identity file only
 * keeps a stable URL/path reference.
 */
export function toIdentityAvatarUrl(avatar: string | null | undefined): string {
  const trimmed = avatar?.trim() ?? "";
  if (!trimmed) return "";
  if (/^data:/i.test(trimmed)) return DEFAULT_IDENTITY_AVATAR_URL;
  return trimmed;
}

/** Extract the description section (everything after the --- divider). */
export function parseIdentityDescription(content: string | null): string {
  if (!content) return "";
  const idx = content.indexOf("\n---");
  if (idx === -1) return "";
  return content.slice(idx + 4).trim();
}

/** Replace the description section (everything after ---) in IDENTITY.md. */
export function updateIdentityDescription(content: string, desc: string): string {
  const idx = content.indexOf("\n---");
  const header = (idx !== -1 ? content.slice(0, idx) : content).trimEnd();
  if (!desc.trim()) return header + "\n\n---\n";
  return header + "\n\n---\n\n" + desc.trimEnd() + "\n";
}

/** Resolve the workspace folder for a given agent. */
export function resolveAgentFolder(agentId: string, workspaceFolder?: string): string {
  if (workspaceFolder) return workspaceFolder;
  if (agentId === "main") return "workspace";
  return `workspace-${agentId}`;
}

/**
 * Read an agent's IDENTITY.md, apply patches, and write it back.
 * Non-fatal — silently catches errors.
 */
/* ── openclaw.json model helpers ──────────────────────────── */

export interface OpenClawConfig {
  agents?: {
    defaults?: { models?: Record<string, unknown> };
    list?: Array<Record<string, unknown>>;
  };
  models?: {
    providers?: Record<string, { models?: Array<{ id: string }> }>;
  };
}

/** Read and parse openclaw.json. Returns null on failure. */
export async function readOpenClawConfig(): Promise<OpenClawConfig | null> {
  try {
    const res = (await bridgeInvoke("get-openclaw-doc", {
      relativePath: "openclaw.json",
    })) as { success?: boolean; content?: string };
    if (!res?.success || !res.content) return null;
    return JSON.parse(res.content) as OpenClawConfig;
  } catch {
    return null;
  }
}

/** Collect all available model IDs from openclaw.json config. */
export function getAvailableModels(config: OpenClawConfig): string[] {
  const defaultModels = config?.agents?.defaults?.models;
  const modelList: string[] = defaultModels ? Object.keys(defaultModels) : [];

  const providers = config?.models?.providers;
  if (providers && typeof providers === "object") {
    for (const [provName, prov] of Object.entries(providers)) {
      if (Array.isArray(prov.models)) {
        for (const m of prov.models) {
          const fullId = `${provName}/${m.id}`;
          if (!modelList.includes(fullId)) modelList.push(fullId);
        }
      }
    }
  }

  return modelList;
}

/** Get the current model for an agent from openclaw.json config. */
export function getAgentModel(config: OpenClawConfig, agentId: string): string {
  const entry = config?.agents?.list?.find((a) => a.id === agentId);
  if (!entry?.model) return "";
  if (typeof entry.model === "string") return entry.model;
  if (typeof entry.model === "object" && entry.model !== null) {
    return (entry.model as { primary?: string }).primary || "";
  }
  return "";
}

/**
 * Update an agent's model in openclaw.json.
 * Pass empty string or "__default__" to remove the override.
 */
export async function saveAgentModel(
  agentId: string,
  modelId: string
): Promise<void> {
  try {
    const config = await readOpenClawConfig();
    if (!config) return;
    const list = config?.agents?.list;
    if (!list) return;

    const entry = list.find((a) => a.id === agentId);
    if (!entry) return;

    const selectedModel = !modelId || modelId === "__default__" ? undefined : modelId;
    if (selectedModel) {
      if (typeof entry.model === "object" && entry.model !== null) {
        (entry.model as Record<string, unknown>).primary = selectedModel;
      } else {
        entry.model = selectedModel;
      }
    } else {
      delete entry.model;
    }

    await bridgeInvoke("write-openclaw-doc", {
      relativePath: "openclaw.json",
      content: JSON.stringify(config, null, 2),
    });
  } catch {
    // Non-fatal
  }
}

/** Update an agent's name in openclaw.json agents.list. */
export async function saveAgentName(
  agentId: string,
  newName: string
): Promise<void> {
  try {
    const config = await readOpenClawConfig();
    if (!config) return;
    const list = config?.agents?.list;
    if (!list) return;

    const entry = list.find((a) => a.id === agentId);
    if (!entry) return;

    if (newName.trim()) {
      entry.name = newName.trim();
    }

    await bridgeInvoke("write-openclaw-doc", {
      relativePath: "openclaw.json",
      content: JSON.stringify(config, null, 2),
    });
  } catch {
    // Non-fatal
  }
}

/* ── Heartbeat config helpers ─────────────────────────────── */

export interface HeartbeatConfig {
  every: string;
  model: string;
}

/** Get the heartbeat config for an agent. Falls back to agents.defaults.heartbeat. */
export function getAgentHeartbeat(config: OpenClawConfig, agentId: string): HeartbeatConfig {
  const defaults = (config?.agents as Record<string, unknown>)?.defaults as Record<string, unknown> | undefined;
  const defaultHb = defaults?.heartbeat as { every?: string; model?: string } | undefined;
  const entry = config?.agents?.list?.find((a) => a.id === agentId);
  const agentHb = entry?.heartbeat as { every?: string; model?: string } | undefined;
  return {
    every: agentHb?.every || defaultHb?.every || "",
    model: agentHb?.model || defaultHb?.model || "",
  };
}

/**
 * Save heartbeat config for an agent in openclaw.json.
 * Empty values fall back to defaults (removes the per-agent override).
 */
export async function saveAgentHeartbeat(
  agentId: string,
  heartbeat: { every?: string; model?: string }
): Promise<void> {
  try {
    const config = await readOpenClawConfig();
    if (!config) return;
    const list = config?.agents?.list;
    if (!list) return;

    const entry = list.find((a) => a.id === agentId);
    if (!entry) return;

    const existing = (entry.heartbeat || {}) as Record<string, unknown>;

    if (heartbeat.every !== undefined) {
      if (heartbeat.every.trim()) {
        existing.every = heartbeat.every.trim();
      } else {
        delete existing.every;
      }
    }
    if (heartbeat.model !== undefined) {
      const m = heartbeat.model === "__default__" ? "" : heartbeat.model;
      if (m.trim()) {
        existing.model = m.trim();
      } else {
        delete existing.model;
      }
    }

    if (Object.keys(existing).length > 0) {
      entry.heartbeat = existing;
    } else {
      delete entry.heartbeat;
    }

    await bridgeInvoke("write-openclaw-doc", {
      relativePath: "openclaw.json",
      content: JSON.stringify(config, null, 2),
    });
  } catch {
    // Non-fatal
  }
}

/* ── Avatar helpers ──────────────────────────────────────── */

/**
 * Check if an avatar value is a local filename (not a URL or data URI).
 */
export function isLocalAvatarFile(avatar: string): boolean {
  if (!avatar) return false;
  const t = avatar.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t) || /^data:/i.test(t) || t.startsWith("/")) return false;
  // Must look like a filename with an image extension
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(t);
}

/**
 * Read a local avatar file from an agent's workspace and return a data URI.
 * Returns null on failure.
 */
export async function readAvatarAsDataUri(
  agentId: string,
  fileName: string,
  workspaceFolder?: string
): Promise<string | null> {
  try {
    const folder = resolveAgentFolder(agentId, workspaceFolder);
    const relativePath = `${folder}/${fileName}`;
    const res = (await bridgeInvoke("read-openclaw-binary", {
      relativePath,
    })) as { success?: boolean; data?: string; mimeType?: string };
    if (!res?.success || !res.data) return null;
    const mime = res.mimeType || "image/png";
    return `data:${mime};base64,${res.data}`;
  } catch {
    return null;
  }
}

/**
 * Save an avatar image (from a data URI) to the agent's workspace folder.
 * Returns the relative filename (e.g. "avatar.png") on success, or null on failure.
 * The file is written as binary via `write-openclaw-binary`.
 */
export async function saveAvatarImage(
  agentId: string,
  dataUri: string,
  workspaceFolder?: string
): Promise<string | null> {
  try {
    // Parse data URI: "data:image/png;base64,iVBOR..."
    const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const b64 = match[2];
    const folder = resolveAgentFolder(agentId, workspaceFolder);
    const fileName = `avatar.${ext}`;
    const relativePath = `${folder}/${fileName}`;

    const res = (await bridgeInvoke("write-openclaw-binary", {
      relativePath,
      data: b64,
    })) as { success?: boolean };

    return res?.success ? fileName : null;
  } catch {
    return null;
  }
}

/* ── IDENTITY.md sync ────────────────────────────────────── */

export async function syncToIdentityMd(
  agentId: string,
  patch: {
    name?: string;
    role?: string;
    description?: string;
    department?: string;
    emoji?: string;
    avatar?: string;
    teammate?: string;
    teamLead?: string;
  },
  workspaceFolder?: string
): Promise<void> {
  const folder = resolveAgentFolder(agentId, workspaceFolder);
  const identityPath = `${folder}/IDENTITY.md`;
  try {
    const res = (await bridgeInvoke("get-openclaw-doc", {
      relativePath: identityPath,
    })) as { success?: boolean; content?: string | null };
    let content =
      res?.success && typeof res.content === "string" ? res.content : "";

    if (patch.name !== undefined) {
      content = updateIdentityField(content, "Name", patch.name);
    }
    if (patch.role !== undefined && patch.role.trim()) {
      content = updateIdentityField(content, "Role", patch.role);
    }
    if (patch.department !== undefined && patch.department.trim()) {
      content = updateIdentityField(content, "Department", patch.department);
    }
    if (patch.emoji !== undefined && patch.emoji.trim()) {
      content = updateIdentityField(content, "Emoji", patch.emoji);
    }
    if (patch.avatar !== undefined && patch.avatar.trim()) {
      const avatarUrl = toIdentityAvatarUrl(patch.avatar);
      if (avatarUrl) content = updateIdentityField(content, "Avatar", avatarUrl);
    }
    if (patch.teamLead !== undefined) {
      content = updateIdentityField(content, "TeamLead", patch.teamLead.trim() || "(none)");
    }
    if (patch.teammate !== undefined) {
      content = updateIdentityField(content, "Teammate", patch.teammate.trim() || "(none)");
    }
    if (patch.description !== undefined) {
      content = updateIdentityDescription(content, patch.description);
    }

    await bridgeInvoke("write-openclaw-doc", {
      relativePath: identityPath,
      content,
    });
  } catch {
    // Non-fatal — identity sync failure shouldn't block the main operation
  }
}

/* ── SOUL.md sync ───────────────────────────────────────── */

/**
 * Patch the name/description in an existing SOUL.md without touching the rest.
 *
 * SOUL.md layout (generated by onboardingSoulMD):
 *   ## {emoji} {name}
 *
 *   {description}
 *
 *   ## Tone
 *   ...
 *
 * Strategy: replace the first H2 heading text and the paragraph between it and
 * the next H2 heading. If the file is empty or doesn't follow this layout, skip.
 */
export function patchSoulContent(
  content: string,
  patch: { name?: string; emoji?: string; description?: string }
): string | null {
  if (!content.trim()) return null;

  // Find the first H2 line (identity header) and the next H2 line (e.g. ## Tone).
  const lines = content.split("\n");
  let headerIdx = -1;
  let nextSectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      if (headerIdx === -1) {
        headerIdx = i;
      } else {
        nextSectionIdx = i;
        break;
      }
    }
  }
  if (headerIdx === -1) return null;

  // Rebuild the header line if name or emoji changed.
  if (patch.name !== undefined || patch.emoji !== undefined) {
    const currentHeader = lines[headerIdx].replace(/^## /, "").trim();
    // Current format is "{emoji} {name}" or just "{name}"
    const parts = currentHeader.split(/\s+/);
    // Detect if first token looks like an emoji (single grapheme, non-ASCII)
    const hasEmoji = parts.length > 1 && /^\p{Emoji}/u.test(parts[0]);
    const currentEmoji = hasEmoji ? parts[0] : "";
    const currentName = hasEmoji ? parts.slice(1).join(" ") : currentHeader;

    const newEmoji = patch.emoji !== undefined ? patch.emoji.trim() : currentEmoji;
    const newName = patch.name !== undefined ? patch.name.trim() : currentName;
    lines[headerIdx] = newEmoji ? `## ${newEmoji} ${newName}` : `## ${newName}`;
  }

  // Replace the description block (everything between header and next section).
  if (patch.description !== undefined && nextSectionIdx !== -1) {
    const desc = patch.description.trim();
    const before = lines.slice(0, headerIdx + 1);
    const after = lines.slice(nextSectionIdx);
    return [...before, "", ...(desc ? [desc, ""] : [""]), ...after].join("\n");
  }

  return lines.join("\n");
}

/**
 * Read an agent's SOUL.md, apply name/description patches, and write it back.
 * Works for both OpenClaw (via get/write-openclaw-doc) and runtime agents
 * (via get/write-agent-identity-doc with fileName=SOUL.md).
 * Non-fatal — silently catches errors.
 */
export async function syncSoulMd(
  agentId: string,
  patch: { name?: string; emoji?: string; description?: string },
  opts?: { runtime?: string; workspaceFolder?: string }
): Promise<void> {
  try {
    const isOpenclaw = !opts?.runtime || opts.runtime === "openclaw";
    let content: string;

    if (isOpenclaw) {
      const folder = resolveAgentFolder(agentId, opts?.workspaceFolder);
      const soulPath = `${folder}/SOUL.md`;
      const res = (await bridgeInvoke("get-openclaw-doc", {
        relativePath: soulPath,
      })) as { success?: boolean; content?: string | null };
      content = res?.success && typeof res.content === "string" ? res.content : "";
    } else {
      const res = (await bridgeInvoke("get-agent-identity-doc", {
        runtime: opts.runtime,
        agentId,
        fileName: "SOUL.md",
      })) as { success?: boolean; content?: string | null };
      content = res?.success && typeof res.content === "string" ? res.content : "";
    }

    const patched = patchSoulContent(content, patch);
    if (patched === null) return; // No-op if SOUL.md is empty or unparseable

    if (isOpenclaw) {
      const folder = resolveAgentFolder(agentId, opts?.workspaceFolder);
      await bridgeInvoke("write-openclaw-doc", {
        relativePath: `${folder}/SOUL.md`,
        content: patched,
      });
    } else {
      await bridgeInvoke("write-agent-identity-doc", {
        runtime: opts!.runtime,
        agentId,
        fileName: "SOUL.md",
        content: patched,
      });
    }
  } catch {
    // Non-fatal
  }
}
