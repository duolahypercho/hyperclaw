"use client";

import React from "react";
import type { EnsembleAgent } from "../agents";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  resolveAvatarText,
} from "$/hooks/useAgentIdentity";
import {
  firstCharUpper,
  isNameInitialGlyph,
  normalizeRealAgentEmoji,
} from "./agent-avatar-utils";

interface AgentGlyphProps {
  agent: Pick<EnsembleAgent, "id" | "emoji" | "name"> & {
    kind?: EnsembleAgent["kind"];
    /** Real connector-backed agents should not render generated name initials as their avatar. */
    real?: boolean;
  };
  size?: number;
  className?: string;
  /**
   * Explicit avatar override. When provided, skips the identity lookup.
   * Accepts http(s) URL, data URI, or short emoji/initials.
   */
  avatar?: string;
}

/**
 * Agent avatar square. Prefers the real OpenClaw identity avatar (image) when
 * available, then the short text avatar (emoji / initials), then the seed emoji.
 */
export function AgentGlyph({ agent, size = 32, className = "", avatar }: AgentGlyphProps) {
  const seed = agent.name || agent.id;
  const avatarLooksGenerated = agent.real && isNameInitialGlyph(avatar, seed);
  // Real agents should follow the same identity path as the chat header; list
  // avatarData can be a stale generated initial or seed fallback.
  const identity = useAgentIdentity(agent.real || !avatar || avatarLooksGenerated ? agent.id : undefined);

  const rawAvatar = agent.real ? identity?.avatar ?? avatar : avatar ?? identity?.avatar;
  const imageUrl = resolveAvatarUrl(rawAvatar);
  const avatarText = resolveAvatarText(rawAvatar);
  const usableAvatarText = agent.real && isNameInitialGlyph(avatarText, seed) ? undefined : avatarText;
  const identityEmoji = agent.real
    ? normalizeRealAgentEmoji(identity?.emoji, seed)
    : identity?.emoji;
  const agentEmoji = agent.real
    ? normalizeRealAgentEmoji(agent.emoji, seed)
    : agent.emoji;
  const glyph = usableAvatarText || identityEmoji || agentEmoji || firstCharUpper(seed);

  const radius = Math.max(5, Math.round(size * 0.25));
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.45),
    borderRadius: radius,
  };

  if (imageUrl) {
    return (
      <div
        className={`ag-glyph ${agent.kind ?? "agent"} ${className}`}
        title={agent.name}
        style={{
          ...style,
          padding: 0,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={agent.name}
          width={size}
          height={size}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            borderRadius: radius,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`ag-glyph ${agent.kind ?? "agent"} ${className}`}
      title={agent.name}
      style={style}
    >
      {glyph}
    </div>
  );
}
