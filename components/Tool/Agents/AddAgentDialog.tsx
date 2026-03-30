"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Crown, Loader2 } from "lucide-react";
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
import { deployCEOTemplates } from "$/lib/ceo-templates";
import { dashboardState } from "$/lib/dashboard-state";
import { cn } from "@/lib/utils";

export interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type AgentTemplate = "blank" | "orchestrator";

export function AddAgentDialog({ open, onOpenChange, onSuccess }: AddAgentDialogProps) {
  const [agentName, setAgentName] = useState("");
  const [template, setTemplate] = useState<AgentTemplate>("blank");
  const [submitting, setSubmitting] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ceoExists, setCeoExists] = useState(false);

  // Check if a CEO agent already exists
  useEffect(() => {
    if (open) {
      const existing = dashboardState.get("hyperclaw-ceo-id");
      setCeoExists(!!existing);
    }
  }, [open]);

  const reset = useCallback(() => {
    setAgentName("");
    setTemplate("blank");
    setError(null);
    setDeployStatus(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  // Auto-fill name when switching to orchestrator template
  const handleTemplateChange = useCallback((t: AgentTemplate) => {
    setTemplate(t);
    if (t === "orchestrator" && !agentName.trim()) {
      setAgentName("hyperclaw");
    }
  }, [agentName]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setDeployStatus(null);
      const name = agentName.trim();
      if (!name) {
        setError("Agent name is required");
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
        setError("Use only letters, numbers, underscores, hyphens, and dots");
        return;
      }
      if (template === "orchestrator" && ceoExists) {
        setError("An orchestrator agent already exists. Only one is allowed per deployment.");
        return;
      }
      setSubmitting(true);
      try {
        // Step 1: Create the agent via bridge
        setDeployStatus("Creating agent...");
        const result = (await bridgeInvoke("add-agent", { agentName: name })) as {
          success?: boolean;
          error?: string;
        };
        if (!result?.success) {
          setError(result?.error ?? "Failed to add agent");
          return;
        }

        // Step 2: Deploy CEO templates if orchestrator selected
        if (template === "orchestrator") {
          setDeployStatus("Deploying orchestrator templates...");
          const normalizedId = name.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
          // Try both workspace prefix formats the connector might use
          const workspacePrefix = `workspace-${normalizedId}`;
          const deployResult = await deployCEOTemplates(workspacePrefix);
          if (!deployResult.success) {
            // Try without the "workspace-" prefix as fallback
            const fallbackResult = await deployCEOTemplates(normalizedId);
            if (!fallbackResult.success) {
              // Agent was created but templates failed — warn but don't block
              console.warn("[AddAgentDialog] Template deployment failed:", deployResult.error);
            }
          }

          // Step 3: Mark as CEO in dashboard state
          dashboardState.set("hyperclaw-ceo-id", normalizedId, { flush: true });
          setDeployStatus("Orchestrator ready!");
        }

        onSuccess?.();
        handleOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add agent");
      } finally {
        setSubmitting(false);
        setDeployStatus(null);
      }
    },
    [agentName, template, ceoExists, onSuccess, handleOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px] gap-0 sm:rounded-xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Add agent
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Creates the agent with default workspace. Configure model and channels later.
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

            {/* Template selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Template</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTemplateChange("blank")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-xs transition-colors",
                    template === "blank"
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <Bot className="w-3.5 h-3.5" />
                    Blank agent
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Empty workspace, configure yourself
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTemplateChange("orchestrator")}
                  disabled={ceoExists}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-xs transition-colors",
                    template === "orchestrator"
                      ? "border-amber-500 bg-amber-500/5"
                      : "border-border/60 hover:border-border",
                    ceoExists && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                    Orchestrator
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {ceoExists
                      ? "Already exists — one per deployment"
                      : "Manages your team's task pipeline"}
                  </span>
                </button>
              </div>
            </div>

            {/* Agent name */}
            <div className="space-y-2">
              <Label htmlFor="add-agent-name" className="text-xs font-medium">
                Agent name
              </Label>
              <Input
                id="add-agent-name"
                placeholder={template === "orchestrator" ? "hyperclaw" : "e.g. my-assistant"}
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="h-9 text-sm font-mono bg-muted/30 border-border/60"
                autoComplete="off"
                disabled={submitting}
              />
              <p className="text-[10px] text-muted-foreground">
                {template === "orchestrator"
                  ? "This agent will orchestrate your team — assign tasks, monitor progress, send notifications."
                  : "Letters, numbers, underscores, hyphens, and dots only."}
              </p>
            </div>

            {/* Deploy status */}
            <AnimatePresence mode="wait">
              {deployStatus && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {deployStatus}
                </motion.div>
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
            <Button type="submit" size="sm" disabled={submitting || !agentName.trim()}>
              {submitting
                ? template === "orchestrator"
                  ? "Deploying…"
                  : "Adding…"
                : template === "orchestrator"
                  ? "Deploy orchestrator"
                  : "Add agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
