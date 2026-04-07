"use client";

import React, { useState } from "react";
import { useTokenUsage, type TokenUsageSummary } from "$/hooks/useTokenUsage";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface Props {
  defaultAgentId?: string;
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function AnalysisTab({ defaultAgentId: _defaultAgentId }: Props) {
  const [groupBy, setGroupBy] = useState<"agent" | "runtime">("agent");
  const [rangeDays, setRangeDays] = useState(30);

  const now = Date.now();
  const from = now - rangeDays * 24 * 60 * 60 * 1000;

  const { data, loading, error, totalCost, totalInput, totalOutput } = useTokenUsage({
    from,
    to: now,
    groupBy,
  });

  const maxCost = data.reduce((m, r) => Math.max(m, r.totalCostUsd), 0);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-xs">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                rangeDays === r.days
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["agent", "runtime"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors",
                groupBy === g
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Cost", value: fmtCost(totalCost), color: "text-yellow-400" },
          { label: "Input", value: fmt(totalInput), color: "text-blue-400" },
          { label: "Output", value: fmt(totalOutput), color: "text-pink-400" },
        ].map((s) => (
          <div key={s.label} className="bg-muted/30 rounded-lg p-2.5">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">
              {s.label}
            </div>
            <div className={cn("text-sm font-bold", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Rows */}
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <p className="text-destructive text-[10px]">{error}</p>}
      {!loading && !error && data.length === 0 && (
        <p className="text-muted-foreground text-center py-6 text-[11px]">
          No usage data yet
        </p>
      )}
      {!loading &&
        data.map((row: TokenUsageSummary) => (
          <div key={row.groupKey} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-medium truncate max-w-[60%]">
                {row.groupKey || "Unattributed"}
              </span>
              <span className="text-yellow-400 font-mono font-semibold">
                {fmtCost(row.totalCostUsd)}
              </span>
            </div>
            <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full transition-all duration-500"
                style={{
                  width: maxCost > 0 ? `${(row.totalCostUsd / maxCost) * 100}%` : "0%",
                }}
              />
            </div>
            <div className="flex gap-3 text-[9px] text-muted-foreground">
              <span className="text-blue-400/70">{fmt(row.inputTokens)} in</span>
              <span className="text-pink-400/70">{fmt(row.outputTokens)} out</span>
            </div>
          </div>
        ))}
    </div>
  );
}
