"use client";

import React, { useMemo, useState } from "react";
import { useIntel } from "./provider/intelligenceProvider";
import { DataGrid } from "./DataGrid";
import { PipelineView } from "./PipelineView";
import { ChartView } from "./ChartView";
import { TimelineView } from "./TimelineView";
import { ResearchView } from "./ResearchView";
import { SqlConsole } from "./SqlConsole";

import { detectSmartViews } from "./SmartViewDetector";
import { Database, Download, LayoutGrid, KanbanSquare, BarChart3, Clock3, Lightbulb } from "lucide-react";
import type { SmartViewType } from "./types";

export function IntelligenceView() {
  const { selectedTable, schema, rows, loading, error, sqlConsoleOpen } = useIntel();
  const [activeView, setActiveView] = useState<SmartViewType>("grid");

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

  const hasSmartViews = smartViews.length > 0;

  if (loading && !schema) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Database className="h-5 w-5 animate-pulse" />
        <span className="text-sm">Loading intelligence database...</span>
      </div>
    );
  }

  if (error && !schema) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Database className="h-6 w-6 text-destructive/60" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Smart view toggle bar */}
      {selectedTable && hasSmartViews && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30 shrink-0">
          <ViewToggle
            type="grid"
            label="Grid"
            icon={<LayoutGrid className="h-3 w-3" />}
            active={activeView === "grid"}
            onClick={() => setActiveView("grid")}
          />
          {smartViews.map((sv) => (
            <ViewToggle
              key={sv.type}
              type={sv.type}
              label={sv.label}
              icon={
                sv.type === "pipeline" ? (
                  <KanbanSquare className="h-3 w-3" />
                ) : sv.type === "chart" ? (
                  <BarChart3 className="h-3 w-3" />
                ) : sv.type === "timeline" ? (
                  <Clock3 className="h-3 w-3" />
                ) : sv.type === "research" ? (
                  <Lightbulb className="h-3 w-3" />
                ) : (
                  <LayoutGrid className="h-3 w-3" />
                )
              }
              active={activeView === sv.type}
              onClick={() => setActiveView(sv.type)}
            />
          ))}

          {/* Export button */}
          <div className="ml-auto">
            <ExportButton rows={rows} tableName={selectedTable} />
          </div>
        </div>
      )}

      {/* Export for tables without smart views */}
      {selectedTable && !hasSmartViews && (
        <div className="flex items-center justify-end px-3 py-1 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30 shrink-0">
          <ExportButton rows={rows} tableName={selectedTable} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {activeView === "grid" && <DataGrid />}
        {activeView === "pipeline" && (
          <PipelineView
            statusColumn={smartViews.find((v) => v.type === "pipeline")?.statusColumn || "status"}
          />
        )}
        {activeView === "chart" && (
          <ChartView
            metricColumn={smartViews.find((v) => v.type === "chart")?.metricColumn || "metric"}
            valueColumn={smartViews.find((v) => v.type === "chart")?.valueColumn || "value"}
            periodColumn={smartViews.find((v) => v.type === "chart")?.periodColumn}
          />
        )}
        {activeView === "timeline" && <TimelineView />}
        {activeView === "research" && <ResearchView />}
      </div>

      {/* SQL Console */}
      {sqlConsoleOpen && <SqlConsole />}
    </div>
  );
}

function ViewToggle({
  label,
  icon,
  active,
  onClick,
}: {
  type: SmartViewType;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        active
          ? "bg-primary/15 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ExportButton({ rows, tableName }: { rows: Record<string, unknown>[]; tableName: string }) {
  const handleExport = (format: "csv" | "json") => {
    if (rows.length === 0) return;

    let content: string;
    let mimeType: string;
    let ext: string;

    if (format === "json") {
      content = JSON.stringify(rows, null, 2);
      mimeType = "application/json";
      ext = "json";
    } else {
      const cols = Object.keys(rows[0]);
      const header = cols.map((c) => `"${c}"`).join(",");
      const lines = rows.map((row) =>
        cols
          .map((c) => {
            const v = row[c];
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(",")
      );
      content = [header, ...lines].join("\n");
      mimeType = "text/csv";
      ext = "csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tableName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => handleExport("csv")}
        disabled={rows.length === 0}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors"
        title="Export as CSV"
      >
        <Download className="h-3 w-3" />
        CSV
      </button>
      <button
        onClick={() => handleExport("json")}
        disabled={rows.length === 0}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors"
        title="Export as JSON"
      >
        <Download className="h-3 w-3" />
        JSON
      </button>
    </div>
  );
}
