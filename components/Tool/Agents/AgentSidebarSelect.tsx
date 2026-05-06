"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAgents } from "./provider/agentsProvider";
import { useAgentIdentities, resolveAvatarUrl } from "$/hooks/useAgentIdentity";

function AgentIcon({ agentId, agentName, identities }: { agentId: string; agentName: string; identities: Map<string, { avatar?: string; emoji?: string; name?: string }> }) {
  const identity = identities.get(agentId);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const displayName = identity?.name || agentName || agentId;
  const fallbackInitials = (displayName || agentId || "AI").slice(0, 2).toUpperCase();

  if (avatarUrl) {
    return (
      <Avatar className="h-4 w-4 shrink-0">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className="text-[8px] bg-primary/10">
          {identity?.emoji || fallbackInitials}
        </AvatarFallback>
      </Avatar>
    );
  }

  if (identity?.emoji) {
    return <span className="text-sm shrink-0">{identity.emoji}</span>;
  }

  return <span className="text-[10px] text-muted-foreground shrink-0">{fallbackInitials}</span>;
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
          {agents.map((agent) => {
            const isHiring = agent.status === "hiring";
            return (
              <SelectItem key={agent.id} value={agent.id} className="text-xs" disabled={isHiring}>
                <span className="flex items-center gap-2">
                  {isHiring
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                    : <AgentIcon agentId={agent.id} agentName={agent.name} identities={identities} />
                  }
                  <span className={isHiring ? "truncate text-muted-foreground" : "truncate"}>
                    {identities.get(agent.id)?.name || agent.name}
                  </span>
                  {isHiring
                    ? <span className="text-[10px] text-amber-500/80 shrink-0 border border-amber-500/30 rounded px-1 py-px leading-none">Hiring…</span>
                    : <span className="text-muted-foreground/60 text-[10px] shrink-0">{agent.id}</span>
                  }
                </span>
              </SelectItem>
            );
          })}
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
