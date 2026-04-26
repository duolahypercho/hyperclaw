"use client";

import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, X as XIcon, Zap, HelpCircle, AlertTriangle, Info } from "lucide-react";
import { getAgent } from "../agents";
import { AgentGlyph, EnsButton } from "../primitives";
import type { InboxItem } from "../hooks";

const INBOX_KIND_ICON: Record<string, React.ReactNode> = {
  approval: <Zap size={12} />,
  question: <HelpCircle size={12} />,
  error: <AlertTriangle size={12} />,
  info: <Info size={12} />,
};

function relTime(ts: number | undefined): string {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "—";
  }
}

interface NeedsYouRowProps {
  item: InboxItem;
  onResolve: (id: number, resolution: "approved" | "rejected" | "dismissed") => void | Promise<void>;
}

export function NeedsYouRow({ item, onResolve }: NeedsYouRowProps) {
  const agent = getAgent(item.agent_id);
  return (
    <div className="ens-row" style={{ gridTemplateColumns: "32px 1fr auto" }}>
      {agent ? (
        <AgentGlyph agent={agent} size={28} />
      ) : (
        <div className="ag-glyph" style={{ width: 28, height: 28, fontSize: 12 }}>?</div>
      )}
      <div className="min-w-0">
        <div className="who truncate" style={{ fontWeight: 500 }}>
          <span className="mr-1" style={{ color: "var(--ink-4)" }}>{INBOX_KIND_ICON[item.kind]}</span>
          {item.title}
        </div>
        <div className="meta truncate">{item.body || relTime(item.created_at)}</div>
      </div>
      <div className="flex items-center gap-1">
        <EnsButton variant="accent" title="Approve" onClick={() => onResolve(item.id, "approved")}>
          <Check size={12} />
        </EnsButton>
        <EnsButton title="Dismiss" onClick={() => onResolve(item.id, "dismissed")}>
          <XIcon size={12} />
        </EnsButton>
      </div>
    </div>
  );
}
