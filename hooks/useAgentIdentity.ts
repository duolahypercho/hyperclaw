"use client";

import { useState, useEffect, useRef } from "react";
import {
  getGatewayConnectionState,
  subscribeGatewayConnection,
} from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

export interface AgentIdentity {
  agentId: string;
  name?: string;
  avatar?: string;
  emoji?: string;
  runtime?: string;
}

// Module-level cache shared across all hook instances.
// Entries are kept until the gateway reconnects (new OpenClaw config may change avatars).
const identityCache = new Map<string, AgentIdentity>();
const inflight = new Map<string, Promise<AgentIdentity | null>>();

// --- localStorage persistence ---
const STORAGE_KEY = "agent-identity-cache";

function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Record<string, AgentIdentity>;
    for (const [id, identity] of Object.entries(entries)) {
      if (!identityCache.has(id)) {
        // Skip entries with empty avatar — they'll be re-fetched fresh.
        // An empty cached avatar would otherwise block the reconnect re-fetch
        // from running (since the ID would appear "cached").
        const clean: AgentIdentity = { ...identity };
        if (!clean.avatar) delete clean.avatar;
        identityCache.set(id, clean);
      }
    }
  } catch { /* ignore corrupt data */ }
}

function saveToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, AgentIdentity> = {};
    for (const [id, identity] of identityCache) {
      obj[id] = identity;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* storage full or unavailable */ }
}

// Load cached identities on module init
loadFromStorage();

// --- Cache-update notification ---
// When any hook instance (or fetchIdentity) populates the cache, all active
// hook instances watching that agentId are notified so they can sync state.
type CacheListener = (agentId: string, identity: AgentIdentity) => void;
const cacheListeners = new Set<CacheListener>();
function notifyCacheUpdate(agentId: string, identity: AgentIdentity) {
  for (const cb of cacheListeners) cb(agentId, identity);
}

// Reset cache on reconnect (but keep localStorage — it's the fallback)
subscribeGatewayConnection(() => {
  const { connected } = getGatewayConnectionState();
  if (connected) {
    identityCache.clear();
    loadFromStorage(); // reload persisted as baseline
    inflight.clear();
  }
});

/**
 * Imperatively update the identity cache for an agent and notify all listeners.
 * Use this after saving name/avatar/emoji so the UI reflects changes immediately
 * without waiting for a gateway re-fetch.
 */
export function patchIdentityCache(agentId: string, patch: Partial<AgentIdentity>) {
  const existing = identityCache.get(agentId);
  const updated: AgentIdentity = { ...(existing ?? { agentId }), ...patch, agentId };
  identityCache.set(agentId, updated);
  saveToStorage();
  notifyCacheUpdate(agentId, updated);
}

async function fetchIdentity(agentId: string): Promise<AgentIdentity | null> {
  // Deduplicate concurrent requests for the same agent
  const existing = inflight.get(agentId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = (await bridgeInvoke("get-agent-identity", { agentId })) as {
        success?: boolean;
        data?: { name?: string; avatarData?: string; emoji?: string; runtime?: string } | null;
      };
      if (!res?.success || !res.data) return null;
      // Preserve cached fields that DB doesn't have (e.g. file-based avatar converted
      // to a data URI by the editor, which isn't written back to SQLite avatar_data).
      const cached = identityCache.get(agentId);
      const identity: AgentIdentity = {
        agentId,
        name: res.data.name || cached?.name || undefined,
        avatar: res.data.avatarData || cached?.avatar || undefined,
        emoji: res.data.emoji || cached?.emoji || undefined,
        runtime: res.data.runtime || cached?.runtime || undefined,
      };
      identityCache.set(agentId, identity);
      saveToStorage();
      notifyCacheUpdate(agentId, identity);
      return identity;
    } finally {
      inflight.delete(agentId);
    }
  })();

  inflight.set(agentId, promise);
  return promise;
}

/**
 * Hook that fetches and caches agent identity (name, avatar, emoji) from OpenClaw.
 * Returns cached data immediately if available; fetches in background otherwise.
 * All hook instances watching the same agentId stay in sync via cache notifications.
 */
export function useAgentIdentity(agentId: string | undefined): AgentIdentity | null {
  const [identity, setIdentity] = useState<AgentIdentity | null>(
    agentId ? identityCache.get(agentId) ?? null : null
  );
  const lastAgentIdRef = useRef(agentId);

  useEffect(() => {
    lastAgentIdRef.current = agentId;
    if (!agentId) {
      setIdentity(null);
      return;
    }

    // Show cached data immediately (avoids blank flicker), but always
    // kick off a fresh fetch in the background so stale localStorage entries
    // (e.g. emoji missing before DB migration fix) get corrected.
    const cached = identityCache.get(agentId);
    if (cached) setIdentity(cached);
    else setIdentity(null);

    // bridgeInvoke goes through hub→connector, not OpenClaw — always fetch.
    // inflight map deduplicates concurrent requests for the same agentId.
    fetchIdentity(agentId).then((result) => {
      if (lastAgentIdRef.current === agentId && result) {
        setIdentity(result);
      }
    });
  }, [agentId]);

  // Subscribe to cache updates from OTHER hook instances or late fetches.
  useEffect(() => {
    const listener: CacheListener = (updatedAgentId, updatedIdentity) => {
      if (updatedAgentId === lastAgentIdRef.current) {
        setIdentity(updatedIdentity);
      }
    };
    cacheListeners.add(listener);
    return () => { cacheListeners.delete(listener); };
  }, []);

  // Re-fetch when gateway reconnects (clears the in-memory cache, so re-fetch
  // ensures we pick up any identity changes that happened while offline).
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      const { connected: isConnected } = getGatewayConnectionState();
      if (isConnected && lastAgentIdRef.current) {
        fetchIdentity(lastAgentIdRef.current).then((result) => {
          if (result) setIdentity(result);
        });
      }
    });
  }, []);

  return identity;
}

/**
 * Hook that fetches identities for multiple agents at once.
 * Returns a Map<agentId, AgentIdentity>.
 */
export function useAgentIdentities(agentIds: string[]): Map<string, AgentIdentity> {
  const [identities, setIdentities] = useState<Map<string, AgentIdentity>>(new Map());
  const prevIdsRef = useRef<string>("");

  useEffect(() => {
    const key = agentIds.join(",");
    if (key === prevIdsRef.current) return;
    prevIdsRef.current = key;

    if (agentIds.length === 0) {
      setIdentities(new Map());
      return;
    }

    // Show cached data immediately for instant render, then always re-fetch
    // all agents in background so stale localStorage entries get corrected.
    const initial = new Map<string, AgentIdentity>();
    for (const id of agentIds) {
      const cached = identityCache.get(id);
      if (cached) initial.set(id, cached);
    }
    setIdentities(initial);

    // Always fetch all — inflight map deduplicates concurrent requests.
    Promise.all(agentIds.map((id) => fetchIdentity(id))).then((results) => {
      if (prevIdsRef.current !== key) return; // stale
      setIdentities((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r) next.set(r.agentId, r);
        }
        return next;
      });
    });
  }, [agentIds]);

  // Subscribe to cache updates for watched agents
  useEffect(() => {
    const listener: CacheListener = (agentId, identity) => {
      if (agentIds.includes(agentId)) {
        setIdentities((prev) => {
          const next = new Map(prev);
          next.set(agentId, identity);
          return next;
        });
      }
    };
    cacheListeners.add(listener);
    return () => { cacheListeners.delete(listener); };
  }, [agentIds]);

  // Re-fetch ALL identities when the gateway connects (or reconnects).
  // The main fetch effect only runs when agentIds changes, so if the gateway
  // was offline at that point, or the connector restarted with new data (e.g.
  // an avatar file that was missing before), those identities need a fresh fetch.
  // We intentionally re-fetch even cached entries because the module-level
  // reconnect handler reloads localStorage as a baseline — stale cache entries
  // (e.g. avatar: "") would otherwise block re-fetching indefinitely.
  useEffect(() => {
    const agentIdsRef = { current: agentIds };
    agentIdsRef.current = agentIds;
    return subscribeGatewayConnection(() => {
      const { connected: isConnected } = getGatewayConnectionState();
      if (!isConnected) return;
      if (agentIdsRef.current.length === 0) return;
      // fetchIdentity calls notifyCacheUpdate on success → cache listener handles state update
      Promise.all(agentIdsRef.current.map(id => fetchIdentity(id)));
    });
  }, [agentIds]);

  return identities;
}

/**
 * Check whether an avatar value is an image URL (matches OpenClaw's isAvatarUrl).
 * HTTP/HTTPS URLs, data URIs, and relative paths (/avatar/...) are all "URLs".
 */
function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    value.startsWith("/") // Relative path served by gateway
  );
}

/**
 * Build an avatar URL for rendering.
 * OpenClaw returns avatars as:
 * - HTTP/HTTPS URL (remote image)
 * - data:image/* (data URI)
 * - /avatar/{agentId} (relative path — NOT directly usable through hub relay)
 * - short text (emoji or initials)
 *
 * Relative paths (e.g. /avatar/main) are NOT resolved to local gateway URLs because
 * in hub/connector mode the gateway HTTP endpoints aren't directly accessible.
 * The fetchIdentity pipeline reads avatar files through the connector as data URIs.
 */
export function resolveAvatarUrl(avatar: string | undefined, gatewayBaseUrl?: string): string | undefined {
  if (!avatar) return undefined;
  const trimmed = avatar.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed;
  }
  // Relative paths and non-URL text (emoji/initials) can't be displayed as image URLs.
  // If a gatewayBaseUrl is explicitly provided (direct local access), resolve against it.
  if (trimmed.startsWith("/") && gatewayBaseUrl) {
    const base = gatewayBaseUrl.replace(/\/$/, "");
    return `${base}${trimmed}`;
  }
  return undefined;
}

/**
 * Check if an avatar value is displayable text (emoji, initials, short string)
 * rather than a URL. Matches OpenClaw's logic: anything that isn't isAvatarUrl().
 */
export function isAvatarText(avatar: string | undefined): boolean {
  if (!avatar) return false;
  const trimmed = avatar.trim();
  if (!trimmed) return false;
  return !isAvatarUrl(trimmed);
}

/**
 * Extract a short displayable text (emoji or ≤2-char initials) from an avatar value.
 * Returns undefined for filenames (e.g. "clio.png"), paths, or anything that looks
 * like a filename rather than an emoji/initials — those should fall back to identity.emoji.
 */
export function resolveAvatarText(avatar: string | undefined): string | undefined {
  if (!isAvatarText(avatar)) return undefined;
  const v = avatar!.trim();
  // Exclude filenames and paths
  if (v.includes(".") || v.includes("/")) return undefined;
  return v;
}

// Invalidate identity cache when IDENTITY.md changes (hub event relayed via gateway WS).
if (typeof window !== "undefined") {
  window.addEventListener("openclaw-gateway-event", (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {};
    const { event, data } = detail;
    if (event === "agent.file.changed" && data?.fileKey === "IDENTITY" && data?.agentId) {
      const agentId = data.agentId;
      identityCache.delete(agentId);
      inflight.delete(agentId);
      // Re-fetch fresh identity immediately so the UI never goes blank.
      // fetchIdentity calls notifyCacheUpdate internally on success.
      fetchIdentity(agentId).then((result) => {
        if (result) notifyCacheUpdate(agentId, result);
      });
    }
  });
}
