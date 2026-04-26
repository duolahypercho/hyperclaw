import { describe, expect, it, beforeEach } from "vitest";
import {
  __testProjectStore,
  type ProjectStoreProject,
} from "$/components/Tool/Projects/project-store";

const baseProject: ProjectStoreProject = {
  id: "project-1",
  name: "Launch room",
  description: "Coordinate launch work",
  emoji: "🚀",
  status: "active",
  createdAt: 1_000,
  updatedAt: 1_000,
  members: [],
};

describe("projects shared realtime store", () => {
  beforeEach(() => {
    __testProjectStore.reset();
  });

  it("publishes an optimistic project to every provider snapshot immediately", () => {
    __testProjectStore.replaceFromFetch([]);

    __testProjectStore.upsert({ ...baseProject, id: "optimistic-project" });

    expect(__testProjectStore.getSnapshot().map((project) => project.id)).toEqual([
      "optimistic-project",
    ]);
  });

  it("keeps a recently created project when a stale list response arrives", () => {
    __testProjectStore.upsert(baseProject, 10_000);

    __testProjectStore.replaceFromFetch([], 12_000);

    expect(__testProjectStore.getSnapshot().map((project) => project.id)).toEqual([
      "project-1",
    ]);
  });

  it("lets the server list win after the realtime protection window expires", () => {
    __testProjectStore.upsert(baseProject, 10_000);

    __testProjectStore.replaceFromFetch([], 80_000);

    expect(__testProjectStore.getSnapshot()).toEqual([]);
  });

  it("replaces an optimistic project with the server project id", () => {
    __testProjectStore.upsert({ ...baseProject, id: "optimistic-project" }, 10_000);

    __testProjectStore.replace("optimistic-project", { ...baseProject, id: "project-real" }, 11_000);

    expect(__testProjectStore.getSnapshot().map((project) => project.id)).toEqual([
      "project-real",
    ]);
  });

  it("removes an optimistic project when creation rolls back", () => {
    __testProjectStore.upsert(baseProject, 10_000);

    __testProjectStore.remove(baseProject.id);

    expect(__testProjectStore.getSnapshot()).toEqual([]);
  });
});
