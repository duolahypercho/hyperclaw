import { describe, expect, it } from "vitest";
import {
  validateWorkflowTemplateDraft,
  workflowDraftFromPrompt,
  workflowDraftToBridgeSteps,
  WORKFLOW_TEMPLATE_DRAFT_EXAMPLE,
} from "$/lib/workflow-template-draft";

describe("workflow template draft contract", () => {
  it("accepts the agent setup kit example", () => {
    expect(validateWorkflowTemplateDraft(WORKFLOW_TEMPLATE_DRAFT_EXAMPLE)).toMatchObject({
      valid: true,
      warnings: [],
    });
  });

  it("warns on missing publishable structure", () => {
    const result = validateWorkflowTemplateDraft({ name: "" });
    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["name is required.", "steps or graph is required before publishing."]),
    );
  });

  it("turns prompt steps into canonical bridge steps", () => {
    const draft = workflowDraftFromPrompt("Start -> SQL query usage -> chart usage -> notify team");
    expect(workflowDraftToBridgeSteps(draft)).toMatchObject([
      { id: "step-1", stepType: "manual_trigger", dependsOn: [] },
      { id: "step-2", stepType: "sql_query", dependsOn: ["step-1"] },
      { id: "step-3", stepType: "chart", dependsOn: ["step-2"] },
      { id: "step-4", stepType: "notification", dependsOn: ["step-3"] },
    ]);
  });
});
