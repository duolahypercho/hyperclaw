import { describe, expect, it } from "vitest";
import { detectSmartViews } from "$/components/Tool/Intelligence/SmartViewDetector";
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

describe("detectSmartViews", () => {
  it("detects pipeline tables from a text status column", () => {
    const views = detectSmartViews([col("id"), col("status"), col("name")]);

    expect(views).toContainEqual({
      type: "pipeline",
      label: "Pipeline",
      statusColumn: "status",
    });
  });

  it("detects chart tables from metric and numeric value columns", () => {
    const views = detectSmartViews([col("metric"), col("value", "REAL"), col("period")]);

    expect(views).toContainEqual({
      type: "chart",
      label: "Chart",
      metricColumn: "metric",
      valueColumn: "value",
      periodColumn: "period",
    });
  });

  it("detects timeline tables from created_at and content columns", () => {
    const views = detectSmartViews([col("created_at", "INTEGER"), col("content"), col("created_by")]);

    expect(views).toContainEqual({
      type: "timeline",
      label: "Timeline",
    });
  });

  it("supports multiple smart views on the same table", () => {
    const views = detectSmartViews([
      col("status"),
      col("metric"),
      col("value", "INTEGER"),
      col("period"),
      col("created_at", "INTEGER"),
      col("content"),
    ]);

    expect(views.map((view) => view.type)).toEqual(["pipeline", "chart", "timeline"]);
  });
});
