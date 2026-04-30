// Ensemble agent seed data. Each fictional employee maps to a real HyperClaw runtime.
// When the runtime is available locally, live data (session count, last activity, cost)
// replaces the seed fields in EnsembleHome.

export type RuntimeKind = "claude-code" | "openclaw" | "code" | "codex" | "hermes";

export interface EnsembleAgent {
  id: string;
  name: string;
  title: string;
  department: string;
  emoji: string;           // 1-char glyph shown in ag-glyph square
  kind: RuntimeKind;       // maps to real HyperClaw runtime
  runtimeLabel: string;    // display label
  identity: string;        // 1-line description for home/roster cards
  // Fallback seed values — overridden by live data when the runtime is online.
  seedCostMonth: number;   // USD
  seedTokensMonth: number;
  seedState: "running" | "idle" | "error";
}

export const ENSEMBLE_AGENTS: EnsembleAgent[] = [
  {
    id: "clio",
    name: "Clio",
    title: "Research analyst",
    department: "Research",
    emoji: "C",
    kind: "claude-code",
    runtimeLabel: "Claude Code",
    identity: "Reads, summarises, drafts. Cites her sources.",
    seedCostMonth: 18.42,
    seedTokensMonth: 2_140_000,
    seedState: "running",
  },
  {
    id: "orin",
    name: "Orin",
    title: "Messaging gateway",
    department: "Customer",
    emoji: "O",
    kind: "openclaw",
    runtimeLabel: "OpenClaw",
    identity: "Routes inbound customer traffic across channels.",
    seedCostMonth: 4.91,
    seedTokensMonth: 312_000,
    seedState: "idle",
  },
  {
    id: "pax",
    name: "Pax",
    title: "Code maintainer",
    department: "Engineering",
    emoji: "P",
    kind: "code",
    runtimeLabel: "Paperclip",
    identity: "Owns refactors, PRs, CI failures.",
    seedCostMonth: 11.08,
    seedTokensMonth: 1_040_000,
    seedState: "idle",
  },
  {
    id: "mira",
    name: "Mira",
    title: "Ops engineer",
    department: "Engineering",
    emoji: "M",
    kind: "codex",
    runtimeLabel: "Codex",
    identity: "Ships patches, watches logs, answers the pager.",
    seedCostMonth: 9.65,
    seedTokensMonth: 820_000,
    seedState: "running",
  },
  {
    id: "rell",
    name: "Rell",
    title: "Operations",
    department: "Ops",
    emoji: "R",
    kind: "hermes",
    runtimeLabel: "Hermes",
    identity: "Remembers. Learns skills. Self-improves.",
    seedCostMonth: 6.31,
    seedTokensMonth: 490_000,
    seedState: "idle",
  },
];

export function getAgent(id: string): EnsembleAgent | undefined {
  return ENSEMBLE_AGENTS.find((a) => a.id === id);
}

/** Map hub/connector runtime strings to the canonical runtime union. */
export function normalizeRuntimeKind(runtime: string | undefined): RuntimeKind {
  const r = (runtime || "").toLowerCase();
  if (r === "claude-code" || r === "claude_code" || r === "claude") return "claude-code";
  if (r === "codex") return "codex";
  if (r === "hermes") return "hermes";
  if (r === "code" || r === "paperclip") return "code";
  return "openclaw";
}

export function agentByRuntime(runtime: string | undefined): EnsembleAgent | undefined {
  if (!runtime) return undefined;
  return ENSEMBLE_AGENTS.find((a) => a.kind === runtime);
}

export function formatUSD(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}
