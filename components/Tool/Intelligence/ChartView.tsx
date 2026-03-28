"use client";

import React, { useMemo } from "react";
import { useIntel } from "./provider/intelligenceProvider";

interface ChartViewProps {
  metricColumn: string;
  valueColumn: string;
  periodColumn?: string;
}

interface DataPoint {
  metric: string;
  value: number;
  period: string;
}

export function ChartView({ metricColumn, valueColumn, periodColumn }: ChartViewProps) {
  const { rows } = useIntel();

  // Parse data points
  const dataPoints = useMemo(() => {
    const points: DataPoint[] = [];
    for (const row of rows) {
      const metric = row[metricColumn];
      const value = Number(row[valueColumn]);
      const period = periodColumn ? String(row[periodColumn] ?? "") : "";
      if (metric != null && !isNaN(value)) {
        points.push({ metric: String(metric), value, period });
      }
    }
    return points;
  }, [rows, metricColumn, valueColumn, periodColumn]);

  // Group by metric
  const metrics = useMemo(() => {
    const grouped: Record<string, DataPoint[]> = {};
    for (const dp of dataPoints) {
      if (!grouped[dp.metric]) grouped[dp.metric] = [];
      grouped[dp.metric].push(dp);
    }
    // Sort each group by period
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.period.localeCompare(b.period));
    }
    return grouped;
  }, [dataPoints]);

  const metricNames = Object.keys(metrics);

  if (metricNames.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No metric data found
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {metricNames.map((name) => {
        const points = metrics[name];
        const values = points.map((p) => p.value);
        const max = Math.max(...values, 1);
        const latest = points[points.length - 1];
        const prev = points.length > 1 ? points[points.length - 2] : null;
        const change = prev ? ((latest.value - prev.value) / (prev.value || 1)) * 100 : null;

        return (
          <div key={name} className="border border-solid border-border/30 rounded-lg p-4 bg-card/50">
            {/* Metric header */}
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-foreground tabular-nums">
                    {formatValue(latest.value)}
                  </span>
                  {change !== null && (
                    <span
                      className={`text-xs font-medium ${
                        change >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {change >= 0 ? "+" : ""}
                      {change.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {points.length} data point{points.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bar chart */}
            <div className="flex items-end gap-1 h-24">
              {points.map((p, i) => {
                const height = (p.value / max) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                    title={`${p.period}: ${formatValue(p.value)}`}
                  >
                    <div className="w-full flex items-end" style={{ height: "80px" }}>
                      <div
                        className="w-full bg-primary/30 hover:bg-primary/50 rounded-t transition-colors min-h-[2px]"
                        style={{ height: `${Math.max(height, 2)}%` }}
                      />
                    </div>
                    {p.period && (
                      <span className="text-[8px] text-muted-foreground/60 truncate w-full text-center">
                        {p.period}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary table */}
            {points.length > 1 && (
              <div className="mt-3 pt-3 border-solid border-t border-r-0 border-b-0 border-l-0 border-border/20">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Min</div>
                    <div className="text-xs font-medium text-foreground tabular-nums">
                      {formatValue(Math.min(...values))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Avg</div>
                    <div className="text-xs font-medium text-foreground tabular-nums">
                      {formatValue(values.reduce((a, b) => a + b, 0) / values.length)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Max</div>
                    <div className="text-xs font-medium text-foreground tabular-nums">
                      {formatValue(Math.max(...values))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
