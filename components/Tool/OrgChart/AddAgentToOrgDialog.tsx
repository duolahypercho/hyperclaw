"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  syncToIdentityMd,
  saveAgentModel,
  saveAgentName,
  readOpenClawConfig,
  getAvailableModels,
} from "$/lib/identity-md";
import type { OrgDepartment } from "./provider/orgChartProvider";

export interface AddAgentToOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: OrgDepartment[];
  onSuccess?: () => void;
}

const NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function AddAgentToOrgDialog({
  open,
  onOpenChange,
  departments,
  onSuccess,
}: AddAgentToOrgDialogProps) {
  const [agentName, setAgentName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("__default__");
  const [type, setType] = useState<"specialist" | "lead">("specialist");
  const [department, setDepartment] = useState("__none__");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);

  // Load available models
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const config = await readOpenClawConfig();
      if (cancelled || !config) return;
      setModels(getAvailableModels(config));
    })();
    return () => { cancelled = true; };
  }, [open]);

  const reset = useCallback(() => {
    setAgentName("");
    setDisplayName("");
    setRole("");
    setDescription("");
    setModel("__default__");
    setType("specialist");
    setDepartment("__none__");
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
        setError("Agent ID is required");
        return;
      }
      if (!NAME_REGEX.test(name)) {
        setError("Agent ID: letters, numbers, underscores, hyphens, dots only");
        return;
      }

      setSubmitting(true);
      try {
        // 1. Create the agent via OpenClaw CLI
        const result = (await bridgeInvoke("add-agent", { agentName: name })) as {
          success?: boolean;
          error?: string;
        };
        if (!result?.success) {
          setError(result?.error ?? "Failed to add agent");
          setSubmitting(false);
          return;
        }

        // 2. Derive the agent ID (same normalization as connector)
        const agentId = name.toLowerCase().replace(/[^a-z0-9_.-]/g, "");

        // 3. Set display name in openclaw.json if provided
        const finalName = displayName.trim() || name;
        if (displayName.trim()) {
          await saveAgentName(agentId, finalName).catch(() => {});
        }

        // 4. Sync to IDENTITY.md (name, role, description)
        const identityPatch: { name?: string; role?: string; description?: string } = {};
        identityPatch.name = finalName;
        if (role.trim()) identityPatch.role = role.trim();
        if (description.trim()) identityPatch.description = description.trim();
        await syncToIdentityMd(agentId, identityPatch).catch(() => {});

        // 5. Set model in openclaw.json
        if (model && model !== "__default__") {
          await saveAgentModel(agentId, model).catch(() => {});
        }

        // 6. Add to org chart with type + department
        const deptId = department !== "__none__" ? department : undefined;
        await bridgeInvoke("update-org-node", {
          nodeId: `unlisted-${agentId}`,
          patch: {
            name: finalName,
            role: role.trim(),
            type,
            ...(deptId ? { department: deptId } : {}),
          },
        }).catch(() => {});

        onSuccess?.();
        handleOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add agent");
      } finally {
        setSubmitting(false);
      }
    },
    [agentName, displayName, role, description, model, type, department, onSuccess, handleOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] gap-0 sm:rounded-xl p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Add Agent
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Creates a new agent and adds it to the org chart.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto customScrollbar2">
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

            {/* Agent ID (required) */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Agent ID <span className="text-destructive">*</span>
              </label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. code-assistant"
                className="h-9 text-sm font-mono bg-muted/30"
                autoComplete="off"
                disabled={submitting}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Letters, numbers, underscores, hyphens, dots only.
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Display Name
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Code Assistant"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Role
              </label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Backend Developer"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                className="min-h-[60px] max-h-[150px] resize-y text-xs"
                rows={2}
                disabled={submitting}
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                Model
              </label>
              <Select value={model} onValueChange={setModel} disabled={submitting}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Use default" />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value="__default__">-- Use Default --</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type + Department row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Type
                </label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as "specialist" | "lead")}
                  disabled={submitting}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[102]">
                    <SelectItem value="specialist">Specialist</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Department
                </label>
                <Select
                  value={department}
                  onValueChange={setDepartment}
                  disabled={submitting}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="z-[102]">
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border/40 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !agentName.trim()} className="gap-1.5">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Creating…" : "Add Agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
