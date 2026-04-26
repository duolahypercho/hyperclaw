"use client";

import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { Search, X, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  listRooms,
  createRoom as bridgeCreateRoom,
  type BridgeRoom,
} from "$/lib/hyperclaw-bridge-client";
import { EnsShell, AgentGlyph, StatusDot, normalizeAgentState, useAgentStatus } from "$/components/ensemble";
import {
  useEnsembleAgents,
  type EnsembleAgentView,
} from "../hooks/useEnsembleAgents";
import type { EnsembleAgent } from "../agents";
import AgentChatWidget from "$/components/Home/widgets/AgentChatWidget";
import { OPEN_AGENT_CHAT_EVENT, AGENT_READ_EVENT, consumePendingOpenAgent } from "$/components/Home/widgets/StatusWidget";
import type { Widget } from "$/components/Home/Dashboard";
import RoomChatView from "./RoomChatView";
import { gatewayConnection, type ChatEventPayload } from "$/lib/openclaw-gateway-ws";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import {
  extractChatEventPreview,
  formatAgentRowDetail,
  getAgentIdFromMainChatSessionKey,
} from "./ensemble-chat-sidebar";

/* ─── Room types ────────────────────────────────────────────────── */

interface Room {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  createdAt: number;
}

type ActiveItem =
  | { type: "dm"; agentId: string }
  | { type: "room"; roomId: string };

/* ─── Emoji palette for room picker ────────────────────────────── */

const ROOM_EMOJIS = [
  "💬", "🚀", "⚡", "🔥", "🌟", "🎯",
  "🛠️", "📊", "🧠", "🔬", "🎨", "📦",
  "🌐", "🤝", "📝", "🔐", "🏆", "⚙️",
  "🌈", "💡", "🎭", "🗂️", "📡", "🧩",
];

/* ─── Persistence helpers ────────────────────────────────────────── */

const LS_KEY = "ensemble:rooms:v1";

function lsLoad(): Room[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    return raw ? (JSON.parse(raw) as Room[]) : [];
  } catch { return []; }
}

function lsSave(rooms: Room[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rooms)); } catch {}
}

function toRoom(r: BridgeRoom): Room {
  return {
    id: r.id ?? `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: r.name,
    emoji: r.emoji ?? "💬",
    memberIds: r.memberIds ?? [],
    createdAt: r.createdAt,
  };
}

/* ─── Main component ────────────────────────────────────────────── */

export default function EnsembleChat() {
  const agents = useEnsembleAgents();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [rooms, setRooms] = useState<Room[]>(() => lsLoad());
  const [active, setActive] = useState<ActiveItem | undefined>(undefined);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [latestDmMessages, setLatestDmMessages] = useState<Record<string, string>>({});

  const existingAgentsForDialog = useMemo(
    () => agents.map((a) => ({ id: a.id, name: a.name, runtime: a.kind })),
    [agents]
  );

  // Default to first agent when nothing is explicitly selected
  const fallbackAgentId = agents[0]?.id;
  const resolvedActive: ActiveItem | undefined = useMemo(
    () => active ?? (fallbackAgentId ? { type: "dm", agentId: fallbackAgentId } : undefined),
    [active, fallbackAgentId],
  );
  const activeRef = useRef<ActiveItem | undefined>(resolvedActive);

  // Keep activeRef in sync so the gateway listener can check it without a stale closure.
  // Use resolvedActive so the first-agent fallback counts as the visible chat.
  useEffect(() => {
    activeRef.current = resolvedActive;
  }, [resolvedActive]);

  // Sync from connector SQLite on mount (bridge may be offline; localStorage is the fallback)
  useEffect(() => {
    listRooms()
      .then((list) => {
        if (list.length > 0) {
          const hydrated = list.map(toRoom);
          setRooms(hydrated);
          lsSave(hydrated);
        }
      })
      .catch(() => {});
  }, []);

  // Track unread counts: increment when a final message arrives for a DM we're not viewing
  useEffect(() => {
    const handler = (payload: ChatEventPayload) => {
      if (payload.state !== "final") return;
      const agentId = getAgentIdFromMainChatSessionKey(payload.sessionKey);
      if (!agentId) return;
      const cur = activeRef.current;

      const preview = extractChatEventPreview(payload.message);
      if (preview) {
        setLatestDmMessages((prev) => ({ ...prev, [agentId]: preview }));
      }

      const isViewing = cur?.type === "dm" && cur.agentId === agentId;
      if (isViewing) return;
      setUnreadCounts((prev) => ({ ...prev, [agentId]: (prev[agentId] ?? 0) + 1 }));
    };
    gatewayConnection.chatEventListeners.add(handler);
    return () => { gatewayConnection.chatEventListeners.delete(handler); };
  }, []);

  const activeRoom =
    resolvedActive?.type === "room"
      ? rooms.find((r) => r.id === resolvedActive.roomId)
      : undefined;
  const activeRoomId = activeRoom?.id;
  const activeRoomAgentId = (activeRoom?.memberIds ?? []).at(0) ?? fallbackAgentId;

  /* Widget stub for the chat panel */
  const widgetStub: Widget = useMemo(() => {
    let agentId: string | undefined;
    let sessionKey: string | undefined;

    if (resolvedActive?.type === "dm") {
      agentId = resolvedActive.agentId;
      sessionKey = `ensemble:dm:${resolvedActive.agentId}`;
    } else if (resolvedActive?.type === "room" && activeRoomId) {
      agentId = activeRoomAgentId;
      sessionKey = `ensemble:room:${activeRoomId}`;
    } else {
      agentId = fallbackAgentId;
    }

    return {
      id: "ensemble-chat",
      type: "agent-chat" as Widget["type"],
      title: "Ensemble Chat",
      icon: null,
      component: AgentChatWidget as unknown as Widget["component"],
      defaultValue: { w: 12, h: 12, minW: 6, minH: 6, x: 0, y: 0 },
      config: agentId
        ? { agentId, sessionKey, hideTabs: true }
        : { hideTabs: true },
    };
  }, [resolvedActive, activeRoomId, activeRoomAgentId, fallbackAgentId]);

  /* Filtered lists */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { agents, rooms };
    return {
      agents: agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.runtimeLabel.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q)
      ),
      rooms: rooms.filter((r) => r.name.toLowerCase().includes(q)),
    };
  }, [agents, rooms, query]);

  /* Handlers */
  const handleSelectAgent = useCallback((agent: EnsembleAgentView) => {
    const isHiring = normalizeAgentState(agent.status) === "hiring";
    setActive({ type: "dm", agentId: agent.id });
    setQuery("");
    if (!isHiring) {
      setUnreadCounts((prev) => {
        if (!prev[agent.id]) return prev;
        const next = { ...prev };
        delete next[agent.id];
        return next;
      });
      window.dispatchEvent(new CustomEvent(AGENT_READ_EVENT, { detail: { agentId: agent.id } }));
    }
    window.dispatchEvent(
      new CustomEvent(OPEN_AGENT_CHAT_EVENT, {
        detail: { agentId: agent.id, sessionKey: `ensemble:dm:${agent.id}`, hiring: isHiring },
      })
    );
  }, []);

  const handleSelectRoom = useCallback((room: Room) => {
    setActive({ type: "room", roomId: room.id });
    setQuery("");
  }, []);

  const handleCreateRoom = useCallback((room: Room) => {
    // Optimistic: add immediately and persist to localStorage so refresh works
    setRooms((prev) => {
      const next = [...prev, room];
      lsSave(next);
      return next;
    });
    setActive({ type: "room", roomId: room.id });
    setShowNewRoom(false);
    // Also persist to SQLite via bridge (best-effort)
    bridgeCreateRoom({
      id: room.id,
      name: room.name,
      emoji: room.emoji,
      memberIds: room.memberIds,
    }).catch(() => {});
  }, []);

  /* On first mount, apply any agent set by navbar before navigation completed */
  useEffect(() => {
    const pending = consumePendingOpenAgent();
    if (pending?.agentId) {
      setActive({ type: "dm", agentId: pending.agentId });
      setQuery("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Listen for external agent-open events (e.g. from navbar on cached visits) */
  useEffect(() => {
    const handler = (e: Event) => {
      const agentId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (agentId) {
        setActive({ type: "dm", agentId });
        setQuery("");
        setUnreadCounts((prev) => {
          if (!prev[agentId]) return prev;
          const next = { ...prev };
          delete next[agentId];
          return next;
        });
      }
    };
    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handler);
  }, []);

  /* Listen for header button events */
  useEffect(() => {
    const onNewRoom = () => setShowNewRoom(true);
    const onNewAgent = () => setShowAddAgent(true);
    window.addEventListener("ensemble:new-room", onNewRoom);
    window.addEventListener("ensemble:new-agent", onNewAgent);
    return () => {
      window.removeEventListener("ensemble:new-room", onNewRoom);
      window.removeEventListener("ensemble:new-agent", onNewAgent);
    };
  }, []);

  /* ⌘K focuses sidebar search */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasSidebar = agents.length > 0;
  const hasNoResults =
    !!query &&
    filtered.agents.length === 0 &&
    filtered.rooms.length === 0;

  return (
    <EnsShell padded={false} className="flex">
      {hasSidebar && (
        <aside
          className="border-r border-border border-solid border-t-0 border-l-0 border-b-0 flex flex-col shrink-0 bg-secondary"
          style={{ width: 240 }}
        >
          {/* Search */}
          <div className="px-3 py-2.5">
            <div className="relative flex items-center border-solid border-1 border-border rounded-md">
              <Search
                size={12}
                className="absolute left-2.5 text-muted-foreground/50 pointer-events-none shrink-0"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents & rooms"
                className="w-full bg-background rounded-md pl-7 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/80 outline-none focus:border-border focus:bg-background transition-colors"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute right-2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* ── ROOMS — pinned, never scrolls away ──────── */}
          {!hasNoResults && (!query || filtered.rooms.length > 0) && (
            <div className="px-2 pt-1 pb-1 shrink-0">
              <div className="flex items-center justify-between px-2 mb-0.5">
              <span className="font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">rooms</span>
              <button
                  onClick={() => setShowNewRoom(true)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted"
                  title="New room"
                >
                  <Plus size={10} />
                </button>
              </div>

              {filtered.rooms.map((r, i) => (
                <RoomRow
                  key={r.id || `room-${i}`}
                  room={r}
                  active={
                    resolvedActive?.type === "room" &&
                    resolvedActive.roomId === r.id
                  }
                  onClick={() => handleSelectRoom(r)}
                />
              ))}

              {!query && rooms.length === 0 && (
                <button
                  onClick={() => setShowNewRoom(true)}
                  className="w-full px-2 py-1.5 text-left text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded-md hover:bg-muted"
                >
                  + Create your first room
                </button>
              )}
            </div>
          )}

          {/* ── DIRECT MESSAGES — scrolls independently ── */}
          {!hasNoResults && filtered.agents.length > 0 && (
            <div className="flex-1 overflow-auto min-h-0 px-2 py-1">
              <div className="flex items-center justify-between px-2 mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">AGENTS · 1:1 </span>
                  {agents.length > 5 && (
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                      {filtered.agents.length}
                      {query && agents.length !== filtered.agents.length
                        ? `/${agents.length}`
                        : ""}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowAddAgent(true)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted"
                  title="Hire agent"
                >
                  <Plus size={10} />
                </button>
              </div>

              {filtered.agents.map((a) => (
                <AgentRow
                  key={a.id}
                  agent={a}
                  active={
                    resolvedActive?.type === "dm" &&
                    resolvedActive.agentId === a.id
                  }
                  unreadCount={unreadCounts[a.id] ?? 0}
                  latestMessage={latestDmMessages[a.id]}
                  onClick={() => handleSelectAgent(a)}
                />
              ))}
            </div>
          )}

          {/* ── No search results ────────────────────────── */}
          {hasNoResults && (
            <p className="px-4 py-3 text-[12px] text-muted-foreground/50">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
        </aside>
      )}

      {/* Chat area — room view or 1:1 DM */}
      <div className="flex-1 min-h-0 min-w-0">
        {resolvedActive?.type === "room" && activeRoom ? (
          <RoomChatView room={activeRoom} allAgents={agents} />
        ) : (
          <AgentChatWidget
            widget={widgetStub}
            isMaximized={false}
            onMaximize={() => {}}
            isEditMode={false}
            className="border-0 rounded-none shadow-none h-full bg-background"
          />
        )}
      </div>

      {/* New Room dialog */}
      <NewRoomDialog
        open={showNewRoom}
        agents={agents}
        onClose={() => setShowNewRoom(false)}
        onCreate={handleCreateRoom}
      />

      {/* Add Agent dialog */}
      <AddAgentDialog
        open={showAddAgent}
        onOpenChange={setShowAddAgent}
        existingAgents={existingAgentsForDialog}
        onSuccess={(agentId) => {
          setActive({ type: "dm", agentId });
          setQuery("");
        }}
      />
    </EnsShell>
  );
}

/* ─────────────────────────────────────────────────────────────────
   RoomRow
───────────────────────────────────────────────────────────────── */

function RoomRow({
  room,
  active,
  onClick,
}: {
  room: Room;
  active: boolean;
  onClick: () => void;
}) {
  const memberCount = (room.memberIds ?? []).length;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-all",
        active
          ? "bg-background border border-solid border-border text-foreground shadow-sm"
          : "border border-solid border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span className="flex items-center justify-center w-[24px] h-[24px] rounded-md bg-muted text-xs shrink-0 p-0.5">
        {room.emoji}
      </span>
 
      <div className="flex-1 min-w-0">
        <div className="truncate leading-tight font-normal text-xs" >
          {room.name}
        </div>
        <div className="text-muted-foreground leading-tight uppercase mt-0.5 text-[10px]">
          {memberCount} {memberCount === 1 ? "agent" : "agents"}
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   AgentRow (DM)
───────────────────────────────────────────────────────────────── */

function AgentRow({
  agent,
  active,
  unreadCount,
  latestMessage,
  onClick,
}: {
  agent: EnsembleAgentView;
  active: boolean;
  unreadCount: number;
  latestMessage?: string;
  onClick: () => void;
}) {
  const detail = formatAgentRowDetail(agent.runtimeLabel, latestMessage);
  const { state } = useAgentStatus(agent.id, { status: agent.status });
  const isGenerating = state === "working";
  const isHiring = state === "hiring";
  const isDeleting = state === "deleting";
  const isBlocked = isDeleting;

  return (
    <button
      onClick={() => {
        if (!isBlocked) onClick();
      }}
      disabled={isBlocked}
      aria-disabled={isBlocked}
      className={cn(
        "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-all",
        isBlocked
          ? "cursor-not-allowed opacity-60 border border-solid border-transparent text-muted-foreground"
          : active
          ? "bg-background border border-solid border-border text-foreground shadow-sm"
          : "border border-solid border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <div className="relative shrink-0 w-[24px] h-[24px]">
        <AgentGlyph agent={toSeedShape(agent)} size={24} />
        <StatusDot state={state} size="sm" corner ringClassName="bg-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate leading-tight flex-1" style={{ fontSize: 12 }}>
            {agent.name}
          </span>
          {isGenerating && (
            <span className="shrink-0 inline-flex items-center px-1 py-0 rounded text-[8px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 leading-tight animate-pulse">
              Generating
            </span>
          )}
          {isHiring && (
            <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] font-semibold bg-red-500/15 text-red-400 border border-red-400/30 leading-tight animate-pulse">
              <Loader2 className="w-2 h-2 animate-spin" />
              Hiring
            </span>
          )}
          {isDeleting && (
            <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] font-semibold bg-red-500/15 text-red-400 border border-red-400/30 leading-tight animate-pulse">
              <Loader2 className="w-2 h-2 animate-spin" />
              Firing
            </span>
          )}
          {!isGenerating && !isHiring && !isDeleting && !active && unreadCount > 0 && (
            <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white leading-none">
              {unreadCount >= 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div
          className="truncate text-muted-foreground leading-tight mt-0.5"
          style={{ fontSize: 10 }}
        >
          {detail}
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   New Room Dialog
───────────────────────────────────────────────────────────────── */

function NewRoomDialog({
  open,
  agents,
  onClose,
  onCreate,
}: {
  open: boolean;
  agents: EnsembleAgentView[];
  onClose: () => void;
  onCreate: (room: Room) => void;
}) {
  const [name, setName] = useState("New Room");
  const [emoji, setEmoji] = useState("💬");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form and auto-focus name when the dialog opens
  useEffect(() => {
    if (open) {
      setName("New Room");
      setEmoji("💬");
      setSelectedIds(new Set());
      setTimeout(() => {
        nameRef.current?.focus();
        nameRef.current?.select();
      }, 60);
    }
  }, [open]);

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canCreate = name.trim().length > 0 && selectedIds.size > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      emoji,
      memberIds: Array.from(selectedIds),
      createdAt: Date.now(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 max-w-[420px] rounded-[14px] flex flex-col border-border"
        style={{ maxHeight: "80vh", minHeight: "60vh" }}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-t-0 border-l-0 border-r-0 border-solid border-border space-y-0 shrink-0">
          <DialogTitle className="text-sm font-semibold">New Room</DialogTitle>
          <DialogClose asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-accent">
              <X size={15} />
            </button>
          </DialogClose>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5 min-h-0">
          {/* Emoji + Name row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                className="w-11 h-11 shrink-0 rounded-xl bg-secondary border border-solid border-border flex items-center justify-center text-xl leading-none hover:bg-accent transition-colors"
                title="Change icon"
              >
                {emoji}
              </button>

              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Room name…"
                maxLength={48}
                className="flex-1 h-11 bg-secondary border border-solid border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            {/* Inline emoji palette — avoids overflow-hidden clipping */}
              <div className="rounded-xl border border-solid border-border bg-transparent p-2.5">
                <div className="grid grid-cols-8 gap-1">
                  {ROOM_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setEmoji(e);
                      }}
                      className={cn(
                        "h-9 rounded-lg text-lg flex items-center justify-center leading-none hover:bg-primary/5 transition-colors",
                        emoji === e && "bg-primary/10 border-solid border-border border-1"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
          </div>

          {/* Agent picker */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Add agents{" "}
              {selectedIds.size > 0 && (
                <span className="text-muted-foreground/50">
                  · {selectedIds.size} selected
                </span>
              )}
            </p>

            <div className="space-y-0.5 max-h-64 overflow-auto rounded-lg border border-solid border-border p-1">
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 py-6 text-center">
                  No agents available
                </p>
              ) : (
                agents.map((a) => {
                  const checked = selectedIds.has(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAgent(a.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-2 py-1 rounded-md text-left transition-colors",
                        checked ? "bg-primary/10" : "hover:bg-primary/5"
                      )}
                    >
                      <div className="relative shrink-0 w-[28px] h-[28px]">
                        <AgentGlyph agent={toSeedShape(a)} size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate leading-tight">
                          {a.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                          {a.title || "Employee"}
                        </div>
                      </div>

                      <div
                        className={cn(
                          "w-4 h-4 rounded border-[1.5px] border-solid flex items-center justify-center shrink-0 transition-colors",
                          checked ? "bg-primary border-primary" : "border-border"
                        )}
                      >
                        {checked && (
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2 text-primary-foreground" fill="none">
                            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3.5 border-t border-b-0 border-l-0 border-r-0 border-solid border-border shrink-0 sm:justify-end gap-2 sm:space-x-0">
          <DialogClose asChild>
            <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
              Cancel
            </button>
          </DialogClose>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              canCreate
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
            )}
          >
            Create Room
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function toSeedShape(a: EnsembleAgentView): EnsembleAgent {
  return {
    id: a.id,
    name: a.name,
    title: a.title,
    department: a.department,
    emoji: a.emoji,
    kind: a.kind,
    runtimeLabel: a.runtimeLabel,
    identity: a.identity,
    seedCostMonth: 0,
    seedTokensMonth: 0,
    seedState: "idle",
  };
}
