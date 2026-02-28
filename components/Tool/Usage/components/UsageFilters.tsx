"use client";

import React from "react";
import { RefreshCw, Download, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useUsage } from "../provider/usageProvider";
import { useUsageFiltered } from "../hooks/useUsageFiltered";
import {
  addQueryToken,
  removeQueryToken,
  setQueryTokensForKey,
  applySuggestionToQuery,
  buildSessionsCsv,
  buildDailyCsv,
  downloadTextFile,
} from "../lib/usage-query";
import { normalizeQueryText } from "../lib/usage-helpers";
import type { SessionsUsageEntry } from "$/lib/openclaw-gateway-ws";
import type { GatewayUsageDaily } from "$/lib/openclaw-gateway-ws";

const DATE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(c: number): string {
  return c < 0.01 && c > 0 ? c.toFixed(4) : c.toFixed(2);
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function UsageFilters() {
  const ctx = useUsage();
  const {
    filteredSessions,
    filteredDaily,
    displayTotals,
    displaySessionCount,
    totalSessions,
    queryWarnings,
    queryTerms,
    querySuggestions,
    hasQuery,
    agentOptions,
    channelOptions,
    providerOptions,
    modelOptions,
    toolOptions,
    selectedValuesFor,
  } = useUsageFiltered(ctx);

  const hasDraftQuery = ctx.queryDraft.trim().length > 0;
  const isEmpty = !ctx.loading && !displayTotals && (ctx.sessionsUsage?.sessions?.length ?? 0) === 0;

  const exportStamp = formatIsoDate(new Date());

  const handleExportSessionsCsv = () => {
    downloadTextFile(
      `openclaw-usage-sessions-${exportStamp}.csv`,
      buildSessionsCsv(filteredSessions as SessionsUsageEntry[]),
      "text/csv"
    );
  };
  const handleExportDailyCsv = () => {
    downloadTextFile(
      `openclaw-usage-daily-${exportStamp}.csv`,
      buildDailyCsv(filteredDaily as GatewayUsageDaily[]),
      "text/csv"
    );
  };
  const handleExportJson = () => {
    downloadTextFile(
      `openclaw-usage-${exportStamp}.json`,
      JSON.stringify(
        {
          totals: displayTotals,
          sessions: filteredSessions,
          daily: filteredDaily,
        },
        null,
        2
      ),
      "application/json"
    );
  };

  const hasFilters =
    ctx.selectedDays.length > 0 ||
    ctx.selectedHours.length > 0 ||
    ctx.selectedSessions.length > 0;

  const sessionsLabel =
    ctx.selectedSessions.length === 1
      ? (() => {
          const s = ctx.sessionsUsage?.sessions?.find(
            (x) => x.key === ctx.selectedSessions[0]
          );
          const name = s?.label ?? s?.key ?? ctx.selectedSessions[0];
          return name.length > 20 ? name.slice(0, 20) + "…" : name;
        })()
      : `${ctx.selectedSessions.length} sessions`;
  const daysLabel =
    ctx.selectedDays.length === 1
      ? ctx.selectedDays[0]
      : `${ctx.selectedDays.length} days`;
  const hoursLabel =
    ctx.selectedHours.length === 1
      ? `${ctx.selectedHours[0]}:00`
      : `${ctx.selectedHours.length} hours`;

  const renderFilterSelect = (
    key: string,
    label: string,
    options: string[]
  ) => {
    if (options.length === 0) return null;
    const selected = selectedValuesFor(key);
    const selectedSet = new Set(selected.map((v) => normalizeQueryText(v)));
    const allSelected =
      options.length > 0 &&
      options.every((v) => selectedSet.has(normalizeQueryText(v)));
    const selectedCount = selected.length;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            {label}
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">
              {selectedCount > 0 ? selectedCount : "All"}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="flex gap-2 mb-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={allSelected}
              onClick={() =>
                ctx.setQueryDraft(
                  setQueryTokensForKey(ctx.queryDraft, key, options)
                )
              }
            >
              Select All
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={selectedCount === 0}
              onClick={() =>
                ctx.setQueryDraft(setQueryTokensForKey(ctx.queryDraft, key, []))
              }
            >
              Clear
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 customScrollbar2">
            {options.map((value) => {
              const checked = selectedSet.has(normalizeQueryText(value));
              return (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(checked) => {
                      const token = `${key}:${value}`;
                      ctx.setQueryDraft(
                        checked
                          ? addQueryToken(ctx.queryDraft, token)
                          : removeQueryToken(ctx.queryDraft, token)
                      );
                    }}
                  />
                  <span className="truncate">{value}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Filters</span>
            {ctx.loading && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading
              </Badge>
            )}
            {isEmpty && (
              <span className="text-xs text-muted-foreground">
                Select a date range and click Refresh to load usage.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {displayTotals && (
              <>
                <Badge variant="outline">
                  <span className="font-medium mr-1">{formatTokens(displayTotals.totalTokens)}</span>
                  <span className="text-xs text-muted-foreground">
                    {" tokens"}
                  </span>
                </Badge>
                <Badge variant="outline">
                  <span className="font-medium mr-1">${formatCost(displayTotals.totalCost)}</span>
                  <span className="text-xs text-muted-foreground">
                    {" cost"}
                  </span>
                </Badge>
                <Badge variant="outline">
                  <span className="font-medium mr-1">{displaySessionCount}</span>
                  <span className="text-xs text-muted-foreground">
                    {" session"}
                    {displaySessionCount !== 1 ? "s" : ""}
                  </span>
                </Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chips + presets + dates | Tokens/Cost + Refresh + Export */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {hasFilters && (
            <>
              {ctx.selectedDays.length > 0 && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  Days: {daysLabel}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={ctx.onClearDays}
                    aria-label="Clear days"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {ctx.selectedHours.length > 0 && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  Hours: {hoursLabel}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={ctx.onClearHours}
                    aria-label="Clear hours"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {ctx.selectedSessions.length > 0 && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  Session: {sessionsLabel}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={ctx.onClearSessions}
                    aria-label="Clear sessions"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {(ctx.selectedDays.length > 0 ||
                ctx.selectedHours.length > 0) &&
                ctx.selectedSessions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={ctx.onClearFilters}
                  >
                    Clear All
                  </Button>
                )}
            </>
          )}
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => ctx.applyPreset(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
          <Input
            type="date"
            value={ctx.startDate}
            title="Start date"
            className="h-8 w-36"
            onChange={(e) => ctx.setStartDate(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={ctx.endDate}
            title="End date"
            className="h-8 w-36"
            onChange={(e) => ctx.setEndDate(e.target.value)}
          />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Tabs
              value={ctx.chartMode}
              onValueChange={(v) => ctx.setChartMode(v as "tokens" | "cost")}
            >
              <TabsList className="h-8">
                <TabsTrigger value="tokens" className="text-xs px-2">
                  Tokens
                </TabsTrigger>
                <TabsTrigger value="cost" className="text-xs px-2">
                  Cost
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              size="sm"
              onClick={() => ctx.refetch()}
              disabled={ctx.loading}
            >
              {ctx.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleExportDailyCsv}
                  disabled={filteredDaily.length === 0}
                >
                  Daily CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportJson}
                  disabled={
                    filteredSessions.length === 0 && filteredDaily.length === 0
                  }
                >
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Query bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="flex-1 min-w-[200px]"
            placeholder="Filter sessions (e.g. agent:main model:gpt-4o has:errors minTokens:2000)"
            value={ctx.queryDraft}
            onChange={(e) => ctx.setQueryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ctx.applyQuery();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={ctx.applyQuery}
            disabled={ctx.loading || (!hasDraftQuery && !hasQuery)}
          >
            Filter (client-side)
          </Button>
          {(hasDraftQuery || hasQuery) && (
            <Button variant="secondary" size="sm" onClick={ctx.clearQuery}>
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {hasQuery
              ? `${filteredSessions.length} of ${totalSessions} sessions match`
              : `${totalSessions} sessions in range`}
          </span>
        </div>

        {/* Filter dropdowns: Agent, Channel, Provider, Model, Tool */}
        <div className="flex flex-wrap items-center gap-2">
          {renderFilterSelect("agent", "Agent", agentOptions)}
          {renderFilterSelect("channel", "Channel", channelOptions)}
          {renderFilterSelect("provider", "Provider", providerOptions)}
          {renderFilterSelect("model", "Model", modelOptions)}
          {renderFilterSelect("tool", "Tool", toolOptions)}
          <span className="text-xs text-muted-foreground">
            Tip: use filters or click bars to filter days.
          </span>
        </div>

        {/* Query chips */}
        {queryTerms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {queryTerms.map((term) => (
              <Badge
                key={term.raw}
                variant="secondary"
                className="gap-1 pr-1 cursor-default"
              >
                {term.raw}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() =>
                    ctx.setQueryDraft(removeQueryToken(ctx.queryDraft, term.raw))
                  }
                  aria-label="Remove filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Query suggestions */}
        {querySuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {querySuggestions.slice(0, 8).map((s) => (
              <Button
                key={s.value}
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  ctx.setQueryDraft(
                    applySuggestionToQuery(ctx.queryDraft, s.value)
                  )
                }
              >
                {s.label}
              </Button>
            ))}
          </div>
        )}

        {/* Warnings */}
        {queryWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {queryWarnings.join(" · ")}
          </div>
        )}

        {/* Error */}
        {ctx.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ctx.error}
          </div>
        )}

        {/* Sessions limit */}
        {ctx.sessionsLimitReached && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Showing first 1,000 sessions. Narrow date range for complete results.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
