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
} from "@/components/ui/select";
import { useCrons } from "./provider/cronsProvider";
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

export function EditCronDialog({ open, onOpenChange, job, onSuccess }: EditCronDialogProps) {
  const { cronEdit } = useCrons();
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
    } else {
      setMessage("");
      setModel(MODEL_UNCHANGED);
      setThinking(THINKING_UNCHANGED);
    }
  }, [open, jobForForm, fullJob]);

  useEffect(() => {
    if (!open) return;
    setAgentsLoading(true);
    fetchAgentOptions()
      .then((opts) => setAgentOptions(opts))
      .finally(() => setAgentsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setModelsLoading(true);
    fetchModelOptions()
      .then((opts) => setModelOptions(opts))
      .finally(() => setModelsLoading(false));
  }, [open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!job?.id) return;
      setError(null);
      const clearAgent = agent === AGENT_NONE || !agent.trim();
      const params = {
        ...(typeof name === "string" && name.trim() && { name: name.trim() }),
        ...(message.trim() && { message: message.trim() }),
        ...(model.trim() && model !== MODEL_UNCHANGED && { model: model.trim() }),
        ...(thinking.trim() && thinking !== THINKING_UNCHANGED && { thinking: thinking.trim() }),
        ...(clearAgent && { clearAgent: true }),
        ...(!clearAgent && agent.trim() && { agent: agent.trim() }),
        ...(exact && { exact: true }),
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
    [job?.id, name, message, model, thinking, agent, exact, cronEdit, onSuccess, onOpenChange]
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
