"use client";

import React, { useMemo, useCallback } from "react";
import { useIntel } from "./provider/intelligenceProvider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  ExternalLink,
  TrendingUp,
  Search,
  ChevronRight,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Confidence → color mapping ──

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  low: "bg-red-500/15 text-red-500 border-red-500/20",
};

// ── Score → visual bar ──

function ScoreBar({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 70
      ? "bg-emerald-500"
      : clamped >= 40
        ? "bg-amber-500"
        : "bg-red-400";

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground/60 w-8 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">
        {clamped}
      </span>
    </div>
  );
}

// ── Status badge for opportunities ──

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  reviewing: "bg-purple-500/15 text-purple-600 border-purple-500/20",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/15 text-red-500 border-red-500/20",
  executing: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  done: "bg-muted text-muted-foreground border-muted",
};

// ── Relative time ──

function timeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

// ── Research finding card ──

function FindingCard({ row }: { row: Record<string, unknown> }) {
  const topic = String(row.topic || "");
  const finding = String(row.finding || "");
  const evidence = row.evidence ? String(row.evidence) : null;
  const source = row.source ? String(row.source) : null;
  const sourceUrl = row.source_url ? String(row.source_url) : null;
  const confidence = String(row.confidence || "medium").toLowerCase();
  const createdAt = row.created_at ? Number(row.created_at) : 0;

  return (
    <div className="group p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 hover:border-border/60 transition-all">
      {/* Header: topic + confidence + time */}
      <div className="flex items-center gap-2 mb-1.5">
        <Search className="w-3 h-3 text-primary/60 shrink-0" />
        <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wider truncate">
          {topic}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "h-4 px-1.5 text-[9px] font-medium ml-auto shrink-0",
            CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS.medium
          )}
        >
          {confidence}
        </Badge>
      </div>

      {/* Finding text */}
      <p className="text-xs text-foreground leading-relaxed mb-1.5 line-clamp-3">
        {finding}
      </p>

      {/* Evidence */}
      {evidence && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5 line-clamp-2 italic">
          {evidence}
        </p>
      )}

      {/* Footer: source + time */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
        {source && (
          <span className="flex items-center gap-1 truncate">
            {sourceUrl ? (
              <>
                <ExternalLink className="w-2.5 h-2.5" />
                <span className="truncate">{source}</span>
              </>
            ) : (
              <span className="truncate">{source}</span>
            )}
          </span>
        )}
        {createdAt > 0 && (
          <span className="ml-auto shrink-0">{timeAgo(createdAt)}</span>
        )}
      </div>
    </div>
  );
}

// ── Opportunity card ──

function OpportunityCard({
  row,
  onStatusChange,
}: {
  row: Record<string, unknown>;
  onStatusChange: (id: unknown, newStatus: string) => void;
}) {
  const title = String(row.title || "Untitled");
  const description = row.description ? String(row.description) : null;
  const category = String(row.category || "general");
  const aiScore = Number(row.ai_score || 0);
  const humanScore = row.human_score != null ? Number(row.human_score) : null;
  const status = String(row.status || "new").toLowerCase();
  const createdAt = row.created_at ? Number(row.created_at) : 0;
  const assignedAgent = row.assigned_agent ? String(row.assigned_agent) : null;
  const id = row.id;

  const nextAction =
    status === "new"
      ? "reviewing"
      : status === "reviewing"
        ? "approved"
        : null;

  return (
    <div className="p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 hover:border-border/60 transition-all">
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-medium text-foreground truncate">
              {title}
            </h4>
            <Badge
              variant="outline"
              className={cn(
                "h-4 px-1.5 text-[9px] font-medium shrink-0",
                STATUS_STYLES[status] || STATUS_STYLES.new
              )}
            >
              {status}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground/50">{category}</span>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2 line-clamp-2">
          {description}
        </p>
      )}

      {/* Scores */}
      <div className="space-y-1 mb-2">
        <ScoreBar score={aiScore} label="AI" />
        {humanScore != null && <ScoreBar score={humanScore} label="You" />}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2">
        {assignedAgent && (
          <span className="text-[10px] text-muted-foreground/50 truncate">
            <Star className="w-2.5 h-2.5 inline mr-0.5" />
            {assignedAgent}
          </span>
        )}
        {createdAt > 0 && (
          <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
            {timeAgo(createdAt)}
          </span>
        )}
        {nextAction && (
          <button
            onClick={() => onStatusChange(id, nextAction)}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors shrink-0"
          >
            {nextAction === "reviewing" ? "Review" : "Approve"}
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ResearchView ──

export function ResearchView() {
  const { rows, selectedTable, schema, updateRow } = useIntel();

  const columns = schema?.tables[selectedTable || ""]?.columns || [];
  const colNames = new Set(columns.map((c) => c.name));

  // Determine if this is a research table or opportunities table
  const isResearchTable = colNames.has("topic") && colNames.has("finding");
  const isOpportunityTable =
    colNames.has("ai_score") && colNames.has("status") && colNames.has("title");

  // Get PK for updates
  const getPkWhere = useCallback(
    (row: Record<string, unknown>) => {
      const pkCols = columns.filter((c) => c.pk);
      if (pkCols.length > 0) {
        const where: Record<string, unknown> = {};
        pkCols.forEach((c) => (where[c.name] = row[c.name]));
        return where;
      }
      if (row.id != null) return { id: row.id };
      return {};
    },
    [columns]
  );

  // Group research by topic
  const topicGroups = useMemo(() => {
    if (!isResearchTable) return new Map<string, Record<string, unknown>[]>();
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const topic = String(row.topic || "uncategorized");
      const existing = groups.get(topic) || [];
      existing.push(row);
      groups.set(topic, existing);
    }
    return groups;
  }, [rows, isResearchTable]);

  // Sort opportunities by score
  const sortedOpportunities = useMemo(() => {
    if (!isOpportunityTable) return [];
    return [...rows].sort((a, b) => {
      const scoreA = Number(a.ai_score || 0);
      const scoreB = Number(b.ai_score || 0);
      return scoreB - scoreA;
    });
  }, [rows, isOpportunityTable]);

  const handleStatusChange = useCallback(
    (id: unknown, newStatus: string) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      updateRow({ status: newStatus }, getPkWhere(row));
    },
    [rows, updateRow, getPkWhere]
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
        <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground/60">No data yet</p>
        <p className="text-xs text-muted-foreground/40">
          {isResearchTable
            ? "Agents will populate research findings here"
            : "Opportunities will appear as research generates them"}
        </p>
      </div>
    );
  }

  // ── Research findings view ──
  if (isResearchTable) {
    return (
      <ScrollArea className="h-full">
        <div className="p-3 space-y-4">
          {Array.from(topicGroups.entries()).map(([topic, findings]) => (
            <div key={topic}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Search className="w-3 h-3 text-primary/50" />
                <h3 className="text-[11px] font-medium text-foreground/80 uppercase tracking-wider">
                  {topic}
                </h3>
                <span className="text-[10px] text-muted-foreground/40">
                  {findings.length} finding{findings.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {findings.map((row, i) => (
                  <FindingCard key={String(row.id ?? i)} row={row} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  // ── Opportunities view ──
  if (isOpportunityTable) {
    return (
      <ScrollArea className="h-full">
        <div className="p-3 space-y-2">
          {sortedOpportunities.map((row, i) => (
            <OpportunityCard
              key={String(row.id ?? i)}
              row={row}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  return null;
}
