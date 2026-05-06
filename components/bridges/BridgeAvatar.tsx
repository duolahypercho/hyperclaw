"use client";

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { BridgeDef } from "./bridges-catalog";

interface BridgeAvatarProps {
  bridge: Pick<BridgeDef, "cat" | "logoDomain" | "name">;
  size?: "sm" | "lg";
}

const SIZE_CLASS: Record<NonNullable<BridgeAvatarProps["size"]>, string> = {
  sm: "w-6 h-6 rounded-md",
  lg: "w-10 h-10 rounded-md",
};

const FALLBACK_TEXT_CLASS: Record<NonNullable<BridgeAvatarProps["size"]>, string> = {
  sm: "text-[9.5px]",
  lg: "text-sm",
};

function bridgeInitials(name: string): string {
  return name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
}

function bridgeLogoUrl(domain: string | undefined): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function BridgeAvatar({ bridge, size = "sm" }: BridgeAvatarProps) {
  const logoUrl = useMemo(() => bridgeLogoUrl(bridge.logoDomain), [bridge.logoDomain]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [logoUrl]);

  if (logoUrl && !imageFailed) {
    return (
      <span
        className={cn(
          SIZE_CLASS[size],
          "grid place-items-center shrink-0 overflow-hidden border border-solid border-border bg-white p-0.5",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={`${bridge.name} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={bridge.name}
      className={cn(
        SIZE_CLASS[size],
        FALLBACK_TEXT_CLASS[size],
        "grid place-items-center shrink-0 font-mono font-bold border border-solid",
        bridge.cat === "AI models"
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border",
      )}
    >
      {bridgeInitials(bridge.name)}
    </span>
  );
}
