"use client";

import React, { useState, useMemo } from "react";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { GripVertical, Plus } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check, RefreshCw, Download } from "lucide-react";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import { useAgentIdentity, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";
import { AgentDetailDialog } from "$/components/Tool/Agents/AgentDetailDialog";
import { ClaudeCodeIcon, CodexIcon, HermesIcon as HermesRuntimeIcon } from "$/components/Onboarding/RuntimeIcons";
export type BackendTab = "openclaw" | "claude-code" | "codex" | "hermes";

export interface GatewayChatHeaderProps extends CustomProps {
  onAgentChange?: (agentId: string) => void;
  onSessionChange?: (sessionKey: string) => void;
  onNewChat?: () => void;
  onReloadChat?: () => void;
  onExport?: () => void;
  onFetchSessions?: () => void;
  currentAgentId?: string;
  selectedSessionKey?: string;
  sessions?: Array<{ key: string; label?: string; updatedAt?: number }>;
  sessionsLoading?: boolean;
  sessionsError?: string | null;
  isConnected?: boolean;
  activeTab?: BackendTab;
  onTabChange?: (tab: BackendTab) => void;
  currentModel?: string;
  onModelChange?: (model: string) => void;
}

export const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  "claude-code": [
    { id: "", label: "Default" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "sonnet", label: "Sonnet (latest)" },
    { id: "opus", label: "Opus (latest)" },
    { id: "haiku", label: "Haiku (latest)" },
  ],
  codex: [
    { id: "", label: "Default" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
    { id: "gpt-5.3-codex", label: "GPT-5.3-Codex" },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5.1-codex-max", label: "GPT-5.1-Codex-Max" },
    { id: "gpt-5.1-codex-mini", label: "GPT-5.1-Codex-Mini" },
  ],
};

const TABS: { id: BackendTab; label: string }[] = [
  { id: "openclaw", label: "OpenClaw" },
  { id: "claude-code", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "hermes", label: "Hermes" },
];

export const GatewayChatCustomHeader: React.FC<GatewayChatHeaderProps> = ({
  widget,
  isEditMode,
  onAgentChange,
  onSessionChange,
  onNewChat,
  onReloadChat,
  onExport,
  onFetchSessions,
  currentAgentId,
  selectedSessionKey,
  sessions = [],
  sessionsLoading = false,
  sessionsError = null,
  isConnected = false,
  activeTab = "openclaw",
  onTabChange,
  currentModel = "",
  onModelChange,
}) => {
  // Get OpenClaw agents and gateway health from provider
  const { agents, gatewayHealthy } = useHyperclawContext();

  // Filter agents by active tab
  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      const backend = (a as any).backend || "openclaw";
      return backend === activeTab;
    });
  }, [agents, activeTab]);

  // Get agent from config or use first available
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const selectedAgent = currentAgentId
    ? filteredAgents.find(a => a.id === currentAgentId) || agents.find(a => a.id === currentAgentId)
    : configAgentId
      ? filteredAgents.find(a => a.id === configAgentId)
      : filteredAgents[0];

  const { loading: agentsLoading, fetchAgents } = useHyperclawContext();
  const agent = selectedAgent || { id: "main", name: "General Assistant", status: "active" };
  const headerIdentity = useAgentIdentity(currentAgentId || agent.id);
  const headerAvatarUrl = resolveAvatarUrl(headerIdentity?.avatar);
  const headerAvatarText = isAvatarText(headerIdentity?.avatar) ? headerIdentity!.avatar! : undefined;

  // Agent detail dialog state
  const [agentDetailOpen, setAgentDetailOpen] = useState(false);

  // Whether we're on a non-OpenClaw provider tab
  const isProviderTab = activeTab === "claude-code" || activeTab === "codex" || activeTab === "hermes";

  const providerMeta: Record<string, { name: string; Icon: React.FC<{ className?: string }> }> = {
    "claude-code": { name: "Claude Code", Icon: ClaudeCodeIcon },
    codex: { name: "Codex", Icon: CodexIcon },
    hermes: { name: "Hermes Agent", Icon: HermesRuntimeIcon },
  };

  return (
    <CardHeader className="pb-0 border-b border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEditMode && (
            <div className="cursor-move h-7 w-7 flex items-center justify-center flex-shrink-0">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}

          {isProviderTab ? (
            /* Provider icon + name for Claude / Codex / Hermes */
            <>
              <div className="relative">
                <Avatar className="w-10 h-10">
                  {activeTab === "hermes" ? (
                    <>
                      <AvatarImage src="/assets/hermes-agent.png" alt="Hermes Agent" />
                      <AvatarFallback className="bg-primary/10">
                        <HermesRuntimeIcon className="w-6 h-6" />
                      </AvatarFallback>
                    </>
                  ) : (
                    <AvatarFallback className="bg-primary/10">
                      {React.createElement(providerMeta[activeTab]!.Icon, { className: "w-6 h-6" })}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background shadow-sm">
                  <span className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all duration-300",
                    isConnected
                      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                      : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  )} />
                </span>
              </div>
              <div className="flex flex-col">
                <CardTitle className="text-sm">{providerMeta[activeTab]!.name}</CardTitle>
                {PROVIDER_MODELS[activeTab] && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-opacity">
                        {PROVIDER_MODELS[activeTab]!.find(m => m.id === currentModel)?.label || "Default"}
                        <ChevronDown className="w-2.5 h-2.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-36">
                      {PROVIDER_MODELS[activeTab]!.map((m) => (
                        <DropdownMenuItem
                          key={m.id}
                          onClick={() => onModelChange?.(m.id)}
                          className="flex items-center justify-between cursor-pointer text-xs"
                        >
                          {m.label}
                          {m.id === currentModel && <Check className="w-3 h-3" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </>
          ) : (
            /* OpenClaw agent avatar + name with dropdown */
            <>
              <button
                type="button"
                className="relative group"
                onClick={() => setAgentDetailOpen(true)}
                title="View agent details"
              >
                <Avatar key={headerAvatarUrl || "no-avatar"} className="w-10 h-10 transition-opacity group-hover:opacity-80">
                  {headerAvatarUrl ? (
                    <AvatarImage src={headerAvatarUrl} alt={headerIdentity?.name || agent.name} />
                  ) : null}
                  <AvatarFallback className={cn("text-primary", "bg-primary/10")}>
                    <span className="text-xl">{headerAvatarText || headerIdentity?.emoji || "🤖"}</span>
                  </AvatarFallback>
                </Avatar>
                {/* Connection status dot */}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background shadow-sm">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full transition-all duration-300",
                      gatewayHealthy === true
                          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                          : gatewayHealthy === false
                            ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                            : "bg-amber-500/80 animate-pulse"
                    )}
                  />
                </span>
              </button>
              <div className="flex flex-col">
                {agentsLoading && !headerIdentity?.name ? (
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                ) : filteredAgents.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left">
                        <CardTitle className="text-sm">{headerIdentity?.name || agent.name}</CardTitle>
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {filteredAgents.map((a) => {
                        return (
                          <DropdownMenuItem
                            key={a.id}
                            onClick={() => onAgentChange?.(a.id)}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              {a.name}
                            </span>
                            {a.id === (currentAgentId || configAgentId || filteredAgents[0]?.id) && (
                              <Check className="w-3 h-3" />
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <CardTitle className="text-sm">{headerIdentity?.name || agent.name}</CardTitle>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onExport} className="h-7 w-7 p-0" title="Export chat">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onReloadChat} className="h-7 w-7 p-0" title="Reload chat">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onNewChat} className="h-7 w-7 p-0" title="Clear chat">
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <SessionHistoryDropdown
            sessions={sessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            currentSessionKey={selectedSessionKey}
            onLoadSession={onSessionChange || (() => {})}
            onNewChat={onNewChat || (() => {})}
            onFetchSessions={onFetchSessions || (() => {})}
            newChatLabel="Clear Session"
          />
        </div>
      </div>

      {/* Backend tabs */}
      <div className="flex items-center gap-0.5 mt-3 -mb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange?.(tab.id)}
            className={cn(
              "px-2 py-1 text-[10px] font-medium rounded-t-md transition-all duration-200 border-b-2",
              activeTab === tab.id
                ? "border-primary text-foreground bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Agent detail dialog */}
      <AgentDetailDialog
        open={agentDetailOpen}
        onOpenChange={setAgentDetailOpen}
        agentId={currentAgentId || agent.id}
        agentName={agent.name}
        agentRuntime={(agent as { runtime?: string }).runtime}
        onDeleted={() => fetchAgents()}
      />
    </CardHeader>
  );
};
