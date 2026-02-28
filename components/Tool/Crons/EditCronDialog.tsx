"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Pencil, Bot } from "lucide-react";
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
import { useCronsActions } from "./provider/cronsProvider";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { fetchCronById } from "./utils";
import type { OpenClawCronJobJson } from "$/types/electron";

interface AgentOption {
  id: string;
  name: string;
}

interface ModelOption {
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

/** Value for a channel from file: "type:id" for dropdown. */
function channelFileValue(ch: ChannelOption): string {
  return `${ch.type}:${ch.id}`;
}

function isChannelFileValue(value: string): boolean {
  return value.includes(":") && value !== "last";
}

/** Convert job delivery channel+to into dropdown value (so we can pre-select HyperClaw channels). */
function deliveryToChannelValue(channel: string, to: string): string {
  const ch = (channel || "last").trim();
  const t = (to || "").trim();
  if (ch === "last" || !t) return ch;
  if (t.startsWith("channel:")) return `${ch}:${t.slice(8).trim()}`;
  return ch;
}

async function fetchChannelOptions(): Promise<ChannelOption[]> {
  const res = (await bridgeInvoke("list-channels", {})) as {
    success?: boolean;
    data?: ChannelOption[];
  };
  if (!res?.success || !Array.isArray(res.data)) return [];
  return res.data.filter((c) => c && c.kind === "channel") as ChannelOption[];
}

async function fetchAgentOptions(): Promise<AgentOption[]> {
  const res = (await bridgeInvoke("list-agents", {})) as {
    success?: boolean;
    data?: { id: string; name: string }[];
  };
  if (!res?.success || !Array.isArray(res.data)) return [];
  return res.data.map((a) => ({ id: a.id, name: a.name || a.id }));
}

async function fetchModelOptions(): Promise<ModelOption[]> {
  const res = (await bridgeInvoke("list-models", {})) as {
    success?: boolean;
    data?: { id: string; name: string }[];
  };
  if (!res?.success || !Array.isArray(res.data)) return [];
  return res.data.map((m) => ({ id: m.id, name: m.name || m.id }));
}

const THINKING_UNCHANGED = "__unchanged__";
const MODEL_UNCHANGED = "__unchanged__";

export interface EditCronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OpenClawCronJobJson | null;
  onSuccess?: () => void;
}

const AGENT_NONE = "__none__";

/** Current prompt from job: payload.message (agentTurn) or payload.text (systemEvent). */
function getJobMessage(job: OpenClawCronJobJson): string {
  const p = job.payload as { message?: string; text?: string } | undefined;
  if (!p || typeof p !== "object") return "";
  if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  if (typeof p.text === "string" && p.text.trim()) return p.text.trim();
  return "";
}

/** Current model id from job.payload.model (agentTurn only). */
function getJobModel(job: OpenClawCronJobJson): string {
  const p = job.payload as { model?: string } | undefined;
  if (!p || typeof p !== "object" || typeof p.model !== "string" || !p.model.trim()) return MODEL_UNCHANGED;
  return p.model.trim();
}

/** Current thinking from job.payload.thinking (agentTurn only). */
function getJobThinking(job: OpenClawCronJobJson): string {
  const p = job.payload as { thinking?: string } | undefined;
  if (!p || typeof p !== "object" || typeof p.thinking !== "string" || !p.thinking.trim()) return THINKING_UNCHANGED;
  return p.thinking.trim();
}

/** Delivery from job.delivery (full job from get-cron-by-id). */
function getJobDelivery(job: OpenClawCronJobJson): { announce: boolean; channel: string; to: string } {
  const d = job.delivery as { mode?: string; channel?: string; to?: string } | undefined;
  if (!d || typeof d !== "object") return { announce: false, channel: "last", to: "" };
  const announce = d.mode === "announce";
  return {
    announce,
    channel: typeof d.channel === "string" && d.channel.trim() ? d.channel.trim() : "last",
    to: typeof d.to === "string" ? d.to.trim() : "",
  };
}

export function EditCronDialog({ open, onOpenChange, job, onSuccess }: EditCronDialogProps) {
  const { cronEdit } = useCronsActions();
  const [fullJob, setFullJob] = useState<OpenClawCronJobJson | null>(null);
  const [fullJobLoading, setFullJobLoading] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [model, setModel] = useState(MODEL_UNCHANGED);
  const [thinking, setThinking] = useState(THINKING_UNCHANGED);
  const [agent, setAgent] = useState("");
  const [exact, setExact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [channel, setChannel] = useState<string>("last");
  const [to, setTo] = useState("");

  const jobForForm = fullJob ?? job;

  useEffect(() => {
    if (!open || !job?.id) {
      setFullJob(null);
      return;
    }
    setFullJobLoading(true);
    setFullJob(null);
    fetchCronById(job.id)
      .then((fetched) => {
        setFullJob(fetched ?? null);
      })
      .finally(() => setFullJobLoading(false));
  }, [open, job?.id]);

  useEffect(() => {
    if (!jobForForm || !open) return;
    setName(typeof jobForForm.name === "string" ? jobForForm.name : "");
    setAgent(jobForForm.agentId ? jobForForm.agentId : AGENT_NONE);
    setExact(false);
    setError(null);
    if (fullJob) {
      setMessage(getJobMessage(fullJob));
      setModel(getJobModel(fullJob));
      setThinking(getJobThinking(fullJob));
      const delivery = getJobDelivery(fullJob);
      console.log("fullJob", fullJob);
      console.log("delivery", delivery);
      setAnnounce(delivery.announce);
      setChannel(deliveryToChannelValue(delivery.channel, delivery.to));
      setTo(isChannelFileValue(deliveryToChannelValue(delivery.channel, delivery.to)) ? "" : delivery.to);
    } else {
      setMessage("");
      setModel(MODEL_UNCHANGED);
      setThinking(THINKING_UNCHANGED);
      setAnnounce(false);
      setChannel("last");
      setTo("");
    }
  }, [open, jobForForm, fullJob]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setAgentsLoading(true);
      fetchAgentOptions()
        .then((opts) => setAgentOptions(opts))
        .finally(() => setAgentsLoading(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setModelsLoading(true);
      fetchModelOptions()
        .then((opts) => setModelOptions(opts))
        .finally(() => setModelsLoading(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setChannelsLoading(true);
      fetchChannelOptions()
        .then((opts) => setChannelOptions(opts))
        .finally(() => setChannelsLoading(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!job?.id) return;
      setError(null);
      if (announce) {
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
      const clearAgent = agent === AGENT_NONE || !agent.trim();
      const params = {
        ...(typeof name === "string" && name.trim() && { name: name.trim() }),
        ...(message.trim() && { message: message.trim() }),
        ...(model.trim() && model !== MODEL_UNCHANGED && { model: model.trim() }),
        ...(thinking.trim() && thinking !== THINKING_UNCHANGED && { thinking: thinking.trim() }),
        ...(clearAgent && { clearAgent: true }),
        ...(!clearAgent && agent.trim() && { agent: agent.trim() }),
        ...(exact && { exact: true }),
        ...(announce && {
          announce: true,
          ...((): { channel?: string; to?: string } => {
            const ch = channel.trim();
            const fromFile = isChannelFileValue(ch);
            if (fromFile) {
              const [chType, chId] = ch.split(":");
              return {
                ...(chType?.trim() && { channel: chType.trim() }),
                ...(chId?.trim() && { to: `channel:${chId.trim()}` }),
              };
            }
            if (ch === "last") return {};
            return {
              ...(ch && { channel: ch }),
              ...(to.trim() && { to: to.trim() }),
            };
          })(),
        }),
      };
      if (Object.keys(params).length === 0) {
        setError("Change at least one field");
        return;
      }
      setSubmitting(true);
      try {
        const result = await cronEdit(job.id, params);
        if (result.success) {
          onSuccess?.();
          onOpenChange(false);
        } else {
          setError(result.error ?? "Failed to update job");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update job");
      } finally {
        setSubmitting(false);
      }
    },
    [job?.id, name, message, model, thinking, agent, exact, announce, channel, to, cronEdit, onSuccess, onOpenChange]
  );

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] gap-0 sm:rounded-xl p-0 overflow-hidden z-[101]" overlayClassName="z-[100]">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit cron job
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {job.name}
            {fullJobLoading ? " — Loading…" : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-4 space-y-4">
            {fullJobLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Loading job details…
              </div>
            )}
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-cron-name" className="text-xs font-medium">
                Title
              </Label>
              <Input
                id="edit-cron-name"
                placeholder="Job name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm bg-muted/30 border-border/60"
                disabled={fullJobLoading}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Model</Label>
              <Select
                value={model || MODEL_UNCHANGED}
                onValueChange={(v) => setModel(v)}
                disabled={modelsLoading || fullJobLoading}
              >
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue placeholder={modelsLoading ? "Loading models…" : "Leave unchanged"} />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value={MODEL_UNCHANGED} className="text-xs text-muted-foreground">
                    Leave unchanged
                  </SelectItem>
                  {modelOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                      {opt.name}
                    </SelectItem>
                  ))}
                  {(() => {
                    const payloadModel = jobForForm ? getJobModel(jobForForm) : MODEL_UNCHANGED;
                    if (
                      payloadModel &&
                      payloadModel !== MODEL_UNCHANGED &&
                      !modelOptions.some((o) => o.id === payloadModel)
                    ) {
                      return (
                        <SelectItem key={payloadModel} value={payloadModel} className="text-xs">
                          {payloadModel}
                        </SelectItem>
                      );
                    }
                    return null;
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Thinking</Label>
              <Select value={thinking} onValueChange={setThinking} disabled={fullJobLoading}>
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue placeholder="Leave unchanged" />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value={THINKING_UNCHANGED}>Leave unchanged</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Agent</Label>
              <Select
                value={agent || AGENT_NONE}
                onValueChange={(v) => setAgent(v === AGENT_NONE ? "" : v)}
                disabled={agentsLoading || fullJobLoading}
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
                  {jobForForm?.agentId &&
                    !agentOptions.some((o) => o.id === jobForForm.agentId) && (
                      <SelectItem value={jobForForm.agentId} className="text-xs">
                        <span className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {jobForForm.agentId}
                        </span>
                      </SelectItem>
                    )}
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
                    disabled={fullJobLoading}
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
                        disabled={fullJobLoading}
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
                                    {ch.topic && (
                                      <span className="text-muted-foreground truncate shrink min-w-0 max-w-[100px]" title={ch.topic}>
                                        ({ch.topic})
                                      </span>
                                    )}
                                    <span className="text-muted-foreground capitalize shrink-0">· {ch.type}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {/* Show current saved channel when it's a composite not in the list (e.g. from another workspace) */}
                          {channel && isChannelFileValue(channel) && !channelOptions.some((ch) => channelFileValue(ch) === channel) && (
                            <SelectGroup>
                              <SelectLabel className="text-[10px] text-muted-foreground">Current</SelectLabel>
                              <SelectItem value={channel} className="text-xs truncate">
                                <span className="truncate" title={channel}>
                                  Saved channel · {channel.split(":")[0]}
                                </span>
                              </SelectItem>
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
                      <Label htmlFor="edit-cron-to" className="text-[10px] text-muted-foreground">
                        {isChannelFileValue(channel) ? "To (from channel)" : "To (optional for Last route)"}
                      </Label>
                      <Input
                        id="edit-cron-to"
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
                        disabled={fullJobLoading || isChannelFileValue(channel)}
                      />
                    </div>
                  </div>
                )}
                {announce && (
                  <p className="text-[10px] text-muted-foreground">
                    Use <span className="font-mono">Last route</span> to deliver to the last place Hyperclaw replied. For Slack/Discord use{" "}
                    <span className="font-mono">channel:&lt;id&gt;</span> or <span className="font-mono">user:&lt;id&gt;</span>.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-cron-message" className="text-xs font-medium">
                Prompt
              </Label>
              <Textarea
                id="edit-cron-message"
                placeholder="Updated prompt"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[120px] max-h-[280px] resize-y text-sm bg-muted/30 border-border/60"
                rows={5}
                disabled={fullJobLoading}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={exact}
                onChange={(e) => setExact(e.target.checked)}
                className="rounded border-border"
              />
              Force exact schedule (no stagger)
            </label>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || fullJobLoading} className="gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
