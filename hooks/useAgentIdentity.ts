"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  gatewayConnection,
  getGatewayConnectionState,
  subscribeGatewayConnection,
} from "$/lib/openclaw-gateway-ws";
import {
  isLocalAvatarFile,
  readAvatarAsDataUri,
  resolveAgentFolder,
  parseIdentityField,
} from "$/lib/identity-md";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

export interface AgentIdentity {
  agentId: string;
  name?: string;
  avatar?: string;
  emoji?: string;
}

// Module-level cache shared across all hook instances.
// Entries are kept until the gateway reconnects (new OpenClaw config may change avatars).
const identityCache = new Map<string, AgentIdentity>();
const inflight = new Map<string, Promise<AgentIdentity | null>>();

// --- Cache-update notification ---
// When any hook instance (or fetchIdentity) populates the cache, all active
// hook instances watching that agentId are notified so they can sync state.
type CacheListener = (agentId: string, identity: AgentIdentity) => void;
const cacheListeners = new Set<CacheListener>();
function notifyCacheUpdate(agentId: string, identity: AgentIdentity) {
  for (const cb of cacheListeners) cb(agentId, identity);
}

// Reset cache on reconnect
subscribeGatewayConnection(() => {
  const { connected } = getGatewayConnectionState();
  if (connected) {
    identityCache.clear();
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
  notifyCacheUpdate(agentId, updated);
}

async function fetchIdentity(agentId: string): Promise<AgentIdentity | null> {
  // Deduplicate concurrent requests for the same agent
  const existing = inflight.get(agentId);
  if (existing) return existing;

  const promise = gatewayConnection.getAgentIdentity({ agentId }).then(async (result) => {
    inflight.delete(agentId);
    if (result) {
      // If the avatar is a local filename (e.g. "avatar.png"), read it as a data URI
      if (result.avatar && isLocalAvatarFile(result.avatar)) {
        const dataUri = await readAvatarAsDataUri(agentId, result.avatar).catch(() => null);
        if (dataUri) result.avatar = dataUri;
      }

      // If the gateway didn't return avatar/emoji, try reading from IDENTITY.md via bridge
      if (!result.avatar || !result.emoji) {
        try {
          const folder = resolveAgentFolder(agentId);
          const res = (await bridgeInvoke("get-openclaw-doc", {
            relativePath: `${folder}/IDENTITY.md`,
          })) as { success?: boolean; content?: string | null };
          if (res?.success && typeof res.content === "string") {
            if (!result.avatar) {
              const avatarVal = parseIdentityField(res.content, "Avatar");
              if (avatarVal) {
                if (isLocalAvatarFile(avatarVal)) {
                  const dataUri = await readAvatarAsDataUri(agentId, avatarVal).catch(() => null);
                  if (dataUri) result.avatar = dataUri;
                } else {
                  result.avatar = avatarVal;
                }
              }
            }
            if (!result.emoji) {
              const emojiVal = parseIdentityField(res.content, "Emoji");
              if (emojiVal) result.emoji = emojiVal;
            }
          }
        } catch { /* non-fatal */ }
      }

      identityCache.set(agentId, result);
      notifyCacheUpdate(agentId, result);
    }
    return result;
  });
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

    // Return cached immediately
    const cached = identityCache.get(agentId);
    if (cached) {
      setIdentity(cached);
      return;
    }

    // Clear stale identity from previous agent while we fetch
    setIdentity(null);

    const { connected } = getGatewayConnectionState();
    if (!connected) return;

    fetchIdentity(agentId).then((result) => {
      if (lastAgentIdRef.current === agentId && result) {
        setIdentity(result);
      }
    });
  }, [agentId]);

  // Subscribe to cache updates from OTHER hook instances or late fetches.
  // This is the key fix: when the message-body hook fetches the identity,
  // the header hook (same agentId) gets notified and updates its state.
  useEffect(() => {
    const listener: CacheListener = (updatedAgentId, updatedIdentity) => {
      if (updatedAgentId === lastAgentIdRef.current) {
        setIdentity(updatedIdentity);
      }
    };
    cacheListeners.add(listener);
    return () => { cacheListeners.delete(listener); };
  }, []);

  // Re-fetch when gateway reconnects (or if it was already connected but the
  // first effect missed it due to mount timing).
  useEffect(() => {
    // Immediate check: if gateway is already connected and we have no identity,
    // the first effect may have skipped the fetch due to a timing gap.
    const { connected } = getGatewayConnectionState();
    if (connected && lastAgentIdRef.current && !identityCache.has(lastAgentIdRef.current)) {
      fetchIdentity(lastAgentIdRef.current).then((result) => {
        if (result && lastAgentIdRef.current) setIdentity(result);
      });
    }

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

    // Build initial map from cache
    const initial = new Map<string, AgentIdentity>();
    const uncached: string[] = [];
    for (const id of agentIds) {
      const cached = identityCache.get(id);
      if (cached) {
        initial.set(id, cached);
      } else {
        uncached.push(id);
      }
    }
    setIdentities(initial);

    if (uncached.length === 0) return;

    const { connected } = getGatewayConnectionState();
    if (!connected) return;

    Promise.all(uncached.map((id) => fetchIdentity(id))).then((results) => {
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

/** Default local gateway base URL for resolving relative avatar paths like /avatar/{agentId} */
const LOCAL_GATEWAY_BASE = "http://127.0.0.1:18789";

/**
 * Build an avatar URL for rendering.
 * OpenClaw returns avatars as:
 * - HTTP/HTTPS URL (remote image)
 * - /avatar/{agentId} (relative path served by local gateway)
 * - data:image/* (data URI)
 * - short text (emoji or initials)
 *
 * Relative paths are resolved against the local OpenClaw gateway (default 127.0.0.1:18789).
 */
export function resolveAvatarUrl(avatar: string | undefined, gatewayBaseUrl?: string): string | undefined {
  if (!avatar) return undefined;
  const trimmed = avatar.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    // Relative path (e.g. /avatar/main) — resolve against provided base or local gateway
    const base = (gatewayBaseUrl || LOCAL_GATEWAY_BASE).replace(/\/$/, "");
    return `${base}${trimmed}`;
  }
  // Non-URL text (emoji/initials)
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
