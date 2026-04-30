import type { BridgeWorkflowStep, WorkflowTemplateDraft } from "$/lib/hyperclaw-bridge-client";

export const WORKFLOW_TEMPLATE_DRAFT_SCHEMA = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    ownerIntent: { type: "string" },
    createdBy: { type: "string" },
    prompt: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          stepType: { type: "string" },
          title: { type: "string" },
          name: { type: "string" },
          assignedAgentId: { type: "string" },
          preferredAgentId: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
          dependencies: { type: "array", items: { type: "string" } },
          inputs: { type: "object" },
          outputs: { type: "object" },
          metadata: { type: "object" },
        },
      },
    },
    components: { type: "array" },
    graph: { type: "object" },
    metadata: { type: "object" },
  },
} as const;

export const WORKFLOW_TEMPLATE_DRAFT_EXAMPLE: WorkflowTemplateDraft = {
  name: "Daily revenue pulse",
  description: "Query connector SQLite for revenue changes, chart the trend, and notify the team.",
  category: "finance",
  tags: ["sql", "chart", "daily"],
  ownerIntent: "Give the founder a daily view of revenue movement without opening dashboards.",
  createdBy: "agent:operator",
  steps: [
    {
      id: "manual-trigger",
      type: "manual_trigger",
      title: "Start daily pulse",
    },
    {
      id: "query-revenue",
      type: "sql_query",
      title: "Query revenue tables",
      dependencies: ["manual-trigger"],
      inputs: { sql: "select * from stripe_revenue_snapshots order by created_at desc limit 30" },
    },
    {
      id: "chart-revenue",
      type: "chart",
      title: "Render revenue trend",
      dependencies: ["query-revenue"],
      inputs: { chartType: "line", x: "created_at", y: "amount" },
    },
    {
      id: "notify-team",
      type: "notification",
      title: "Send Mission Control summary",
      dependencies: ["chart-revenue"],
    },
  ],
};

const SUPPORTED_STEP_TYPES = new Set([
  "manual_trigger",
  "agent_task",
  "human_approval",
  "notification",
  "sql_query",
  "chart",
  "component",
]);

export function validateWorkflowTemplateDraft(draft: unknown): {
  valid: boolean;
  draft: WorkflowTemplateDraft | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!draft || typeof draft !== "object") {
    return { valid: false, draft: null, warnings: ["Draft must be a JSON object."] };
  }
  const record = draft as WorkflowTemplateDraft;
  if (!record.name?.trim()) errors.push("name is required.");
  if (!record.description?.trim()) warnings.push("description is recommended.");
  if (!Array.isArray(record.steps) && !record.graph) {
    errors.push("steps or graph is required before publishing.");
  }
  record.steps?.forEach((step, index) => {
    if (!step.id?.trim()) errors.push(`steps[${index}].id is required.`);
    const type = step.stepType ?? step.type ?? "agent_task";
    if (!SUPPORTED_STEP_TYPES.has(type)) errors.push(`steps[${index}] uses unsupported type "${type}".`);
  });
  return { valid: errors.length === 0, draft: record, warnings: [...errors, ...warnings] };
}

export function workflowDraftToBridgeSteps(draft: WorkflowTemplateDraft): BridgeWorkflowStep[] {
  return (draft.steps ?? []).map((step, index) => ({
    id: step.id,
    name: step.name ?? step.title ?? `Step ${index + 1}`,
    stepType: step.stepType ?? step.type ?? "agent_task",
    dependsOn: step.dependsOn ?? step.dependencies ?? [],
    preferredAgentId: step.preferredAgentId ?? step.assignedAgentId,
    preferredRole: step.preferredRole,
    inputSchema: step.inputs,
    outputSchema: step.outputs,
    position: index,
    metadata: step.metadata ?? {},
  }));
}

export function workflowDraftFromPrompt(prompt: string): WorkflowTemplateDraft {
  const parts = prompt.includes("->")
    ? prompt.split("->")
    : prompt.split("\n").map((line) => line.replace(/^[-*\d.\s]+/, ""));
  const steps = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((title, index) => {
      const lower = title.toLowerCase();
      const type = lower.includes("sql")
        ? "sql_query"
        : lower.includes("chart")
          ? "chart"
          : lower.includes("approval") || lower.includes("review")
            ? "human_approval"
            : lower.includes("notify") || lower.includes("send")
              ? "notification"
              : index === 0
                ? "manual_trigger"
                : "agent_task";
      return {
        id: `step-${index + 1}`,
        type,
        title,
        dependencies: index > 0 ? [`step-${index}`] : [],
      };
    });
  return {
    name: prompt.trim().split(/\s+/).slice(0, 5).join(" ") || "Generated workflow",
    description: prompt,
    category: "agent-generated",
    tags: ["prompt"],
    ownerIntent: prompt,
    prompt,
    steps: steps.length > 0 ? steps : [{ id: "step-1", type: "agent_task", title: "Execute workflow" }],
  };
}
