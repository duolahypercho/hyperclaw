"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronsUpDown, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AgentMonogram } from "./agent-monogram";
import type { ProjectRosterAgent } from "./use-agent-roster";

/**
 * Shared visual parts for the project drawer family (Create + Edit).
 *
 * These were originally inlined in `create-project-drawer.tsx`. Lifting them
 * here lets the EditProjectDrawer match the create surface pixel-for-pixel
 * without copy-pasting the picker UI, and keeps any future drawer (clone,
 * duplicate, archive flow) one import away from looking native.
 *
 * Behaviour and class lists mirror the original create-drawer inlines on
 * purpose — the goal of this extraction is reuse, not redesign.
 */

export const EMOJI_OPTIONS = [
  "📁",
  "📦",
  "🚀",
  "🔭",
  "🎯",
  "🧪",
  "🛰️",
  "🛠️",
  "🌱",
  "📈",
  "📚",
  "🎬",
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-9 w-11 rounded-md border border-[var(--line)] bg-[var(--paper-2)] text-lg",
            "flex items-center justify-center transition-colors hover:bg-[var(--paper-3)]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)]"
          )}
          aria-label="Choose project icon"
        >
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="grid w-auto grid-cols-6 gap-1 border-[var(--line)] bg-[var(--paper)] p-2"
      >
        {EMOJI_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
            className={cn(
              "h-8 w-8 rounded text-lg transition-colors hover:bg-[var(--paper-3)]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)]",
              value === option && "bg-[var(--paper-2)]"
            )}
            aria-label={`Use ${option} as project icon`}
          >
            {option}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function LeadAgentSelect({
  agents,
  value,
  onChange,
}: {
  agents: ProjectRosterAgent[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger
        className="h-8 border-[var(--line)] bg-[var(--paper-2)] px-2 text-[12px] shadow-none"
        aria-label="Project lead"
      >
        <SelectValue placeholder="Select a lead" />
      </SelectTrigger>
      <SelectContent className="max-h-72 border-[var(--line)] bg-[var(--paper)]">
        {agents.map((agent) => (
          <SelectItem
            key={agent.id}
            value={agent.id}
            className="py-1.5 pl-7 text-[12px] data-[state=checked]:bg-[var(--paper-2)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <RosterAvatar agent={agent} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--ink)]">
                  {agent.name}
                </span>
                <span className="block truncate text-[10.5px] text-[var(--ink-4)]">
                  {agent.subtitle}
                </span>
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AgentMultiSelect({
  agents,
  leadAgentId,
  selectedIds,
  selectedAgents,
  onToggle,
}: {
  agents: ProjectRosterAgent[];
  leadAgentId: string | null;
  selectedIds: Set<string>;
  selectedAgents: ProjectRosterAgent[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedCount = selectedAgents.length;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={
              selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? "agent" : "agents"} selected`
                : "Select project agents"
            }
            className={cn(
              "flex h-8 w-full items-center justify-between rounded-md border border-[var(--line)]",
              "bg-[var(--paper-2)] px-2 text-left text-[12px] text-[var(--ink)] transition-colors",
              "hover:bg-[var(--paper-3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)]"
            )}
          >
            <span className="truncate">
              {selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? "agent" : "agents"} in crew`
                : "Select agents"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--ink-4)]" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] border-[var(--line)] bg-[var(--paper)] p-1"
        >
          <Command className="bg-transparent">
            <CommandInput placeholder="Search agents..." className="text-[12px]" />
            <CommandList className="max-h-64">
              <CommandEmpty className="py-5 text-[12px] text-[var(--ink-4)]">
                No agents found.
              </CommandEmpty>
              <CommandGroup>
                {agents.map((agent) => {
                  const isLead = agent.id === leadAgentId;
                  const selected = isLead || selectedIds.has(agent.id);

                  return (
                    <CommandItem
                      key={agent.id}
                      value={`${agent.name} ${agent.subtitle}`}
                      disabled={isLead}
                      aria-checked={selected}
                      onSelect={() => {
                        if (!isLead) onToggle(agent.id);
                      }}
                      className="min-h-9 rounded-md px-2 py-1.5 text-[12px] data-selected:bg-[var(--paper-2)]"
                    >
                      <Checkbox
                        checked={selected}
                        tabIndex={-1}
                        aria-hidden
                        className="h-3.5 w-3.5 rounded border-[var(--line)] data-[state=checked]:bg-[var(--ink)] data-[state=checked]:text-[var(--paper)]"
                      />
                      <RosterAvatar agent={agent} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-[var(--ink)]">
                            {agent.name}
                          </span>
                          {isLead ? (
                            <span className="rounded-full border border-[var(--line)] px-1.5 py-px text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                              Lead
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[10.5px] text-[var(--ink-4)]">
                          {agent.subtitle}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedAgents.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedAgents.map((agent) => {
            const isLead = agent.id === leadAgentId;
            return (
              <SelectedAgentChip
                key={agent.id}
                agent={agent}
                isLead={isLead}
                onRemove={() => onToggle(agent.id)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function SelectedAgentChip({
  agent,
  isLead,
  onRemove,
}: {
  agent: ProjectRosterAgent;
  isLead: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper-2)] pl-1 pr-2 text-[11px] text-[var(--ink)]">
      <RosterAvatar agent={agent} size="xs" />
      <span className="max-w-[132px] truncate">{agent.name}</span>
      {isLead ? (
        <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          lead
        </span>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full text-[var(--ink-4)] transition-colors hover:text-[var(--ink)]"
          aria-label={`Remove ${agent.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function RosterAvatar({
  agent,
  size = "md",
}: {
  agent: ProjectRosterAgent;
  size?: "xs" | "sm" | "md";
}) {
  return (
    <AgentMonogram
      agentId={agent.id}
      name={agent.name}
      initials={agent.emoji ?? agent.initials}
      runtime={agent.runtime}
      status={agent.status}
      avatarData={agent.avatarData}
      size={size}
    />
  );
}

export function EmptyAgentRoster({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
      <UserPlus className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-[12.5px] text-foreground">
        You don&apos;t have any agents yet.
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Hire your first agent to lead this project.
      </p>
      <Button asChild size="sm" className="mt-3">
        <Link href="/Tool/Agent" onClick={onClose}>
          Add an agent
        </Link>
      </Button>
    </div>
  );
}
