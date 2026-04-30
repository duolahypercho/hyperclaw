"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Table as TableIcon, Key, Play } from "lucide-react";
import {
  EnsShell,
  Section,
  Kpi,
  EnsButton,
} from "$/components/ensemble";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

// ── Types ──────────────────────────────────────────────────────────────────

interface LiveColumn {
  name: string;
  type: string;
  pk: boolean;
  notnull?: boolean;
}

interface LiveTable {
  name: string;
  icon: string;
  desc: string;
  columns: LiveColumn[];
  rowCount: number;
  sampleColumns: string[];
  sampleRows: unknown[][];
  loadingSample: boolean;
}

interface SchemaColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  default: string | null;
}

interface SchemaTableInfo {
  columns: SchemaColumnInfo[];
  row_count: number;
}

interface SchemaResponse {
  // tables is a map keyed by table name
  tables?: Record<string, SchemaTableInfo>;
}

interface QueryResponse {
  columns: string[];
  rows: unknown[][];
}

// ── Icon derivation ────────────────────────────────────────────────────────

function iconForTable(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("contact")) return "◆";
  if (n.includes("research") || n.includes("finding")) return "▤";
  if (n.includes("ticket") || n.includes("support")) return "●";
  if (n.includes("metric") || n.includes("daily")) return "∿";
  return "◈";
}

// ── Hook ───────────────────────────────────────────────────────────────────

function useLiveTables(activeTableName: string | null) {
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedSamples = useRef<Set<string>>(new Set());

  // Load schema on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    bridgeInvoke("intel-schema", {})
      .then((result) => {
        if (cancelled) return;
        const r = result as SchemaResponse;
        const tablesMap = r?.tables ?? {};
        const mapped: LiveTable[] = Object.entries(tablesMap).map(([name, info]) => ({
          name,
          icon: iconForTable(name),
          desc: "",
          columns: (info.columns ?? []).map((c) => ({ name: c.name, type: c.type, pk: c.pk, notnull: c.notnull })),
          rowCount: info.row_count ?? 0,
          sampleColumns: [],
          sampleRows: [],
          loadingSample: false,
        }));
        setTables(mapped);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load schema");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Fetch sample rows when active table changes
  useEffect(() => {
    if (!activeTableName || fetchedSamples.current.has(activeTableName)) return;

    fetchedSamples.current.add(activeTableName);

    setTables((prev) =>
      prev.map((t) =>
        t.name === activeTableName ? { ...t, loadingSample: true } : t
      )
    );

    bridgeInvoke("intel-query", { sql: `SELECT * FROM [${activeTableName}] LIMIT 7` })
      .then((result) => {
        const r = result as QueryResponse;
        setTables((prev) =>
          prev.map((t) =>
            t.name === activeTableName
              ? { ...t, sampleColumns: r.columns ?? [], sampleRows: r.rows ?? [], loadingSample: false }
              : t
          )
        );
      })
      .catch(() => {
        setTables((prev) =>
          prev.map((t) =>
            t.name === activeTableName ? { ...t, loadingSample: false } : t
          )
        );
      });
  }, [activeTableName]);

  return { tables, loading, error };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function DataTables() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sqlInput, setSqlInput] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);

  const resolvedActive = activeId;
  const { tables, loading, error } = useLiveTables(resolvedActive);

  // Set initial active table once schema loads
  useEffect(() => {
    if (tables.length > 0 && activeId === null) {
      setActiveId(tables[0].name);
    }
  }, [tables, activeId]);

  const active = tables.find((t) => t.name === activeId) ?? null;

  // Reset SQL input when active table changes
  useEffect(() => {
    if (activeId) {
      setSqlInput(`SELECT * FROM [${activeId}] LIMIT 10`);
      setQueryResult(null);
      setQueryError(null);
    }
  }, [activeId]);

  const runQuery = useCallback(async () => {
    if (!sqlInput.trim()) return;
    setQueryRunning(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const result = await bridgeInvoke("intel-query", { sql: sqlInput });
      setQueryResult(result as QueryResponse);
    } catch (err: unknown) {
      setQueryError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setQueryRunning(false);
    }
  }, [sqlInput]);

  const totalRows = tables.reduce((s, t) => s + t.rowCount, 0);

  if (loading) {
    return (
      <EnsShell padded={false} className="flex">
        <div className="flex-1 flex items-center justify-center" style={{ color: "var(--ink-4)" }}>
          <div className="text-sm ens-sub animate-pulse">Loading schema…</div>
        </div>
      </EnsShell>
    );
  }

  if (error) {
    return (
      <EnsShell padded={false} className="flex">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm" style={{ color: "var(--danger, #e55)" }}>{error}</div>
        </div>
      </EnsShell>
    );
  }

  return (
    <EnsShell padded={false} className="flex">
      {/* Rail */}
      <aside
        className="border-r flex flex-col"
        style={{ width: 280, borderColor: "var(--line)", background: "var(--paper-2)" }}
      >
        <div className="px-5 py-5 border-b" style={{ borderColor: "var(--line)" }}>
          <h1 className="ens-h2">Data</h1>
          <p className="ens-sub text-xs mt-1">
            {tables.length} tables · {totalRows.toLocaleString()} rows
          </p>
        </div>
        <div className="flex-1 overflow-auto px-2 py-2">
          {tables.map((t) => (
            <TableRow
              key={t.name}
              table={t}
              active={t.name === activeId}
              onClick={() => setActiveId(t.name)}
            />
          ))}
          {tables.length === 0 && (
            <div className="px-3 py-4 ens-sub text-xs">No tables found.</div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {active ? (
          <div className="px-8 py-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="text-3xl">{active.icon}</div>
              <div className="flex-1">
                <h1 className="ens-hero">{active.name}</h1>
                {active.desc && <p className="ens-sub mt-1">{active.desc}</p>}
              </div>
            </div>

            <div className="ens-grid-kpi mb-6">
              <Kpi label="Rows" value={active.rowCount.toLocaleString()} />
              <Kpi label="Columns" value={String(active.columns.length)} />
            </div>

            <div className="ens-grid-2 gap-6">
              {/* Left: Schema + Sample */}
              <div>
                <Section title="Schema">
                  <div className="flex flex-col">
                    {active.columns.map((col) => (
                      <SchemaRow key={col.name} col={col} />
                    ))}
                  </div>
                </Section>

                <div className="mt-4">
                  <Section title="Sample rows">
                    {active.loadingSample ? (
                      <div className="ens-sub text-xs animate-pulse py-2">Loading…</div>
                    ) : active.sampleColumns.length > 0 ? (
                      <TablePreview columns={active.sampleColumns} rows={active.sampleRows} />
                    ) : (
                      <div className="ens-sub text-xs py-2">No sample data.</div>
                    )}
                  </Section>
                </div>
              </div>

              {/* Right: SQL query panel */}
              <div>
                <Section title="SQL query">
                  <div className="ens-sub text-xs mb-3">Run a query against this table.</div>
                  <textarea
                    value={sqlInput}
                    onChange={(e) => setSqlInput(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    className="w-full ens-mono text-xs rounded border px-3 py-2 resize-none"
                    style={{
                      background: "var(--paper-3)",
                      borderColor: "var(--line)",
                      color: "var(--ink)",
                      outline: "none",
                    }}
                  />
                  <div className="mt-2 flex justify-end">
                    <EnsButton
                      variant="accent"
                      onClick={queryRunning ? undefined : runQuery}
                      disabled={queryRunning}
                    >
                      <Play size={12} />
                      {queryRunning ? "Running…" : "Run query"}
                    </EnsButton>
                  </div>

                  {queryError && (
                    <div className="mt-3 text-xs px-2 py-2 rounded" style={{ color: "var(--danger, #e55)", background: "var(--paper-3)" }}>
                      {queryError}
                    </div>
                  )}

                  {queryResult && (
                    <div className="mt-3">
                      <div className="ens-sub text-xs mb-2">
                        {queryResult.rows.length} rows · {queryResult.columns.length} columns
                      </div>
                      <div className="overflow-auto rounded border" style={{ borderColor: "var(--line)" }}>
                        <TablePreview columns={queryResult.columns} rows={queryResult.rows} />
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center ens-sub text-sm">
            Select a table.
          </div>
        )}
      </div>
    </EnsShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TableRow({
  table,
  active,
  onClick,
}: {
  table: LiveTable;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-3 py-2.5 rounded text-left transition-colors mb-1"
      style={{
        background: active ? "var(--paper-3)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-3)",
      }}
    >
      <div className="text-lg flex-shrink-0">{table.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="ens-mono" style={{ fontSize: 13, fontWeight: 500 }}>
            {table.name}
          </span>
        </div>
        <div className="ens-sub text-xs truncate">{table.rowCount.toLocaleString()} rows</div>
      </div>
    </button>
  );
}

function SchemaRow({ col }: { col: LiveColumn }) {
  return (
    <div
      className="flex items-center gap-3 py-2 border-b"
      style={{ borderColor: "var(--line)" }}
    >
      {col.pk ? (
        <Key size={12} style={{ color: "var(--accent)" }} />
      ) : (
        <TableIcon size={12} style={{ color: "var(--ink-4)" }} />
      )}
      <div className="flex-1 ens-mono" style={{ fontSize: 13, color: "var(--ink)" }}>
        {col.name}
      </div>
      <div className="ens-sub ens-mono text-xs">{col.type}</div>
      {col.pk && <span className="ens-sub text-xs">pk</span>}
    </div>
  );
}

function TablePreview({
  columns,
  rows,
}: {
  columns: string[];
  rows: unknown[][];
}) {
  return (
    <div className="overflow-auto" style={{ margin: -16, padding: 16 }}>
      <table className="w-full ens-mono" style={{ fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="ens-sub text-left px-2 py-2 border-b"
                style={{ borderColor: "var(--line)", fontWeight: 500 }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {(row as unknown[]).map((cell, cidx) => (
                <td
                  key={cidx}
                  className="px-2 py-1.5 border-b"
                  style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
                >
                  {cell === null || cell === undefined
                    ? <span className="ens-sub">null</span>
                    : typeof cell === "number"
                    ? cell.toLocaleString()
                    : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
