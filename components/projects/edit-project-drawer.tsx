"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Pencil, Users } from "lucide-react";
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
import {
  useProjects,
  type Project as StoredProject,
  type ProjectMember,
} from "$/components/Tool/Projects/provider/projectsProvider";
import { useProjectAgentRoster } from "./use-agent-roster";
import {
  AgentMultiSelect,
  EmojiPicker,
  EmptyAgentRoster,
  LeadAgentSelect,
} from "./project-drawer-parts";

export interface EditProjectDrawerProps {
  /**
   * Id of the project being edited. When null, the drawer is closed. The
   * drawer self-resolves the live `StoredProject` from `useProjects()` so the
   * form always seeds from the freshest store snapshot — no risk of editing a
   * stale name/lead captured at the moment the menu was opened.
   */
  projectId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Fired once the patch + member diff have all settled successfully. */
  onSaved?: (project: StoredProject) => void;
}

const DEFAULT_EMOJI = "📁";

/**
 * Right-side drawer for editing an existing project. Mirrors
 * `CreateProjectDrawer` (same Sheet shell, same shared parts) so the surface
 * feels native — only the title, header icon, submit copy, and write
 * semantics differ.
 *
 * On submit we compute the minimal patch:
 *  - `updateProject` only carries fields the user actually changed (name,
 *    description, emoji, leadAgentId).
 *  - Member diff: anyone added since open → `addMember(builder)`; anyone
 *    removed → `removeMember`. The lead is upserted as `addMember(lead)`
 *    when it changes (the bridge upserts on `(projectId, agentId)` so this
 *    converts an existing builder to lead without a delete + re-add round
 *    trip).
 *  - Old lead, if no longer in the crew, is explicitly removed from the
 *    members table so the lead transition doesn't leave a stranded row.
 */
export function EditProjectDrawer({
  projectId,
  onOpenChange,
  onSaved,
}: EditProjectDrawerProps) {
  const { projects, updateProject, addMember, removeMember } = useProjects();
  const { agents, hasAgents } = useProjectAgentRoster();

  // Always re-resolve from the live store list so the form sees fresh
  // members/lead even if the parent passed an old projectId reference.
  const project = React.useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const open = Boolean(projectId);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [emoji, setEmoji] = React.useState(DEFAULT_EMOJI);
  const [leadAgentId, setLeadAgentId] = React.useState<string | null>(null);
  const [memberIds, setMemberIds] = React.useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Snapshot of the project state when the drawer opened. We keep it around
  // in a ref so the submit handler can compute "added since open" and
  // "removed since open" diffs without depending on whatever the live
  // store currently looks like (which could be mid-mutation if the user
  // hammered Save).
  const baselineRef = React.useRef<{
    name: string;
    description: string;
    emoji: string;
    leadAgentId: string | null;
    memberIds: Set<string>;
  } | null>(null);

  // Seed the form whenever the drawer opens against a project. We seed off
  // `project.id` rather than `project` itself so a benign re-render of the
  // store snapshot doesn't blow away the user's in-progress typing.
  React.useEffect(() => {
    if (!open) {
      baselineRef.current = null;
      return;
    }
    if (!project) return;

    const members = (project.members ?? []) as ProjectMember[];
    const memberSet = new Set<string>();
    for (const m of members) {
      // Skip the lead — they're tracked separately in `leadAgentId`. Members
      // we surface in the multi-select are the *non-lead* crew (matches the
      // create drawer's mental model).
      if (m.agentId !== project.leadAgentId) memberSet.add(m.agentId);
    }

    setName(project.name ?? "");
    setDescription(project.description ?? "");
    setEmoji(project.emoji?.trim() ? project.emoji : DEFAULT_EMOJI);
    setLeadAgentId(project.leadAgentId ?? null);
    setMemberIds(memberSet);
    setSubmitting(false);
    setError(null);

    baselineRef.current = {
      name: project.name ?? "",
      description: project.description ?? "",
      emoji: project.emoji?.trim() ? project.emoji : DEFAULT_EMOJI,
      leadAgentId: project.leadAgentId ?? null,
      memberIds: new Set(memberSet),
    };
    // Intentionally only re-seed when the drawer opens or the *project id*
    // changes — not on every store re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  const selectedCrew = React.useMemo(() => {
    const lead = agents.find((agent) => agent.id === leadAgentId);
    const members = agents.filter(
      (agent) => agent.id !== leadAgentId && memberIds.has(agent.id),
    );
    return lead ? [lead, ...members] : members;
  }, [agents, leadAgentId, memberIds]);

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
  const trimmedDescription = description.trim();

  // We compute "isDirty" against the open-time baseline — that way the Save
  // button stays disabled until the user actually moves something, even if
  // the live store has churned underneath them (e.g. another tab editing
  // the same project).
  const isDirty = React.useMemo(() => {
    const base = baselineRef.current;
    if (!base) return false;
    if (trimmedName !== base.name.trim()) return true;
    if (trimmedDescription !== base.description.trim()) return true;
    if (emoji !== base.emoji) return true;
    if (leadAgentId !== base.leadAgentId) return true;
    if (memberIds.size !== base.memberIds.size) return true;
    for (const id of memberIds) {
      if (!base.memberIds.has(id)) return true;
    }
    return false;
  }, [emoji, leadAgentId, memberIds, trimmedDescription, trimmedName]);

  const canSubmit =
    open &&
    !submitting &&
    hasAgents &&
    !!project &&
    trimmedName.length > 0 &&
    !!leadAgentId &&
    isDirty;

  const handleSubmit = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit || !project || !leadAgentId) return;

      const base = baselineRef.current;
      if (!base) return;

      setSubmitting(true);
      setError(null);

      try {
        // 1. Build a minimal patch — only the fields the user touched make
        //    the trip to the bridge.
        const patch: Parameters<typeof updateProject>[1] = {};
        if (trimmedName !== base.name.trim()) patch.name = trimmedName;
        if (trimmedDescription !== base.description.trim()) {
          patch.description = trimmedDescription;
        }
        if (emoji !== base.emoji) patch.emoji = emoji;
        if (leadAgentId !== base.leadAgentId) patch.leadAgentId = leadAgentId;

        // 2. Member diff. We treat the lead specially:
        //    - If the lead changed, the new lead must be upserted with
        //      role="lead" (works whether they were a builder or absent).
        //    - The old lead, if not retained as a builder via memberIds,
        //      gets removed so we don't leave a "lead" row pointing at an
        //      agent who is no longer the project's lead.
        const additions: string[] = [];
        const removals: string[] = [];

        for (const id of memberIds) {
          if (!base.memberIds.has(id)) additions.push(id);
        }
        for (const id of base.memberIds) {
          if (!memberIds.has(id)) removals.push(id);
        }

        const writes: Promise<unknown>[] = [];
        if (Object.keys(patch).length > 0) {
          writes.push(updateProject(project.id, patch));
        }

        if (leadAgentId !== base.leadAgentId) {
          // New lead → upsert as lead. If the same agent was a builder
          // before, this promotes the role server-side.
          writes.push(addMember(project.id, leadAgentId, "lead"));

          // Old lead → if not retained as a member, evict so the members
          // table doesn't keep a stale "lead" row.
          if (
            base.leadAgentId &&
            base.leadAgentId !== leadAgentId &&
            !memberIds.has(base.leadAgentId)
          ) {
            writes.push(removeMember(project.id, base.leadAgentId));
          }
        }

        for (const id of additions) {
          writes.push(addMember(project.id, id, "builder"));
        }
        for (const id of removals) {
          writes.push(removeMember(project.id, id));
        }

        const results = await Promise.all(writes);

        // updateProject returns the project (truthy on success); add/remove
        // member return booleans. A `false` boolean means the member write
        // didn't take — surface a soft error rather than failing the whole
        // edit since the metadata may already have saved.
        const failed = results.some((r) => r === false || r === null);
        if (failed) {
          setError("Saved with partial changes — some members didn't update.");
          setSubmitting(false);
          return;
        }

        // Resolve the freshest project snapshot for the callback. The
        // updateProject result is the most current; fall back to the
        // store list otherwise.
        const updated =
          (results.find(
            (r): r is StoredProject =>
              !!r && typeof r === "object" && "id" in (r as object),
          ) as StoredProject | undefined) ?? project;

        onSaved?.(updated);
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save changes.");
        setSubmitting(false);
      }
    },
    [
      addMember,
      canSubmit,
      emoji,
      leadAgentId,
      memberIds,
      onOpenChange,
      onSaved,
      project,
      removeMember,
      trimmedDescription,
      trimmedName,
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
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <SheetTitle className="ens-h2">Edit Project</SheetTitle>
              <SheetDescription className="ens-sub mt-0.5">
                Update the name, lead, and crew on this project.
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
            <Label htmlFor="prj-edit-name" className="ens-sh">
              Name & icon
            </Label>
            <div className="flex items-stretch gap-2">
              <EmojiPicker value={emoji} onChange={setEmoji} />
              <Input
                id="prj-edit-name"
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
            <Label htmlFor="prj-edit-desc" className="ens-sh">
              Description
            </Label>
            <Textarea
              id="prj-edit-desc"
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
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
