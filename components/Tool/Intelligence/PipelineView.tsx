"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { useIntel } from "./provider/intelligenceProvider";
import { GripVertical } from "lucide-react";

interface PipelineViewProps {
  statusColumn: string;
}

export function PipelineView({ statusColumn }: PipelineViewProps) {
  const { rows, selectedTable, schema, updateRow } = useIntel();
  const [dragItem, setDragItem] = useState<Record<string, unknown> | null>(null);
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);
  const dragRef = useRef<{ sourceStatus: string } | null>(null);

  // Get primary key column(s) for WHERE clause
  const columns = schema?.tables[selectedTable || ""]?.columns || [];
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

  // Discover unique statuses from the data
  const lanes = useMemo(() => {
    const statuses = new Set<string>();
    for (const row of rows) {
      const val = row[statusColumn];
      if (val != null) statuses.add(String(val));
    }
    return Array.from(statuses);
  }, [rows, statusColumn]);

  // Group rows by status
  const laneRows = useMemo(() => {
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const lane of lanes) grouped[lane] = [];
    for (const row of rows) {
      const val = String(row[statusColumn] ?? "");
      if (grouped[val]) grouped[val].push(row);
    }
    return grouped;
  }, [rows, lanes, statusColumn]);

  // Determine display columns (skip status, pk, timestamps)
  const displayCols = useMemo(() => {
    const skip = new Set([statusColumn, "created_at", "updated_at", "created_by"]);
    return columns
      .filter((c) => !skip.has(c.name))
      .slice(0, 4); // Max 4 fields per card
  }, [columns, statusColumn]);

  const handleDragStart = (row: Record<string, unknown>, status: string) => {
    setDragItem(row);
    dragRef.current = { sourceStatus: status };
  };

  const handleDragOver = (e: React.DragEvent, lane: string) => {
    e.preventDefault();
    setDragOverLane(lane);
  };

  const handleDragLeave = () => {
    setDragOverLane(null);
  };

  const handleDrop = async (targetLane: string) => {
    setDragOverLane(null);
    if (!dragItem || !dragRef.current) return;
    if (dragRef.current.sourceStatus === targetLane) {
      setDragItem(null);
      return;
    }

    const where = getPkWhere(dragItem);
    if (Object.keys(where).length === 0) {
      setDragItem(null);
      return;
    }

    await updateRow({ [statusColumn]: targetLane }, where);
    setDragItem(null);
    dragRef.current = null;
  };

  const LANE_COLORS: Record<string, string> = {
    lead: "border-t-blue-500",
    engaged: "border-t-amber-500",
    customer: "border-t-emerald-500",
    churned: "border-t-red-500",
    active: "border-t-emerald-500",
    idle: "border-t-gray-500",
    error: "border-t-red-500",
    running: "border-t-blue-500",
    done: "border-t-emerald-500",
    todo: "border-t-gray-500",
    "in-progress": "border-t-amber-500",
    in_progress: "border-t-amber-500",
  };

  const getLaneColor = (lane: string) =>
    LANE_COLORS[lane.toLowerCase()] || "border-t-primary/50";

  if (lanes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No status values found in "{statusColumn}" column
      </div>
    );
  }

  return (
    <div className="flex gap-3 h-full overflow-x-auto p-3">
      {lanes.map((lane) => (
        <div
          key={lane}
          className={`flex flex-col min-w-[220px] max-w-[280px] flex-1 rounded-lg border border-solid border-border/50 bg-muted/10 ${getLaneColor(lane)} border-t-2 transition-colors ${
            dragOverLane === lane ? "bg-primary/5 border-primary/30" : ""
          }`}
          onDragOver={(e) => handleDragOver(e, lane)}
          onDragLeave={handleDragLeave}
          onDrop={() => handleDrop(lane)}
        >
          {/* Lane header */}
          <div className="flex items-center justify-between px-3 py-2 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30">
            <span className="text-xs font-semibold text-foreground capitalize">{lane}</span>
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
              {laneRows[lane]?.length || 0}
            </span>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {(laneRows[lane] || []).map((row, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={() => handleDragStart(row, lane)}
                className="bg-card border border-solid border-border/30 rounded-md px-3 py-2 cursor-grab active:cursor-grabbing hover:border-border/60 transition-colors group"
              >
                <div className="flex items-start gap-1.5">
                  <GripVertical className="h-3 w-3 text-muted-foreground/30 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex-1 min-w-0 space-y-1">
                    {displayCols.map((col, ci) => {
                      const val = row[col.name];
                      if (val == null) return null;
                      return (
                        <div key={col.name} className="min-w-0">
                          {ci === 0 ? (
                            <span className="text-xs font-medium text-foreground truncate block">
                              {String(val)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground truncate block">
                              <span className="text-muted-foreground/50">{col.name}: </span>
                              {String(val)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {(() => {
                      const createdBy = row.created_by;
                      if (createdBy == null || createdBy === "") return null;
                      return (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 text-[9px] font-medium mt-0.5">
                          {String(createdBy)}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
