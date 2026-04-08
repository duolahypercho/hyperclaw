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

  /* Runtime */
  runtime: string;
  setRuntime: (v: string) => void;

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
  patchCacheNow: (patch: { name?: string; emoji?: string; avatar?: string }) => void;

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
    (async () => {
      try {
        const res = (await bridgeInvoke("get-openclaw-doc", {
          relativePath: identityPath,
        })) as { success?: boolean; content?: string | null };
        if (cancelled) return;
        const content =
          res?.success && typeof res.content === "string" ? res.content : "";
        setRaw(content);
        setName(parseIdentityField(content, "Name") || opts?.identityName || agentId);
        setRole(parseIdentityField(content, "Role") || "");
        setDescription(parseIdentityDescription(content));
        setEmoji(parseIdentityField(content, "Emoji") || opts?.identityEmoji || "🤖");
        setRuntime(parseIdentityField(content, "Runtime") || "");
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

    // 2. openclaw.json (model + heartbeat)
    (async () => {
      try {
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
  }, [agentId]);

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
    const origRuntime = parseIdentityField(raw, "Runtime") || "";
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
      department !== originalDepartment ||
      runtime !== origRuntime
    );
  })();

  /* ── Batch save ─────────────────────────────────── */
  const isRuntimeAgent = !!(opts?.agentRuntime && opts.agentRuntime !== "openclaw");

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaved(false);
    try {
      // Non-OpenClaw runtime agents (claude-code, codex, hermes) don't have
      // IDENTITY.md in the OpenClaw workspace. Save directly to SQLite instead.
      if (isRuntimeAgent) {
        const avatarData = avatarPreview || loadedAvatarUri || undefined;
        const res = (await bridgeInvoke("update-agent-identity", {
          agentId,
          name,
          emoji,
          ...(avatarData ? { avatarData } : {}),
        })) as { success?: boolean };
        if (!res?.success) { setSaving(false); return false; }
        patchIdentityCache(agentId, { name, emoji, ...(avatarData ? { avatar: avatarData } : {}) });
        if (avatarPreview) setLoadedAvatarUri(avatarPreview);
        setAvatarPreview(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        setSaving(false);
        return true;
      }

      let content = raw || "";
      content = updateIdentityField(content, "Name", name);
      if (role.trim()) content = updateIdentityField(content, "Role", role);
      if (runtime.trim()) content = updateIdentityField(content, "Runtime", runtime);
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
    (patch: { name?: string; emoji?: string; avatar?: string }) => {
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
    runtime, setRuntime,
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
