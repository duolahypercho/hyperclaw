import { beforeEach, describe, expect, it, vi } from "vitest";
import { hubCommand } from "$/lib/hub-direct";
import {
  archiveWorkflowTemplate,
  createWorkflowDraft,
  createWorkflowTemplateFromPrompt,
  createWorkflowTemplate,
  listWorkflowComponents,
  listWorkflowCharts,
  listWorkflowTemplates,
  promoteWorkflowDraft,
  publishWorkflowTemplate,
  saveWorkflowDraft,
  saveWorkflowGraph,
} from "$/lib/hyperclaw-bridge-client";

vi.mock("$/lib/hub-direct", () => ({
  hubCommand: vi.fn(),
}));

const mockedHubCommand = vi.mocked(hubCommand);

describe("workflow bridge client", () => {
  beforeEach(() => {
    mockedHubCommand.mockReset();
  });

  it("lists templates across projects when no project id is provided", async () => {
    mockedHubCommand.mockResolvedValueOnce({ success: true, data: [{ id: "tpl-1" }] });

    await expect(listWorkflowTemplates()).resolves.toEqual([{ id: "tpl-1" }]);
    expect(mockedHubCommand).toHaveBeenCalledWith({ action: "workflow-template-list" });
  });

  it("creates typed templates with graph-friendly step metadata", async () => {
    mockedHubCommand.mockResolvedValueOnce({ success: true, data: { id: "tpl-1" } });

    await createWorkflowTemplate({
      projectId: "project-1",
      name: "Spend digest",
      tags: ["finance"],
      steps: [
        {
          id: "query",
          name: "Query spend",
          stepType: "sql_query",
          dependsOn: [],
          position: 0,
          metadata: { sql: "select 1" },
        },
      ],
    });

    expect(mockedHubCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workflow-template-create",
        projectId: "project-1",
        name: "Spend digest",
      }),
    );
  });

  it("persists graph, components, and agent-authored drafts through explicit actions", async () => {
    mockedHubCommand
      .mockResolvedValueOnce({ success: true, data: { id: "graph-1" } })
      .mockResolvedValueOnce({ success: true, data: [{ id: "component-chart" }] })
      .mockResolvedValueOnce({ success: true, data: { id: "draft-1" }, warnings: [] });

    await saveWorkflowGraph({
      projectId: "project-1",
      graph: { nodes: [], edges: [], updatedAt: 1 },
    });
    await expect(listWorkflowComponents()).resolves.toEqual([{ id: "component-chart" }]);
    await expect(
      saveWorkflowDraft({
        projectId: "project-1",
        draft: { name: "Agent workflow", steps: [] },
      }),
    ).resolves.toMatchObject({ valid: true, warnings: [] });

    expect(mockedHubCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: "workflow-graph-save" }),
    );
    expect(mockedHubCommand).toHaveBeenNthCalledWith(2, { action: "workflow-component-list" });
    expect(mockedHubCommand).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ action: "workflow-draft-save" }),
    );
  });

  it("exposes publish/archive/chart-list/draft-promote bridge contracts", async () => {
    mockedHubCommand
      .mockResolvedValueOnce({ success: true, data: { id: "tpl-1", status: "published" } })
      .mockResolvedValueOnce({ success: true, data: { id: "tpl-1", status: "archived" } })
      .mockResolvedValueOnce({ success: true, data: [{ id: "chart-1" }] })
      .mockResolvedValueOnce({ success: true, data: { id: "draft-1" }, warnings: [] })
      .mockResolvedValueOnce({ success: true, data: { id: "tpl-2" } })
      .mockResolvedValueOnce({ success: true, data: { id: "tpl-3" } });

    await publishWorkflowTemplate("tpl-1");
    await archiveWorkflowTemplate("tpl-1");
    await listWorkflowCharts({ projectId: "project-1" });
    await createWorkflowDraft({ projectId: "project-1", draft: { name: "Draft", steps: [] } });
    await promoteWorkflowDraft("draft-1", "project-1");
    await createWorkflowTemplateFromPrompt({ projectId: "project-1", prompt: "Do work" });

    expect(mockedHubCommand).toHaveBeenNthCalledWith(1, { action: "workflow-template-publish", id: "tpl-1" });
    expect(mockedHubCommand).toHaveBeenNthCalledWith(2, { action: "workflow-template-archive", id: "tpl-1" });
    expect(mockedHubCommand).toHaveBeenNthCalledWith(3, { action: "workflow-chart-list", projectId: "project-1" });
    expect(mockedHubCommand).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ action: "workflow-draft-create" }),
    );
    expect(mockedHubCommand).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({ action: "workflow-draft-promote", id: "draft-1" }),
    );
    expect(mockedHubCommand).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({ action: "workflow-template-create-from-prompt" }),
    );
  });
});
