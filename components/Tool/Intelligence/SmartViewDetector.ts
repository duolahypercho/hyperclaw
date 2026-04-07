import type { ColumnInfo, SmartViewDetection } from "./types";

/**
 * Detect smart views based on column patterns.
 * Returns all applicable smart views for a table's schema.
 */
export function detectSmartViews(columns: ColumnInfo[]): SmartViewDetection[] {
  const colNames = new Set(columns.map((c) => c.name));
  const views: SmartViewDetection[] = [];

  // Pipeline: has a "status" column with TEXT type
  const statusCol = columns.find(
    (c) => c.name === "status" && c.type.toUpperCase().includes("TEXT")
  );
  if (statusCol) {
    views.push({
      type: "pipeline",
      label: "Pipeline",
      statusColumn: statusCol.name,
    });
  }

  // Chart: has metric + value + period columns
  const metricCol = columns.find((c) => c.name === "metric");
  const valueCol = columns.find(
    (c) => c.name === "value" && (c.type.toUpperCase().includes("REAL") || c.type.toUpperCase().includes("INT"))
  );
  const periodCol = columns.find((c) => c.name === "period");
  if (metricCol && valueCol) {
    views.push({
      type: "chart",
      label: "Chart",
      metricColumn: metricCol.name,
      valueColumn: valueCol.name,
      periodColumn: periodCol?.name,
    });
  }

  // Timeline: has created_at + content columns
  if (colNames.has("created_at") && colNames.has("content")) {
    views.push({ type: "timeline", label: "Timeline" });
  }

  // Research: has topic + finding columns (matches the research table)
  // Also matches opportunities table via title + ai_score + status
  if (colNames.has("topic") && colNames.has("finding")) {
    views.push({ type: "research", label: "Research" });
  } else if (colNames.has("ai_score") && colNames.has("status") && colNames.has("title")) {
    views.push({ type: "research", label: "Opportunities" });
  }

  return views;
}
