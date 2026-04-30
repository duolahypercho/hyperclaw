"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, FolderPlus, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useProjects, type Project } from "$/components/Tool/Projects/provider/projectsProvider";
import { useProjectAgentRoster } from "./use-agent-roster";
import {
  AgentMultiSelect,
  EmojiPicker,
  EmptyAgentRoster,
  LeadAgentSelect,
} from "./project-drawer-parts";

export interface CreateProjectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once after the project + lead + members are persisted. */
  onCreated?: (project: Project) => void;
}

/**
 * Right-side drawer for creating a new project. Mirrors the AddAgentDialog
 * sheet (`side="right" className="w-[480px]"`) so the surface feels native.
 *
 * The drawer always assigns a lead agent — the user picks one from the
 * database-backed roster (`useProjectAgentRoster`). Members are optional
 * extras; the lead is implicitly added as a member with role "lead".
 *
 * If the workspace has zero agents, the drawer renders an empty-state CTA
 * pointing at the agent onboarding flow rather than letting the user create
 * an unassignable project.
 */
export function CreateProjectDrawer({ open, onOpenChange, onCreated }: CreateProjectDrawerProps) {
  const { createProject, updateProject, addMember } = useProjects();
  const { agents, hasAgents } = useProjectAgentRoster();
  const { toast } = useToast();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [emoji, setEmoji] = React.useState("📁");
  const [leadAgentId, setLeadAgentId] = React.useState<string | null>(null);
  const [memberIds, setMemberIds] = React.useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedCrew = React.useMemo(
    () => {
      const lead = agents.find((agent) => agent.id === leadAgentId);
      const members = agents.filter((agent) => agent.id !== leadAgentId && memberIds.has(agent.id));
      return lead ? [lead, ...members] : members;
    },
    [agents, leadAgentId, memberIds],
  );

  // Reset form whenever the drawer opens. We intentionally avoid clearing on
  // close so a stray re-open during an in-flight submit doesn't blank the
  // user's typing.
  React.useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setEmoji("📁");
    setLeadAgentId(null);
    setMemberIds(new Set());
    setSubmitting(false);
    setError(null);
  }, [open]);

  // Default the lead to the first available agent so the form is ready to
  // submit on a single click for the common case (one or two agents).
  React.useEffect(() => {
    if (!open) return;
    if (leadAgentId) return;
    if (agents.length === 0) return;
    setLeadAgentId(agents[0].id);
  }, [agents, leadAgentId, open]);

  const handleLeadChange = React.useCallback((id: string) => {
    setLeadAgentId(id);
    setMemberIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleMember = React.useCallback((id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const trimmedName = name.trim();
  const canSubmit =
    !submitting && hasAgents && trimmedName.length > 0 && !!leadAgentId;

  const handleSubmit = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit || !leadAgentId) return;

      setSubmitting(true);
      setError(null);

      let created: Project | null = null;

      try {
        created = await createProject(
          trimmedName,
          description.trim(),
          emoji,
          "project",
        );
        if (!created) throw new Error("Failed to create project.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Project creation failed.");
        setSubmitting(false);
        return;
      }

      try {
        // Persist the lead in two places: the project's leadAgentId column
        // (for badges, default assignee derivation, etc.) and the members
        // table (so the lead also shows up in the crew roster). The two
        // writes are independent on the backend, so we run them in parallel.
        const memberWrites = [addMember(created.id, leadAgentId, "lead")];
        for (const id of memberIds) {
          if (id === leadAgentId) continue;
          memberWrites.push(addMember(created.id, id, "builder"));
        }

        const [leadUpdated, ...memberResults] = await Promise.all([
          updateProject(created.id, { leadAgentId }),
          ...memberWrites,
        ]);

        if (!leadUpdated || memberResults.some((ok) => ok === false)) {
          toast({
            title: "Project created",
            description: "Some setup details couldn't be saved. Open the project to retry.",
          });
        }
      } catch (err) {
        toast({
          title: "Project created",
          description: err instanceof Error
            ? err.message
            : "Some setup details couldn't be saved. Open the project to retry.",
        });
      }

      onCreated?.(created);
      onOpenChange(false);
    },
    [
      addMember,
      canSubmit,
      createProject,
      description,
      emoji,
      leadAgentId,
      memberIds,
      onCreated,
      onOpenChange,
      trimmedName,
      toast,
      updateProject,
    ],
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (submitting && !next) return;
      onOpenChange(next);
    },
    [onOpenChange, submitting],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="ensemble-root w-[520px] sm:w-[520px] flex flex-col gap-0 p-0 border-l border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--paper-2)] border border-[var(--line)] flex items-center justify-center text-[var(--ink)]">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <SheetTitle className="ens-h2">New Project</SheetTitle>
              <SheetDescription className="ens-sub mt-0.5">
                Pick a lead agent and (optionally) build a crew.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6"
        >
          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Identity ─────────────────────────────────────────────── */}
          <section className="space-y-2.5">
            <Label htmlFor="prj-name" className="ens-sh">
              Name & icon
            </Label>
            <div className="flex items-stretch gap-2">
              <EmojiPicker value={emoji} onChange={setEmoji} />
              <Input
                id="prj-name"
                placeholder="e.g. Earnings brief"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                className="h-9 flex-1 border-[var(--line)] bg-[var(--paper-2)] text-[13px]"
              />
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="prj-desc" className="ens-sh">
              Description
            </Label>
            <Textarea
              id="prj-desc"
              rows={3}
              placeholder="What does this crew do? One or two sentences."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none border-[var(--line)] bg-[var(--paper-2)] text-[13px]"
            />
          </section>

          {/* Lead picker (required) ───────────────────────────────── */}
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <Label className="ens-sh flex items-center gap-1.5">
                <Crown className="w-3 h-3" />
                Project lead
                <span className="text-destructive">*</span>
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Routes posts & owns issues
              </span>
            </div>

            {hasAgents ? (
              <LeadAgentSelect
                agents={agents}
                value={leadAgentId}
                onChange={handleLeadChange}
              />
            ) : (
              <EmptyAgentRoster onClose={() => onOpenChange(false)} />
            )}
          </section>

          {/* Member multi-select (optional) ───────────────────────── */}
          {hasAgents ? (
            <section className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <Label className="ens-sh flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  Agents
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {selectedCrew.length} selected
                </span>
              </div>
              <AgentMultiSelect
                agents={agents}
                leadAgentId={leadAgentId}
                selectedIds={memberIds}
                selectedAgents={selectedCrew}
                onToggle={toggleMember}
              />
            </section>
          ) : null}
        </form>

        <SheetFooter className="px-6 py-4 border-t border-[var(--line)] flex flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex-1"
          >
            {submitting ? "Creating…" : "Create project"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* Subcomponents (EmojiPicker, LeadAgentSelect, AgentMultiSelect,
   SelectedAgentChip, RosterAvatar, EmptyAgentRoster) live in
   `./project-drawer-parts` so the EditProjectDrawer can render the
   exact same surface without any copy-paste. */

