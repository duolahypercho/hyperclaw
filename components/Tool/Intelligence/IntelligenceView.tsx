"use client";

import React, { useMemo, useRef, useState } from "react";
import { useIntel } from "./provider/intelligenceProvider";
import { DataGrid, type DataGridHandle } from "./DataGrid";
import { PipelineView } from "./PipelineView";
import { ChartView } from "./ChartView";
import { TimelineView } from "./TimelineView";
import { ResearchView } from "./ResearchView";
import { SqlConsole } from "./SqlConsole";
import { detectSmartViews } from "./SmartViewDetector";
import {
  TerminalSquare,
  LayoutGrid,
  KanbanSquare,
  BarChart3,
  Clock3,
  Lightbulb,
  Database,
  Plus,
  X,
  Trash2,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SmartViewType, TableMeta, ColumnInfo } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

const TABLE_EMOJIS = [
  "🗂️", "📊", "👤", "📄", "🎫", "📈", "🔗", "💰", "📦", "🏷️",
  "🔑", "📅", "📍", "🎯", "💬", "⚙️", "🌐", "🔒", "📧", "🔔",
  "🧪", "🚀", "🏢", "🎨", "📱", "🤖", "🧬", "📰", "🛒", "⭐",
];

function iconForTable(name: string, customEmoji?: string): string {
  if (customEmoji) return customEmoji;
  const n = name.toLowerCase();
  if (n.includes("contact") || n.includes("customer") || n.includes("client") || n.includes("user")) return "👤";
  if (n.includes("research") || n.includes("filing") || n.includes("doc") || n.includes("finding")) return "📄";
  if (n.includes("ticket") || n.includes("support") || n.includes("issue")) return "🎫";
  if (n.includes("metric") || n.includes("daily") || n.includes("stat")) return "📊";
  if (n.includes("order") || n.includes("payment") || n.includes("invoice")) return "💰";
  if (n.includes("product") || n.includes("item") || n.includes("sku")) return "📦";
  if (n.includes("event") || n.includes("log") || n.includes("audit")) return "🔔";
  if (n.includes("config") || n.includes("setting")) return "⚙️";
  return "🗂️";
}

// ── Column type options ────────────────────────────────────────────────────

const COLUMN_TYPES = ["TEXT", "INTEGER", "REAL", "BOOLEAN", "TIMESTAMP", "UUID", "JSONB", "BIGINT", "VARCHAR"];

type NewColumn = { name: string; type: string; pk: boolean; nullable: boolean };

// ── Create Table Drawer ────────────────────────────────────────────────────

function CreateTableDrawer({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, emoji: string, columns: NewColumn[]) => void;
}) {
  const [tableName, setTableName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("🗂️");
  const [columns, setColumns] = useState<NewColumn[]>([
    { name: "id", type: "UUID", pk: true, nullable: false },
    { name: "created_at", type: "TIMESTAMP", pk: false, nullable: false },
  ]);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (val: string) => {
    setTableName(val);
    const auto = iconForTable(val);
    if (auto !== selectedEmoji) setSelectedEmoji(auto);
  };

  const addColumn = () =>
    setColumns((prev) => [...prev, { name: "", type: "TEXT", pk: false, nullable: true }]);

  const removeColumn = (idx: number) =>
    setColumns((prev) => prev.filter((_, i) => i !== idx));

  const updateColumn = (idx: number, patch: Partial<NewColumn>) =>
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const handleSubmit = () => {
    if (!tableName.trim()) {
      nameRef.current?.focus();
      return;
    }
    onSubmit(tableName.trim(), selectedEmoji, columns.filter((c) => c.name.trim()));
    setTableName("");
    setSelectedEmoji("🗂️");
    setColumns([
      { name: "id", type: "UUID", pk: true, nullable: false },
      { name: "created_at", type: "TIMESTAMP", pk: false, nullable: false },
    ]);
  };

  // Rendered as `absolute` within the IntelligenceView container (which has
  // `relative` + `overflow-hidden`) so it never bleeds over the Electron title
  // bar or the SiteHeader sitting above the view.
  return (
    <div
      className={cn("absolute inset-0 z-30", !open && "pointer-events-none")}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 w-[420px] flex flex-col bg-background border-l border-border",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.22)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
              <span className="text-lg leading-none">{selectedEmoji}</span>
              New Table
            </div>
            <p className="text-[11.5px] mt-0.5 text-muted-foreground">
              Define schema and create a new database table
            </p>
          </div>
          <Button variant="outline" size="iconSm" onClick={onClose} className="shrink-0 ml-3">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Body — scrollable */}
        <ScrollArea className="flex-1">
          <div className="p-5 flex flex-col gap-5">

            {/* Table name */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="new-table-name"
                className="text-[10.5px] font-mono font-semibold uppercase tracking-[0.07em] text-muted-foreground"
              >
                Table Name
              </Label>
              <Input
                id="new-table-name"
                ref={nameRef}
                value={tableName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. user_profiles"
                className="font-mono text-[13px] h-9"
              />
            </div>

            {/* Emoji / icon picker */}
            <div className="flex flex-col gap-2">
              <Label className="text-[10.5px] font-mono font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                Table Icon
              </Label>
              <div className="grid grid-cols-10 gap-1 p-2.5 rounded-lg border border-border bg-muted/20">
                {TABLE_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    title={emoji}
                    className={cn(
                      "flex items-center justify-center aspect-square text-[17px] rounded-md border-2 transition-all duration-100",
                      selectedEmoji === emoji
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-muted/60"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Columns */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10.5px] font-mono font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Columns
                </Label>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={addColumn}
                  className="h-7 text-[11px] gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Column
                </Button>
              </div>

              <div className="flex flex-col gap-1.5">
                {columns.map((col, idx) => (
                  <div
                    key={idx}
                    className="grid items-center gap-1.5 p-2 rounded-lg border border-border bg-muted/20"
                    style={{ gridTemplateColumns: "1fr 90px auto auto" }}
                  >
                    <Input
                      value={col.name}
                      onChange={(e) => updateColumn(idx, { name: e.target.value })}
                      placeholder="column_name"
                      className="font-mono text-[12px] h-7 px-2"
                    />
                    <Select
                      value={col.type}
                      onValueChange={(v) => updateColumn(idx, { type: v })}
                    >
                      <SelectTrigger className="h-7 text-[11px] font-mono px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMN_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-[11px] font-mono">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="iconSm"
                      variant={col.pk ? "active" : "ghost"}
                      onClick={() => updateColumn(idx, { pk: !col.pk })}
                      title="Toggle primary key"
                      className="h-7 w-8 text-[10px] font-mono font-bold"
                    >
                      PK
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      onClick={() => removeColumn(idx)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-border shrink-0">
          <Button className="flex-1 gap-1.5" onClick={handleSubmit}>
            <Plus className="w-3.5 h-3.5" />
            Create Table
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Schema Drawer ────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  UUID: "bg-violet-500/12 text-violet-400 border-violet-500/25",
  TEXT: "bg-sky-500/12 text-sky-400 border-sky-500/25",
  VARCHAR: "bg-sky-500/12 text-sky-400 border-sky-500/25",
  INTEGER: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
  BIGINT: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
  REAL: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
  BOOLEAN: "bg-purple-500/12 text-purple-400 border-purple-500/25",
  TIMESTAMP: "bg-amber-500/12 text-amber-400 border-amber-500/25",
  JSONB: "bg-teal-500/12 text-teal-400 border-teal-500/25",
};

function typeColor(type: string): string {
  const upper = type.toUpperCase().split("(")[0].trim();
  return TYPE_COLOR[upper] ?? "bg-muted/50 text-muted-foreground border-border";
}

function EditSchemaDrawer({
  open,
  onClose,
  tableName,
  columns,
}: {
  open: boolean;
  onClose: () => void;
  tableName: string | null;
  columns: ColumnInfo[];
}) {
  return (
    <div className={cn("absolute inset-0 z-30", !open && "pointer-events-none")} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 w-[440px] flex flex-col bg-background border-l border-border",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.22)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
              <span className="text-lg leading-none">{tableName ? iconForTable(tableName) : "📋"}</span>
              Edit Schema
            </div>
            <p className="text-[11.5px] mt-0.5 text-muted-foreground">
              Column definitions for{" "}
              <span className="font-mono text-foreground">{tableName ?? "—"}</span>
            </p>
          </div>
          <Button variant="outline" size="iconSm" onClick={onClose} className="shrink-0 ml-3">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Column list */}
        <ScrollArea className="flex-1">
          <div className="p-5 flex flex-col gap-2">
            <Label className="text-[10.5px] font-mono font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              Columns — {columns.length}
            </Label>

            {/* Column header row */}
            <div
              className="grid text-[10px] font-mono uppercase tracking-[0.06em] text-muted-foreground px-3 pb-1"
              style={{ gridTemplateColumns: "1fr 100px 44px 44px" }}
            >
              <span>Name</span>
              <span>Type</span>
              <span className="text-center">PK</span>
              <span className="text-center">Null</span>
            </div>

            {columns.map((col) => (
              <div
                key={col.name}
                className={cn(
                  "grid items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                  col.pk
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-muted/10 hover:bg-muted/20"
                )}
                style={{ gridTemplateColumns: "1fr 100px 44px 44px" }}
              >
                {/* Name */}
                <div className="min-w-0">
                  <span className="font-mono text-[12.5px] font-medium text-foreground truncate block">
                    {col.name}
                  </span>
                  {col.default != null && (
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block truncate">
                      default: {col.default}
                    </span>
                  )}
                </div>

                {/* Type badge */}
                <Select value={col.type} onValueChange={() => {}}>
                  <SelectTrigger
                    className={cn(
                      "h-[26px] text-[10.5px] font-mono px-2 border rounded-md",
                      typeColor(col.type)
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-[11px] font-mono">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* PK */}
                <div className="flex justify-center">
                  {col.pk ? (
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/15 border border-primary/30">
                      <Check className="w-2.5 h-2.5 text-primary" />
                    </span>
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center rounded-full border border-border/40">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    </span>
                  )}
                </div>

                {/* Nullable */}
                <div className="flex justify-center">
                  {!col.notnull ? (
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/25">
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    </span>
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center rounded-full border border-border/40">
                      <X className="w-2.5 h-2.5 text-muted-foreground/40" />
                    </span>
                  )}
                </div>
              </div>
            ))}

            {columns.length === 0 && (
              <p className="text-[12px] text-muted-foreground text-center py-8">
                No columns defined
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-border shrink-0">
          <Button className="flex-1 gap-1.5" disabled title="Schema editing coming soon">
            <Check className="w-3.5 h-3.5" />
            Save Changes
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function freshnessLabel(freshness: TableMeta["freshness"]): string {
  if (!freshness) return "—";
  const now = Date.now();
  const ts = freshness.newest > 1_000_000_000_000 ? freshness.newest : freshness.newest * 1000;
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

// ── Rail item ──────────────────────────────────────────────────────────────

function TableRailItem({
  name,
  rowCount,
  colCount,
  isActive,
  onClick,
}: {
  name: string;
  rowCount: number | undefined;
  colCount: number | undefined;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md mb-0.5 transition-colors"
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        background: isActive ? "var(--paper-3, hsl(var(--muted)/0.6))" : "transparent",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-2, hsl(var(--muted)/0.3))";
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span
        className="flex items-center justify-center flex-shrink-0 rounded-[5px] text-[13px]"
        style={{
          width: 24,
          height: 24,
          background: "var(--paper-2, hsl(var(--muted)/0.3))",
          border: "1px solid var(--line, hsl(var(--border)))",
          color: "var(--ink-3, hsl(var(--muted-foreground)))",
        }}
      >
        {iconForTable(name)}
      </span>
      <div className="min-w-0">
        <div
          className="text-[12px] font-mono font-medium truncate"
          style={{ color: "var(--ink, hsl(var(--foreground)))" }}
        >
          {name}
        </div>
        <div
          className="text-[10.5px] mt-px truncate"
          style={{ color: "var(--ink-4, hsl(var(--muted-foreground)))" }}
        >
          {rowCount != null && colCount != null
            ? `${rowCount.toLocaleString()} rows · ${colCount} cols`
            : "—"}
        </div>
      </div>
    </button>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

export function IntelligenceView() {
  const {
    schema,
    selectedTable,
    rows,
    loading,
    error,
    sqlConsoleOpen,
    setSqlConsoleOpen,
    createTableOpen,
    setCreateTableOpen,
    selectTable,
    refreshSchema,
  } = useIntel();

  const [activeView, setActiveView] = useState<SmartViewType>("grid");
  const [editSchemaOpen, setEditSchemaOpen] = useState(false);

  const handleCreateTable = (_name: string, _emoji: string, _columns: NewColumn[]) => {
    // TODO: integrate with provider to execute CREATE TABLE DDL via intel-create-table bridge action
    setCreateTableOpen(false);
  };

  const tableList = useMemo(() => {
    if (!schema?.tables) return [];
    return Object.keys(schema.tables)
      .filter((n) => !n.startsWith("_"))
      .sort();
  }, [schema]);

  const tableMeta = selectedTable ? schema?.tables[selectedTable] ?? null : null;

  const smartViews = useMemo(() => {
    if (!selectedTable || !schema?.tables[selectedTable]) return [];
    return detectSmartViews(schema.tables[selectedTable].columns);
  }, [selectedTable, schema]);

  // Reset to grid when table changes
  const [prevTable, setPrevTable] = useState(selectedTable);
  if (selectedTable !== prevTable) {
    setPrevTable(selectedTable);
    setActiveView("grid");
  }

  const dataGridRef = useRef<DataGridHandle>(null);

  if (loading && !schema) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm" style={{ color: "var(--ink-4)" }}>
        <Database className="h-4 w-4 animate-pulse" />
        <span className="animate-pulse">Loading schema…</span>
      </div>
    );
  }

  if (error && !schema) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    // `relative` is required — CreateTableDrawer uses `absolute` positioning
    // so it stays bounded inside this container and never covers the header above.
    <div className="relative flex h-full w-full min-h-0 overflow-hidden">
      {/* ── Left Rail ── */}
      <aside className="flex flex-col px-[10px] py-[14px] shrink-0 overflow-hidden w-[240px] bg-secondary border border-solid border-border border-t-0 border-l-0 border-b-0 border-r-1">
        {/* Rail header */}
        <div className="flex items-center justify-between px-3">
          <span
            className="text-[10.5px] font-mono uppercase text-muted-foreground"
            style={{ letterSpacing: "0.84px" }}
          >
            Tables
          </span>
          <button
            onClick={() => setCreateTableOpen(true)}
            title="Create new table"
            style={{
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 5,
              border: "1px solid var(--line, hsl(var(--border)))",
              background: "transparent",
              color: "var(--ink-3, hsl(var(--muted-foreground)))",
              cursor: "pointer",
              transition: "all 120ms ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--paper-3, hsl(var(--muted)/0.6))";
              e.currentTarget.style.color = "var(--ink, hsl(var(--foreground)))";
              e.currentTarget.style.borderColor = "var(--accent, hsl(var(--primary)))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--ink-3, hsl(var(--muted-foreground)))";
              e.currentTarget.style.borderColor = "var(--line, hsl(var(--border)))";
            }}
          >
            <Plus style={{ width: 12, height: 12 }} />
          </button>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto py-3">
          {tableList.map((name) => {
            const meta = schema?.tables[name];
            return (
              <TableRailItem
                key={name}
                name={name}
                rowCount={meta?.row_count}
                colCount={meta?.columns.length}
                isActive={name === selectedTable}
                onClick={() => selectTable(name)}
              />
            );
          })}
          {tableList.length === 0 && !loading && (
            <p className="px-3 py-4 text-[12px]" style={{ color: "var(--ink-4)" }}>
              No tables found.
            </p>
          )}
        </div>
      </aside>

      {/* ── Create Table Drawer (absolute, bounded to this container) ── */}
      <CreateTableDrawer
        open={createTableOpen}
        onClose={() => setCreateTableOpen(false)}
        onSubmit={handleCreateTable}
      />

      {/* ── Edit Schema Drawer ── */}
      <EditSchemaDrawer
        open={editSchemaOpen}
        onClose={() => setEditSchemaOpen(false)}
        tableName={selectedTable}
        columns={tableMeta?.columns ?? []}
      />

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden gap-3 px-7 py-6">
        {selectedTable && tableMeta ? (
          <>
            {/* ── Table header ── */}
            <div
              className="shrink-0"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: title + desc */}
                <div>
                  <div
                    className="flex items-center gap-2.5"
                    style={{
                      fontWeight: 600,
                      fontSize: 20,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    <span>{iconForTable(selectedTable)}</span>
                    {selectedTable}
                    <span
                      className="text-[10px] font-medium font-mono px-1.5 py-0.5 rounded-full"
                      style={{
                        letterSpacing: "0.05em",
                        color: "var(--ok, #16a34a)",
                        background: "color-mix(in srgb, var(--ok, #16a34a) 10%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--ok, #16a34a) 28%, transparent)",
                      }}
                    >
                      public
                    </span>
                  </div>
                </div>

                {/* Right: view toggles + actions */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {/* View toggle group */}
                  <div className="flex items-center border border-solid border-border rounded-md overflow-hidden">
                    <Button
                      variant={activeView === "grid" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setActiveView("grid")}
                      className="rounded-none h-7 border-0 gap-1 px-2.5 text-[11.5px] font-medium"
                    >
                      <LayoutGrid className="h-3 w-3" />
                      Grid
                    </Button>
                    {smartViews.map((sv) => (
                      <Button
                        key={sv.type}
                        variant={activeView === sv.type ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setActiveView(sv.type)}
                        className="rounded-none h-7 gap-1 px-2.5 text-[11.5px] font-medium border-l-1 border-t-0 border-b-0 border-r-0 border-solid border-border"
                      >
                        {sv.type === "pipeline" ? (
                          <KanbanSquare className="h-3 w-3" />
                        ) : sv.type === "chart" ? (
                          <BarChart3 className="h-3 w-3" />
                        ) : sv.type === "timeline" ? (
                          <Clock3 className="h-3 w-3" />
                        ) : (
                          <Lightbulb className="h-3 w-3" />
                        )}
                        {sv.label}
                      </Button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="w-px h-4 bg-border/60 shrink-0" />

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditSchemaOpen(true)}
                    className="h-7 gap-1.5 text-[11.5px]"
                    title="Edit table schema"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    Schema
                  </Button>
                  <Button
                    variant={sqlConsoleOpen ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setSqlConsoleOpen(!sqlConsoleOpen)}
                    className="h-7 gap-1.5 text-[11.5px]"
                    title="Open SQL console"
                  >
                    <TerminalSquare className="h-3 w-3" />
                    Query
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dataGridRef.current?.triggerAddRow()}
                    disabled={!selectedTable}
                    className="h-7 gap-1.5 text-[11.5px]"
                    title="Add row"
                  >
                    <Plus className="h-3 w-3" />
                    Add row
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Meta stats ── */}
            <div
              className="grid grid-cols-4 shrink-0 border border-solid border-border rounded-md bg-secondary"
            >
              {[
                { label: "Rows", value: tableMeta.row_count.toLocaleString() },
                { label: "Updated", value: freshnessLabel(tableMeta.freshness) },
                { label: "Columns", value: String(tableMeta.columns.length) },
                {
                  label: "Indexes",
                  value: tableMeta.indexes ? String(tableMeta.indexes.length) : "—",
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="px-6 py-3"

                >
                  <span
                    className="block text-[10px] font-mono uppercase text-muted-foreground"
                    style={{
                      letterSpacing: "0.05em",
                    }}
                  >
                    {label}
                  </span>
                  <b
                    className="block font-semibold mt-1 text-primary-foreground"
                    style={{
                      fontSize: 18,
                      letterSpacing: "-0.02em",
                      color: "var(--ink, hsl(var(--foreground)))",
                    }}
                  >
                    {value}
                  </b>
                </div>
              ))}
            </div>

            {/* ── Data area ── */}
            <div className="flex-1 overflow-hidden">
              {activeView === "grid" && <DataGrid ref={dataGridRef} />}
              {activeView === "pipeline" && (
                <PipelineView
                  statusColumn={
                    smartViews.find((v) => v.type === "pipeline")?.statusColumn || "status"
                  }
                />
              )}
              {activeView === "chart" && (
                <ChartView
                  metricColumn={
                    smartViews.find((v) => v.type === "chart")?.metricColumn || "metric"
                  }
                  valueColumn={
                    smartViews.find((v) => v.type === "chart")?.valueColumn || "value"
                  }
                  periodColumn={smartViews.find((v) => v.type === "chart")?.periodColumn}
                />
              )}
              {activeView === "timeline" && <TimelineView />}
              {activeView === "research" && <ResearchView />}
            </div>

            {/* ── SQL Console ── */}
            {sqlConsoleOpen && <SqlConsole />}
          </>
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ color: "var(--ink-4)" }}
          >
            <span className="text-4xl opacity-20">◈</span>
            <span className="text-[13px]">Select a table from the left</span>
          </div>
        )}
      </div>
    </div>
  );
}
