"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Crown, UserMinus, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { AgentGlyph } from "$/components/ensemble";
import type { HyperclawAgent } from "$/Providers/HyperclawProv";
import { resolveProjectAgentDisplay } from "./project-agent-display";

interface WorkflowOwnerPickerProps {
  /** Full agent roster the user can pick from. */
  agents: HyperclawAgent[];
  /** Currently assigned owner id, or null/undefined when unassigned. */
  selectedAgentId?: string | null;
  /** Persist a new owner. `null` clears the assignment. */
  onAssign: (agentId: string | null) => void | Promise<void>;
  /** Disable the picker (e.g. while no project is selected). */
  disabled?: boolean;
  /** Show a spinner on the trigger while a save round-trip is in flight. */
  saving?: boolean;
  /** Optional className for the trigger chip wrapper. */
  className?: string;
}

/**
 * Inline owner / lead picker rendered as a chip in the workflow detail
 * header. Clicking opens a searchable Popover sourced from the live agent
 * roster; selecting an agent persists through the supplied `onAssign`
 * callback. Mirrors the existing `leadAgent` chip visually so the
 * Mission Control header stays calm when nothing is set.
 */
export function WorkflowOwnerPicker({
  agents,
  selectedAgentId,
  onAssign,
  disabled,
  saving,
  className,
}: WorkflowOwnerPickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(
    () => (selectedAgentId ? agents.find((a) => a.id === selectedAgentId) ?? null : null),
    [agents, selectedAgentId],
  );

  const handleSelect = React.useCallback(
    async (agentId: string | null) => {
      setOpen(false);
      if ((agentId ?? null) === (selectedAgentId ?? null)) return;
      await onAssign(agentId);
    },
    [onAssign, selectedAgentId],
  );

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          aria-label={selected ? `Workflow owner: ${selected.name}. Click to change.` : "Assign workflow owner"}
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.02 } : undefined}
          whileTap={!disabled ? { scale: 0.98 } : undefined}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 text-[11px] font-medium",
            "border bg-card text-muted-foreground transition-colors",
            "hover:border-primary/40 hover:text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "disabled:cursor-not-allowed disabled:opacity-60",
            selected && "text-foreground",
            className,
          )}
          style={{ borderColor: "var(--line)" }}
        >
          {selected ? (
            <AgentGlyph
              agent={resolveProjectAgentDisplay(selected)}
              size={18}
              className="!rounded-full"
            />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <Crown size={10} />
            </span>
          )}
          <span className="truncate max-w-[140px]">
            {selected?.name ?? "Assign owner"}
          </span>
          {saving ? (
            <Loader2 size={10} className="animate-spin opacity-70" aria-hidden="true" />
          ) : (
            <ChevronsUpDown
              size={10}
              className="opacity-50 transition-opacity group-hover:opacity-90"
              aria-hidden="true"
            />
          )}
        </motion.button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[260px] p-0 border-border bg-popover"
      >
        <Command>
          <CommandInput placeholder="Search agents…" />
          <CommandList>
            <CommandEmpty>No agents match.</CommandEmpty>
            {selectedAgentId && (
              <>
                <CommandGroup heading="Current">
                  <CommandItem
                    value="__unassign__"
                    onSelect={() => void handleSelect(null)}
                    className="gap-2"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserMinus size={12} />
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[12.5px]">Unassign owner</span>
                      <span className="text-[10.5px] text-muted-foreground">
                        Workflow runs without a designated lead.
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading={agents.length > 0 ? "Agents" : undefined}>
              {agents.length === 0 ? (
                <div className="px-2 py-3 text-[11.5px] text-muted-foreground">
                  No agents available yet. Hire or sync agents, then return.
                </div>
              ) : (
                agents.map((agent) => {
                  const active = agent.id === selectedAgentId;
                  return (
                    <CommandItem
                      key={agent.id}
                      value={`${agent.name} ${agent.id} ${agent.runtime ?? ""}`}
                      onSelect={() => void handleSelect(agent.id)}
                      data-checked={active ? "true" : undefined}
                      className="gap-2"
                    >
                      <AgentGlyph
                        agent={resolveProjectAgentDisplay(agent)}
                        size={24}
                        className="!rounded-full"
                      />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[12.5px] text-foreground">
                          {agent.name}
                        </span>
                        <span className="truncate text-[10.5px] text-muted-foreground">
                          {[agent.role, agent.runtime].filter(Boolean).join(" · ") || agent.id}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
