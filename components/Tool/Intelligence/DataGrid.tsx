"use client";

import React, { forwardRef, useImperativeHandle, useState, useCallback, useMemo, useEffect } from "react";
import {
  Trash2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  ChevronsUpDown,
} from "lucide-react";
import { useIntel } from "./provider/intelligenceProvider";
import type { ColumnInfo } from "./types";
import {
  coerceInputValue,
  getColumnOptions,
  getFreshnessLabel,
  isBooleanColumnType,
  isNumericColumnType,
  isTimestampColumnName,
} from "./logic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 50;
const INTERNAL_ROWID_COLUMN = "__hyperclaw_rowid";

// ── Cell rendering helpers ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-400/25",
  inactive:  "bg-red-500/15 text-red-400 border-red-400/25",
  pending:   "bg-amber-500/15 text-amber-400 border-amber-400/25",
  open:      "bg-sky-500/15 text-sky-400 border-sky-400/25",
  closed:    "bg-slate-500/15 text-slate-400 border-slate-400/25",
  done:      "bg-emerald-500/15 text-emerald-400 border-emerald-400/25",
  cancelled: "bg-red-500/15 text-red-400 border-red-400/25",
  draft:     "bg-muted/50 text-muted-foreground border-border/30",
  published: "bg-emerald-500/15 text-emerald-400 border-emerald-400/25",
  archived:  "bg-slate-500/15 text-slate-400 border-slate-400/25",
};

function statusPill(val: string): string {
  return STATUS_COLORS[val.toLowerCase()] ?? "bg-muted/40 text-muted-foreground border-border/30";
}

function isUUID(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function formatTimestamp(val: unknown): string {
  if (val == null) return "";
  const n = Number(val);
  if (!isNaN(n) && n > 1e12) return new Date(n).toLocaleString();
  if (!isNaN(n) && n > 1e9) return new Date(n * 1000).toLocaleString();
  try {
    const d = new Date(String(val));
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch { /* empty */ }
  return String(val);
}

function getFreshnessChipClass(label: string): string {
  return label === "fresh"
    ? "bg-emerald-500/15 text-emerald-400"
    : label === "recent"
      ? "bg-sky-500/15 text-sky-400"
      : label === "aging"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-red-500/15 text-red-400";
}

function FreshnessChip({ timestamp }: { timestamp: unknown }) {
  const label = getFreshnessLabel(timestamp);
  if (!label) return null;
  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium", getFreshnessChipClass(label))}>
      {label}
    </span>
  );
}

// ── Cell value renderer ────────────────────────────────────────────────────────

function CellValue({
  col,
  val,
  isStatusCol,
}: {
  col: ColumnInfo;
  val: unknown;
  isStatusCol: boolean;
}) {
  if (val == null) {
    return <span className="text-muted-foreground/40 font-mono text-[11px] select-none">—</span>;
  }

  const strVal = String(val);

  if (isBooleanColumnType(col.type) || strVal === "true" || strVal === "false") {
    const isTrue = strVal === "true" || strVal === "1";
    return (
      <span className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border",
        isTrue
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-400/25"
          : "bg-muted/40 text-muted-foreground border-border/30"
      )}>
        <span className={cn("w-1.5 h-1.5 rounded-full", isTrue ? "bg-emerald-400" : "bg-muted-foreground/50")} />
        {isTrue ? "true" : "false"}
      </span>
    );
  }

  if (isStatusCol) {
    return (
      <span className={cn(
        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border",
        statusPill(strVal)
      )}>
        {strVal}
      </span>
    );
  }

  if (isTimestampColumnName(col.name)) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground text-[11.5px]">{formatTimestamp(val)}</span>
        {(col.name === "updated_at" || col.name === "created_at") && (
          <FreshnessChip timestamp={val} />
        )}
      </span>
    );
  }

  if (col.name === "created_by") {
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded-md bg-violet-500/12 text-violet-400 text-[11px] font-medium border border-violet-400/20">
        {strVal}
      </span>
    );
  }

  if (isUUID(strVal)) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground" title={strVal}>
        {strVal.slice(0, 8)}
        <span className="text-muted-foreground/40">…</span>
      </span>
    );
  }

  return <span className="text-foreground text-[12.5px]">{strVal}</span>;
}

// ── Field input ────────────────────────────────────────────────────────────────

function FieldInput({
  column,
  value,
  onChange,
  onKeyDown,
  autoFocus,
  options,
}: {
  column: ColumnInfo;
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  autoFocus?: boolean;
  options: string[];
}) {
  const selectCls =
    "w-full rounded border border-border/50 bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  if (isBooleanColumnType(column.type)) {
    return (
      <select autoFocus={autoFocus} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}>
        <option value="">null</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (options.length > 0 && options.length <= 12) {
    return (
      <select autoFocus={autoFocus} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (column.name.includes("content") || column.name.includes("notes") || column.name.includes("description")) {
    return (
      <textarea
        autoFocus={autoFocus}
        className={`${selectCls} resize-y min-h-[56px]`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <Input
      autoFocus={autoFocus}
      type={isNumericColumnType(column.type) ? "number" : "text"}
      placeholder={column.name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="h-6 px-1.5 py-0.5 text-xs rounded border-border/50 focus-visible:ring-primary/50"
    />
  );
}

// ── Row key ────────────────────────────────────────────────────────────────────

function getCompletePkParts(row: Record<string, unknown>, columns: ColumnInfo[]): unknown[] | null {
  const pkCols = columns.filter((c) => c.pk);
  if (pkCols.length === 0) return null;

  const parts = pkCols.map((c) => row[c.name]);
  return parts.some((part) => part == null) ? null : parts;
}

function getRowKey(row: Record<string, unknown>, columns: ColumnInfo[]): string {
  if (row.__optimistic_key != null) return String(row.__optimistic_key);
  const pkParts = getCompletePkParts(row, columns);
  if (pkParts) return `pk:${JSON.stringify(pkParts)}`;
  if (row[INTERNAL_ROWID_COLUMN] != null) return `rowid:${String(row[INTERNAL_ROWID_COLUMN])}`;
  if (row.rowid != null) return `rowid:${String(row.rowid)}`;
  if (row.id != null) return `id:${String(row.id)}`;
  return JSON.stringify(row);
}

function getStableRowDisambiguator(row: Record<string, unknown>): string | null {
  const rowid = row[INTERNAL_ROWID_COLUMN] ?? row.rowid;
  if (rowid != null) return `rowid:${String(rowid)}`;
  if (row.id != null) return `id:${String(row.id)}`;
  return null;
}

function getRowKeyEntries(
  rows: Record<string, unknown>[],
  columns: ColumnInfo[],
  offset = 0
): { key: string; row: Record<string, unknown> }[] {
  const baseKeys = rows.map((row) => getRowKey(row, columns));
  const baseCounts = new Map<string, number>();
  const disambiguatorCounts = new Map<string, number>();

  rows.forEach((row, index) => {
    const baseKey = baseKeys[index];
    baseCounts.set(baseKey, (baseCounts.get(baseKey) ?? 0) + 1);
  });

  rows.forEach((row, index) => {
    const baseKey = baseKeys[index];
    const disambiguator = getStableRowDisambiguator(row);
    if (!disambiguator || (baseCounts.get(baseKey) ?? 0) <= 1) return;
    const candidate = `${baseKey}|${disambiguator}`;
    disambiguatorCounts.set(candidate, (disambiguatorCounts.get(candidate) ?? 0) + 1);
  });

  const seenDuplicateKeys = new Map<string, number>();
  return rows.map((row, index) => {
    const baseKey = baseKeys[index];
    if ((baseCounts.get(baseKey) ?? 0) <= 1) return { key: baseKey, row };

    const disambiguator = getStableRowDisambiguator(row);
    const candidate = disambiguator ? `${baseKey}|${disambiguator}` : null;
    if (candidate && disambiguatorCounts.get(candidate) === 1) {
      return { key: candidate, row };
    }

    const duplicateIndex = seenDuplicateKeys.get(baseKey) ?? 0;
    seenDuplicateKeys.set(baseKey, duplicateIndex + 1);
    return {
      key: `${baseKey}|${disambiguator ?? "no-rowid"}|dup:${offset + index}:${duplicateIndex}`,
      row,
    };
  });
}

// ── DataGrid ───────────────────────────────────────────────────────────────────

export interface DataGridHandle {
  triggerAddRow: () => void;
}

export const DataGrid = forwardRef<DataGridHandle>(function DataGrid(_, ref) {
  const { rows: liveRows, selectedTable, schema, tableLoading, insertRow, updateRow, deleteRow } = useIntel();
  const [sortCol, setSortCol]       = useState<string | null>(null);
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc");
  const [page, setPage]             = useState(0);
  const [editingCell, setEditingCell] = useState<{ rowKey: string; col: string } | null>(null);
  const [editValue, setEditValue]   = useState("");
  const [addingRow, setAddingRow]   = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");

  const rows = liveRows;

  const columns: ColumnInfo[] = useMemo(() => {
    if (!selectedTable || !schema?.tables[selectedTable]) return [];
    return schema.tables[selectedTable].columns;
  }, [selectedTable, schema]);

  useImperativeHandle(ref, () => ({
    triggerAddRow: () => { setAddingRow(true); setNewRowData({}); },
  }));

  const displayColumns = useMemo(
    () => columns.filter((c) =>
      !["created_at", "updated_at", "created_by"].includes(c.name) ||
      rows.some((r) => r[c.name] != null)
    ),
    [columns, rows]
  );

  const statusColumn  = useMemo(() => columns.find((c) => c.name === "status"), [columns]);
  const statusOptions = useMemo(
    () => (statusColumn ? getColumnOptions(rows, statusColumn.name) : []),
    [rows, statusColumn]
  );

  const searchableColumns = useMemo(() => displayColumns.map((c) => c.name), [displayColumns]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (searchTerm.trim()) {
      const needle = searchTerm.trim().toLowerCase();
      if (!searchableColumns.some((n) => String(row[n] ?? "").toLowerCase().includes(needle))) return false;
    }
    if (statusColumn && statusFilter !== "all") {
      if (String(row[statusColumn.name] ?? "") !== statusFilter) return false;
    }
    if (freshnessFilter !== "all") {
      if (getFreshnessLabel(row.updated_at ?? row.created_at) !== freshnessFilter) return false;
    }
    return true;
  }), [rows, searchTerm, searchableColumns, statusColumn, statusFilter, freshnessFilter]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const va = a[sortCol] ?? "";
      const vb = b[sortCol] ?? "";
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir]);

  const pageRows   = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedRows, page]
  );
  const pageRowEntries = useMemo(
    () => getRowKeyEntries(pageRows, columns, page * PAGE_SIZE),
    [columns, page, pageRows]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));

  useEffect(() => { setPage(0); }, [selectedTable, searchTerm, statusFilter, freshnessFilter]);
  useEffect(() => { if (page >= totalPages) setPage(Math.max(0, totalPages - 1)); }, [page, totalPages]);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }, [sortCol]);

  const getPkWhere = useCallback((row: Record<string, unknown>) => {
    const pkCols = columns.filter((c) => c.pk);
    if (pkCols.length > 0 && pkCols.every((c) => row[c.name] != null)) {
      const where: Record<string, unknown> = {};
      pkCols.forEach((c) => (where[c.name] = row[c.name]));
      return where;
    }
    if (row[INTERNAL_ROWID_COLUMN] != null) return { rowid: row[INTERNAL_ROWID_COLUMN] };
    if (row.rowid != null) return { rowid: row.rowid };
    if (row.id    != null) return { id: row.id };
    return {};
  }, [columns]);

  const handleCellEdit = useCallback(async (row: Record<string, unknown>, col: ColumnInfo) => {
    const where = getPkWhere(row);
    if (Object.keys(where).length === 0) return;
    const ok = await updateRow({ [col.name]: coerceInputValue(editValue, col) }, where);
    if (ok) setEditingCell(null);
  }, [editValue, getPkWhere, updateRow]);

  const handleAddRow = useCallback(async () => {
    const data: Record<string, unknown> = {};
    for (const col of displayColumns) {
      const val = newRowData[col.name] ?? "";
      if (val === "") continue;
      data[col.name] = coerceInputValue(val, col);
    }
    if (Object.keys(data).length === 0) return;
    const ok = await insertRow(data);
    if (ok) { setAddingRow(false); setNewRowData({}); }
  }, [displayColumns, insertRow, newRowData]);

  const handleDeleteRow = useCallback(async (row: Record<string, unknown>) => {
    const where = getPkWhere(row);
    if (Object.keys(where).length === 0) return;
    await deleteRow(where);
  }, [deleteRow, getPkWhere]);

  if (!selectedTable) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a table from the sidebar
      </div>
    );
  }

  if (tableLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground animate-pulse">
        Loading…
      </div>
    );
  }

  const isStatusCol = (colName: string) => colName === "status";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background border-1 border-solid border-border rounded-md">
      {/* ── Table ──
           Left edge  → border-l on the # column
           Right edge → last content col: last:border-r-0
           Top edge   → toolbar's border-b
           Bottom edge→ last row cells' border-b                                  ── */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="min-w-max w-full border-separate border-spacing-0 text-[12.5px]">

          {/* Header — [&_tr]:border-0 cancels TableHeader's default [&_tr]:border-b */}
          <TableHeader className="sticky top-0 z-10 [&_tr]:border-0">
            <TableRow className="bg-muted/40 border-0 hover:bg-muted/40 backdrop-blur-sm">
       
              {/* # col — owns the LEFT edge */}
              <TableHead className="w-10 px-2 py-0 h-auto border-b-1 border-l-0 border-r-1 border-t-0 border-solid border-border select-none shrink-0 font-normal text-foreground">
                <div className="flex items-center justify-center py-2.5">
                  <span className="text-[10px] font-mono text-muted-foreground/50">#</span>
                </div>
              </TableHead>

              {displayColumns.map((col) => (
                <TableHead
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="px-0 py-0 h-auto text-left cursor-pointer select-none border-b-1 border-r-0 border-t-0 border-l-0 border-r-1 border-solid border-border last:border-r-0 min-w-[140px] font-normal text-foreground"
                >
                  <div className="flex flex-col gap-1 px-3 py-2.5 hover:bg-muted/60 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[12px] text-foreground/90 truncate">{col.name}</span>
                      {col.pk && (
                        <span className="text-[8.5px] font-bold px-1 py-px rounded-sm bg-primary/15 text-primary border border-solid border-primary/40 leading-none shrink-0">
                          PK
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-muted-foreground/50">
                        {sortCol === col.name ? (
                          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3" />
                        )}
                      </span>
                    </div>
                    <span className="self-start text-[9.5px] font-mono px-1.5 py-0.5 rounded-sm border border-solid border-border bg-transparent text-muted-foreground leading-none">
                      {col.type.toUpperCase().split("(")[0]}
                    </span>
                  </div>
                </TableHead>
              ))}

              {/* Delete col header */}
              <TableHead className="w-8 h-auto border-b-1 border-t-0 border-l-0 border-r-0 border-solid border-border shrink-0 px-0 py-0" />
            </TableRow>
          </TableHeader>

          {/* Body — override [&_tr:last-child]:border-0 so last row keeps its border-b on cells */}
          <TableBody className="[&_tr:last-child]:border-b-0 ">

            {/* ── New row ── */}
            {addingRow && (
              <TableRow className="bg-primary/5 align-top border-0 hover:bg-primary/5">
                <TableCell className="w-10 px-2 py-1.5 border-b border-l-1 border-r-1 border-r-0 border-b-0 border-solid border-border text-center text-[10px] font-mono text-muted-foreground/50">
                  *
                </TableCell>
                {displayColumns.map((col) => (
                  <TableCell key={col.name} className="px-2 py-1.5 border-b border-t-0 border-l-0 border-r border-solid border-border last:border-r-0">
                    {col.name === "created_at" || col.name === "updated_at" || col.name === "created_by" ? (
                      <span className="text-muted-foreground/50 italic text-[11px]">auto</span>
                    ) : (
                      <FieldInput
                        column={col}
                        value={newRowData[col.name] ?? ""}
                        options={getColumnOptions(rows, col.name)}
                        onChange={(next) => setNewRowData((d) => ({ ...d, [col.name]: next }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !(e.shiftKey && e.currentTarget.tagName === "TEXTAREA")) {
                            e.preventDefault();
                            handleAddRow();
                          }
                          if (e.key === "Escape") setAddingRow(false);
                        }}
                      />
                    )}
                  </TableCell>
                ))}
                <TableCell className="px-1 py-1.5 border-b-1 border-l-0 border-r-0 border-t-0 border-solid border-border">
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={handleAddRow}
                      className="h-5 w-5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => setAddingRow(false)}
                      className="h-5 w-5 text-red-400 hover:bg-red-500/20 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* ── Data rows ── */}
            {pageRowEntries.map(({ key: rowKey, row }, rowIdx) => {
              const isOptimistic = row.__optimistic === true;
              const globalIdx   = page * PAGE_SIZE + rowIdx + 1;

              return (
                <TableRow
                  key={rowKey}
                  className={cn(
                    "group border-0 hover:bg-muted/20 transition-colors align-middle",
                    isOptimistic && "opacity-60"
                  )}
                >
                  {/* # col — border-l is the left edge */}
                  <TableCell className="w-10 px-2 py-2 border-b-1 border-l-0 border-r-1 border-t-0 border-solid border-border text-center text-[10.5px] font-mono text-muted-foreground/40 select-none shrink-0">
                    {globalIdx}
                  </TableCell>

                  {displayColumns.map((col) => {
                    const val       = row[col.name];
                    const isEditing = editingCell?.rowKey === rowKey && editingCell?.col === col.name;
                    const options   = getColumnOptions(rows, col.name);

                    return (
                      <TableCell
                        key={col.name}
                        className="px-3 py-2 border-b-1 border-l-0 border-t-0 border-r-1 border-solid border-border last:border-r-0 max-w-[280px] align-middle"
                      >
                        {isEditing ? (
                          <FieldInput
                            autoFocus
                            column={col}
                            value={editValue}
                            options={options}
                            onChange={setEditValue}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !(e.shiftKey && e.currentTarget.tagName === "TEXTAREA")) {
                                e.preventDefault();
                                handleCellEdit(row, col);
                              }
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                          />
                        ) : (
                          <div
                            className="truncate cursor-text"
                            onDoubleClick={() => {
                              setEditingCell({ rowKey, col: col.name });
                              setEditValue(val == null ? "" : String(val));
                            }}
                            title={val != null ? String(val) : "null"}
                          >
                            <CellValue col={col} val={val} isStatusCol={isStatusCol(col.name)} />
                            {rowIdx === 0 && isOptimistic && (
                              <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                                syncing
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}

                  {/* Delete */}
                  <TableCell className="w-8 px-1 py-2 border-b-1 border-t-0 border-l-0 border-r-0 border-solid border-border">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => handleDeleteRow(row)}
                      title="Delete row"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-500/20 hover:text-red-400 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* ── Empty state ── */}
            {pageRows.length === 0 && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell
                  colSpan={displayColumns.length + 2}
                  className="px-4 py-12 text-center"
                >
                  <span className="text-2xl block mb-2 opacity-20">◈</span>
                  <span className="text-[13px] text-muted-foreground">
                    No rows match the current filters
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-b-0 border-l-0 border-r-0 border-solid border-border bg-muted/10 text-[12px] text-muted-foreground shrink-0">
          <span>
            Page {page + 1} of {totalPages} · {sortedRows.length.toLocaleString()} rows
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="iconSm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
