"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Pencil, Bot } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCronsActions } from "./provider/cronsProvider";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
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
  const { cronEdit } = useCronsActions();
  const { agents: openClawAgents, models: openClawModels } = useHyperclawContext();
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

  // Sync agents from context
  useEffect(() => {
    if (!open) return;
    setAgentOptions(openClawAgents.map((a) => ({ id: a.id, name: a.name || a.id })));
  }, [open, openClawAgents]);

  // Sync models from context
  useEffect(() => {
    if (!open) return;
    setModelOptions(openClawModels.map((m) => ({ id: m.id, name: m.displayName || m.id })));
  }, [open, openClawModels]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <SheetTitle>Edit Cron Job</SheetTitle>
              <SheetDescription className="mt-0.5">
                {job.name}{fullJobLoading ? " — Loading…" : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {fullJobLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Loading job details…
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="edit-cron-name" className="text-xs uppercase tracking-wider text-muted-foreground">
                Title
              </Label>
              <Input
                id="edit-cron-name"
                placeholder="Job name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={fullJobLoading}
              />
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Model</Label>
              <Select value={model || MODEL_UNCHANGED} onValueChange={setModel} disabled={modelsLoading || fullJobLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? "Loading models…" : "Leave unchanged"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MODEL_UNCHANGED} className="text-muted-foreground">Leave unchanged</SelectItem>
                  {modelOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                  ))}
                  {(() => {
                    const payloadModel = jobForForm ? getJobModel(jobForForm) : MODEL_UNCHANGED;
                    if (payloadModel && payloadModel !== MODEL_UNCHANGED && !modelOptions.some((o) => o.id === payloadModel)) {
                      return <SelectItem key={payloadModel} value={payloadModel}>{payloadModel}</SelectItem>;
                    }
                    return null;
                  })()}
                </SelectContent>
              </Select>
            </div>

            {/* Thinking */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Thinking</Label>
              <Select value={thinking} onValueChange={setThinking} disabled={fullJobLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Leave unchanged" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={THINKING_UNCHANGED}>Leave unchanged</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agent */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Agent</Label>
              <Select
                value={agent || AGENT_NONE}
                onValueChange={(v) => setAgent(v === AGENT_NONE ? "" : v)}
                disabled={agentsLoading || fullJobLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={agentsLoading ? "Loading agents…" : "Select agent…"} />
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
                  {jobForForm?.agentId && !agentOptions.some((o) => o.id === jobForForm.agentId) && (
                    <SelectItem value={jobForForm.agentId}>
                      <span className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {jobForForm.agentId}
                      </span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <Label htmlFor="edit-cron-message" className="text-xs uppercase tracking-wider text-muted-foreground">
                Prompt
              </Label>
              <Textarea
                id="edit-cron-message"
                placeholder="Updated prompt"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="resize-y"
                disabled={fullJobLoading}
              />
            </div>

            {/* Exact schedule */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={exact}
                onChange={(e) => setExact(e.target.checked)}
                className="rounded border-border"
              />
              Force exact schedule (no stagger)
            </label>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border flex flex-row gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || fullJobLoading} className="flex-1">
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
