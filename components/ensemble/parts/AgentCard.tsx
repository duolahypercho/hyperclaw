"use client";

import React from "react";
import { AgentGlyph, StatusDot } from "../primitives";
import { formatUSD, formatTokens } from "../agents";
import { useAgentStatus, type LiveAgentRow } from "../hooks";

interface AgentCardProps {
  row: LiveAgentRow;
  variant?: "compact" | "full";
  onClick?: () => void;
}

/** Reusable agent roster card. Used on Home, Team, and Agent Profile pages. */
export function AgentCard({ row, variant = "full", onClick }: AgentCardProps) {
  const { state } = useAgentStatus(row.agent.id, { state: row.state });
  const showStateTag = state === "deleting" || state === "working" || state === "error";
  const isBlocked = state === "deleting";
  const isInteractive = !!onClick && !isBlocked;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };

  if (variant === "compact") {
    return (
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? (isBlocked ? -1 : 0) : undefined}
        aria-disabled={onClick ? isBlocked : undefined}
        className={`flex items-center gap-3 py-2 ${isBlocked ? "cursor-not-allowed opacity-60" : ""}`}
        onClick={isBlocked ? undefined : onClick}
        onKeyDown={handleKeyDown}
        style={!isBlocked && onClick ? { cursor: "pointer" } : undefined}
      >
        <AgentGlyph agent={row.agent} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{row.agent.name}</span>
            {showStateTag && <StatusDot state={state} label size="xs" className="h-5 px-2 text-[10px]" />}
          </div>
          <div className="ens-sub truncate">
            {row.agent.runtimeLabel} · {row.sessions} session{row.sessions === 1 ? "" : "s"}
          </div>
        </div>
        <div className="ens-mono" style={{ color: "var(--ink-4)" }}>{formatUSD(row.costMonth)}</div>
      </div>
    );
  }

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? (isBlocked ? -1 : 0) : undefined}
      aria-disabled={onClick ? isBlocked : undefined}
      className={`ens-agent-card ${isBlocked ? "cursor-not-allowed opacity-60" : ""}`}
      onClick={isBlocked ? undefined : onClick}
      onKeyDown={handleKeyDown}
    >
      {/* Glyph with status dot */}
      <div className="ens-agent-glyph-wrap relative">
        <AgentGlyph agent={row.agent} size={44} />
        <StatusDot state={state} size="sm" corner />
      </div>

      {/* Info */}
      <div>
        <div className="ens-agent-name flex items-center gap-2 min-w-0">
          <span className="truncate">{row.agent.name}</span>
          {showStateTag && <StatusDot state={state} label size="xs" className="h-5 px-2 text-[10px]" />}
          <span className="ens-agent-role truncate">· {row.agent.runtimeLabel} · {row.agent.department}</span>
        </div>
        <span className="ens-agent-role">{row.agent.title}</span>
        <div className="ens-agent-tagline">{row.agent.identity}</div>
        {/* Stats row */}
        <div className="ens-agent-meta">
          <div>
            <span className="mk">Bridge</span>
            <span className="mv">{row.agent.runtimeLabel}</span>
          </div>
          <div>
            <span className="mk">Sessions</span>
            <span className="mv">{row.sessions}</span>
          </div>
          <div>
            <span className="mk">Spend · mo</span>
            <span className="mv">{formatUSD(row.costMonth)}</span>
          </div>
          <div>
            <span className="mk">Tokens · mo</span>
            <span className="mv">{formatTokens(row.tokensMonth)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
