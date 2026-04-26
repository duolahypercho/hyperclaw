import { describe, expect, it } from "vitest";
import {
  getRuntimeSessionUsageQueryParams,
  getSessionUsageQueryParams,
  getStatsAgentId,
  hasStatsActivity,
  isRootRuntimeUsageAgent,
  shouldUseRuntimeUsageFallback,
} from "$/components/Home/widgets/agent-overview-usage";

describe("agent overview usage query helpers", () => {
  it("keeps normal profile agents scoped by agent id", () => {
    expect(isRootRuntimeUsageAgent("mira", "codex")).toBe(false);
    expect(getStatsAgentId("mira", "codex")).toBe("mira");
    expect(getSessionUsageQueryParams("mira", "codex", 10, 20)).toEqual({
      agentId: "mira",
      groupBy: "session",
      from: 10,
      to: 20,
    });
  });

  it("queries runtime-scoped rows for root runtime agents", () => {
    expect(isRootRuntimeUsageAgent("hermes", "hermes")).toBe(true);
    expect(shouldUseRuntimeUsageFallback("hermes", "hermes")).toBe(false);
    expect(getStatsAgentId("hermes", "hermes")).toBe("hermes");
    expect(getSessionUsageQueryParams("hermes", "hermes", 10, 20)).toEqual({
      runtime: "hermes",
      groupBy: "session",
      from: 10,
      to: 20,
    });
  });

  it("falls back to runtime usage for Hermes profile pages", () => {
    expect(shouldUseRuntimeUsageFallback("rell", "hermes")).toBe(true);
    expect(shouldUseRuntimeUsageFallback("hermes:rell", "hermes")).toBe(true);
    expect(shouldUseRuntimeUsageFallback("mira", "codex")).toBe(false);
    expect(shouldUseRuntimeUsageFallback("rell", undefined)).toBe(false);
  });

  it("keeps the primary Hermes profile query agent scoped before fallback", () => {
    expect(getStatsAgentId("rell", "hermes")).toBe("rell");
    expect(getSessionUsageQueryParams("rell", "hermes", 10, 20)).toEqual({
      agentId: "rell",
      groupBy: "session",
      from: 10,
      to: 20,
    });
    expect(getRuntimeSessionUsageQueryParams("hermes", 10, 20)).toEqual({
      runtime: "hermes",
      groupBy: "session",
      from: 10,
      to: 20,
    });
  });

  it("treats token-only Hermes rows as real activity", () => {
    expect(hasStatsActivity({
      totalCostUsd: 0,
      inputTokens: 11299,
      outputTokens: 94,
      cacheReadTokens: 0,
      sessionCount: 1,
      lastActiveMs: 1777097560499,
    })).toBe(true);
  });

  it("treats zero stats as no activity", () => {
    expect(hasStatsActivity(null)).toBe(false);
    expect(hasStatsActivity(undefined)).toBe(false);
    expect(hasStatsActivity({
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      sessionCount: 0,
      lastActiveMs: 0,
    })).toBe(false);
  });

  it("uses an agent scoped session query when runtime is unknown", () => {
    expect(getSessionUsageQueryParams("rell", undefined, 10, 20)).toEqual({
      agentId: "rell",
      groupBy: "session",
      from: 10,
      to: 20,
    });
  });
});
