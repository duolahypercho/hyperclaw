"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot } from "lucide-react";
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
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

export interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddAgentDialog({ open, onOpenChange, onSuccess }: AddAgentDialogProps) {
  const [agentName, setAgentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAgentName("");
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
      const name = agentName.trim();
      if (!name) {
        setError("Agent name is required");
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
        setError("Use only letters, numbers, underscores, hyphens, and dots");
        return;
      }
      setSubmitting(true);
      try {
        const result = (await bridgeInvoke("add-agent", { agentName: name })) as {
          success?: boolean;
          error?: string;
        };
        if (result?.success) {
          onSuccess?.();
          handleOpenChange(false);
        } else {
          setError(result?.error ?? "Failed to add agent");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add agent");
      } finally {
        setSubmitting(false);
      }
    },
    [agentName, onSuccess, handleOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] gap-0 sm:rounded-xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Add agent
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Creates the agent with default workspace <code className="text-[10px] bg-muted/50 px-1 rounded">~/.openclaw/workspace-&lt;name&gt;</code>. Configure model and channels later in terminal or agent settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-4 space-y-4">
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
              <Label htmlFor="add-agent-name" className="text-xs font-medium">
                Agent name
              </Label>
              <Input
                id="add-agent-name"
                placeholder="e.g. my-assistant"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="h-9 text-sm font-mono bg-muted/30 border-border/60"
                autoComplete="off"
                disabled={submitting}
              />
              <p className="text-[10px] text-muted-foreground">
                Letters, numbers, underscores, hyphens, and dots only.
              </p>
            </div>
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
            <Button type="submit" size="sm" disabled={submitting || !agentName.trim()}>
              {submitting ? "Adding…" : "Add agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
