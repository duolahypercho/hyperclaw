"use client";

import React from "react";
import type { EnsembleAgent } from "../agents";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  resolveAvatarText,
} from "$/hooks/useAgentIdentity";

interface AgentGlyphProps {
  agent: Pick<EnsembleAgent, "id" | "emoji" | "name"> & { kind?: EnsembleAgent["kind"] };
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
  // Only look up identity when no explicit avatar override is given — avoids
  // extra bridge calls on cards that already know the value.
  const identity = useAgentIdentity(avatar ? undefined : agent.id);

  const rawAvatar = avatar ?? identity?.avatar;
  const imageUrl = resolveAvatarUrl(rawAvatar);
  const avatarText = resolveAvatarText(rawAvatar);

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

  const glyph = avatarText || identity?.emoji || agent.emoji;
  return (
    <div className={`ag-glyph ${agent.kind ?? "agent"} ${className}`} style={style}>
      {glyph}
    </div>
  );
}
