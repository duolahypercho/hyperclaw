"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { patchIdentityCache } from "$/hooks/useAgentIdentity";
import {
  parseIdentityField,
  updateIdentityField,
  parseIdentityDescription,
  updateIdentityDescription,
  resolveAgentFolder,
  readOpenClawConfig,
  getAvailableModels,
  getAgentModel,
  saveAgentModel,
  saveAgentName,
  saveAvatarImage,
  isLocalAvatarFile,
  readAvatarAsDataUri,
  getAgentHeartbeat,
  saveAgentHeartbeat,
  syncSoulMd,
} from "$/lib/identity-md";

/* ── Constants ─────────────────────────────────────────── */

export const EMOJI_OPTIONS = [
  "🤖", "🦞", "💻", "🔍", "✍️", "🎨",
  "📊", "🧠", "⚡", "🚀", "🎯", "🔧",
  "🎧", "🧡", "🌙", "🛡️", "📝", "👁️",
];

/* ── Types ─────────────────────────────────────────────── */

export interface AgentIdentityEditorState {
  /* Loading */
  loading: boolean;

  /* Identity fields */
  name: string;
  setName: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;

  /* Avatar */
  avatarPath: string;
  setAvatarPath: (v: string) => void;
  /** Data URI from a new user upload (marks dirty) */
  avatarPreview: string | null;
  setAvatarPreview: (v: string | null) => void;
  /** Data URI loaded from existing file on disk (not dirty) */
  loadedAvatarUri: string | null;
  /** Best display URL: preview > loadedUri > gateway-resolved */
  displayAvatarSrc: string | undefined;
  /** Ref for the hidden file input */
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  /** Validated image upload handler */
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  /* Model */
  model: string;
  setModel: (v: string) => void;
  originalModel: string;
  availableModels: string[];

  /* Heartbeat (loaded alongside model) */
  hbModel: string;
  setHbModel: (v: string) => void;
  originalHbModel: string;
  hbEvery: string;
  setHbEvery: (v: string) => void;
  originalHbEvery: string;

  /* Runtime (read-only — set at agent creation) */
  runtime: string;

  /* Department / org chart */
  department: string;
  setDepartment: (v: string) => void;
  originalDepartment: string;
  departments: Array<{ id: string; name: string }>;
  orgNodeId: string | null;

  /* Dirty check */
  isDirty: boolean;

  /* Batch save — writes IDENTITY.md, openclaw.json, org node, identity cache */
  save: () => Promise<boolean>;
  saving: boolean;
  saved: boolean;

  /* Immediate-save helpers (for auto-save-on-blur patterns) */
  saveFieldNow: (field: string, value: string) => Promise<void>;
  saveModelNow: (modelId: string) => void;
  patchCacheNow: (patch: { name?: string; emoji?: string; avatar?: string; role?: string; description?: string }) => void;

  /** Raw IDENTITY.md content (for advanced use) */
  raw: string;
}

/* ── Hook ──────────────────────────────────────────────── */

export function useAgentIdentityEditor(
  agentId: string,
  opts?: {
    /** Fallback name from identity cache / gateway */
    identityName?: string;
    /** Fallback emoji from identity cache / gateway */
    identityEmoji?: string;
    /** Fallback avatar URL resolved from identity cache / gateway */
    identityAvatarUrl?: string | undefined;
    /** Workspace folder override */
    workspaceFolder?: string;
    /** Agent runtime — if non-OpenClaw, saves go to SQLite bridge, not IDENTITY.md */
    agentRuntime?: string;
  },
): AgentIdentityEditorState {
  const folder = resolveAgentFolder(agentId, opts?.workspaceFolder);
  const identityPath = `${folder}/IDENTITY.md`;

  /* ── State ─────────────────────────────────────── */
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [avatarPath, setAvatarPath] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loadedAvatarUri, setLoadedAvatarUri] = useState<string | null>(null);

  const [model, setModel] = useState("");
  const [originalModel, setOriginalModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const [hbModel, setHbModel] = useState("");
  const [originalHbModel, setOriginalHbModel] = useState("");
  const [hbEvery, setHbEvery] = useState("");
  const [originalHbEvery, setOriginalHbEvery] = useState("");

  const [runtime, setRuntime] = useState("");

  const [department, setDepartment] = useState("");
  const [originalDepartment, setOriginalDepartment] = useState("");
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [orgNodeId, setOrgNodeId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Load ───────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // 1. IDENTITY.md
    //    OpenClaw agents live in ~/.openclaw/{workspace}/IDENTITY.md.
    //    Runtime agents (hermes, claude-code, codex) live under their runtime home.
    //    Route via runtime-aware bridge so we actually reach ~/.hermes/IDENTITY.md
    //    instead of a nonexistent path inside the OpenClaw home.
    (async () => {
      try {
        const runtime = opts?.agentRuntime;
        const useRuntimeDoc = !!(runtime && runtime !== "openclaw");
        const res = useRuntimeDoc
          ? ((await bridgeInvoke("get-agent-identity-doc", {
              runtime,
              agentId,
              fileName: "IDENTITY.md",
            })) as { success?: boolean; content?: string | null })
          : ((await bridgeInvoke("get-openclaw-doc", {
              relativePath: identityPath,
            })) as { success?: boolean; content?: string | null });
        if (cancelled) return;
        const content =
          res?.success && typeof res.content === "string" ? res.content : "";
        setRaw(content);
        setName(parseIdentityField(content, "Name") || opts?.identityName || agentId);
        setRole(parseIdentityField(content, "Role") || "");
        setDescription(parseIdentityDescription(content));
        setEmoji(parseIdentityField(content, "Emoji") || opts?.identityEmoji || "🤖");
        setRuntime(parseIdentityField(content, "Runtime") || opts?.agentRuntime || "");
        const avatarVal = parseIdentityField(content, "Avatar") || "";
        setAvatarPath(avatarVal);
        setAvatarPreview(null);
        if (isLocalAvatarFile(avatarVal)) {
          readAvatarAsDataUri(agentId, avatarVal).then((uri) => {
            if (!cancelled && uri) {
              setLoadedAvatarUri(uri);
              // Push into the shared identity cache so StatusWidget / header
              // show the avatar without waiting for a separate bridge fetch.
              patchIdentityCache(agentId, { avatar: uri });
            }
          });
        } else {
          setLoadedAvatarUri(null);
        }
      } catch {
        if (!cancelled) {
          setRaw("");
          setName(opts?.identityName || agentId);
          setEmoji(opts?.identityEmoji || "🤖");
        }
      }
      if (!cancelled) setLoading(false);
    })();

    // 2. Models + heartbeat — source depends on runtime
    (async () => {
      const runtime = opts?.agentRuntime;
      try {
        if (runtime === "hermes") {
          const res = (await bridgeInvoke("list-models", {
            runtime: "hermes",
            agentId,
          })) as { models?: Array<{ id: string; label: string }> };
          if (cancelled) return;
          const modelList = (res?.models ?? []).map((m) => m.id).filter(Boolean);
          setAvailableModels(modelList);
          const defaultModel = modelList[0] ?? "";
          if (defaultModel) {
            setModel(defaultModel);
            setOriginalModel(defaultModel);
          }
        } else if (runtime === "claude-code") {
          if (cancelled) return;
          setAvailableModels([
            "claude-opus-4-6",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
          ]);
        } else if (runtime === "codex") {
          if (cancelled) return;
          // Codex handles model selection internally — nothing to show
          setAvailableModels([]);
        } else {
          // OpenClaw: read from openclaw.json
          const config = await readOpenClawConfig();
          if (cancelled || !config) return;
          setAvailableModels(getAvailableModels(config));
          const m = getAgentModel(config, agentId);
          setModel(m);
          setOriginalModel(m);
          const hb = getAgentHeartbeat(config, agentId);
          setHbModel(hb.model);
          setOriginalHbModel(hb.model);
          setHbEvery(hb.every);
          setOriginalHbEvery(hb.every);
        }
      } catch { /* */ }
    })();

    // 3. Org chart (department)
    (async () => {
      try {
        const res = (await bridgeInvoke("get-org-status", {})) as {
          success?: boolean;
          departments?: Array<{ id: string; name: string; color: string }>;
          nodes?: Array<{ id: string; agentId: string; department?: string }>;
        };
        if (cancelled) return;
        if (res?.departments) setDepartments(res.departments);
        const node = res?.nodes?.find((n) => n.agentId === agentId);
        if (node) {
          setOrgNodeId(node.id);
          setDepartment(node.department || "");
          setOriginalDepartment(node.department || "");
        }
      } catch { /* */ }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, opts?.agentRuntime]);

  /* ── Display avatar ─────────────────────────────── */
  const displayAvatarSrc = avatarPreview || loadedAvatarUri || opts?.identityAvatarUrl;

  /* ── Image upload handler ───────────────────────── */
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 512_000) {
      alert("Image must be under 500KB. Please resize or compress it first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setAvatarPreview(dataUri);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  /* ── Dirty check ────────────────────────────────── */
  const isDirty = !loading && (() => {
    const origName = parseIdentityField(raw, "Name") || opts?.identityName || agentId;
    const origRole = parseIdentityField(raw, "Role") || "";
    const origDesc = parseIdentityDescription(raw);
    const origEmoji = parseIdentityField(raw, "Emoji") || opts?.identityEmoji || "🤖";
    const origAvatar = parseIdentityField(raw, "Avatar") || "";
    return (
      name !== origName ||
      role !== origRole ||
      description !== origDesc ||
      emoji !== origEmoji ||
      avatarPath !== origAvatar ||
      avatarPreview !== null ||
      model !== originalModel ||
      hbModel !== originalHbModel ||
      hbEvery !== originalHbEvery ||
      department !== originalDepartment
    );
  })();

  /* ── Batch save ─────────────────────────────────── */
  const isRuntimeAgent = !!(opts?.agentRuntime && opts.agentRuntime !== "openclaw");

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaved(false);
    try {
      // Non-OpenClaw runtime agents (claude-code, codex, hermes) don't have
      // IDENTITY.md in the OpenClaw workspace. Save name/emoji/avatar to SQLite
      // and description/role to the runtime's IDENTITY.md on disk.
      if (isRuntimeAgent) {
        const avatarData = avatarPreview || loadedAvatarUri || undefined;
        const res = (await bridgeInvoke("update-agent-identity", {
          agentId,
          name,
          emoji,
          role,
          description,
          runtime: opts?.agentRuntime,
          ...(avatarData ? { avatarData } : {}),
        })) as { success?: boolean };
        if (!res?.success) { setSaving(false); return false; }

        // Persist description/role/name back to the runtime's IDENTITY.md so
        // onboarding-provisioned content and subsequent edits stay in sync.
        try {
          let content = raw || "";
          content = updateIdentityField(content, "Name", name);
          if (role.trim()) content = updateIdentityField(content, "Role", role);
          content = updateIdentityField(content, "Emoji", emoji);
          content = updateIdentityDescription(content, description);
          await bridgeInvoke("write-agent-identity-doc", {
            runtime: opts?.agentRuntime,
            agentId,
            fileName: "IDENTITY.md",
            content,
          });
          setRaw(content);
        } catch { /* non-fatal — SQLite copy still saved */ }

        patchIdentityCache(agentId, {
          name,
          emoji,
          role,
          description,
          ...(avatarData ? { avatar: avatarData } : {}),
        });
        if (avatarPreview) setLoadedAvatarUri(avatarPreview);
        setAvatarPreview(null);
        // Save model back to Hermes profile config.yaml
        if (opts?.agentRuntime === "hermes" && model !== originalModel && model && model !== "__default__") {
          const profileId = agentId.replace(/^hermes:/, "");
          if (typeof window !== "undefined") {
            await window.electronAPI?.hermes?.saveProfileModel(profileId, model).catch(() => {});
          }
          setOriginalModel(model);
        }
        // Keep SQLite agents.config in sync so DB readers (widgets, diagnostics)
        // can reliably find description/role/runtime metadata after onboarding.
        try {
          const configPatch: Record<string, unknown> = {
            description,
            role,
            runtime: opts?.agentRuntime || runtime || "",
          };
          if (model && model !== "__default__") configPatch.mainModel = model;
          await bridgeInvoke("update-agent-config", {
            agentId,
            config: configPatch,
          });
        } catch { /* non-fatal */ }
        // Keep SOUL.md name/description in sync with IDENTITY.md edits.
        syncSoulMd(agentId, { name, emoji, description }, { runtime: opts?.agentRuntime });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        setSaving(false);
        return true;
      }

      let content = raw || "";
      content = updateIdentityField(content, "Name", name);
      if (role.trim()) content = updateIdentityField(content, "Role", role);
      if (department.trim()) {
        const deptLabel = departments.find((d) => d.id === department)?.name || department;
        content = updateIdentityField(content, "Department", deptLabel);
      }
      content = updateIdentityField(content, "Emoji", emoji);

      // Save avatar image file if user uploaded
      let avatarValue = avatarPath;
      if (avatarPreview) {
        const savedName = await saveAvatarImage(agentId, avatarPreview);
        if (savedName) avatarValue = savedName;
      }
      content = updateIdentityField(content, "Avatar", avatarValue);
      content = updateIdentityDescription(content, description);

      const res = (await bridgeInvoke("write-openclaw-doc", {
        relativePath: identityPath,
        content,
      })) as { success?: boolean };

      if (!res?.success) {
        setSaving(false);
        return false;
      }

      setRaw(content);
      setAvatarPath(avatarValue);
      patchIdentityCache(agentId, {
        name,
        emoji,
        role,
        description,
        avatar: avatarPreview || loadedAvatarUri || avatarValue,
      });
      if (avatarPreview) setLoadedAvatarUri(avatarPreview);
      setAvatarPreview(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // Save model to openclaw.json
      if (model !== originalModel) {
        await saveAgentModel(agentId, model);
        setOriginalModel(model === "__default__" ? "" : model);
      }

      // Keep SQLite config metadata aligned with the identity editor values.
      // This ensures downstream DB reads include description/role/runtime.
      try {
        const configPatch: Record<string, unknown> = {
          description,
          role,
          runtime: "openclaw",
        };
        if (model && model !== "__default__") configPatch.mainModel = model;
        await bridgeInvoke("update-agent-config", {
          agentId,
          config: configPatch,
        });
      } catch { /* non-fatal */ }

      // Keep SOUL.md name/description in sync with IDENTITY.md edits.
      syncSoulMd(agentId, { name, emoji, description }, { runtime: "openclaw" });

      // Save heartbeat
      if (hbModel !== originalHbModel || hbEvery !== originalHbEvery) {
        await saveAgentHeartbeat(agentId, { model: hbModel, every: hbEvery });
        setOriginalHbModel(hbModel === "__default__" ? "" : hbModel);
        setOriginalHbEvery(hbEvery);
      }

      // Save name to openclaw.json + org chart
      const origName = parseIdentityField(raw || "", "Name") || opts?.identityName || agentId;
      if (name !== origName) {
        await saveAgentName(agentId, name);
        if (orgNodeId) {
          await bridgeInvoke("update-org-node", {
            nodeId: orgNodeId,
            patch: { name },
          });
        }
      }

      // Save department to org chart
      if (department !== originalDepartment && orgNodeId) {
        await bridgeInvoke("update-org-node", {
          nodeId: orgNodeId,
          patch: { department: department || undefined },
        });
        setOriginalDepartment(department);
      }

      setSaving(false);
      return true;
    } catch {
      setSaving(false);
      return false;
    }
  }, [
    isRuntimeAgent, raw, name, role, description, emoji, avatarPath, avatarPreview,
    loadedAvatarUri, identityPath, model, originalModel, agentId,
    hbModel, originalHbModel, hbEvery, originalHbEvery,
    runtime, department, originalDepartment, orgNodeId, departments,
    opts?.identityName,
    opts?.agentRuntime,
  ]);

  /* ── Immediate-save helpers (for auto-save patterns) ── */

  /** Write a single IDENTITY.md field immediately. Re-reads the file first for safety. */
  const saveFieldNow = useCallback(
    async (field: string, value: string) => {
      try {
        const res = (await bridgeInvoke("get-openclaw-doc", {
          relativePath: identityPath,
        })) as { success?: boolean; content?: string | null };
        let content =
          res?.success && typeof res.content === "string" ? res.content : raw;
        content = updateIdentityField(content, field, value);
        await bridgeInvoke("write-openclaw-doc", {
          relativePath: identityPath,
          content,
        });
        setRaw(content);
      } catch { /* */ }
    },
    [identityPath, raw],
  );

  /** Save model to openclaw.json immediately. */
  const saveModelNow = useCallback(
    (modelId: string) => {
      setModel(modelId);
      setOriginalModel(modelId === "__default__" ? "" : modelId);
      saveAgentModel(agentId, modelId).catch(() => {});
    },
    [agentId],
  );

  /** Patch the identity cache immediately (for instant UI updates). */
  const patchCacheNow = useCallback(
    (patch: { name?: string; emoji?: string; avatar?: string; role?: string; description?: string }) => {
      patchIdentityCache(agentId, patch);
    },
    [agentId],
  );

  return {
    loading,
    name, setName,
    role, setRole,
    description, setDescription,
    emoji, setEmoji,
    avatarPath, setAvatarPath,
    avatarPreview, setAvatarPreview,
    loadedAvatarUri,
    displayAvatarSrc,
    fileInputRef,
    handleImageUpload,
    model, setModel,
    originalModel,
    availableModels,
    hbModel, setHbModel,
    originalHbModel,
    hbEvery, setHbEvery,
    originalHbEvery,
    runtime,
    department, setDepartment,
    originalDepartment,
    departments,
    orgNodeId,
    isDirty: !!isDirty,
    save, saving, saved,
    saveFieldNow,
    saveModelNow,
    patchCacheNow,
    raw,
  };
}
