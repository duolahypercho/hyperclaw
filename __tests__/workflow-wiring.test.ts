import { describe, expect, it, vi } from "vitest";
import {
  WIRE_PRESETS,
  wireGraphToTemplateSteps,
  wireNodeKindToStepType,
  type WireGraph,
} from "$/lib/workflow-wiring";

vi.mock("$/lib/hub-direct", () => ({
  hubCommand: vi.fn(),
}));

describe("workflow wiring", () => {
  it("includes data and visual palette nodes", () => {
    expect(WIRE_PRESETS.map((preset) => preset.kind)).toEqual(
      expect.arrayContaining(["sql", "chart", "component"]),
    );
  });

  it("maps graph nodes into executable template steps with dependencies", () => {
    const graph: WireGraph = {
      updatedAt: 1,
      nodes: [
        { id: "trigger", kind: "trigger", label: "Start", x: 0, y: 0 },
        { id: "query", kind: "sql", label: "Read usage", x: 220, y: 0 },
        { id: "chart", kind: "chart", label: "Chart spend", x: 440, y: 0 },
        { id: "send", kind: "output", label: "Send report", x: 660, y: 0 },
      ],
      edges: [
        { id: "e1", from: "trigger", to: "query" },
        { id: "e2", from: "query", to: "chart" },
        { id: "e3", from: "chart", to: "send" },
      ],
    };

    expect(wireGraphToTemplateSteps(graph)).toMatchObject([
      { id: "trigger", stepType: "manual_trigger", dependsOn: [] },
      { id: "query", stepType: "sql_query", dependsOn: ["trigger"] },
      { id: "chart", stepType: "chart", dependsOn: ["query"] },
      { id: "send", stepType: "notification", dependsOn: ["chart"] },
    ]);
  });

  it("keeps agent-like node kinds executable as agent tasks", () => {
    expect(wireNodeKindToStepType("claude")).toBe("agent_task");
    expect(wireNodeKindToStepType("codex")).toBe("agent_task");
    expect(wireNodeKindToStepType("hermes")).toBe("agent_task");
  });
});
