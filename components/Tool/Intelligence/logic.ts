import type { ColumnInfo } from "./types";

export function isTimestampColumnName(name: string): boolean {
  return name.endsWith("_at") || name === "started_at";
}

export function isNumericColumnType(type: string): boolean {
  const upper = type.toUpperCase();
  return upper.includes("INT") || upper.includes("REAL") || upper.includes("NUM");
}

export function isBooleanColumnType(type: string): boolean {
  const upper = type.toUpperCase();
  return upper.includes("BOOL");
}

export function getFreshnessLabel(timestamp: unknown): "fresh" | "recent" | "aging" | "stale" | null {
  if (timestamp == null) return null;
  const ms = Number(timestamp);
  if (isNaN(ms)) return null;
  const age = Date.now() - (ms > 1e12 ? ms : ms * 1000);
  const hours = age / 3600000;
  if (hours < 1) return "fresh";
  if (hours < 24) return "recent";
  if (hours < 168) return "aging";
  return "stale";
}

export function getColumnOptions(
  rows: Record<string, unknown>[],
  columnName: string,
  limit = 24
): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[columnName];
    if (value == null || value === "") continue;
    values.add(String(value));
    if (values.size >= limit) break;
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function coerceInputValue(rawValue: string, column: ColumnInfo): unknown {
  if (rawValue === "") return null;
  if (isBooleanColumnType(column.type)) {
    return rawValue === "true";
  }
  if (isNumericColumnType(column.type)) {
    const num = Number(rawValue);
    return Number.isNaN(num) ? rawValue : num;
  }
  return rawValue;
}

export function getIntelEventRefreshPlan(
  payload: Record<string, unknown>,
  selectedTable: string | null
): { schema: boolean; table: boolean } {
  const table = typeof payload.table === "string" ? payload.table : null;
  const isSchemaAffecting = payload.action === "execute" || Boolean(payload.ddl);

  return {
    schema: isSchemaAffecting,
    table: !table || table === selectedTable,
  };
}

export function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown>
): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}
