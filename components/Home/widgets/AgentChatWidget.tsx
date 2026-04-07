"use client";

import React, { memo, useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Save,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useFocusMode } from "./hooks/useFocusMode";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  isAvatarText,
} from "$/hooks/useAgentIdentity";
import {
  InfoTab,
  FileEditorTab,
  type FooterSaveState,
} from "$/components/Tool/Agents/AgentDetailDialog";
import { DeleteAgentDialog } from "$/components/Tool/Agents/DeleteAgentDialog";
import { PanelChatView, type PanelChatViewHandle } from "./AgentChatPanel";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import { OPEN_AGENT_CHAT_EVENT } from "./StatusWidget";
import { OPEN_AGENT_PANEL_EVENT } from "./AgentChatPanel";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";
import AgentStatsTab from "./AgentStatsTab";
import { AnalysisTab } from "./AnalysisTab";

/* ── Tab definitions ──────────────────────────────────────── */

const TAB_FILES = [
  { key: "SOUL", label: "Soul", desc: "Personality & behavior" },
  { key: "USER", label: "User", desc: "Context about the human" },
  { key: "AGENTS", label: "Agent", desc: "Team awareness" },
  { key: "TOOLS", label: "Tools", desc: "Tools & MCP servers" },
  { key: "HEARTBEAT", label: "Heartbeat", desc: "Periodic tasks & health checks" },
] as const;

type WidgetTab = "CHAT" | "INFO" | "STATS" | "ANALYSIS" | (typeof TAB_FILES)[number]["key"];

/* ── Widget content ────────────────────────────────────────── */

const AgentChatWidgetContent = memo((props: CustomProps) => {
  const { widget, isEditMode, isMaximized, onMaximize, onConfigChange } = props;
  const { isFocusModeActive } = useFocusMode();
  const { agents } = useOpenClawContext();

  // Persisted config
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;

  // Local state
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(configAgentId);
  const [backendTab, setBackendTab] = useState<BackendTab>("openclaw");
  const [activeTab, setActiveTab] = useState<WidgetTab>("CHAT");
  const [footerState, setFooterState] = useState<FooterSaveState>({
    isDirty: false, saving: false, saved: false, save: null,
  });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "deleted">("idle");
  const chatRef = useRef<PanelChatViewHandle>(null);

  // Sync config on late hydration
  useEffect(() => {
    if (configAgentId && !selectedAgentId) setSelectedAgentId(configAgentId);
  }, [configAgentId, selectedAgentId]);

  // Resolve agent
  const currentAgentId = selectedAgentId || configAgentId || agents[0]?.id || "main";
  const currentAgent = agents.find((a) => a.id === currentAgentId) || {
    id: currentAgentId,
    name: currentAgentId === "main" ? "General Assistant" : currentAgentId,
  };

  // Agent identity
  const identity = useAgentIdentity(currentAgentId);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const displayName = identity?.name || currentAgent.name;
  const isFirstAgent = agents[0] != null && currentAgentId === agents[0].id;

  // Listen for agent-click events from StatusWidget
  useEffect(() => {
    const handler = (e: Event) => {
      const agentId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (!agentId) return;
      setSelectedAgentId(agentId);
      setActiveTab("CHAT");
    };
    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handler);
    window.addEventListener(OPEN_AGENT_PANEL_EVENT, handler);
    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handler);
      window.removeEventListener(OPEN_AGENT_PANEL_EVENT, handler);
    };
  }, []);

  // Reset footer state when switching tabs
  useEffect(() => {
    setFooterState({ isDirty: false, saving: false, saved: false, save: null });
  }, [activeTab, currentAgentId]);

  // Persist config
  const onConfigChangeRef = useRef(onConfigChange);
  onConfigChangeRef.current = onConfigChange;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistMountedRef = useRef(false);

  useEffect(() => {
    if (!persistMountedRef.current) { persistMountedRef.current = true; return; }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      onConfigChangeRef.current?.({ agentId: currentAgentId });
      persistTimerRef.current = null;
    }, 500);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        onConfigChangeRef.current?.({ agentId: currentAgentId });
      }
    };
  }, [currentAgentId]);

  const isEditorTab = activeTab !== "CHAT" && activeTab !== "STATS" && activeTab !== "ANALYSIS";
  const showChatActions = activeTab === "CHAT";
  const showSaveButton = isEditorTab;

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
          isFocusModeActive && "border-transparent grayscale-[30%]",
          deleteState !== "idle" && "border-destructive/30"
        )}
      >
        {/* ── Header: avatar + tabs + actions ── */}
        <div className="shrink-0 border-b border-border/50">
          {/* Top row: agent info + maximize */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {isEditMode && (
                <div className="cursor-move h-7 w-7 flex items-center justify-center shrink-0">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
              <Avatar className="h-8 w-8 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {avatarText || identity?.emoji || "🤖"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold truncate">{displayName}</h3>
                  {deleteState === "deleting" && (
                    <span className="flex items-center gap-1 text-[10px] text-destructive shrink-0">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Deleting…
                    </span>
                  )}
                  {deleteState === "deleted" && (
                    <span className="text-[10px] text-destructive shrink-0">Deleted</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{currentAgentId}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Chat actions — only on Chat tab */}
              {showChatActions && (
                <>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => chatRef.current?.reload()} title="Reload chat">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => chatRef.current?.newChat()} title="New chat">
                    <Plus className="w-3 h-3" />
                  </Button>
                  <SessionHistoryDropdown
                    sessions={chatRef.current?.sessions || []}
                    isLoading={chatRef.current?.sessionsLoading || false}
                    error={chatRef.current?.sessionsError || null}
                    currentSessionKey={chatRef.current?.selectedSessionKey}
                    onLoadSession={(key) => chatRef.current?.onSessionChange(key)}
                    onNewChat={() => chatRef.current?.newChat()}
                    onFetchSessions={() => chatRef.current?.fetchSessions()}
                  />
                </>
              )}
              {/* Save button — only on editor tabs when dirty */}
              {showSaveButton && (
                <div className="flex items-center gap-1.5">
                  {footerState.saved && (
                    <span className="text-[10px] text-emerald-500">Saved</span>
                  )}
                  {footerState.isDirty && !footerState.saved && (
                    <span className="text-[10px] text-amber-500">Unsaved</span>
                  )}
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="h-6 w-6"
                    disabled={footerState.saving || !footerState.isDirty}
                    onClick={() => footerState.save?.()}
                    title="Save"
                  >
                    {footerState.saving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              )}
              <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" title="More options">
                    <MoreHorizontal className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 z-[60]">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2 text-xs"
                    disabled={isFirstAgent}
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreMenuOpen(false);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete agent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Tab row */}
          <div className="flex items-center gap-0.5 px-3 pb-0 -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab("CHAT")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "CHAT"
                  ? "border-border text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("INFO")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "INFO"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Info
            </button>
            <button
              onClick={() => setActiveTab("STATS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "STATS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Stats
            </button>
            <button
              onClick={() => setActiveTab("ANALYSIS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "ANALYSIS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Analysis
            </button>
            {TAB_FILES.map((tf) => (
              <button
                key={tf.key}
                onClick={() => setActiveTab(tf.key)}
                className={cn(
                  "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                  activeTab === tf.key
                    ? "border-primary text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "CHAT" && (
            <PanelChatView
              ref={chatRef}
              agentId={currentAgentId}
              backendTab={backendTab}
              onBackendTabChange={setBackendTab}
              showSubHeader={false}
            />
          )}

          {activeTab === "INFO" && (
            <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-4 py-4">
              <InfoTab
                agentId={currentAgentId}
                identity={identity}
                onStateChange={setFooterState}
              />
            </div>
          )}

          {activeTab === "STATS" && (
            <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-3">
              <AgentStatsTab agentId={currentAgentId} />
            </div>
          )}

          {activeTab === "ANALYSIS" && (
            <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2">
              <AnalysisTab defaultAgentId={currentAgentId} />
            </div>
          )}

          {TAB_FILES.map((tf) =>
            activeTab === tf.key ? (
              <div
                key={tf.key}
                className="flex-1 min-h-0 flex flex-col overflow-y-auto customScrollbar2 px-4 py-4"
              >
                <p className="text-xs text-muted-foreground mb-3">{tf.desc}</p>
                <FileEditorTab
                  agentId={currentAgentId}
                  fileKey={tf.key}
                  onStateChange={setFooterState}
                />
              </div>
            ) : null
          )}
        </div>
      </Card>

      <DeleteAgentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        agentId={currentAgentId}
        agentDisplayName={displayName}
        isFirstAgent={isFirstAgent}
        onDeleteStart={() => setDeleteState("deleting")}
        onSuccess={() => {
          setDeleteState("deleted");
          // Brief pause so user sees "Deleted" status before switching agents
          setTimeout(() => {
            setDeleteState("idle");
            setSelectedAgentId(agents.find((a) => a.id !== currentAgentId)?.id);
          }, 1200);
        }}
      />
    </motion.div>
  );
});

AgentChatWidgetContent.displayName = "AgentChatWidgetContent";

export const AgentChatCustomHeader = () => null;

const AgentChatWidget = memo((props: CustomProps) => {
  return <AgentChatWidgetContent {...props} />;
});

AgentChatWidget.displayName = "AgentChatWidget";

export default AgentChatWidget;
