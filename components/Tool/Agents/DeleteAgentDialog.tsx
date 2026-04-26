"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

export interface DeleteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentDisplayName: string;
  onSuccess?: () => void;
  onDeleteStart?: () => void;
  /** When true, dialog will not show / will close immediately (e.g. first agent is not deletable). */
  isFirstAgent?: boolean;
}

export function DeleteAgentDialog({
  open,
  onOpenChange,
  agentId,
  agentDisplayName,
  onSuccess,
  onDeleteStart,
  isFirstAgent = false,
}: DeleteAgentDialogProps) {
  const [error, setError] = useState<string | null>(null);

  // Don't show dialog for the first agent; close if it becomes first (e.g. after refresh).
  React.useEffect(() => {
    if (open && isFirstAgent) onOpenChange(false);
  }, [open, isFirstAgent, onOpenChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setError(null);
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleConfirm = useCallback(() => {
    // Close the dialog immediately — don't block the UI on the delete operation.
    // The agent stays visible but stamped "deleting" (red firing dot) until the
    // bridge confirms. If the bridge fails, we drop the stamp so the agent
    // returns to its normal state rather than vanishing silently.
    window.dispatchEvent(new CustomEvent("agent.deleting", { detail: { agentId } }));
    onDeleteStart?.();
    handleOpenChange(false);

    bridgeInvoke("delete-agent", { agentId })
      .then((result) => {
        const r = result as { success?: boolean; error?: string };
        if (r?.success) {
          window.dispatchEvent(new CustomEvent("agent.deleted", { detail: { agentId } }));
          onSuccess?.();
        } else {
          window.dispatchEvent(
            new CustomEvent("agent.delete.failed", {
              detail: { agentId, error: r?.error ?? "delete failed" },
            }),
          );
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "bridge error";
        window.dispatchEvent(
          new CustomEvent("agent.delete.failed", { detail: { agentId, error: message } }),
        );
      });
  }, [agentId, onSuccess, onDeleteStart, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-h-[85vh] gap-0 sm:rounded-xl p-0 overflow-hidden flex flex-col z-[101]" overlayClassName="z-[100]">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Delete agent
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Remove agent <strong className="text-foreground font-medium">&quot;{agentDisplayName}&quot;</strong> (id: {agentId}). Workspace and session data will be moved to Trash. This cannot be undone from the app.
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
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
          >
            Delete agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
