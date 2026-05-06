"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plug, Plus, Search, Settings as SettingsIcon, Grid3x3, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnsShell, Kpi } from "$/components/ensemble";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BRIDGE_CATEGORIES, type BridgeCategoryId } from "./bridges-catalog";
import { useBridges, type LiveBridge } from "./useBridges";
import { ConnectDrawer } from "./ConnectDrawer";
import { BridgeAvatar } from "./BridgeAvatar";

type View = "grid" | "catalog";
type StatusFilter = "all" | "connected" | "needs-auth" | "paused" | "off";

const STATUS_LABEL: Record<LiveBridge["status"], string> = {
  connected: "Connected",
  "needs-auth": "Needs auth",
  paused: "Paused",
  off: "Not connected",
};

function statusDotClass(s: LiveBridge["status"]): string {
  if (s === "connected") return "ens-dot online";
  if (s === "needs-auth") return "ens-dot error";
  if (s === "paused") return "ens-dot working";
  return "ens-dot offline";
}

interface BridgeRowProps {
  bridge: LiveBridge;
  onOpen: (bridgeId: string) => void;
}

function BridgeRow({ bridge: b, onOpen }: BridgeRowProps) {
  const action = (() => {
    if (b.status === "off") return { label: "Connect", icon: <Plus className="w-3 h-3" />, variant: "default" as const };
    if (b.status === "needs-auth") return { label: "Reauthorize", icon: null, variant: "default" as const };
    return { label: "Manage", icon: <SettingsIcon className="w-3 h-3" />, variant: "secondary" as const };
  })();

  return (
    <button
      type="button"
      onClick={() => onOpen(b.id)}
      className={cn(
        "w-full grid items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
        "border-b border-t-0 border-l-0 border-r-0 border-solid border-border last:border-b-0",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/60",
        b.status === "needs-auth" && "bg-accent/30 hover:bg-accent/40",
      )}
      style={{ gridTemplateColumns: "28px minmax(160px, 1.4fr) minmax(120px, 1fr) 110px 130px auto" }}
    >
      <BridgeAvatar bridge={b} />
      <span className="min-w-0">
        <div className="text-[12.5px] font-medium text-foreground truncate">{b.name}</div>
        <div className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground/80 truncate">
          {b.kind} · {b.tagline}
        </div>
      </span>
      <span className="font-mono text-[11px] text-muted-foreground truncate" title={b.account}>
        {b.account}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground/70">
        {b.addedAt ? new Date(b.addedAt).toLocaleDateString() : "—"}
      </span>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide">
        <span className={statusDotClass(b.status)} />
        <span
          className={cn(
            b.status === "connected" && "text-emerald-600 dark:text-emerald-400",
            b.status === "needs-auth" && "text-foreground",
            b.status === "paused" && "text-amber-600 dark:text-amber-400",
            b.status === "off" && "text-muted-foreground",
          )}
        >
          {STATUS_LABEL[b.status]}
        </span>
      </span>
      <span className="flex justify-end">
        <Badge variant={action.variant} className="gap-1 px-2 py-1 cursor-pointer">
          {action.icon}
          {action.label}
        </Badge>
      </span>
    </button>
  );
}

export function BridgesView() {
  const { bridges, loading, error, deviceId, saveBridge, removeBridge } = useBridges();

  const [cat, setCat] = useState<BridgeCategoryId | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const selectStatusFilter = useCallback((status: StatusFilter) => {
    setStatusFilter(status);
    if (status === "off") {
      setView("catalog");
      setCat("all");
    } else if (status !== "all" && view === "catalog") {
      setView("grid");
      setCat("all");
    }
  }, [view]);

  // Listen for "Connect bridge" button event from page header
  useEffect(() => {
    const handler = () => setView("catalog");
    window.addEventListener("bridges:open-catalog", handler);
    return () => window.removeEventListener("bridges:open-catalog", handler);
  }, []);

  const catCounts = useMemo(() => {
    const scoped = bridges.filter((b) => {
      if (view === "catalog" && b.status !== "off") return false;
      if (view === "grid" && b.status === "off") return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${b.name} ${b.kind} ${b.blurb}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const c: Record<string, number> = { all: scoped.length };
    scoped.forEach((b) => { c[b.cat] = (c[b.cat] || 0) + 1; });
    return c;
  }, [bridges, query, statusFilter, view]);

  const list = useMemo(() => {
    return bridges.filter((b) => {
      if (view === "catalog" && b.status !== "off") return false;
      if (view === "grid" && b.status === "off") return false;
      if (cat !== "all" && b.cat !== cat) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${b.name} ${b.kind} ${b.blurb}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [bridges, cat, statusFilter, view, query]);

  const groups = useMemo(() => {
    if (cat !== "all") {
      const meta = BRIDGE_CATEGORIES.find((c) => c.id === cat);
      return [{ id: cat, cat: meta?.label || cat, desc: meta?.desc, items: list }];
    }
    const map: Record<string, LiveBridge[]> = {};
    list.forEach((b) => { (map[b.cat] = map[b.cat] || []).push(b); });
    return BRIDGE_CATEGORIES.filter((c) => c.id !== "all" && map[c.id])
      .map((c) => ({ id: c.id, cat: c.label, desc: c.desc, items: map[c.id] }));
  }, [cat, list]);

  const stats = useMemo(() => {
    const total = bridges.length;
    const connected = bridges.filter((b) => b.status === "connected").length;
    const needAttn = bridges.filter((b) => b.status === "needs-auth" || b.status === "paused").length;
    const offered = bridges.filter((b) => b.status === "off").length;
    return { total, connected, needAttn, offered };
  }, [bridges]);

  const open = openId ? bridges.find((b) => b.id === openId) ?? null : null;

  return (
    <EnsShell padded={false} className="flex flex-col">
      <div className="grid h-full min-h-0 overflow-hidden" style={{ gridTemplateColumns: "220px 1fr" }}>
        {/* Sidebar */}
        <aside className="border-r border-t-0 border-b-0 border-l-0 border-solid border-border bg-card/40 overflow-y-auto p-4 flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <div className="ens-sh px-2 pb-1.5">View</div>
            {([
              { id: "grid", label: "Connected", icon: <Plug className="w-3.5 h-3.5" />, count: stats.total - stats.offered },
              { id: "catalog", label: "Browse catalog", icon: <Grid3x3 className="w-3.5 h-3.5" />, count: stats.offered },
            ] as const).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { setView(v.id); setStatusFilter("all"); setCat("all"); }}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors",
                  "hover:bg-muted/60 hover:text-foreground",
                  view === v.id ? "bg-muted text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {v.icon}
                <span className="flex-1">{v.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground/70">{v.count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="ens-sh px-2 pb-1.5">Category</div>
            {BRIDGE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors",
                  "hover:bg-muted/60 hover:text-foreground",
                  cat === c.id ? "bg-muted text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                <span className="flex-1">{c.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground/70">{catCounts[c.id] || 0}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="ens-sh px-2 pb-1.5">Status</div>
            {([
              { id: "all", label: "Any status" },
              { id: "connected", label: "Connected" },
              { id: "needs-auth", label: "Needs auth" },
              { id: "paused", label: "Paused" },
              { id: "off", label: "Not connected" },
            ] as const).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStatusFilter(s.id)}
                className={cn(
                  "flex items-center px-2 py-1.5 rounded-md text-[12px] text-left transition-colors",
                  "hover:bg-muted/60 hover:text-foreground",
                  statusFilter === s.id ? "bg-muted text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <div className="overflow-y-auto px-7 py-7 pb-16 relative">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="ens-hero">Bridges</h1>
              <p className="ens-sub mt-1 max-w-xl">
                Connect models, APIs and tools your agents can read from and write to. Keys are stored
                encrypted on the connector daemon — never sent to the hub.
              </p>
            </div>
          </div>

          {!deviceId && !loading && (
            <div className="ens-card-flat flex items-center gap-2 mb-4 text-[12.5px] text-muted-foreground">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              No connector device detected. Start the Hyperclaw connector daemon on this machine to
              save keys locally.
            </div>
          )}
          {error && (
            <div className="ens-card-flat flex items-center gap-2 mb-4 text-[12.5px] text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* KPIs — same pattern as TeamRoster */}
          <div className="ens-grid-kpi mb-6">
            <Kpi label="Total" value={stats.total} detail="bridges available" />
            <Kpi
              label="Connected"
              value={stats.connected}
              detail={loading ? "loading…" : "actively configured"}
            />
            <Kpi
              label="Need attention"
              value={stats.needAttn}
              detail={stats.needAttn ? "review auth & state" : "all good"}
            />
            <Kpi label="Catalog" value={stats.offered} detail="available to connect" />
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search models, providers, tools…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8 text-[12.5px]"
              />
            </div>
            <div className="inline-flex border border-solid border-border bg-card rounded-md p-0.5">
              {(["grid", "catalog"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setView(v); setStatusFilter("all"); setCat("all"); }}
                  className={cn(
                    "h-6 px-3 text-[11.5px] font-medium rounded-[3px] transition-colors",
                    view === v
                      ? "bg-background text-foreground shadow-sm"
                      : "bg-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "grid" ? "Connected" : "Catalog"}
                </button>
              ))}
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.id}>
              {cat === "all" && (
                <div className="flex items-baseline gap-2.5 mb-2.5 mt-5">
                  <h2 className="ens-h2">{g.cat}</h2>
                  <span className="font-mono text-[10px] text-muted-foreground/80">{g.items.length}</span>
                  {g.desc && <span className="text-[12px] text-muted-foreground">{g.desc}</span>}
                </div>
              )}
              <div className="ens-card p-0 overflow-hidden mb-3.5">
                <div
                  className={cn(
                    "grid items-center gap-3 px-3.5 py-2 bg-muted/50",
                    "font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground",
                    "border-b border-t-0 border-l-0 border-r-0 border-solid border-border",
                  )}
                  style={{ gridTemplateColumns: "28px minmax(160px, 1.4fr) minmax(120px, 1fr) 110px 130px auto" }}
                >
                  <div />
                  <div>Provider</div>
                  <div>Account</div>
                  <div>Added</div>
                  <div>Status</div>
                  <div />
                </div>
                {g.items.map((b) => <BridgeRow key={b.id} bridge={b} onOpen={setOpenId} />)}
              </div>
            </div>
          ))}

          {list.length === 0 && (
            <div className="ens-card-flat text-center py-10 mt-3.5">
              <Search className="w-5 h-5 mx-auto text-muted-foreground" />
              <div className="mt-2 text-[13px] text-muted-foreground">No bridges match this filter.</div>
            </div>
          )}
        </div>
      </div>

      <ConnectDrawer
        bridge={open}
        open={!!open}
        onClose={() => setOpenId(null)}
        onSave={saveBridge}
        onRemove={removeBridge}
      />
    </EnsShell>
  );
}

export default BridgesView;
