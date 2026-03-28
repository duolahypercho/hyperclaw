"use client";

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Bot, Loader2 } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
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
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { Task } from "$/components/Tool/TodoList/types";

interface TeamAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
}

export interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  /** Pre-loaded agents from the parent — avoids redundant bridge call */
  preloadedAgents?: TeamAgent[];
}

export function EditTaskDialog({
  open,
  onOpenChange,
  task,
  preloadedAgents,
}: EditTaskDialogProps) {
  const { handleEditTask } = useTodoList();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignedAgent, setAssignedAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<TeamAgent[]>(preloadedAgents ?? []);
  const [dataLoading, setDataLoading] = useState(false);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const MAX_DESC_PX = 320;

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.overflow = "hidden";
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_DESC_PX);
    el.style.height = `${next}px`;
    el.style.overflow = el.scrollHeight > MAX_DESC_PX ? "auto" : "hidden";
  }, [description]);

  // Re-sync local state when task prop changes
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setError(null);
  }, [task._id]);

  // Resolve assignedAgent label/id → selected agent id when agents load
  useEffect(() => {
    if (task.assignedAgentId) {
      setAssignedAgent(task.assignedAgentId);
      return;
    }
    if (!task.assignedAgent) {
      setAssignedAgent("");
      return;
    }
    const match = agents.find(
      (a) => a.name === task.assignedAgent || a.id === task.assignedAgent
    );
    setAssignedAgent(match?.id ?? "");
  }, [task.assignedAgent, task.assignedAgentId, agents]);

  // Only fetch data that wasn't preloaded
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const needAgents = !preloadedAgents?.length;
    if (!needAgents) return;

    setDataLoading(true);
    bridgeInvoke("get-team", {})
      .catch(() => [])
      .then((teamRes) => {
        if (cancelled) return;
        const agentList = Array.isArray(teamRes) ? (teamRes as TeamAgent[]) : [];
        setAgents(agentList);
        setDataLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, preloadedAgents]);

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const agentObj = assignedAgent
        ? agents.find((a) => a.id === assignedAgent)
        : undefined;

      const fields: Record<string, any> = {};
      if (trimmedTitle !== task.title) fields.title = trimmedTitle;
      if (description.trim() !== (task.description ?? "").trim())
        fields.description = description.trim();
      const newAgentName = agentObj?.name ?? undefined;
      const newAgentId = agentObj?.id ?? undefined;
      if (newAgentName !== task.assignedAgent)
        fields.assignedAgent = newAgentName ?? null;
      if ((newAgentId ?? null) !== (task.assignedAgentId ?? null))
        fields.assignedAgentId = newAgentId ?? null;

      if (Object.keys(fields).length > 0) {
        handleEditTask(task._id, fields);
      }
      handleDialogOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save task"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] gap-0 sm:rounded-xl p-0 overflow-hidden z-[101]"
        overlayClassName="z-[100]"
      >
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1.5 border-b border-border/40">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit task
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update task details and assignee.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto customScrollbar2">
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
              <Label htmlFor="edit-task-title" className="text-xs font-medium">
                Title
              </Label>
              <Input
                id="edit-task-title"
                placeholder="Task title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 text-sm bg-muted/30 border-border/60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                Assigned agent
              </Label>
              <Select
                value={assignedAgent || "__none__"}
                onValueChange={(v) =>
                  setAssignedAgent(v === "__none__" ? "" : v)
                }
                disabled={dataLoading}
              >
                <SelectTrigger className="h-9 bg-muted/30 border-border/60">
                  <SelectValue
                    placeholder={
                      dataLoading ? "Loading…" : "Select agent…"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value="__none__" className="text-xs text-muted-foreground">
                    None
                  </SelectItem>
                  {agents.map((agent) => {
                    const label = agent.name || agent.id || "Unnamed";
                    return (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        className="text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {label}
                          {agent.role && (
                            <span className="text-muted-foreground">
                              ({agent.role})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-task-desc" className="text-xs font-medium">
                Prompt description
              </Label>
              <Textarea
                ref={descRef}
                id="edit-task-desc"
                placeholder="Add a description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px] text-sm bg-muted/30 border-border/60 transition-[height] duration-150 ease-out"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !title.trim()}
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
