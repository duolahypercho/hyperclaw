"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Database, RefreshCw, Table2, TerminalSquare } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { AppSchema } from "@OS/Layout/types";
import type { IntelSchema } from "../types";
import { getIntelEventRefreshPlan, matchesWhere } from "../logic";

interface IntelContextValue {
  schema: IntelSchema | null;
  selectedTable: string | null;
  rows: Record<string, unknown>[];
  loading: boolean;
  tableLoading: boolean;
  error: string | null;
  sqlConsoleOpen: boolean;
  appSchema: AppSchema;
  selectTable: (name: string | null) => void;
  refreshSchema: () => Promise<void>;
  refreshTable: () => Promise<void>;
  insertRow: (data: Record<string, unknown>) => Promise<boolean>;
  updateRow: (data: Record<string, unknown>, where: Record<string, unknown>) => Promise<boolean>;
  deleteRow: (where: Record<string, unknown>) => Promise<boolean>;
  runQuery: (sql: string) => Promise<{ rows?: Record<string, unknown>[]; error?: string }>;
  setSqlConsoleOpen: (open: boolean) => void;
}

const IntelContext = createContext<IntelContextValue | undefined>(undefined);

export function useIntel() {
  const ctx = useContext(IntelContext);
  if (!ctx) throw new Error("useIntel must be used within IntelProvider");
  return ctx;
}

export function IntelProvider({ children }: { children: ReactNode }) {
  const [schema, setSchema] = useState<IntelSchema | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sqlConsoleOpen, setSqlConsoleOpen] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedColumns = schema?.tables[selectedTable || ""]?.columns || [];

  const refreshSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("intel-schema")) as IntelSchema | { error?: string };
      if ("error" in res && res.error) {
        setError(res.error as string);
        return;
      }
      setSchema(res as IntelSchema);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTableData = useCallback(async (tableName: string) => {
    setTableLoading(true);
    try {
      const res = (await bridgeInvoke("intel-query", {
        sql: `SELECT * FROM "${tableName}" ORDER BY rowid DESC LIMIT 500`,
      })) as { rows?: Record<string, unknown>[]; error?: string };
      if (res.error) {
        setError(res.error);
        setRows([]);
      } else {
        setRows(res.rows ?? []);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load table data");
      setRows([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  const selectTable = useCallback(
    (name: string | null) => {
      setSelectedTable(name);
      if (name) loadTableData(name);
      else setRows([]);
    },
    [loadTableData]
  );

  const refreshTable = useCallback(async () => {
    if (selectedTable) await loadTableData(selectedTable);
  }, [selectedTable, loadTableData]);

  const scheduleRefresh = useCallback(
    (opts?: { schema?: boolean; table?: boolean }) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        if (opts?.schema) void refreshSchema();
        if (opts?.table && selectedTable) void loadTableData(selectedTable);
      }, 150);
    },
    [loadTableData, refreshSchema, selectedTable]
  );

  const insertRow = useCallback(
    async (data: Record<string, unknown>) => {
      if (!selectedTable) return false;
      const now = Date.now();
      const optimisticRow: Record<string, unknown> = {
        ...data,
        __optimistic: true,
        __optimistic_key: `tmp-${now}-${Math.random().toString(36).slice(2, 8)}`,
      };

      if (selectedColumns.some((col) => col.name === "created_at") && optimisticRow.created_at == null) {
        optimisticRow.created_at = now;
      }
      if (selectedColumns.some((col) => col.name === "updated_at") && optimisticRow.updated_at == null) {
        optimisticRow.updated_at = now;
      }

      setRows((prev) => [optimisticRow, ...prev]);
      try {
        const res = (await bridgeInvoke("intel-insert", {
          table: selectedTable,
          data,
        })) as { inserted?: boolean; error?: string };
        if (res.error) {
          setRows((prev) => prev.filter((row) => row.__optimistic_key !== optimisticRow.__optimistic_key));
          setError(res.error);
          return false;
        }
        await refreshTable();
        await refreshSchema();
        return true;
      } catch {
        setRows((prev) => prev.filter((row) => row.__optimistic_key !== optimisticRow.__optimistic_key));
        return false;
      }
    },
    [selectedColumns, selectedTable, refreshTable, refreshSchema]
  );

  const updateRow = useCallback(
    async (data: Record<string, unknown>, where: Record<string, unknown>) => {
      if (!selectedTable) return false;
      const previousRows = rows;
      const optimisticUpdatedAt = selectedColumns.some((col) => col.name === "updated_at")
        ? { updated_at: Date.now() }
        : {};
      setRows((prev) =>
        prev.map((row) =>
          matchesWhere(row, where)
            ? { ...row, ...data, ...optimisticUpdatedAt, __optimistic: true }
            : row
        )
      );
      try {
        const res = (await bridgeInvoke("intel-update", {
          table: selectedTable,
          data,
          where,
        })) as { updated?: boolean; error?: string };
        if (res.error) {
          setRows(previousRows);
          setError(res.error);
          return false;
        }
        await refreshTable();
        return true;
      } catch {
        setRows(previousRows);
        return false;
      }
    },
    [rows, selectedColumns, selectedTable, refreshTable]
  );

  const deleteRow = useCallback(
    async (where: Record<string, unknown>) => {
      if (!selectedTable) return false;
      const previousRows = rows;
      setRows((prev) => prev.filter((row) => !matchesWhere(row, where)));
      try {
        const res = (await bridgeInvoke("intel-delete", {
          table: selectedTable,
          where,
        })) as { deleted?: boolean; error?: string };
        if (res.error) {
          setRows(previousRows);
          setError(res.error);
          return false;
        }
        await refreshTable();
        await refreshSchema();
        return true;
      } catch {
        setRows(previousRows);
        return false;
      }
    },
    [rows, selectedTable, refreshTable, refreshSchema]
  );

  const runQuery = useCallback(
    async (sql: string) => {
      try {
        const res = (await bridgeInvoke("intel-query", { sql })) as {
          rows?: Record<string, unknown>[];
          error?: string;
        };
        return res;
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Query failed" };
      }
    },
    []
  );

  // Load schema on mount
  useEffect(() => {
    refreshSchema();
  }, [refreshSchema]);

  // Auto-select the first user table when schema loads and nothing is selected
  useEffect(() => {
    if (!schema || selectedTable) return;
    const userTables = Object.keys(schema.tables)
      .filter((n) => !n.startsWith("_"))
      .sort();
    if (userTables.length > 0) {
      selectTable(userTables[0]);
    }
  }, [schema, selectedTable, selectTable]);

  useEffect(() => {
    const unsubIntel = gatewayConnection.on("intel_change", (msg) => {
      const payload = (msg.payload ?? {}) as Record<string, unknown>;
      scheduleRefresh(getIntelEventRefreshPlan(payload, selectedTable));
    });

    return () => {
      unsubIntel();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh, selectedTable]);

  // Build AppSchema
  const appSchema: AppSchema = useMemo(() => {
    const tableNames = schema?.tables ? Object.keys(schema.tables).sort() : [];

    // System tables go to a separate section
    const userTables = tableNames.filter((n) => !n.startsWith("_"));
    const systemTables = tableNames.filter((n) => n.startsWith("_"));

    const makeSidebarItems = (tables: string[]) =>
      tables.map((name) => {
        const meta = schema?.tables[name];
        return {
          id: `intel-table-${name}`,
          title: name,
          icon: Table2,
          isActive: selectedTable === name,
          badge: meta ? String(meta.row_count) : undefined,
          onClick: () => selectTable(name),
        };
      });

    const sections = [
      {
        id: "intel-tables",
        title: "Tables",
        type: "collapsible" as const,
        defaultOpen: true,
        items: makeSidebarItems(userTables),
      },
    ];

    if (systemTables.length > 0) {
      sections.push({
        id: "intel-system",
        title: "System",
        type: "collapsible" as const,
        defaultOpen: false,
        items: makeSidebarItems(systemTables),
      });
    }

    return {
      id: "hypercho-intelligence",
      name: "Intelligence",
      header: {
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "intel-sql-console",
              label: "SQL",
              icon: <TerminalSquare className="h-4 w-4" />,
              onClick: () => setSqlConsoleOpen((v) => !v),
              variant: sqlConsoleOpen ? "default" : "ghost",
            },
          ],
        },
      },
      sidebar: {
        header: {
          title: "Intelligence",
          icon: Database,
          rightButtons: [
            {
              id: "intel-refresh",
              label: "Refresh",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => refreshSchema(),
            },
          ],
        },
        sections,
      },
    };
  }, [schema, selectedTable, sqlConsoleOpen, selectTable, refreshSchema]);

  return (
    <IntelContext.Provider
      value={{
        schema,
        selectedTable,
        rows,
        loading,
        tableLoading,
        error,
        sqlConsoleOpen,
        appSchema,
        selectTable,
        refreshSchema,
        refreshTable,
        insertRow,
        updateRow,
        deleteRow,
        runQuery,
        setSqlConsoleOpen,
      }}
    >
      {children}
    </IntelContext.Provider>
  );
}
