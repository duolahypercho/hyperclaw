/**
 * Starter workflow templates surfaced on the empty Workflows page so users
 * can scaffold a new workflow with one click instead of staring at a blank
 * editor. Each template is a *seed* — it pre-fills the editor's name,
 * description, emoji, and trigger; the user still owns final review and
 * crew assignment in the editor.
 *
 * Keep this list short (6–8 entries) and editorial. Templates compete with
 * "Start from blank", so each one needs an unmistakable use case in <60
 * characters of tagline copy.
 */

export type WorkflowTemplateTrigger =
  | "manual"
  | "schedule"
  | "cron"
  | "webhook"
  | "event";

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
}

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplateSeed[] = [
  {
    id: "morning-briefing",
    name: "Morning briefing",
    tagline: "A daily digest of metrics, news, and next moves in your inbox.",
    description:
      "Every morning, summarize yesterday's metrics, scan the news your team cares about, and surface the top three things you should act on today.",
    emoji: "📰",
    trigger: "schedule",
    triggerLabel: "Schedule · 8:00 AM daily",
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
