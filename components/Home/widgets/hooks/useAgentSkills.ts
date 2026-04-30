/**
 * useAgentSkills — offline-first skill store.
 *
 * Bridge (connector SQLite) is the source of truth.
 * localStorage is a read cache for instant first paint.
 * Mutations are optimistic: update local immediately, push to bridge async.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/* ── Types ─────────────────────────────────────────────────── */

export interface AgentSkill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  source: string;
  description?: string;
  filePath?: string;
  cloudId?: string;
  author?: string;
  version?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

/* ── Cache: one read, one write ────────────────────────────── */

const KEY = (id: string) => `hc-agent-skills:${id}`;

function cache(agentId: string): AgentSkill[] {
  try {
    const raw = localStorage.getItem(KEY(agentId));
    return raw ? (JSON.parse(raw) as AgentSkill[]) : [];
  } catch {
    return [];
  }
}

function setCache(agentId: string, skills: AgentSkill[]) {
  try {
    localStorage.setItem(KEY(agentId), JSON.stringify(skills));
  } catch { /* full */ }
}

/* ── Response unwrapping ───────────────────────────────────── */

/** Bridge response can be a raw array, {data: [...]}, or {success: false, error} */
function extractArray(raw: unknown): AgentSkill[] | null {
  if (Array.isArray(raw)) return raw as AgentSkill[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.success === false) return null; // error envelope
    if (Array.isArray(obj.data)) return obj.data as AgentSkill[];
    if (Array.isArray(obj.result)) return obj.result as AgentSkill[];
    if (Array.isArray(obj.skills)) return obj.skills as AgentSkill[];
  }
  return null;
}

/** Bridge add response can be the skill object or wrapped */
function extractSkill(raw: unknown): AgentSkill | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id === "string") return obj as unknown as AgentSkill;
  if (obj.data && typeof obj.data === "object" && typeof (obj.data as Record<string, unknown>).id === "string") {
    return obj.data as unknown as AgentSkill;
  }
  return null;
}

/* ── Hook ──────────────────────────────────────────────────── */

export function useAgentSkills(agentId: string) {
  const [skills, setSkills] = useState<AgentSkill[]>(() => cache(agentId));
  const [syncing, setSyncing] = useState(false);
  const [bridgeOk, setBridgeOk] = useState(true);
  const alive = useRef(true);
  const aid = useRef(agentId);
  aid.current = agentId;

  // Write state + cache in one shot
  const put = useCallback(
    (next: AgentSkill[]) => {
      setSkills(next);
      setCache(agentId, next);
    },
    [agentId],
  );

  // ── Fetch from bridge, replace cache ──
  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const raw = await bridgeInvoke("agent-skill-list", { agentId });
      if (!alive.current || aid.current !== agentId) return;

      // Response can be: raw array, {data: [...]}, or {success: false, error: "..."}
      const arr = extractArray(raw);
      if (arr) {
        // Merge: bridge skills + any local-only runtime skills (system/hermes/etc.)
        // Runtime-discovered skills are only in cache, never in SQLite.
        const bridgeIds = new Set(arr.map((s) => s.id));
        const localRuntime = cache(agentId).filter(
          (s) => !bridgeIds.has(s.id) && s.source !== "custom" && s.source !== "cloud",
        );
        put([...arr, ...localRuntime]);
        setBridgeOk(true);
      } else {
        // Bridge doesn't support agent-skill-list (old connector) — keep cache, work offline
        setBridgeOk(false);
      }
    } catch {
      // Connector unreachable or action not supported — degrade gracefully
      if (alive.current) setBridgeOk(false);
    }
    if (alive.current) setSyncing(false);
  }, [agentId, put]);

  useEffect(() => {
    alive.current = true;
    setSkills(cache(agentId));
    refresh();
    return () => { alive.current = false; };
  }, [agentId, refresh]);

  // ── Mutations: optimistic local + bridge fire-and-forget ──

  const add = useCallback(
    (name: string, content: string, source = "custom") => {
      const tempId = `local-${Date.now()}`;
      const skill: AgentSkill = {
        id: tempId, name, content, enabled: true, source,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      put([...skills, skill]);

      if (bridgeOk) {
        bridgeInvoke("agent-skill-add", {
          agentId, name, description: "", content, source,
          cloudId: "", author: "", version: "", tags: [],
        }).then((raw) => {
          const created = extractSkill(raw);
          if (alive.current && aid.current === agentId && created) {
            setSkills((prev) => {
              const next = prev.map((s) => (s.id === tempId ? created : s));
              setCache(agentId, next);
              return next;
            });
          }
        }).catch(() => {});
      }
    },
    [agentId, skills, bridgeOk, put],
  );

  const update = useCallback(
    (id: string, name: string, content: string) => {
      put(skills.map((s) => (s.id === id ? { ...s, name, content, updatedAt: Date.now() } : s)));
      if (bridgeOk) bridgeInvoke("agent-skill-update", { id, name, description: "", content, tags: [] }).catch(() => {});
    },
    [agentId, skills, bridgeOk, put],
  );

  const toggle = useCallback(
    (id: string) => {
      const skill = skills.find((s) => s.id === id);
      if (!skill) return;
      const enabled = !skill.enabled;
      put(skills.map((s) => (s.id === id ? { ...s, enabled, updatedAt: Date.now() } : s)));
      if (bridgeOk) bridgeInvoke("agent-skill-toggle", { id, enabled }).catch(() => {});
    },
    [skills, bridgeOk, put],
  );

  const remove = useCallback(
    (id: string) => {
      put(skills.filter((s) => s.id !== id));
      if (bridgeOk) bridgeInvoke("agent-skill-delete", { id }).catch(() => {});
    },
    [skills, bridgeOk, put],
  );

  /** Insert-or-update a runtime-discovered skill (system/hermes/openclaw/codex).
   *  Only touches local state + cache — these aren't pushed to SQLite. */
  const upsert = useCallback(
    (skill: AgentSkill) => {
      setSkills((prev) => {
        const idx = prev.findIndex((s) => s.id === skill.id);
        const next = idx >= 0
          ? prev.map((s, i) => (i === idx ? { ...s, ...skill } : s))
          : [...prev, skill];
        setCache(agentId, next);
        return next;
      });
    },
    [agentId],
  );

  return { skills, syncing, bridgeOk, add, update, toggle, remove, upsert, refresh };
}

/* ── Standalone helper for non-hook contexts ───────────────── */

export function getActiveSkillsContent(agentId: string): string {
  const skills = cache(agentId).filter((s) => s.enabled && s.content.trim());
  if (skills.length === 0) return "";
  return skills
    .map((s) => `## Skill: ${s.name}\n\n${s.content.trim()}`)
    .join("\n\n---\n\n");
}
