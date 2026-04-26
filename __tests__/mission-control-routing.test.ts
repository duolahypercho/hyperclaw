import { describe, expect, it } from "vitest";
import {
  buildMissionControlProjectHref,
  getMissionControlProjectId,
} from "$/components/ensemble/views/mission-control-routing";

describe("mission control routing", () => {
  it("builds a project deep link for Mission Control", () => {
    expect(buildMissionControlProjectHref("project 1")).toBe(
      "/Tool/MissionControl?projectId=project%201",
    );
  });

  it("reads the projectId query value", () => {
    expect(getMissionControlProjectId({ projectId: "project-1" })).toBe("project-1");
  });

  it("keeps old id links working as a fallback", () => {
    expect(getMissionControlProjectId({ id: ["project-legacy"] })).toBe("project-legacy");
  });

  it("prefers projectId when both supported keys are present", () => {
    expect(getMissionControlProjectId({ projectId: "project-new", id: "project-old" })).toBe(
      "project-new",
    );
  });

  it("ignores empty query values", () => {
    expect(getMissionControlProjectId({ projectId: "   " })).toBeNull();
  });

  it("ignores missing and empty array query values", () => {
    expect(getMissionControlProjectId({ projectId: undefined })).toBeNull();
    expect(getMissionControlProjectId({ projectId: [] })).toBeNull();
  });
});
