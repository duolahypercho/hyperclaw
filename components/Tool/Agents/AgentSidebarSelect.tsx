"use client";

import React from "react";
import { Bot } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAgents } from "./provider/agentsProvider";
import { useAgentIdentities, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";

function AgentIcon({ agentId, identities }: { agentId: string; identities: Map<string, { avatar?: string; emoji?: string; name?: string }> }) {
  const identity = identities.get(agentId);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;

  if (avatarUrl) {
    return (
      <Avatar className="h-4 w-4 shrink-0">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className="text-[8px] bg-primary/10">
          {avatarText || identity?.emoji || <Bot className="h-2.5 w-2.5" />}
        </AvatarFallback>
      </Avatar>
    );
  }

  if (avatarText || identity?.emoji) {
    return <span className="text-sm shrink-0">{avatarText || identity!.emoji}</span>;
  }

  return <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

export function AgentSidebarSelect() {
  const {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    loading,
    filteredAgentFiles,
  } = useAgents();

  const agentIds = React.useMemo(() => agents.map((a) => a.id), [agents]);
  const identities = useAgentIdentities(agentIds);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Agent
      </label>
      <Select
        value={selectedAgentId}
        onValueChange={setSelectedAgentId}
        disabled={loading}
      >
        <SelectTrigger className="w-full h-9 text-xs">
          <SelectValue placeholder="Select agent…">
            {selectedAgentId
              ? (() => {
                  const agent = agents.find((a) => a.id === selectedAgentId);
                  const identity = identities.get(selectedAgentId);
                  return identity?.name || agent?.name || selectedAgentId;
                })()
              : "Select agent…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id} className="text-xs">
              <span className="flex items-center gap-2">
                <AgentIcon agentId={agent.id} identities={identities} />
                <span className="truncate">{identities.get(agent.id)?.name || agent.name}</span>
                <span className="text-muted-foreground/60 text-[10px] shrink-0">{agent.id}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedAgentId && (
        <p className="text-[10px] text-muted-foreground/60">
          {filteredAgentFiles.length} file{filteredAgentFiles.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
