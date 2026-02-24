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
import { useAgents } from "./provider/agentsProvider";

export function AgentSidebarSelect() {
  const {
    agentOptions,
    selectedAgentId,
    setSelectedAgentId,
    loading,
  } = useAgents();

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
          <SelectValue placeholder="Select agent…" />
        </SelectTrigger>
        <SelectContent>
          {agentOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.id} className="text-xs">
              <span className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                {opt.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
