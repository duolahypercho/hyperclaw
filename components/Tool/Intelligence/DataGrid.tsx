"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Plus,
  Trash2,
  Check,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
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

const PAGE_SIZE = 50;

function formatTimestamp(val: unknown): string {
  if (val == null) return "";
  const n = Number(val);
  if (!isNaN(n) && n > 1e12) return new Date(n).toLocaleString();
  if (!isNaN(n) && n > 1e9) return new Date(n * 1000).toLocaleString();
  return String(val);
}

function FreshnessChip({ timestamp }: { timestamp: unknown }) {
  const label = getFreshnessLabel(timestamp);
  if (!label) return null;

  const color =
    label === "fresh"
      ? "bg-emerald-500/20 text-emerald-400"
      : label === "recent"
        ? "bg-blue-500/20 text-blue-400"
        : label === "aging"
          ? "bg-yellow-500/20 text-yellow-400"
          : "bg-red-500/20 text-red-400";

  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}

function getRowKey(row: Record<string, unknown>, columns: ColumnInfo[]): string {
  if (row.__optimistic_key != null) return String(row.__optimistic_key);
  const pkCols = columns.filter((col) => col.pk);
  if (pkCols.length > 0) {
    const parts = pkCols.map((col) => String(row[col.name] ?? ""));
    return `pk:${parts.join("|")}`;
  }
  if (row.rowid != null) return `rowid:${String(row.rowid)}`;
  if (row.id != null) return `id:${String(row.id)}`;
  return JSON.stringify(row);
}

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
  const baseClassName =
    "w-full rounded border border-solid border-border/50 bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  if (isBooleanColumnType(column.type)) {
    return (
      <select
        autoFocus={autoFocus}
        className={baseClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      >
        <option value="">null</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (options.length > 0 && options.length <= 12) {
    return (
      <select
        autoFocus={autoFocus}
        className={baseClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (column.name.includes("content") || column.name.includes("notes") || column.name.includes("description")) {
    return (
      <textarea
        autoFocus={autoFocus}
        className={`${baseClassName} resize-y min-h-[56px]`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <input
      autoFocus={autoFocus}
      className={baseClassName}
      type={isNumericColumnType(column.type) ? "number" : "text"}
      placeholder={column.name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export function DataGrid() {
  const { rows, selectedTable, schema, tableLoading, insertRow, updateRow, deleteRow } = useIntel();
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [editingCell, setEditingCell] = useState<{ rowKey: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingRow, setAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");

  const columns: ColumnInfo[] = useMemo(() => {
    if (!selectedTable || !schema?.tables[selectedTable]) return [];
    return schema.tables[selectedTable].columns;
  }, [selectedTable, schema]);

  const rowKeyMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    rows.forEach((row) => {
      map.set(getRowKey(row, columns), row);
    });
    return map;
  }, [columns, rows]);

  const displayColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          !["created_at", "updated_at", "created_by"].includes(c.name) ||
          rows.some((r) => r[c.name] != null)
      ),
    [columns, rows]
  );

  const statusColumn = useMemo(() => columns.find((col) => col.name === "status"), [columns]);
  const statusOptions = useMemo(
    () => (statusColumn ? getColumnOptions(rows, statusColumn.name) : []),
    [rows, statusColumn]
  );

  const searchableColumns = useMemo(
    () => displayColumns.map((col) => col.name),
    [displayColumns]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (searchTerm.trim()) {
        const needle = searchTerm.trim().toLowerCase();
        const matchesSearch = searchableColumns.some((name) =>
          String(row[name] ?? "").toLowerCase().includes(needle)
        );
        if (!matchesSearch) return false;
      }

      if (statusColumn && statusFilter !== "all") {
        if (String(row[statusColumn.name] ?? "") !== statusFilter) return false;
      }

      if (freshnessFilter !== "all") {
        const freshnessTimestamp = row.updated_at ?? row.created_at;
        if (getFreshnessLabel(freshnessTimestamp) !== freshnessFilter) return false;
      }

      return true;
    });
  }, [rows, searchTerm, searchableColumns, statusColumn, statusFilter, freshnessFilter]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const va = a[sortCol] ?? "";
      const vb = b[sortCol] ?? "";
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir]);

  const pageRows = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedRows, page]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [selectedTable, searchTerm, statusFilter, freshnessFilter]);

  useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("desc");
      }
    },
    [sortCol]
  );

  const getPkWhere = useCallback(
    (row: Record<string, unknown>) => {
      const pkCols = columns.filter((c) => c.pk);
      if (pkCols.length > 0) {
        const where: Record<string, unknown> = {};
        pkCols.forEach((c) => (where[c.name] = row[c.name]));
        return where;
      }
      if (row.rowid != null) return { rowid: row.rowid };
      if (row.id != null) return { id: row.id };
      return {};
    },
    [columns]
  );

  const handleCellEdit = useCallback(
    async (rowKey: string, col: ColumnInfo) => {
      const row = rowKeyMap.get(rowKey);
      if (!row) return;
      const where = getPkWhere(row);
      if (Object.keys(where).length === 0) return;
      const ok = await updateRow({ [col.name]: coerceInputValue(editValue, col) }, where);
      if (ok) setEditingCell(null);
    },
    [editValue, getPkWhere, rowKeyMap, updateRow]
  );

  const handleAddRow = useCallback(async () => {
    const data: Record<string, unknown> = {};
    for (const col of displayColumns) {
      const val = newRowData[col.name] ?? "";
      if (val === "") continue;
      data[col.name] = coerceInputValue(val, col);
    }
    if (Object.keys(data).length === 0) return;
    const ok = await insertRow(data);
    if (ok) {
      setAddingRow(false);
      setNewRowData({});
    }
  }, [displayColumns, insertRow, newRowData]);

  const handleDeleteRow = useCallback(
    async (row: Record<string, unknown>) => {
      const where = getPkWhere(row);
      if (Object.keys(where).length === 0) return;
      await deleteRow(where);
    },
    [deleteRow, getPkWhere]
  );

  if (!selectedTable) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a table from the sidebar
      </div>
    );
  }

  if (tableLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{selectedTable}</h3>
          <span className="text-xs text-muted-foreground">
            {sortedRows.length} filtered row{sortedRows.length !== 1 ? "s" : ""}
          </span>
          {sortedRows.length !== rows.length && (
            <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              {rows.length} total
            </span>
          )}
        </div>
        <button
          onClick={() => {
            setAddingRow(true);
            setNewRowData({});
          }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add row
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30 bg-background/60 shrink-0">
        <label className="relative min-w-[220px] flex-1 max-w-[320px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search rows..."
            className="w-full rounded-md border border-solid border-border/50 bg-background pl-7 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>

        {statusColumn && statusOptions.length > 0 && (
          <label className="inline-flex items-center gap-1 rounded-md border border-solid border-border/50 bg-background px-2 py-1 text-xs text-muted-foreground">
            <Filter className="h-3 w-3" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-foreground focus:outline-none"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-xs text-muted-foreground">
          <Filter className="h-3 w-3" />
          <select
            value={freshnessFilter}
            onChange={(e) => setFreshnessFilter(e.target.value)}
            className="bg-transparent text-foreground focus:outline-none"
          >
            <option value="all">All freshness</option>
            <option value="fresh">Fresh</option>
            <option value="recent">Recent</option>
            <option value="aging">Aging</option>
            <option value="stale">Stale</option>
          </select>
        </label>

        {(searchTerm || statusFilter !== "all" || freshnessFilter !== "all") && (
          <button
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("all");
              setFreshnessFilter("all");
            }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
            <tr>
              {displayColumns.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30 select-none"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.name}
                    {col.pk && <span className="text-[9px] text-primary font-bold">PK</span>}
                    {sortCol === col.name ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
              <th className="w-8 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30" />
            </tr>
          </thead>
          <tbody>
            {addingRow && (
              <tr className="bg-primary/5 align-top">
                {displayColumns.map((col) => (
                  <td key={col.name} className="px-2 py-1">
                    {col.name === "created_at" || col.name === "updated_at" || col.name === "created_by" ? (
                      <span className="text-muted-foreground italic">auto</span>
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
                  </td>
                ))}
                <td className="px-1 py-1">
                  <div className="flex gap-0.5">
                    <button
                      onClick={handleAddRow}
                      className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setAddingRow(false)}
                      className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {pageRows.map((row) => {
              const rowKey = getRowKey(row, columns);
              const isOptimistic = row.__optimistic === true;

              return (
                <tr
                  key={rowKey}
                  className={`group border-solid border-b border-t-0 border-r-0 border-l-0 border-border/10 hover:bg-muted/30 transition-colors ${
                    isOptimistic ? "opacity-70" : ""
                  }`}
                >
                  {displayColumns.map((col, colIdx) => {
                    const val = row[col.name];
                    const isEditing =
                      editingCell?.rowKey === rowKey && editingCell?.col === col.name;
                    const options = getColumnOptions(rows, col.name);

                    return (
                      <td key={col.name} className="px-3 py-1.5 max-w-[300px] align-top">
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
                                handleCellEdit(rowKey, col);
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
                            {isTimestampColumnName(col.name) ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-muted-foreground">{formatTimestamp(val)}</span>
                                {(col.name === "updated_at" || col.name === "created_at") && (
                                  <FreshnessChip timestamp={val} />
                                )}
                              </span>
                            ) : val == null ? (
                              <span className="text-muted-foreground/50 italic">null</span>
                            ) : col.name === "created_by" ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 text-[10px] font-medium">
                                {String(val)}
                              </span>
                            ) : (
                              <span className="text-foreground">
                                {String(val)}
                                {colIdx === 0 && isOptimistic && (
                                  <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                                    syncing
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1.5">
                    <button
                      onClick={() => handleDeleteRow(row)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-opacity"
                      title="Delete row"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={displayColumns.length + 1}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No rows match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-solid border-t border-r-0 border-b-0 border-l-0 border-border/50 text-xs text-muted-foreground shrink-0">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
