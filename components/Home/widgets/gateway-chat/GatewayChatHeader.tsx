"use client";

import React, { useState } from "react";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { GripVertical, Plus } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
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
}

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
}) => {
  // Get OpenClaw agents from provider
  const { agents } = useOpenClawContext();

  // Get agent from config or use first available
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const selectedAgent = currentAgentId
    ? agents.find(a => a.id === currentAgentId)
    : configAgentId
      ? agents.find(a => a.id === configAgentId)
      : agents[0];

  const agent = selectedAgent || { id: "main", name: "General Assistant", status: "active" };
  // Use currentAgentId directly for identity lookup — agents array may not be loaded yet,
  // which would cause agent.id to fall back to "main" and fetch the wrong identity.
  const headerIdentity = useAgentIdentity(currentAgentId || agent.id);
  const headerAvatarUrl = resolveAvatarUrl(headerIdentity?.avatar);
  const headerAvatarText = isAvatarText(headerIdentity?.avatar) ? headerIdentity!.avatar! : undefined;

  // Agent detail dialog state
  const [agentDetailOpen, setAgentDetailOpen] = useState(false);

  return (
    <CardHeader className="pb-3 border-b border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEditMode && (
            <div className="cursor-move h-7 w-7 flex items-center justify-center flex-shrink-0">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}
          <button
            type="button"
            className="relative group"
            onClick={() => setAgentDetailOpen(true)}
            title="View agent details"
          >
            <Avatar className="w-10 h-10 transition-opacity group-hover:opacity-80">
              {headerAvatarUrl ? (
                <AvatarImage src={headerAvatarUrl} alt={headerIdentity?.name || agent.name} className="object-contain" />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                <span className="text-xl">{headerAvatarText || headerIdentity?.emoji || "🤖"}</span>
              </AvatarFallback>
            </Avatar>
            {/* Connection status dot — matches navbar avatar style */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background shadow-sm">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-all duration-300",
                  isConnected
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                )}
              />
            </span>
          </button>
          <div className="flex flex-col">
            {agents.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left">
                    <CardTitle className="text-sm">{agent.name}</CardTitle>
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {agents.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onClick={() => onAgentChange?.(a.id)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span>{a.name}</span>
                      {a.id === (currentAgentId || configAgentId || agents[0]?.id) && (
                        <Check className="w-3 h-3" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <CardTitle className="text-sm">{agent.name}</CardTitle>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Export chat */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            className="h-7 w-7 p-0"
            title="Export chat"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>

          {/* Reload chat */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onReloadChat}
            className="h-7 w-7 p-0"
            title="Reload chat"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>

          {/* New chat */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewChat}
            className="h-7 w-7 p-0"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>

          {/* Session History Dropdown */}
          <SessionHistoryDropdown
            sessions={sessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            currentSessionKey={selectedSessionKey}
            onLoadSession={onSessionChange || (() => {})}
            onNewChat={onNewChat || (() => {})}
            onFetchSessions={onFetchSessions || (() => {})}
          />
        </div>
      </div>

      {/* Agent detail dialog */}
      <AgentDetailDialog
        open={agentDetailOpen}
        onOpenChange={setAgentDetailOpen}
        agentId={currentAgentId || agent.id}
        agentName={agent.name}
      />
    </CardHeader>
  );
};
