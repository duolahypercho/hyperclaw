import type { BridgeWorkflowStep } from "$/lib/hyperclaw-bridge-client";

/**
 * Starter workflow templates surfaced on the empty Workflows page. These are
 * executable specs, not just cards: agent-backed templates carry the exact
 * agent requirement, provisioning blueprint, and step seeds needed to clone a
 * ready-to-run workflow.
 */

export type WorkflowTemplateTrigger =
  | "manual"
  | "schedule"
  | "cron"
  | "webhook"
  | "event";

export type WorkflowTemplateDeliveryChannel = "mission_control" | string;

const WORKFLOW_TEMPLATE_TRIGGERS = new Set<WorkflowTemplateTrigger>([
  "manual",
  "schedule",
  "cron",
  "webhook",
  "event",
]);

export function isWorkflowTemplateTrigger(value: unknown): value is WorkflowTemplateTrigger {
  return typeof value === "string" && WORKFLOW_TEMPLATE_TRIGGERS.has(value as WorkflowTemplateTrigger);
}

export interface WorkflowTemplateDefaults {
  cadence?: string;
  time?: string;
  cron?: string;
  deliveryChannel?: WorkflowTemplateDeliveryChannel;
}

export interface WorkflowTemplateAgentBlueprint {
  defaultName: string;
  role: string;
  description: string;
  runtime: string;
  emoji?: string;
  skills?: string[];
  prompt?: string;
  expectedOutput?: string;
  soulTemplateSlug?: string;
  systemPrompt?: string;
  soulContent?: string;
  workspaceInstructions?: string;
  userNotes?: string;
  files?: Record<string, string>;
}

export interface WorkflowTemplateAgentRequirement {
  id: string;
  label: string;
  role: string;
  description: string;
  runtime?: string;
  skills?: string[];
  defaultName: string;
  emoji?: string;
  prompt: string;
  expectedOutput: string;
  agentBlueprint: WorkflowTemplateAgentBlueprint;
}

export interface WorkflowTemplateStepSeed {
  id: string;
  name: string;
  stepType: BridgeWorkflowStep["stepType"];
  dependsOn?: string[];
  position: number;
  preferredRole?: string;
  requirementId?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTemplateSeed {
  /** URL-safe id used as the `?template=` query param. */
  id: string;
  /** Suggested workflow name (user can edit). */
  name: string;
  /** One-line pitch shown on the gallery card. */
  tagline: string;
  /** Longer description that pre-fills the editor. */
  description: string;
  /** Card emoji and editor seed emoji. */
  emoji: string;
  /** Trigger preset; matches the editor's `Trigger` union. */
  trigger: WorkflowTemplateTrigger;
  /** Human-readable cadence shown inside the trigger pill. */
  triggerLabel: string;
  /** Portable role hints. Concrete agent IDs are selected per workspace. */
  suggestedRoles?: string[];
  /** Default scheduler/output values used when opening the editor. */
  defaults?: WorkflowTemplateDefaults;
  /** Agent slots users can attach or create from this template. */
  agentRequirements?: WorkflowTemplateAgentRequirement[];
  /** Concrete steps created when this static template is saved. */
  steps?: WorkflowTemplateStepSeed[];
}

function oneAgentRequirement(input: {
  id: string;
  label: string;
  defaultName: string;
  role: string;
  description: string;
  emoji: string;
  skills: string[];
  prompt: string;
  expectedOutput: string;
  soulContent: string;
  workspaceInstructions: string;
  runtime?: string;
}): WorkflowTemplateAgentRequirement {
  const runtime = input.runtime ?? "openclaw";
  return {
    id: input.id,
    label: input.label,
    role: input.role,
    description: input.description,
    runtime,
    skills: input.skills,
    defaultName: input.defaultName,
    emoji: input.emoji,
    prompt: input.prompt,
    expectedOutput: input.expectedOutput,
    agentBlueprint: {
      defaultName: input.defaultName,
      role: input.role,
      description: input.description,
      runtime,
      emoji: input.emoji,
      skills: input.skills,
      prompt: input.prompt,
      expectedOutput: input.expectedOutput,
      soulContent: input.soulContent,
      systemPrompt: input.soulContent,
      workspaceInstructions: input.workspaceInstructions,
      userNotes: input.skills.map((skill) => `- ${skill}`).join("\n"),
      files: {
        "SOUL.md": input.soulContent,
        "AGENTS.md": input.workspaceInstructions,
        "CLAUDE.md": input.workspaceInstructions,
      },
    },
  };
}

function oneAgentSteps(
  requirementId: string,
  agentName: string,
  prompt: string,
  expectedOutput: string,
): WorkflowTemplateStepSeed[] {
  return [
    {
      id: "trigger",
      name: "Start trigger",
      stepType: "manual_trigger",
      dependsOn: [],
      position: 0,
    },
    {
      id: requirementId,
      name: agentName,
      stepType: "agent_task",
      dependsOn: ["trigger"],
      position: 1,
      requirementId,
      metadata: { requirementId, prompt, expectedOutput },
    },
    {
      id: "output",
      name: "Send to user channel",
      stepType: "notification",
      dependsOn: [requirementId],
      position: 2,
      metadata: { channel: "mission_control" },
    },
  ];
}

const morningBriefingRequirement = oneAgentRequirement({
  id: "briefing-agent",
  label: "Briefing agent",
  defaultName: "Morning Briefing Agent",
  role: "Briefing operator",
  description:
    "Reads the configured sources, extracts what matters, and sends a concise executive briefing to the user's chosen channel.",
  emoji: "📰",
  skills: ["research", "summarization", "prioritization", "communication", "channel delivery"],
  prompt:
    "Read the configured inputs for today's briefing, produce a concise executive summary, list risks and next actions, then prepare the final message for delivery.",
  expectedOutput:
    "A short daily briefing with key updates, decisions, risks, next actions, and citations for important context.",
  soulContent:
    "You are the Morning Briefing Agent. Every morning, read the configured sources and turn them into a sharp operator briefing. Prioritize decisions, risks, blockers, and actions over noise. Keep the final message concise, cite important source context when available, and prepare it for delivery to the user's selected channel.",
  workspaceInstructions:
    "When this workflow runs, gather the configured inputs, summarize what changed, identify risks and next actions, and return a final channel-ready briefing. If no external channel is configured, deliver to Mission Control.",
});

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplateSeed[] = [
  {
    id: "morning-briefing",
    name: "Morning briefing",
    tagline: "A daily digest of metrics, news, and next moves in your inbox.",
    description:
      "Every morning, summarize yesterday's metrics, scan the news your team cares about, and surface the top three things you should act on today.",
    emoji: "📰",
    trigger: "schedule",
    triggerLabel: "Schedule · 7:00 AM daily",
    suggestedRoles: [morningBriefingRequirement.role],
    defaults: { cadence: "daily", time: "07:00", deliveryChannel: "mission_control" },
    agentRequirements: [morningBriefingRequirement],
    steps: oneAgentSteps(
      morningBriefingRequirement.id,
      morningBriefingRequirement.label,
      morningBriefingRequirement.prompt,
      morningBriefingRequirement.expectedOutput,
    ),
  },
  {
    id: "inbox-triage",
    name: "Inbox triage",
    tagline: "Sort, label, and draft replies the moment new mail lands.",
    description:
      "Watch your inbox in real time. For each new message, classify intent, draft a tone-matched reply, and queue it for one-click send.",
    emoji: "📥",
    trigger: "event",
    triggerLabel: "Event · on new email",
    suggestedRoles: ["Inbox operator"],
    defaults: { deliveryChannel: "mission_control" },
    agentRequirements: [
      oneAgentRequirement({
        id: "inbox-agent",
        label: "Inbox operator",
        defaultName: "Inbox Triage Agent",
        role: "Inbox operator",
        description:
          "Classifies new messages, drafts replies in the user's voice, and queues urgent items for review.",
        emoji: "📥",
        skills: ["classification", "reply drafting", "tone matching", "priority routing"],
        prompt:
          "Review the incoming message, classify intent and urgency, draft a concise reply when useful, and flag anything that needs human approval.",
        expectedOutput:
          "Intent label, urgency, recommended action, draft reply, and human-review flag.",
        soulContent:
          "You are the Inbox Triage Agent. Protect the user's attention. For every incoming message, identify intent, urgency, sender context, and the safest next action. Draft replies in a helpful, direct tone and require human approval before anything customer-facing is sent.",
        workspaceInstructions:
          "Watch new inbox events, classify them, draft replies when appropriate, and send the triage summary to the selected workflow channel.",
      }),
    ],
    steps: oneAgentSteps(
      "inbox-agent",
      "Inbox operator",
      "Review the incoming message, classify intent and urgency, draft a concise reply when useful, and flag anything that needs human approval.",
      "Intent label, urgency, recommended action, draft reply, and human-review flag.",
    ),
  },
  {
    id: "lead-research",
    name: "Lead research",
    tagline: "Drop in a name; get a one-pager on the company and the person.",
    description:
      "Given a person and a company, gather public signal, map the relationship graph, and produce a one-pager with talking points and a recommended next step.",
    emoji: "🔍",
    trigger: "manual",
    triggerLabel: "Manual · run on demand",
    suggestedRoles: ["Lead researcher"],
    defaults: { deliveryChannel: "mission_control" },
    agentRequirements: [
      oneAgentRequirement({
        id: "research-agent",
        label: "Lead researcher",
        defaultName: "Lead Research Agent",
        role: "Lead researcher",
        description:
          "Researches a person and company, builds a compact account brief, and recommends the next outreach move.",
        emoji: "🔍",
        skills: ["web research", "relationship mapping", "sales intelligence", "brief writing"],
        prompt:
          "Given the target person and company, gather public signal, identify relevant context, and produce a one-page outreach brief.",
        expectedOutput:
          "Company/person summary, relevant signals, warm-path notes, talking points, and a recommended next step.",
        soulContent:
          "You are the Lead Research Agent. Find useful, current public signal without padding. Explain why the account matters, what the user can say credibly, and the next best outreach move. Favor specifics over generic firmographics.",
        workspaceInstructions:
          "Run on demand with a target person and company. Return a concise one-pager ready for the user's sales or founder workflow.",
      }),
    ],
    steps: oneAgentSteps(
      "research-agent",
      "Lead researcher",
      "Given the target person and company, gather public signal, identify relevant context, and produce a one-page outreach brief.",
      "Company/person summary, relevant signals, warm-path notes, talking points, and a recommended next step.",
    ),
  },
  {
    id: "bug-intake",
    name: "Bug intake",
    tagline: "Reproduce, classify, and file every incoming bug report.",
    description:
      "When a bug report hits the webhook, attempt a clean reproduction, attach logs, classify severity, and open a ticket with the failing trace pre-filled.",
    emoji: "🐛",
    trigger: "webhook",
    triggerLabel: "Webhook · on new report",
    suggestedRoles: ["Bug triage operator"],
    defaults: { deliveryChannel: "mission_control" },
    agentRequirements: [
      oneAgentRequirement({
        id: "bug-triage-agent",
        label: "Bug triage operator",
        defaultName: "Bug Intake Agent",
        role: "Bug triage operator",
        description:
          "Turns incoming bug reports into reproducible, severity-scored tickets with evidence attached.",
        emoji: "🐛",
        skills: ["QA reproduction", "log analysis", "severity scoring", "ticket writing"],
        prompt:
          "Inspect the incoming bug report, attempt a clean reproduction from available evidence, classify severity, and prepare a ticket-ready summary.",
        expectedOutput:
          "Repro steps, expected vs actual behavior, severity, evidence links, suspected area, and ticket summary.",
        soulContent:
          "You are the Bug Intake Agent. Convert messy bug reports into actionable engineering work. Preserve evidence, avoid guessing beyond the available data, and clearly distinguish confirmed reproduction from hypothesis.",
        workspaceInstructions:
          "On webhook reports, parse the payload, collect attached evidence or logs, classify severity, and send a ticket-ready intake summary to the selected channel.",
      }),
    ],
    steps: oneAgentSteps(
      "bug-triage-agent",
      "Bug triage operator",
      "Inspect the incoming bug report, attempt a clean reproduction from available evidence, classify severity, and prepare a ticket-ready summary.",
      "Repro steps, expected vs actual behavior, severity, evidence links, suspected area, and ticket summary.",
    ),
  },
  {
    id: "weekly-metrics",
    name: "Weekly metrics digest",
    tagline: "Pull the numbers, write the narrative, ship it on Friday.",
    description:
      "Every Friday afternoon, query the warehouse for north-star metrics, write a one-page narrative with week-over-week deltas, and post it to the team channel.",
    emoji: "📊",
    trigger: "cron",
    triggerLabel: "Cron · Fridays at 4 PM",
    suggestedRoles: ["Metrics analyst"],
    defaults: { cadence: "weekly", time: "16:00", cron: "0 16 * * 5", deliveryChannel: "mission_control" },
    agentRequirements: [
      oneAgentRequirement({
        id: "metrics-agent",
        label: "Metrics analyst",
        defaultName: "Weekly Metrics Agent",
        role: "Metrics analyst",
        description:
          "Pulls weekly numbers, explains movement, and writes a team-ready metrics narrative.",
        emoji: "📊",
        skills: ["data analysis", "metric interpretation", "narrative writing", "executive reporting"],
        prompt:
          "Query the configured metrics, compare week-over-week movement, explain the why behind notable changes, and prepare the Friday digest.",
        expectedOutput:
          "Metric table, week-over-week deltas, narrative summary, anomalies, and recommended follow-ups.",
        soulContent:
          "You are the Weekly Metrics Agent. Translate numbers into a crisp operating narrative. Always highlight deltas, likely causes, confidence level, anomalies, and practical follow-up actions.",
        workspaceInstructions:
          "Run every Friday afternoon, read the configured metric sources, and deliver the digest to the selected workflow channel.",
      }),
    ],
    steps: oneAgentSteps(
      "metrics-agent",
      "Metrics analyst",
      "Query the configured metrics, compare week-over-week movement, explain the why behind notable changes, and prepare the Friday digest.",
      "Metric table, week-over-week deltas, narrative summary, anomalies, and recommended follow-ups.",
    ),
  },
  {
    id: "customer-onboarding",
    name: "Customer onboarding",
    tagline: "Greet, provision, and nudge new sign-ups through their first win.",
    description:
      "When a new customer signs up, send a personal welcome, provision their workspace, and watch for the first activation event — nudge them if it doesn't fire within 48 hours.",
    emoji: "🎯",
    trigger: "event",
    triggerLabel: "Event · on new signup",
    suggestedRoles: ["Customer onboarding operator"],
    defaults: { deliveryChannel: "mission_control" },
    agentRequirements: [
      oneAgentRequirement({
        id: "onboarding-agent",
        label: "Customer onboarding operator",
        defaultName: "Customer Onboarding Agent",
        role: "Customer onboarding operator",
        description:
          "Welcomes new customers, prepares their workspace, and nudges them toward the first activation moment.",
        emoji: "🎯",
        skills: ["customer success", "workspace provisioning", "activation analysis", "follow-up writing"],
        prompt:
          "Review the new signup, prepare the welcome and activation plan, provision required setup steps, and schedule a nudge if activation does not happen.",
        expectedOutput:
          "Welcome message, provisioning checklist, activation target, follow-up timing, and escalation notes.",
        soulContent:
          "You are the Customer Onboarding Agent. Your job is to make the user's first win feel inevitable. Be warm, specific, and operational: welcome the customer, prepare setup, watch for activation, and recommend the next nudge only when it helps.",
        workspaceInstructions:
          "On new signup events, create a welcome plan, provision checklist, activation watch, and channel-ready update for the customer success team.",
      }),
    ],
    steps: oneAgentSteps(
      "onboarding-agent",
      "Customer onboarding operator",
      "Review the new signup, prepare the welcome and activation plan, provision required setup steps, and schedule a nudge if activation does not happen.",
      "Welcome message, provisioning checklist, activation target, follow-up timing, and escalation notes.",
    ),
  },
] as const;

/** Look up a template by id. Returns `null` for unknown ids so callers can
 *  gracefully fall through to the blank editor. */
export function getWorkflowTemplate(
  id: string | null | undefined
): WorkflowTemplateSeed | null {
  if (!id) return null;
  return WORKFLOW_TEMPLATES.find((t) => t.id === id) ?? null;
}
