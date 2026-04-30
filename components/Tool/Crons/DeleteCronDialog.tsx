"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCrons } from "./provider/cronsProvider";
import type { OpenClawCronJobJson } from "$/types/electron";

export interface DeleteCronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OpenClawCronJobJson | null;
  onSuccess?: () => void;
}

export function DeleteCronDialog({
  open,
  onOpenChange,
  job,
  onSuccess,
}: DeleteCronDialogProps) {
  const { cronDelete } = useCrons();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setError(null);
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleConfirm = useCallback(async () => {
    if (!job?.id) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await cronDelete(job.id);
      if (result.success) {
        onSuccess?.();
        handleOpenChange(false);
      } else {
        setError(result.error ?? "Failed to delete cron job");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cron job");
    } finally {
      setSubmitting(false);
    }
  }, [job?.id, cronDelete, onSuccess, handleOpenChange]);

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-h-[85vh] gap-0 sm:rounded-xl p-0 overflow-hidden flex flex-col z-[101]" overlayClassName="z-[100]">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Delete cron job
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Remove <strong className="text-foreground font-medium">&quot;{job.name}&quot;</strong> (id: {job.id}). This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 min-w-0 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 break-words overflow-y-auto max-h-24"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting}
            className="gap-2"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {submitting ? "Deleting…" : "Delete job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
