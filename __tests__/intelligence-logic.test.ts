import { describe, expect, it, vi } from "vitest";
import {
  coerceInputValue,
  getFreshnessLabel,
  getIntelEventRefreshPlan,
  matchesWhere,
} from "$/components/Tool/Intelligence/logic";
import type { ColumnInfo } from "$/components/Tool/Intelligence/types";

function col(name: string, type = "TEXT"): ColumnInfo {
  return {
    name,
    type,
    notnull: false,
    default: null,
    pk: false,
  };
}

describe("intelligence logic", () => {
  it("plans schema and table refresh for DDL-like intel events", () => {
    expect(
      getIntelEventRefreshPlan({ action: "execute", ddl: true, table: "contacts" }, "contacts")
    ).toEqual({
      schema: true,
      table: true,
    });
  });

  it("skips table refresh when event targets a different table", () => {
    expect(
      getIntelEventRefreshPlan({ action: "update", table: "research" }, "contacts")
    ).toEqual({
      schema: false,
      table: false,
    });
  });

  it("coerces numeric and boolean form values from schema", () => {
    expect(coerceInputValue("42", col("employee_count", "INTEGER"))).toBe(42);
    expect(coerceInputValue("true", col("active", "BOOLEAN"))).toBe(true);
    expect(coerceInputValue("", col("notes"))).toBeNull();
  });

  it("matches rows against update/delete where clauses", () => {
    expect(matchesWhere({ id: "a", status: "lead" }, { id: "a" })).toBe(true);
    expect(matchesWhere({ id: "a", status: "lead" }, { id: "b" })).toBe(false);
  });

  it("computes freshness bands from timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));

    expect(getFreshnessLabel(Date.parse("2026-03-26T11:30:00Z"))).toBe("fresh");
    expect(getFreshnessLabel(Date.parse("2026-03-25T12:00:00Z"))).toBe("aging");

    vi.useRealTimers();
  });
});
