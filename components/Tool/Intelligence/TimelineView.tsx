"use client";

import React, { useMemo } from "react";
import { Clock3 } from "lucide-react";
import { useIntel } from "./provider/intelligenceProvider";

interface TimelineViewProps {
  contentColumn?: string;
  timestampColumn?: string;
}

function formatTimestamp(val: unknown): string {
  if (val == null) return "";
  const n = Number(val);
  if (!isNaN(n) && n > 1e12) return new Date(n).toLocaleString();
  if (!isNaN(n) && n > 1e9) return new Date(n * 1000).toLocaleString();
  return String(val);
}

export function TimelineView({
  contentColumn = "content",
  timestampColumn = "created_at",
}: TimelineViewProps) {
  const { rows, schema, selectedTable } = useIntel();

  const columns = schema?.tables[selectedTable || ""]?.columns || [];

  const items = useMemo(() => {
    return [...rows]
      .filter((row) => row[contentColumn] != null)
      .sort((a, b) => Number(b[timestampColumn] ?? 0) - Number(a[timestampColumn] ?? 0));
  }, [contentColumn, rows, timestampColumn]);

  const metaColumns = columns
    .map((col) => col.name)
    .filter((name) => ![contentColumn, timestampColumn, "updated_at"].includes(name))
    .slice(0, 3);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No timeline entries found
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-0 before:bottom-0 before:w-px before:bg-border/40">
        {items.map((row, idx) => (
          <div key={idx} className="relative rounded-xl border border-solid border-border/40 bg-card/60 p-4">
            <div className="absolute -left-[1.625rem] top-5 flex h-5 w-5 items-center justify-center rounded-full border border-solid border-border/40 bg-background">
              <Clock3 className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {formatTimestamp(row[timestampColumn])}
              </div>
              {row.created_by != null && String(row.created_by) !== "" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {String(row.created_by)}
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {String(row[contentColumn])}
            </p>
            {metaColumns.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metaColumns.map((name) => {
                  const value = row[name];
                  if (value == null || value === "") return null;
                  return (
                    <span
                      key={name}
                      className="rounded-full border border-solid border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {name}: {String(value)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
