"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import InputContainer from "@OS/AI/components/InputContainer";
import type { InputContainerHandle } from "@OS/AI/components/Chat/types/Input";
import { useUser } from "$/Providers/UserProv";
import { resolveAvatarUrl, resolveAvatarText } from "$/hooks/useAgentIdentity";
import { getMediaUrl } from "$/utils";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import { rehypePlugins } from "@OS/AI/components/rehypeConfig";
import { cn } from "@/lib/utils";
import { AgentGlyph, StatusDot } from "$/components/ensemble";
import { useAgentStatus } from "../hooks";
import {
  MemoizedReactMarkdown,
  memoizedMarkdownComponents,
} from "$/components/Home/widgets/gateway-chat/EnhancedMessageBubble";
import { AnimatedThinkingText } from "@OS/AI/components/Chat";
import {
  listRoomMessages,
  roomSend,
  type RoomMessage,
  type RoomAgentStreamEvent,
} from "$/lib/hyperclaw-bridge-client";
import { getGatewayConnectionState, subscribeGatewayConnection } from "$/lib/openclaw-gateway-ws";
import type { EnsembleAgentView } from "../hooks/useEnsembleAgents";
import type { EnsembleAgent } from "../agents";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Room {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  createdAt: number;
}

interface StreamingMessage {
  agentId: string;
  agentName: string;
  runtime: string;
  content: string;
}

/* ── Runtime colours ───────────────────────────────────────────────────── */

const RUNTIME_COLORS: Record<string, string> = {
  "claude-code": "bg-amber-500/10 text-amber-500",
  claude:        "bg-amber-500/10 text-amber-500",
  codex:         "bg-blue-500/10 text-blue-500",
  openclaw:      "bg-violet-500/10 text-violet-500",
  hermes:        "bg-emerald-500/10 text-emerald-500",
};

function RuntimeBadge({ runtime }: { runtime: string }) {
  const cls = RUNTIME_COLORS[runtime?.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide leading-none", cls)}>
      {runtime || "agent"}
    </span>
  );
}

/* ── Agent pill status dot ─────────────────────────────────────────────── */

function AgentPillDot({
  agentId,
  fallbackStatus,
}: {
  agentId: string;
  fallbackStatus?: string;
}) {
  const { state } = useAgentStatus(agentId, { status: fallbackStatus });
  return <StatusDot state={state} size="sm" corner ringClassName="bg-background" />;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function toSeedShape(a: EnsembleAgentView): EnsembleAgent {
  return {
    id: a.id, name: a.name, title: a.title, department: a.department,
    emoji: a.emoji, kind: a.kind, runtimeLabel: a.runtimeLabel,
    identity: a.identity, seedCostMonth: 0, seedTokensMonth: 0, seedState: "idle",
  };
}

function getMentionContext(val: string): { query: string; start: number } | null {
  const match = /@(\w*)$/.exec(val);
  if (!match) return null;
  return { query: match[1], start: match.index };
}

/* ── Stacked avatars ───────────────────────────────────────────────────── */

const MAX_AVATARS = 4;

function StackedAvatars({ members }: { members: EnsembleAgentView[] }) {
  const shown = members.slice(0, MAX_AVATARS);
  const extra = members.length - MAX_AVATARS;

  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <div
          key={m.id}
          title={m.name}
          className="relative w-6 h-6 rounded-full border-2 border-solid border-background bg-secondary flex items-center justify-center overflow-hidden shrink-0"
          style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
        >
          <AgentGlyph agent={toSeedShape(m)} size={22} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="relative w-6 h-6 rounded-full border-2 border-solid border-background bg-muted flex items-center justify-center shrink-0 text-[9px] font-semibold text-muted-foreground"
          style={{ marginLeft: -8, zIndex: 0 }}
          title={members.slice(MAX_AVATARS).map((m) => m.name).join(", ")}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────── */

export default function RoomChatView({
  room,
  allAgents,
}: {
  room: Room;
  allAgents: EnsembleAgentView[];
}) {
  const members = useMemo(
    () => allAgents.filter((a) => (room.memberIds ?? []).includes(a.id)),
    [allAgents, room.memberIds]
  );

  const [gatewayConnected, setGatewayConnected] = useState(
    () => getGatewayConnectionState().connected
  );
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      setGatewayConnected(getGatewayConnectionState().connected);
    });
  }, []);

  const { userInfo } = useUser();
  const userAvatar = useMemo(() => ({
    src: userInfo?.profilePic ? getMediaUrl(userInfo.profilePic) : undefined,
    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
  }), [userInfo?.profilePic, userInfo?.username]);

  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    members.at(0)?.id ? new Set([members.at(0)!.id]) : new Set()
  );

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputContainerHandle | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setStreaming(null);
    listRoomMessages(room.id, 50).then(setMessages).catch(() => {});
  }, [room.id]);

  useEffect(() => {
    if (members.length === 0) return;
    setSelectedIds((prev) => {
      const valid = new Set([...prev].filter((id) => members.some((m) => m.id === id)));
      return valid.size > 0 ? valid : new Set([members[0].id]);
    });
  }, [members]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming?.content]);

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<RoomAgentStreamEvent>).detail;
      if (data.roomId !== room.id) return;

      if (data.done) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.messageId ?? `msg-${Date.now()}`,
            roomId: room.id,
            role: "assistant",
            agentId: data.agentId,
            agentName: data.agentName,
            runtime: data.runtime,
            content: streaming?.content ?? "",
            createdAt: Date.now(),
          },
        ]);
        setStreaming(null);
        setSending(false);
      } else if (data.chunk) {
        setStreaming((prev) => ({
          agentId: data.agentId,
          agentName: data.agentName,
          runtime: data.runtime,
          content: (prev?.content ?? "") + data.chunk,
        }));
      }
    };
    window.addEventListener("room-agent-stream", handler);
    return () => window.removeEventListener("room-agent-stream", handler);
  }, [room.id, streaming?.content]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().startsWith(q));
  }, [mentionQuery, members]);

  useEffect(() => { setMentionIndex(0); }, [mentionMatches.length]);

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setMentionStart(0);
    setMentionIndex(0);
  }, []);

  const commitMention = useCallback((agent: EnsembleAgentView) => {
    const ih = inputRef.current;
    if (!ih) return;
    const val = ih.getValue();
    const before = val.slice(0, mentionStart);
    const after = val.slice(mentionStart + (mentionQuery?.length ?? 0) + 1);
    const newVal = `${before}@${agent.name} ${after}`;
    ih.setValue(newVal);
    setInput(newVal);
    setSelectedIds((prev) => new Set([...prev, agent.id]));
    closeMention();
    requestAnimationFrame(() => ih.focus());
  }, [mentionStart, mentionQuery, closeMention]);

  const toggleAgent = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleValueChange = useCallback((val: string) => {
    setInput(val);
    const ctx = getMentionContext(val);
    if (ctx) {
      setMentionQuery(ctx.query);
      setMentionStart(ctx.start);
    } else {
      closeMention();
    }
  }, [closeMention]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || sending || selectedIds.size === 0 || members.length === 0) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        roomId: room.id,
        role: "user",
        agentId: "", agentName: "", runtime: "",
        content: text.trim(),
        createdAt: Date.now(),
      },
    ]);
    setInput("");
    closeMention();
    setSending(true);

    for (const targetId of selectedIds) {
      try {
        await roomSend({ roomId: room.id, targetAgentId: targetId, message: text.trim(), contextLimit: 20 });
      } catch {
        // continue to next agent
      }
    }
    setSending(false);
  }, [sending, selectedIds, members, room.id, closeMention]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionMatches.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitMention(mentionMatches[mentionIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); closeMention(); return; }
    }
  }, [mentionQuery, mentionMatches, mentionIndex, commitMention, closeMention]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mentionListRef.current && !mentionListRef.current.contains(e.target as Node)) {
        closeMention();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeMention]);

  const selectedAgents = members.filter((m) => selectedIds.has(m.id));

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-t-0 border-l-0 border-r-0 border-solid border-border/50">
        <span className="text-xl leading-none">{room.emoji}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-foreground truncate">{room.name}</h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {members.length} agent{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        {members.length > 0 && <StackedAvatars members={members} />}
      </div>

      {/* ── Message thread ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0 px-4 py-4 space-y-1">
        {messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center pb-8">
            <div className="w-14 h-14 rounded-2xl bg-secondary border border-solid border-border flex items-center justify-center text-3xl">
              {room.emoji}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{room.name}</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-[260px] leading-relaxed">
                Select one or more agents below, then start the conversation.
                Type <span className="font-mono bg-muted px-1 rounded text-[10px]">@Name</span> to add an agent to the reply.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const prevSide = prev ? (prev.role === "user" ? "user" : "assistant") : null;
          const thisSide = msg.role === "user" ? "user" : "assistant";
          const showAvatar = prevSide !== thisSide;
          const agent = members.find((m) => m.id === msg.agentId);

          return msg.role === "user" ? (
            <RoomUserBubble key={msg.id} content={msg.content} showAvatar={showAvatar} userAvatar={userAvatar} />
          ) : (
            <RoomAgentBubble
              key={msg.id}
              agentName={msg.agentName}
              runtime={msg.runtime}
              content={msg.content}
              agent={agent}
              showAvatar={showAvatar}
            />
          );
        })}

        {streaming && (
          <RoomAgentBubble
            agentName={streaming.agentName}
            runtime={streaming.runtime}
            content={streaming.content}
            agent={members.find((m) => m.id === streaming.agentId)}
            showAvatar
            isStreaming
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-4 pt-2">

        {/* @mention popup */}
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div
            ref={mentionListRef}
            className="mb-1.5 rounded-xl border border-solid border-border bg-background shadow-lg overflow-hidden"
          >
            <div className="px-2 py-1.5 border-b border-solid border-border">
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                Mention agent
              </span>
            </div>
            <div className="py-1 max-h-48 overflow-auto">
              {mentionMatches.map((agent, idx) => (
                <button
                  key={agent.id}
                  onMouseDown={(e) => { e.preventDefault(); commitMention(agent); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    idx === mentionIndex
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <div className="shrink-0 w-6 h-6 rounded-full border border-solid border-border bg-secondary flex items-center justify-center overflow-hidden">
                    <AgentGlyph agent={toSeedShape(agent)} size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block">{agent.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 truncate block">{agent.title || "Agent"}</span>
                  </div>
                  {agent.runtimeLabel && <RuntimeBadge runtime={agent.runtimeLabel} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected agent chips */}
        {selectedAgents.length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            {selectedAgents.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 bg-primary/10 rounded-full pl-1 pr-2 py-0.5">
                <span className="w-4 h-4 shrink-0 rounded-full overflow-hidden bg-secondary border border-solid border-border/50 flex items-center justify-center">
                  <AgentGlyph agent={toSeedShape(a)} size={14} />
                </span>
                <span className="text-[10px] text-muted-foreground/80 leading-none">{a.name}</span>
              </div>
            ))}
            {selectedIds.size > 1 && (
              <span className="text-[10px] text-muted-foreground/50 px-1">
                → all {selectedIds.size} will reply
              </span>
            )}
          </div>
        )}

        {/* Input */}
        <InputContainer
          inputRef={inputRef}
          onSendMessage={handleSend}
          onInputChange={handleValueChange}
          onKeyDown={handleKeyDown}
          onStopGeneration={() => setSending(false)}
          isLoading={sending}
          disabled={members.length === 0}
          agentId={selectedAgents[0]?.id}
          sessionKey={`room:${room.id}`}
          placeholder={
            members.length === 0
              ? "No agents in this room…"
              : `Message ${selectedAgents.map((a) => a.name).join(", ") || "agents"}… type @ to mention`
          }
        />

        {/* Agent pills */}
        {members.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {members.map((agent) => {
              const active = selectedIds.has(agent.id);
              return (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    "flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border border-solid transition-all text-xs",
                    active
                      ? "bg-primary/10 border-primary/30 text-foreground shadow-sm"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className="relative w-[18px] h-[18px] shrink-0 flex items-center justify-center">
                    <span className="w-[18px] h-[18px] rounded-full overflow-hidden flex items-center justify-center bg-secondary border border-solid border-border">
                      <AgentGlyph agent={toSeedShape(agent)} size={18} />
                    </span>
                    <AgentPillDot
                      agentId={agent.id}
                      fallbackStatus={agent.status || (gatewayConnected ? "active" : "offline")}
                    />
                  </span>
                  <span className="font-medium">{agent.name}</span>
                  {agent.runtimeLabel && <RuntimeBadge runtime={agent.runtimeLabel} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── User bubble — matches EnhancedMessageBubble exactly ─────────────────── */

function RoomUserBubble({
  content,
  showAvatar,
  userAvatar,
}: {
  content: string;
  showAvatar: boolean;
  userAvatar?: { src?: string; fallback: string };
}) {
  return (
    <div className="flex gap-3 group justify-end">
      <div className="relative flex flex-col max-w-full min-w-0 justify-end items-end">
        <div
          className="py-1.5 px-3 relative w-full max-w-full overflow-hidden transition-all duration-200 select-text font-normal text-sm bg-primary text-primary-foreground"
          style={{
            borderTopRightRadius: "0px",
            borderBottomRightRadius: "10px",
            borderTopLeftRadius: "10px",
            borderBottomLeftRadius: "10px",
          }}
        >
          <MemoizedReactMarkdown
            components={memoizedMarkdownComponents.user}
            remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={rehypePlugins}
          >
            {content}
          </MemoizedReactMarkdown>
        </div>
      </div>

      <div className="w-8 h-8 flex-shrink-0">
        {showAvatar ? (
          <Avatar className="w-8 h-8">
            {userAvatar?.src && <AvatarImage src={userAvatar.src} />}
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
              {userAvatar?.fallback ?? "U"}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-8 h-8 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

/* ── Agent bubble — matches EnhancedMessageBubble exactly ────────────────── */

function RoomAgentBubble({
  agentName,
  runtime,
  content,
  agent,
  showAvatar,
  isStreaming = false,
}: {
  agentName: string;
  runtime: string;
  content: string;
  agent?: EnsembleAgentView;
  showAvatar: boolean;
  isStreaming?: boolean;
}) {
  const avatarUrl = agent ? resolveAvatarUrl(agent.avatarData) : undefined;
  const avatarText = agent
    ? (resolveAvatarText(agent.avatarData) ?? agent.emoji)
    : (agentName || "?")[0]?.toUpperCase();

  return (
    <div className="flex gap-3 group justify-start">
      <div className="w-8 h-8 flex-shrink-0">
        {showAvatar ? (
          <Avatar className="w-8 h-8">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {avatarText}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-8 h-8 flex-shrink-0" />
        )}
      </div>

      <div className="relative flex flex-col max-w-full min-w-0 justify-start items-start">
        {showAvatar && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-foreground">{agentName || "Agent"}</span>
            {runtime && <RuntimeBadge runtime={runtime} />}
          </div>
        )}

        <div
          className="py-1.5 px-3 relative w-full max-w-full overflow-hidden transition-all duration-200 select-text font-normal text-sm border border-border/50"
          style={{
            borderTopRightRadius: "10px",
            borderBottomRightRadius: "10px",
            borderTopLeftRadius: "0px",
            borderBottomLeftRadius: "10px",
          }}
        >
          {isStreaming && !content ? (
            <div className="flex items-center">
              <AnimatedThinkingText />
            </div>
          ) : (
            <>
              <MemoizedReactMarkdown
                components={memoizedMarkdownComponents.assistant}
                remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
                rehypePlugins={rehypePlugins}
              >
                {content || ""}
              </MemoizedReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 bg-foreground/30 rounded-sm ml-0.5 animate-pulse align-middle" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
