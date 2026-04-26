/**
 * Mock data for the Ensemble Projects feature.
 * Mirrors data.js from the design handoff bundle, ported to TypeScript.
 * Replace with real API/store wiring at integration time.
 */

import type { Agent, AgentKind, AgentKindId, Project, ProjectTemplate } from "./types";

export const AGENT_KINDS: Record<AgentKindId, AgentKind> = {
  claude: { id: "claude", label: "Claude", glyph: "CL", cls: "glyph-claude", role: "reasoning" },
  code: { id: "code", label: "Code", glyph: "CD", cls: "glyph-code", role: "execution" },
  codex: { id: "codex", label: "Codex", glyph: "CX", cls: "glyph-codex", role: "codegen" },
  openclaw: { id: "openclaw", label: "OpenClaw", glyph: "OC", cls: "glyph-claw", role: "retrieval" },
  hermes: { id: "hermes", label: "Hermes", glyph: "HM", cls: "glyph-hermes", role: "delivery" },
  input: { id: "input", label: "Input", glyph: "▶", cls: "glyph-input", role: "trigger" },
  output: { id: "output", label: "Output", glyph: "■", cls: "glyph-output", role: "sink" },
};

export const AGENTS: Agent[] = [
  {
    id: "clio",
    name: "Clio",
    kind: "claude",
    title: "Chief of Staff",
    dept: "Leadership",
    status: "online",
    tagline: "Synthesizes, writes, decides what matters.",
    emoji: "CL",
    tone: "warm · direct · low-ego",
    cost: { today: 1.84, month: 48.2, tokens: 482013 },
    projects: 8,
  },
  {
    id: "orin",
    name: "Orin",
    kind: "openclaw",
    title: "Research Lead",
    dept: "Intelligence",
    status: "online",
    tagline: "Knows where the receipts are.",
    emoji: "OC",
    tone: "meticulous · footnoted · patient",
    cost: { today: 0.42, month: 18.9, tokens: 284120 },
    projects: 12,
  },
  {
    id: "pax",
    name: "Pax",
    kind: "code",
    title: "Engineer",
    dept: "Engineering",
    status: "busy",
    tagline: "Runs the math. Draws the charts.",
    emoji: "CD",
    tone: "terse · precise · no-chit-chat",
    cost: { today: 0.31, month: 9.12, tokens: 84200 },
    projects: 6,
  },
  {
    id: "mira",
    name: "Mira",
    kind: "codex",
    title: "QA & Verification",
    dept: "Engineering",
    status: "online",
    tagline: "Reads every draft twice and checks the math.",
    emoji: "CX",
    tone: "skeptical · kind · thorough",
    cost: { today: 0.18, month: 6.4, tokens: 52100 },
    projects: 9,
  },
  {
    id: "rell",
    name: "Rell",
    kind: "hermes",
    title: "Delivery & Ops",
    dept: "Operations",
    status: "online",
    tagline: "Gets it out the door, on time, to the right inbox.",
    emoji: "HM",
    tone: "calm · reliable · cheerful",
    cost: { today: 0.04, month: 1.1, tokens: 8200 },
    projects: 14,
  },
];

export const PROJECTS: Project[] = [
  {
    id: "company-setup",
    name: "Company setup",
    status: "live",
    description: "Your first operating workspace: profile, channels, onboarded agents, and launch workflow.",
    owner: "Project lead",
    agents: [],
    cost: { run: 0, month: 0 },
    runs: 0,
    eta: "ready now",
    nodes: [
      { id: "profile", kind: "input", x: 40, y: 220, title: "Company profile", body: "name · website · positioning", status: "queued", ms: null },
      { id: "channels", kind: "openclaw", x: 270, y: 90, title: "Connect channels", body: "Slack · Discord · Telegram", status: "queued", ms: null },
      { id: "crew", kind: "claude", x: 270, y: 340, title: "Attach agent crew", body: "all onboarding-created agents", status: "running", ms: null },
      { id: "workflow", kind: "output", x: 520, y: 220, title: "First workflow", body: "turn setup into operating rhythm", status: "needs", ms: null },
    ],
    edges: [
      ["profile", "channels"],
      ["profile", "crew"],
      ["channels", "workflow"],
      ["crew", "workflow"],
    ],
  },
];

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "brief",
    name: "Source → Brief",
    desc: "Pull from sources, retrieve context, draft, deliver.",
    chain: ["Source", "Retrieve", "Draft", "Deliver"],
    agents: ["orin", "clio", "rell"],
  },
  {
    id: "blank",
    name: "Blank canvas",
    desc: "Start with one trigger and one sink. Wire it yourself.",
    chain: ["Start", "End"],
    agents: [],
  },
];

/** Lookup helpers. */
export const getAgent = (id: string): Agent | undefined =>
  AGENTS.find((a) => a.id === id);

export const getProject = (id: string): Project | undefined =>
  PROJECTS.find((p) => p.id === id);

export const getAgentKind = (kind: AgentKindId): AgentKind => AGENT_KINDS[kind];
