"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Calendar, Clock, Bot } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useCronsActions } from "./provider/cronsProvider";
import type { CronAddParams } from "./utils";
import { Textarea } from "@/components/ui/textarea";

export interface AddCronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ScheduleType = "one-shot" | "recurring";

const ONE_SHOT_PRESETS = [
  { value: "15m", label: "In 15 minutes" },
  { value: "30m", label: "In 30 minutes" },
  { value: "1h", label: "In 1 hour" },
  { value: "custom", label: "Custom (e.g. 2026-01-12T18:00:00Z or 20m)" },
] as const;

const CRON_PRESETS = [
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 7 * * *", label: "Every day at 7:00 AM" },
  { value: "0 9 * * *", label: "Every day at 9:00 AM" },
  { value: "0 8 * * 1-5", label: "Weekdays at 8:00 AM" },
  { value: "0 9 * * 1", label: "Every Monday at 9:00 AM" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "custom", label: "Custom expression" },
] as const;

interface AgentOption {
  id: string;
  name: string;
}

/** Channel from ~/.hyperclaw/channels.json */
interface ChannelOption {
  id: string;
  name: string;
  type: string;
  kind: string;
  parent?: string | null;
  topic?: string | null;
}

const AGENT_NONE = "__none__";

/** Value for a channel from file: "type:id" so we can set --channel and --to. */
function channelFileValue(ch: ChannelOption): string {
  return `${ch.type}:${ch.id}`;
}

function isChannelFileValue(value: string): boolean {
  return value.includes(":") && value !== "last";
}


async function fetchChannelOptions(): Promise<ChannelOption[]> {
  const res = (await bridgeInvoke("list-channels", {})) as {
    success?: boolean;
    data?: ChannelOption[];
  };
  if (!res?.success || !Array.isArray(res.data)) return [];
  return res.data.filter((c) => c && c.kind === "channel") as ChannelOption[];
}

export function AddCronDialog({ open, onOpenChange, onSuccess }: AddCronDialogProps) {
  const { cronAdd } = useCronsActions();
  const { agents: openClawAgents } = useOpenClawContext();
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("recurring");
  const [atPreset, setAtPreset] = useState<string>("15m");
  const [atCustom, setAtCustom] = useState("");
  const [cronPreset, setCronPreset] = useState<string>("0 7 * * *");
  const [cronCustom, setCronCustom] = useState("");
  const [session, setSession] = useState<"main" | "isolated">("isolated");
  const [prompt, setPrompt] = useState("");
  const [deleteAfterRun, setDeleteAfterRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState("");
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [channel, setChannel] = useState<string>("last");
  const [to, setTo] = useState("");

  const atValue = atPreset === "custom" ? atCustom.trim() : atPreset;
  const cronValue = cronPreset === "custom" ? cronCustom.trim() : cronPreset;

  const reset = useCallback(() => {
    setName("");
    setScheduleType("one-shot");
    setAtPreset("15m");
    setAtCustom("");
    setCronPreset("0 7 * * *");
    setCronCustom("");
    setSession("main");
    setPrompt("");
    setDeleteAfterRun(false);
    setError(null);
    setAgent("");
    setAnnounce(false);
    setChannel("last");
    setTo("");
  }, []);

  // Sync agents from context
  useEffect(() => {
    if (!open) return;
    setAgentOptions(openClawAgents.map((a) => ({ id: a.id, name: a.name || a.id })));
  }, [open, openClawAgents]);

  // Fetch channels (still a bridge call — not centralized)
  useEffect(() => {
    if (!open) return;
    setChannelsLoading(true);
    fetchChannelOptions()
      .then((channels) => setChannelOptions(channels))
      .finally(() => setChannelsLoading(false));
  }, [open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (scheduleType === "one-shot" && !atValue) {
      setError("Choose when to run or enter a custom time (e.g. 20m or 2026-01-12T18:00:00Z).");
      return;
    }
    if (scheduleType === "recurring" && !cronValue) {
      setError("Choose a schedule or enter a custom cron expression.");
      return;
    }
    if (!prompt.trim()) {
      setError(session === "main" ? "System event is required for main session." : "Message is required for isolated session.");
      return;
    }
    if (session === "isolated" && announce) {
      const ch = channel.trim();
      if (!ch) {
        setError("Choose a delivery channel (or use last route).");
        return;
      }
      const fromFile = isChannelFileValue(ch);
      if (!fromFile && ch !== "last" && !to.trim()) {
        setError("Delivery target is required for this channel (e.g. channel:C123… or +1555…).");
        return;
      }
    }
    const params: CronAddParams = {
      name: name.trim(),
      session,
      deleteAfterRun: deleteAfterRun || undefined,
    };
    if (scheduleType === "one-shot") params.at = atValue;
    else params.cron = cronValue;
    if (session === "main") params.systemEvent = prompt.trim();
    else params.message = prompt.trim();
    if (agent && agent !== AGENT_NONE && agent.trim()) params.agent = agent.trim();
    if (session === "isolated" && announce) {
      params.announce = true;
      const ch = channel.trim();
      const fromFile = isChannelFileValue(ch);
      if (fromFile) {
        const [chType, chId] = ch.split(":");
        if (chType) params.channel = chType.trim();
        if (chId) params.to = `channel:${chId.trim()}`;
      } else if (ch !== "last") {
        if (ch) params.channel = ch;
        if (to.trim()) params.to = to.trim();
      }
    }
    setSubmitting(true);
    try {
      const result = await cronAdd(params);
      if (result.success) {
        onSuccess?.();
        handleOpenChange(false);
      } else {
        setError(result.error ?? "Failed to add cron job");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add cron job");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px] gap-0 sm:rounded-xl p-0 overflow-hidden z-[101]" overlayClassName="z-[100]">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Add cron job
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Create a one-shot reminder or a recurring OpenClaw cron job.
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
              <Label htmlFor="add-cron-name" className="text-xs font-medium">
                Name
              </Label>
              <Input
                id="add-cron-name"
                placeholder="e.g. Morning status"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm bg-muted/30 border-border/60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Schedule type</Label>
              <Select
                value={scheduleType}
                onValueChange={(v) => setScheduleType(v as ScheduleType)}
              >
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value="one-shot">One-shot (run once)</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <AnimatePresence mode="wait">
            {scheduleType === "one-shot" && (
              <motion.div
                key="one-shot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="space-y-2"
              >
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  When to run
                </Label>
                <Select value={atPreset} onValueChange={setAtPreset}>
                  <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[102]">
                    {ONE_SHOT_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {atPreset === "custom" && (
                  <Input
                    placeholder="e.g. 20m, 1h, or 2026-01-12T18:00:00Z"
                    value={atCustom}
                    onChange={(e) => setAtCustom(e.target.value)}
                    className="h-9 text-sm font-mono bg-muted/30 border-border/60 mt-1"
                  />
                )}
              </motion.div>
            )}

            {scheduleType === "recurring" && (
              <motion.div
                key="recurring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    Repeat
                  </Label>
                  <Select value={cronPreset} onValueChange={setCronPreset}>
                    <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[102]">
                      {CRON_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <span className="flex flex-col items-start gap-0.5">
                            <span>{p.label}</span> 
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {cronPreset === "custom" && (
                  <div className="space-y-1.5 pl-1 border-l-2 border-border/50">
                    <Label htmlFor="add-cron-custom" className="text-xs text-muted-foreground">
                      Cron expression (min hour day month weekday)
                    </Label>
                    <Input
                      id="add-cron-custom"
                      placeholder="e.g. 0 7 * * *"
                      value={cronCustom}
                      onChange={(e) => setCronCustom(e.target.value)}
                      className="h-9 text-sm font-mono bg-muted/30 border-border/60"
                    />
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Session</Label>
                <Select value={session} onValueChange={(v) => setSession(v as "main" | "isolated")}>
                  <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[102]">
                    <SelectItem value="main">Main (system event)</SelectItem>
                    <SelectItem value="isolated">Isolated (AI prompt)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {session === "main"
                    ? "Runs in the main session. Use a system event (reminder / notification style)."
                    : "Runs in an isolated session. Use a message as the AI prompt."}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Agent</Label>
                <Select
                  value={agent || AGENT_NONE}
                  onValueChange={(v) => setAgent(v === AGENT_NONE ? "" : v)}
                  disabled={agentsLoading}
                >
                  <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                    <SelectValue placeholder={agentsLoading ? "Loading agents…" : "Select agent…"} />
                  </SelectTrigger>
                  <SelectContent className="z-[102]">
                    <SelectItem value={AGENT_NONE} className="text-xs text-muted-foreground">
                      None
                    </SelectItem>
                    {agentOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id} className="text-xs">
                        <span className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {opt.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {session === "isolated" && (
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
                        <Label className="text-[10px] text-muted-foreground">Channel</Label>
                        <Select
                          value={channel}
                          onValueChange={(v) => {
                            setChannel(v);
                            if (isChannelFileValue(v) || v === "last") setTo("");
                          }}
                        >
                          <SelectTrigger className="h-9 min-w-0 overflow-hidden bg-muted/30 border-border/60">
                            <span className="block min-w-0 truncate text-left">
                              <SelectValue placeholder={channelsLoading ? "Loading channels…" : "Choose channel…"} />
                            </span>
                          </SelectTrigger>
                          <SelectContent className="z-[102]">
                            <SelectItem value="last">Last route</SelectItem>
                            {channelOptions.length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[10px] text-muted-foreground">From HyperClaw</SelectLabel>
                                {channelOptions.map((ch) => (
                                  <SelectItem key={ch.id} value={channelFileValue(ch)} className="text-xs">
                                    <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                      <span className="truncate" title={ch.name}>{ch.name}</span>
                                      {ch.topic && <span className="text-muted-foreground truncate shrink min-w-0 max-w-[100px]" title={ch.topic}>({ch.topic})</span>}
                                      <span className="text-muted-foreground capitalize shrink-0">· {ch.type}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            <SelectGroup>
                              <SelectLabel className="text-[10px] text-muted-foreground">Manual</SelectLabel>
                              <SelectItem value="slack">Slack</SelectItem>
                              <SelectItem value="discord">Discord</SelectItem>
                              <SelectItem value="telegram">Telegram</SelectItem>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              <SelectItem value="imessage">iMessage</SelectItem>
                              <SelectItem value="signal">Signal</SelectItem>
                              <SelectItem value="mattermost">Mattermost</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="add-cron-to" className="text-[10px] text-muted-foreground">
                          {isChannelFileValue(channel) ? "To (from channel)" : "To (optional for Last route)"}
                        </Label>
                        <Input
                          id="add-cron-to"
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
                  {announce && (
                    <p className="text-[10px] text-muted-foreground">
                      Tip: use <span className="font-mono">Last route</span> to deliver to the last place Hyperclaw replied. For Slack/Discord prefer{" "}
                      <span className="font-mono">channel:&lt;id&gt;</span> or <span className="font-mono">user:&lt;id&gt;</span>.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="add-cron-prompt" className="text-xs font-medium flex items-center gap-1.5">
                {session === "main" ? "System event" : "Message (prompt)"}
              </Label>
              <Textarea
                id="add-cron-prompt"
                placeholder={
                  session === "main"
                    ? "e.g. Reminder: submit report"
                    : "e.g. Summarize my inbox for today"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="h-9 text-sm bg-muted/30 border-border/60"
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={deleteAfterRun}
                  onChange={(e) => setDeleteAfterRun(e.target.checked)}
                  className="rounded border-border"
                />
                Delete after run
              </label>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="gap-2">
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {submitting ? "Adding…" : "Add cron job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
