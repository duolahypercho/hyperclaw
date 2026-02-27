"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Calendar, Clock, MessageSquare } from "lucide-react";
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
} from "@/components/ui/select";
import { useCrons } from "./provider/cronsProvider";
import type { CronAddParams } from "./utils";

export interface AddCronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ScheduleType = "one-shot" | "recurring";

export function AddCronDialog({ open, onOpenChange, onSuccess }: AddCronDialogProps) {
  const { cronAdd } = useCrons();
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("one-shot");
  const [at, setAt] = useState("");
  const [cronExpr, setCronExpr] = useState("");
  const [tz, setTz] = useState("UTC");
  const [session, setSession] = useState<"main" | "isolated">("main");
  const [message, setMessage] = useState("");
  const [systemEvent, setSystemEvent] = useState("");
  const [wakeNow, setWakeNow] = useState(false);
  const [deleteAfterRun, setDeleteAfterRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName("");
    setScheduleType("one-shot");
    setAt("");
    setCronExpr("");
    setTz("UTC");
    setSession("main");
    setMessage("");
    setSystemEvent("");
    setWakeNow(false);
    setDeleteAfterRun(false);
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      if (scheduleType === "one-shot" && !at.trim()) {
        setError("For one-shot, provide at (e.g. 2026-01-12T18:00:00Z or 20m)");
        return;
      }
      if (scheduleType === "recurring" && !cronExpr.trim()) {
        setError("For recurring, provide a cron expression (e.g. 0 7 * * *)");
        return;
      }
      if (!message.trim() && !systemEvent.trim()) {
        setError("Provide either a message or system event");
        return;
      }
      const params: CronAddParams = {
        name: name.trim(),
        session,
        tz: tz.trim() || undefined,
        wake: wakeNow ? "now" : undefined,
        deleteAfterRun: deleteAfterRun || undefined,
      };
      if (scheduleType === "one-shot") params.at = at.trim();
      else params.cron = cronExpr.trim();
      if (message.trim()) params.message = message.trim();
      if (systemEvent.trim()) params.systemEvent = systemEvent.trim();
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
    },
    [name, scheduleType, at, cronExpr, tz, session, message, systemEvent, wakeNow, deleteAfterRun, cronAdd, onSuccess, handleOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px] gap-0 sm:rounded-xl p-0 overflow-hidden">
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
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
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
              <Label className="text-xs font-medium">Schedule</Label>
              <Select
                value={scheduleType}
                onValueChange={(v) => setScheduleType(v as ScheduleType)}
              >
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-shot">One-shot (at time)</SelectItem>
                  <SelectItem value="recurring">Recurring (cron)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleType === "one-shot" && (
              <div className="space-y-2">
                <Label htmlFor="add-cron-at" className="text-xs font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  At (UTC ISO or relative, e.g. 20m)
                </Label>
                <Input
                  id="add-cron-at"
                  placeholder="2026-01-12T18:00:00Z or 20m"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  className="h-9 text-sm font-mono bg-muted/30 border-border/60"
                />
              </div>
            )}
            {scheduleType === "recurring" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="add-cron-expr" className="text-xs font-medium">
                    Cron expression
                  </Label>
                  <Input
                    id="add-cron-expr"
                    placeholder="0 7 * * * (e.g. daily 7am)"
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    className="h-9 text-sm font-mono bg-muted/30 border-border/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-cron-tz" className="text-xs font-medium">
                    Timezone
                  </Label>
                  <Input
                    id="add-cron-tz"
                    placeholder="America/Los_Angeles"
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    className="h-9 text-sm bg-muted/30 border-border/60"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Session</Label>
              <Select value={session} onValueChange={(v) => setSession(v as "main" | "isolated")}>
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">main</SelectItem>
                  <SelectItem value="isolated">isolated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-cron-message" className="text-xs font-medium flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Message (prompt to run)
              </Label>
              <Input
                id="add-cron-message"
                placeholder="e.g. Summarize inbox for today"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="h-9 text-sm bg-muted/30 border-border/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-cron-system-event" className="text-xs font-medium text-muted-foreground">
                System event (optional, alternative to message)
              </Label>
              <Input
                id="add-cron-system-event"
                placeholder="e.g. Reminder: submit report"
                value={systemEvent}
                onChange={(e) => setSystemEvent(e.target.value)}
                className="h-9 text-sm bg-muted/30 border-border/60"
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={wakeNow}
                  onChange={(e) => setWakeNow(e.target.checked)}
                  className="rounded border-border"
                />
                Wake now
              </label>
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
