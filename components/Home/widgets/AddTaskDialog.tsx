"use client";

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Bot, Loader2 } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";

interface TeamAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
}

interface ChannelOption {
  id: string;
  name: string;
  type: string;
  kind: string;
  parent?: string | null;
  topic?: string | null;
}

function channelFileValue(ch: ChannelOption): string {
  return `${ch.type}:${ch.id}`;
}

function isChannelFileValue(value: string): boolean {
  return value.includes(":") && value !== "last";
}

export interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Pre-loaded agents from the parent — avoids redundant bridge call */
  preloadedAgents?: TeamAgent[];
}

export function AddTaskDialog({
  open,
  onOpenChange,
  onSuccess,
  preloadedAgents,
}: AddTaskDialogProps) {
  const { handleAddTask } = useTodoList();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedAgent, setAssignedAgent] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [channel, setChannel] = useState<string>("last");
  const [to, setTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<TeamAgent[]>(preloadedAgents ?? []);
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Defer rendering Select items until first open
  const [agentSelectReady, setAgentSelectReady] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const MAX_DESC_PX = 320;

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.overflow = "hidden";
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_DESC_PX);
    el.style.height = `${next}px`;
    el.style.overflow = el.scrollHeight > MAX_DESC_PX ? "auto" : "hidden";
  }, [description]);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setAssignedAgent("");
    setAnnounce(false);
    setChannel("last");
    setTo("");
    setError(null);
  }, []);

  // Only fetch data that wasn't preloaded
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const needAgents = !preloadedAgents?.length;
    const fetches: Promise<unknown>[] = [
      needAgents ? bridgeInvoke("get-team", {}).catch(() => []) : Promise.resolve(null),
      bridgeInvoke("list-channels", {}).catch(() => ({ data: [] })),
    ];

    if (needAgents) setDataLoading(true);

    Promise.all(fetches).then(([teamRes, channelsRes]) => {
      if (cancelled) return;

      if (teamRes !== null) {
        const agentList = Array.isArray(teamRes) ? (teamRes as TeamAgent[]) : [];
        setAgents(agentList);
      }

      const channelsResult = channelsRes as { success?: boolean; data?: ChannelOption[] };
      const channelList =
        channelsResult?.success && Array.isArray(channelsResult.data) ? channelsResult.data : [];
      setChannelOptions(
        channelList.filter((c) => c && c.kind === "channel") as ChannelOption[]
      );

      setDataLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, preloadedAgents]);

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }
    if (announce && !channel.trim()) {
      setError("Choose a delivery channel (or use last route).");
      return;
    }
    if (
      announce &&
      !isChannelFileValue(channel) &&
      channel !== "last" &&
      !to.trim()
    ) {
      setError(
        "Delivery target is required for this channel (e.g. channel:C123… or +1555…)."
      );
      return;
    }
    setSubmitting(true);
    try {
      const agentObj = assignedAgent
        ? agents.find((a) => a.id === assignedAgent)
        : undefined;
      const delivery = announce
        ? (() => {
            const ch = channel.trim();
            const fromFile = isChannelFileValue(ch);
            if (fromFile) {
              const [chType, chId] = ch.split(":");
              return {
                announce: true,
                channel: chType?.trim() ?? undefined,
                to: chId ? `channel:${chId.trim()}` : undefined,
              };
            }
            // "last" = use main session with previous channel — omit channel so backend doesn't require one
            if (ch === "last") {
              return { announce: true };
            }
            return {
              announce: true,
              channel: ch,
              to: to.trim() || undefined,
            };
          })()
        : undefined;
      await handleAddTask({
        title: trimmedTitle,
        description: description.trim() || undefined,
        assignedAgent: agentObj?.name ?? undefined,
        delivery,
      });
      onSuccess?.();
      handleDialogOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add task"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] gap-0 sm:rounded-xl p-0 overflow-hidden z-[101]"
        overlayClassName="z-[100]"
      >
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Add task
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Create a new task with optional description, assignee, and delivery.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto customScrollbar2">
            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-2">
              <Label htmlFor="add-task-title" className="text-xs font-medium">
                Title
              </Label>
              <Input
                id="add-task-title"
                placeholder="Task title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 text-sm bg-muted/30 border-border/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-task-desc" className="text-xs font-medium">
                Prompt description
              </Label>
              <Textarea
                ref={descRef}
                id="add-task-desc"
                placeholder="Add a description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[60px] text-sm resize-none bg-muted/30 border-border/60 transition-[height] duration-150 ease-out"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                Assigned agent
              </Label>
              <Select
                value={assignedAgent || "__none__"}
                onValueChange={(v) =>
                  setAssignedAgent(v === "__none__" ? "" : v)
                }
                onOpenChange={(o) => { if (o) setAgentSelectReady(true); }}
                disabled={dataLoading}
              >
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue
                    placeholder={
                      dataLoading ? "Loading…" : "Select agent…"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value="__none__" className="text-xs text-muted-foreground">
                    None
                  </SelectItem>
                  {agentSelectReady && agents.map((agent) => {
                    const label = agent.name || agent.id || "Unnamed";
                    return (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        className="text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {label}
                          {agent.role && (
                            <span className="text-muted-foreground">
                              ({agent.role})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Delivery</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={announce}
                    onChange={(e) => setAnnounce(e.target.checked)}
                    className="rounded border-border"
                  />
                  Announce result to a channel
                </label>
                {announce && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">
                        Channel
                      </Label>
                      <Select
                        value={channel}
                        onValueChange={(v) => {
                          setChannel(v);
                          if (isChannelFileValue(v)) setTo("");
                        }}
                        disabled={dataLoading}
                      >
                        <SelectTrigger className="h-9 min-w-0 overflow-hidden bg-muted/30 border-border/60">
                          <span className="block min-w-0 truncate text-left">
                            <SelectValue
                              placeholder={
                                dataLoading
                                  ? "Loading…"
                                  : "Choose channel…"
                              }
                            />
                          </span>
                        </SelectTrigger>
                        <SelectContent className="z-[102]">
                          <SelectItem value="last" className="text-sm">
                            Last route
                          </SelectItem>
                          {channelOptions.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="text-[10px] text-muted-foreground">
                                From HyperClaw
                              </SelectLabel>
                              {channelOptions.map((ch) => (
                                <SelectItem
                                  key={ch.id}
                                  value={channelFileValue(ch)}
                                  className="text-xs"
                                >
                                  <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                    <span className="truncate" title={ch.name}>
                                      {ch.name}
                                    </span>
                                    {ch.topic && (
                                      <span
                                        className="text-muted-foreground truncate shrink min-w-0 max-w-[100px]"
                                        title={ch.topic}
                                      >
                                        ({ch.topic})
                                      </span>
                                    )}
                                    <span className="text-muted-foreground capitalize shrink-0">
                                      · {ch.type}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          <SelectGroup>
                            <SelectLabel className="text-[10px] text-muted-foreground">
                              Manual
                            </SelectLabel>
                            <SelectItem value="slack" className="text-sm">
                              Slack
                            </SelectItem>
                            <SelectItem value="discord" className="text-sm">
                              Discord
                            </SelectItem>
                            <SelectItem value="telegram" className="text-sm">
                              Telegram
                            </SelectItem>
                            <SelectItem value="whatsapp" className="text-sm">
                              WhatsApp
                            </SelectItem>
                            <SelectItem value="imessage" className="text-sm">
                              iMessage
                            </SelectItem>
                            <SelectItem value="signal" className="text-sm">
                              Signal
                            </SelectItem>
                            <SelectItem value="mattermost" className="text-sm">
                              Mattermost
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="add-task-to"
                        className="text-[10px] text-muted-foreground"
                      >
                        {isChannelFileValue(channel)
                          ? "To (from channel)"
                          : "To (optional for Last route)"}
                      </Label>
                      <Input
                        id="add-task-to"
                        placeholder={
                          isChannelFileValue(channel)
                            ? "Set automatically"
                            : channel === "slack"
                              ? "e.g. channel:C1234567890"
                              : channel === "telegram"
                                ? "e.g. -1001234567890:topic:123"
                                : "e.g. +15551234567"
                        }
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="h-9 text-sm font-mono bg-muted/30 border-border/60"
                        disabled={isChannelFileValue(channel)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                submitting ||
                !title.trim() ||
                (announce && !channel.trim()) ||
                (announce &&
                  !isChannelFileValue(channel) &&
                  channel !== "last" &&
                  !to.trim())
              }
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {submitting ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
