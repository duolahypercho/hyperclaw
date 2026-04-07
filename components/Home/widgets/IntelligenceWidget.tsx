"use client";

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Database,
  RefreshCw,
  Loader2,
  Table2,
  ExternalLink,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useIntel, IntelProvider } from "$/components/Tool/Intelligence/provider/intelligenceProvider";
import { useOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";
import type { IntelSchema } from "$/components/Tool/Intelligence/types";
import { getFreshnessLabel } from "$/components/Tool/Intelligence/logic";

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function freshnessDotColor(label: string): string {
  switch (label) {
    case "fresh": return "bg-emerald-500";
    case "recent": return "bg-sky-500";
    case "aging": return "bg-amber-500";
    case "stale": return "bg-destructive";
    default: return "bg-muted-foreground";
  }
}

function truncateValue(v: unknown, maxLen = 60): string {
  if (v == null) return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

export const IntelligenceCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { loading, tableLoading, refreshSchema, refreshTable, schema, selectedTable, selectTable } = useIntel();
  const { toolAbstracts } = useOS();

  const intelTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "intelligence"),
    [toolAbstracts]
  );

  const userTables = useMemo(() => {
    if (!schema) return [];
    return Object.entries(schema.tables)
      .filter(([name]) => !name.startsWith("_"))
      .sort(([, a], [, b]) => b.row_count - a.row_count);
  }, [schema]);

  const selectedMeta = selectedTable ? schema?.tables[selectedTable] : null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 min-h-0">
      {/* Top row: title + controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {isEditMode && (
            <div className="cursor-move h-7 w-7 flex shrink-0 items-center justify-center">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}
          <div className="text-primary shrink-0">
            {intelTool?.icon || <Database className="w-3.5 h-3.5" />}
          </div>
          <h3
            className="text-xs font-normal text-foreground truncate min-w-0"
            title={widget.title}
          >
            {widget.title}
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="iconSm"
            className="h-6 w-6"
            onClick={() => selectedTable ? refreshTable() : refreshSchema()}
            disabled={loading || tableLoading}
            title="Refresh"
          >
            <RefreshCw className={cn("w-3 h-3", (loading || tableLoading) && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            className="h-6 w-6"
            onClick={() => window.open("/Tool/Intelligence", "_blank")}
            title="Open Intelligence"
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onMaximize}
            className="h-6 w-6"
          >
            {isMaximized ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Table selector row */}
      {schema && userTables.length > 0 && (
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs px-2 min-w-0 max-w-[200px]"
              >
                <Table2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{selectedTable || "Select table"}</span>
                <ChevronsUpDown className="w-3 h-3 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                {userTables.length} table{userTables.length !== 1 ? "s" : ""}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {userTables.map(([name, meta]) => {
                const freshness = meta.freshness ? getFreshnessLabel(meta.freshness.newest) : null;
                return (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => selectTable(name)}
                    className={cn(
                      "text-xs gap-2",
                      selectedTable === name && "bg-primary/10"
                    )}
                  >
                    <Table2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatRowCount(meta.row_count)}
                    </span>
                    {freshness && (
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", freshnessDotColor(freshness))} />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedMeta && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="tabular-nums">{formatRowCount(selectedMeta.row_count)} rows</span>
              <span>{selectedMeta.columns.length} cols</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const IntelligenceWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { schema, rows, loading, tableLoading, error, selectedTable, selectTable, refreshSchema, refreshTable } = useIntel();

  const selectedMeta = selectedTable ? schema?.tables[selectedTable] : null;
  const columns = selectedMeta?.columns ?? [];

  const isInitialLoading = loading && !schema;

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        {/* Compact inline bar — table selector + controls */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          {props.isEditMode && (
            <div className="cursor-move h-6 w-6 flex items-center justify-center shrink-0">
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>
          )}
          {schema && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1.5 text-[11px] px-2 min-w-0 max-w-[180px]"
                >
                  <Table2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{selectedTable || "Select table"}</span>
                  <ChevronsUpDown className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
                <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                  Tables
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(schema.tables)
                  .filter(([name]) => !name.startsWith("_"))
                  .sort(([, a], [, b]) => b.row_count - a.row_count)
                  .map(([name, meta]) => {
                    const freshness = meta.freshness ? getFreshnessLabel(meta.freshness.newest) : null;
                    return (
                      <DropdownMenuItem
                        key={name}
                        onClick={() => selectTable(name)}
                        className={cn(
                          "text-xs gap-2",
                          selectedTable === name && "bg-primary/10"
                        )}
                      >
                        <Table2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {formatRowCount(meta.row_count)}
                        </span>
                        {freshness && (
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", freshnessDotColor(freshness))} />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedTable && schema?.tables[selectedTable] && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatRowCount(schema.tables[selectedTable].row_count)} rows
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <Button
              variant="ghost"
              size="iconSm"
              className="h-5 w-5"
              onClick={() => selectedTable ? refreshTable() : refreshSchema()}
              disabled={loading || tableLoading}
            >
              <RefreshCw className={cn("w-2.5 h-2.5", (loading || tableLoading) && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={props.onMaximize} className="h-5 w-5">
              {props.isMaximized ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-2 pb-2">
          {isInitialLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading schema...</span>
            </div>
          ) : error && !schema ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <Database className="w-8 h-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Unable to load database</p>
              <p className="text-xs text-destructive mb-3 max-w-[240px]">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => refreshSchema()}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </Button>
            </div>
          ) : !selectedTable ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <Table2 className="w-6 h-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                Select a table above to view data
              </p>
            </div>
          ) : tableLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Loading {selectedTable}...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <Database className="w-6 h-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No rows in {selectedTable}</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0 rounded-md border border-border/50 bg-background/40">
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-[1]">
                    <tr>
                      {columns.map((col) => (
                        <th
                          key={col.name}
                          className="text-left text-[10px] font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap border-b border-border/50"
                        >
                          {col.name}
                          {col.pk && (
                            <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0 h-3.5">
                              PK
                            </Badge>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {rows.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        {columns.map((col) => (
                          <td
                            key={col.name}
                            className="px-2 py-1 text-foreground/90 font-mono whitespace-nowrap max-w-[200px] truncate"
                            title={row[col.name] != null ? String(row[col.name]) : undefined}
                          >
                            {row[col.name] == null ? (
                              <span className="text-muted-foreground/50 italic">null</span>
                            ) : (
                              truncateValue(row[col.name])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 && (
                <div className="text-center text-[10px] text-muted-foreground py-1.5 border-t border-border/50">
                  Showing 100 of {rows.length} rows
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

IntelligenceWidgetContent.displayName = "IntelligenceWidgetContent";

const IntelligenceWidget = memo((props: CustomProps) => {
  return (
    <IntelProvider>
      <IntelligenceWidgetContent {...props} />
    </IntelProvider>
  );
});

IntelligenceWidget.displayName = "IntelligenceWidget";

export default IntelligenceWidget;
