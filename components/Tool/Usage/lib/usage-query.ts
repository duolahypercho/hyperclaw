/**
 * Usage query and export helpers (ported from OpenClaw usage-query).
 */

import { extractQueryTerms, normalizeQueryText } from "./usage-helpers";
import type { SessionsUsageEntry } from "$/lib/openclaw-gateway-ws";
import type { GatewayUsageDaily } from "$/lib/openclaw-gateway-ws";

export function downloadTextFile(
  filename: string,
  content: string,
  type = "text/plain"
) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function toCsvRow(values: Array<string | number | undefined | null>): string {
  return values
    .map((v) => {
      if (v === undefined || v === null) return "";
      return csvEscape(String(v));
    })
    .join(",");
}

export function buildSessionsCsv(sessions: SessionsUsageEntry[]): string {
  const rows = [
    toCsvRow([
      "key",
      "label",
      "agentId",
      "channel",
      "provider",
      "model",
      "updatedAt",
      "durationMs",
      "messages",
      "errors",
      "toolCalls",
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "totalTokens",
      "totalCost",
    ]),
  ];
  for (const session of sessions) {
    const usage = session.usage as
      | (typeof session.usage & {
          messageCounts?: { total?: number; errors?: number };
          toolUsage?: { totalCalls?: number };
        })
      | undefined;
    rows.push(
      toCsvRow([
        session.key,
        session.label ?? "",
        session.agentId ?? "",
        session.channel ?? "",
        session.modelProvider ?? (session as { providerOverride?: string }).providerOverride ?? "",
        session.model ?? "",
        session.updatedAt ? new Date(session.updatedAt).toISOString() : "",
        usage?.firstActivity != null && usage?.lastActivity != null
          ? Math.abs((usage.lastActivity ?? 0) - (usage.firstActivity ?? 0))
          : "",
        usage?.messageCounts?.total ?? "",
        usage?.messageCounts?.errors ?? "",
        usage?.toolUsage?.totalCalls ?? "",
        usage?.input ?? "",
        usage?.output ?? "",
        usage?.cacheRead ?? "",
        usage?.cacheWrite ?? "",
        usage?.totalTokens ?? "",
        usage?.totalCost ?? "",
      ])
    );
  }
  return rows.join("\n");
}

export function buildDailyCsv(daily: GatewayUsageDaily[]): string {
  const rows = [
    toCsvRow([
      "date",
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "totalTokens",
      "inputCost",
      "outputCost",
      "cacheReadCost",
      "cacheWriteCost",
      "totalCost",
    ]),
  ];
  for (const day of daily) {
    rows.push(
      toCsvRow([
        day.date,
        day.input,
        day.output,
        day.cacheRead,
        day.cacheWrite,
        day.totalTokens,
        day.inputCost ?? "",
        day.outputCost ?? "",
        day.cacheReadCost ?? "",
        day.cacheWriteCost ?? "",
        day.totalCost,
      ])
    );
  }
  return rows.join("\n");
}

export type QuerySuggestion = { label: string; value: string };

type AggregatesLike = {
  byProvider?: Array<{ provider?: string }>;
  byModel?: Array<{ model?: string }>;
  tools?: { tools: Array<{ name: string }> };
};

export function buildQuerySuggestions(
  query: string,
  sessions: SessionsUsageEntry[],
  aggregates?: AggregatesLike | null
): QuerySuggestion[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/);
  const lastToken = tokens[tokens.length - 1] ?? "";
  const [rawKey, rawValue] = lastToken.includes(":")
    ? [lastToken.slice(0, lastToken.indexOf(":")), lastToken.slice(lastToken.indexOf(":") + 1)]
    : ["", ""];
  const key = rawKey.toLowerCase();
  const value = rawValue.toLowerCase();

  const unique = (items: Array<string | undefined>): string[] => {
    const set = new Set<string>();
    for (const item of items) {
      if (item) set.add(item);
    }
    return Array.from(set);
  };

  const agents = unique(sessions.map((s) => s.agentId)).slice(0, 6);
  const channels = unique(sessions.map((s) => s.channel)).slice(0, 6);
  const providers = unique([
    ...sessions.map((s) => s.modelProvider),
    ...sessions.map((s) => (s as { providerOverride?: string }).providerOverride),
    ...(aggregates?.byProvider?.map((p) => p.provider) ?? []),
  ]).slice(0, 6);
  const models = unique([
    ...sessions.map((s) => s.model),
    ...(aggregates?.byModel?.map((m) => m.model) ?? []),
  ]).slice(0, 6);
  const tools = unique(aggregates?.tools?.tools?.map((t) => t.name) ?? []).slice(0, 6);

  if (!key) {
    return [
      { label: "agent:", value: "agent:" },
      { label: "channel:", value: "channel:" },
      { label: "provider:", value: "provider:" },
      { label: "model:", value: "model:" },
      { label: "tool:", value: "tool:" },
      { label: "has:errors", value: "has:errors" },
      { label: "has:tools", value: "has:tools" },
      { label: "minTokens:", value: "minTokens:" },
      { label: "maxCost:", value: "maxCost:" },
    ];
  }

  const suggestions: QuerySuggestion[] = [];
  const addValues = (prefix: string, values: string[]) => {
    for (const val of values) {
      if (!value || val.toLowerCase().includes(value)) {
        suggestions.push({ label: `${prefix}:${val}`, value: `${prefix}:${val}` });
      }
    }
  };
  switch (key) {
    case "agent":
      addValues("agent", agents);
      break;
    case "channel":
      addValues("channel", channels);
      break;
    case "provider":
      addValues("provider", providers);
      break;
    case "model":
      addValues("model", models);
      break;
    case "tool":
      addValues("tool", tools);
      break;
    case "has":
      ["errors", "tools", "usage", "model", "provider"].forEach((entry) => {
        if (!value || entry.includes(value)) {
          suggestions.push({ label: `has:${entry}`, value: `has:${entry}` });
        }
      });
      break;
    default:
      break;
  }
  return suggestions;
}

export function applySuggestionToQuery(query: string, suggestion: string): string {
  const trimmed = query.trim();
  if (!trimmed) return `${suggestion} `;
  const tokens = trimmed.split(/\s+/);
  tokens[tokens.length - 1] = suggestion;
  return `${tokens.join(" ")} `;
}

export function addQueryToken(query: string, token: string): string {
  const trimmed = query.trim();
  if (!trimmed) return `${token} `;
  const tokens = trimmed.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";
  const tokenKey = token.includes(":") ? token.split(":")[0] : null;
  const lastKey = last.includes(":") ? last.split(":")[0] : null;
  if (last.endsWith(":") && tokenKey && lastKey === tokenKey) {
    tokens[tokens.length - 1] = token;
    return `${tokens.join(" ")} `;
  }
  if (tokens.includes(token)) return `${tokens.join(" ")} `;
  return `${tokens.join(" ")} ${token} `;
}

export function removeQueryToken(query: string, token: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const next = tokens.filter((entry) => entry !== token);
  return next.length ? `${next.join(" ")} ` : "";
}

export function setQueryTokensForKey(
  query: string,
  key: string,
  values: string[]
): string {
  const normalizedKey = normalizeQueryText(key);
  const terms = extractQueryTerms(query);
  const tokens = terms
    .filter((term) => normalizeQueryText(term.key ?? "") !== normalizedKey)
    .map((term) => term.raw);
  const next = [...tokens, ...values.map((value) => `${key}:${value}`)];
  return next.length ? `${next.join(" ")} ` : "";
}
