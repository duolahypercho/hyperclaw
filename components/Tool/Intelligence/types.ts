export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  default: string | null;
  pk: boolean;
}

export interface TableMeta {
  columns: ColumnInfo[];
  row_count: number;
  freshness: { oldest: number; newest: number; column: string } | null;
  indexes: { name: string; unique: boolean }[];
}

export interface IntelSchema {
  tables: Record<string, TableMeta>;
  fts5_available?: boolean;
}

export type SmartViewType = "grid" | "pipeline" | "chart" | "timeline";

export interface SmartViewDetection {
  type: SmartViewType;
  label: string;
  statusColumn?: string;
  metricColumn?: string;
  valueColumn?: string;
  periodColumn?: string;
}
