"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Calendar, Clock, Bot } from "lucide-react";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCronsActions } from "./provider/cronsProvider";
import type { CronAddParams } from "./utils";
import { Textarea } from "@/components/ui/textarea";

export interface AddCronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultAgent?: string;
  /** Default runtime (openclaw, claude-code, codex, hermes) */
  defaultRuntime?: string;
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

const AGENT_NONE = "__none__";

export function AddCronDialog({ open, onOpenChange, onSuccess, defaultAgent, defaultRuntime }: AddCronDialogProps) {
  const { cronAdd } = useCronsActions();
  const { agents: openClawAgents } = useHyperclawContext();
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("recurring");
  const [atPreset, setAtPreset] = useState<string>("15m");
  const [atCustom, setAtCustom] = useState("");
  const [cronPreset, setCronPreset] = useState<string>("0 7 * * *");
  const [cronCustom, setCronCustom] = useState("");
  const [runtime, setRuntime] = useState<string>(defaultRuntime ?? "openclaw");
  const [model, setModel] = useState("");
  const [session, setSession] = useState<"main" | "isolated">("isolated");
  const [prompt, setPrompt] = useState("");
  const [deleteAfterRun, setDeleteAfterRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState(defaultAgent ?? "");
  const [announceChannel, setAnnounceChannel] = useState("");
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const atValue = atPreset === "custom" ? atCustom.trim() : atPreset;
  const cronValue = cronPreset === "custom" ? cronCustom.trim() : cronPreset;

  const reset = useCallback(() => {
    setName("");
    setScheduleType("one-shot");
    setAtPreset("15m");
    setAtCustom("");
    setCronPreset("0 7 * * *");
    setCronCustom("");
    setRuntime(defaultRuntime ?? "openclaw");
    setModel("");
    setSession("main");
    setPrompt("");
    setDeleteAfterRun(false);
    setError(null);
    setAgent(defaultAgent ?? "");
    setAnnounceChannel("");
  }, [defaultAgent, defaultRuntime]);

  // Sync agents from context
  useEffect(() => {
    if (!open) return;
    setAgentOptions(openClawAgents.map((a) => ({ id: a.id, name: a.name || a.id })));
  }, [open, openClawAgents]);

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
      setError("Message is required.");
      return;
    }
    const params: CronAddParams = {
      name: name.trim(),
      ...(runtime !== "openclaw" && { runtime }),
    };
    if (scheduleType === "one-shot") params.at = atValue;
    else params.cron = cronValue;
    if (runtime === "openclaw") {
      params.session = session;
      params.deleteAfterRun = deleteAfterRun || undefined;
      if (session === "main") params.systemEvent = prompt.trim();
      else params.message = prompt.trim();
      if (agent && agent !== AGENT_NONE && agent.trim()) params.agent = agent.trim();
    } else {
      params.message = prompt.trim();
      if (agent && agent !== AGENT_NONE && agent.trim()) params.agent = agent.trim();
      if (model.trim() && (runtime === "claude-code" || runtime === "codex")) {
        params.model = model.trim();
      }
    }
    if (announceChannel.trim()) {
      params.channel = announceChannel.trim();
      params.announce = true;
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <SheetTitle>New Cron Job</SheetTitle>
              <SheetDescription className="mt-0.5">
                Schedule a one-shot or recurring task
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="add-cron-name" className="text-xs uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <Input
                id="add-cron-name"
                placeholder="e.g. Morning status"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Schedule type */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Schedule type</Label>
              <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as ScheduleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-shot">One-shot (run once)</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Runtime */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Runtime</Label>
              <Select value={runtime} onValueChange={setRuntime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openclaw">OpenClaw</SelectItem>
                  <SelectItem value="claude-code">Claude Code</SelectItem>
                  <SelectItem value="codex">Codex</SelectItem>
                  <SelectItem value="hermes">Hermes</SelectItem>
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
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    When to run
                  </Label>
                  <Select value={atPreset} onValueChange={setAtPreset}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ONE_SHOT_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {atPreset === "custom" && (
                    <Input
                      placeholder="e.g. 20m, 1h, or 2026-01-12T18:00:00Z"
                      value={atCustom}
                      onChange={(e) => setAtCustom(e.target.value)}
                      className="font-mono"
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
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Repeat
                    </Label>
                    <Select value={cronPreset} onValueChange={setCronPreset}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {cronPreset === "custom" && (
                    <div className="space-y-1.5 pl-3 border-l-2 border-border/50">
                      <Label htmlFor="add-cron-custom" className="text-xs text-muted-foreground">
                        Cron expression (min hour day month weekday)
                      </Label>
                      <Input
                        id="add-cron-custom"
                        placeholder="e.g. 0 7 * * *"
                        value={cronCustom}
                        onChange={(e) => setCronCustom(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Session + Agent */}
            <div className="grid grid-cols-2 gap-4">
              {runtime === "openclaw" && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Session</Label>
                  <Select value={session} onValueChange={(v) => setSession(v as "main" | "isolated")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">Main</SelectItem>
                      <SelectItem value="isolated">Isolated</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    {session === "main" ? "System event style." : "Isolated AI prompt."}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Agent</Label>
                <Select
                  value={agent || AGENT_NONE}
                  onValueChange={(v) => setAgent(v === AGENT_NONE ? "" : v)}
                  disabled={agentsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={agentsLoading ? "Loading…" : "Select…"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AGENT_NONE} className="text-muted-foreground">None</SelectItem>
                    {agentOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
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

            {/* Model (claude-code / codex only) */}
            {(runtime === "claude-code" || runtime === "codex") && (
              <div className="space-y-2">
                <Label htmlFor="add-cron-model" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Model <span className="text-muted-foreground/60 normal-case">(optional)</span>
                </Label>
                <Input
                  id="add-cron-model"
                  placeholder="e.g. claude-sonnet-4-6"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
            )}

            {/* Prompt / system event */}
            <div className="space-y-2">
              <Label htmlFor="add-cron-prompt" className="text-xs uppercase tracking-wider text-muted-foreground">
                {runtime === "openclaw" && session === "main" ? "System event" : "Message (prompt)"}
              </Label>
              <Textarea
                id="add-cron-prompt"
                placeholder={
                  runtime === "openclaw" && session === "main"
                    ? "e.g. Reminder: submit report"
                    : "e.g. Summarize my inbox for today"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Delete after run (OpenClaw only) */}
            {runtime === "openclaw" && (
              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={deleteAfterRun}
                  onChange={(e) => setDeleteAfterRun(e.target.checked)}
                  className="rounded border-border"
                />
                Delete after run
              </label>
            )}

            {/* Announce channel (all runtimes) */}
            <div className="space-y-2">
              <Label htmlFor="add-cron-announce" className="text-xs uppercase tracking-wider text-muted-foreground">
                Announce channel <span className="text-muted-foreground/60 normal-case">(optional)</span>
              </Label>
              <Input
                id="add-cron-announce"
                placeholder="e.g. telegram, whatsapp, slack"
                value={announceChannel}
                onChange={(e) => setAnnounceChannel(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Post run results to this messaging channel when the job completes.
              </p>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border flex flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {submitting ? "Adding…" : "Add cron job"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
