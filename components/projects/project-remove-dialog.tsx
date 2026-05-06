"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import type { Project } from "./types";

interface ProjectRemoveDialogProps {
  /** When set, the dialog is open and bound to this project. */
  project: Project | null;
  onClose: () => void;
}

/**
 * ProjectRemoveDialog — destructive confirmation step.
 *
 * Mirrors the rest of the destructive flows in the app: reuses the shadcn
 * AlertDialog so the affirmative button automatically picks up the
 * `destructive` button variant, and locks the dialog open while the bridge
 * call is in flight to prevent accidental double-deletes.
 *
 * Visual density matches the project card surface (`h-7`, `text-[12px]`,
 * `text-[12.5px]` description) so the alert reads as part of the same
 * family rather than a generic shadcn modal. Class overrides ride on top
 * of shadcn's `cn()` (twMerge), so the wrapper's outline/destructive
 * defaults get cleanly replaced instead of stacking.
 */
export function ProjectRemoveDialog({ project, onClose }: ProjectRemoveDialogProps) {
  const { deleteProject } = useProjects();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!project) {
      setSubmitting(false);
      setError(null);
    }
  }, [project]);

  const handleConfirm = React.useCallback(async () => {
    if (!project) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await deleteProject(project.id);
      if (!ok) {
        setError("Couldn't remove this project. Try again in a moment.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove project.");
      setSubmitting(false);
    }
  }, [deleteProject, onClose, project]);

  return (
    <AlertDialog
      open={Boolean(project)}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <AlertDialogContent className="max-w-[420px] gap-4 p-5 sm:rounded-xl">
        <AlertDialogHeader className="space-y-1">
          <AlertDialogTitle className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">
            Remove this project?
          </AlertDialogTitle>
          {/* Body uses `text-secondary` per the design tokens — pairs with
              the `border-border` cancel button so the modal sits inside the
              palette instead of leaning on the projects-page `--ink-*` ramp. */}
          <AlertDialogDescription className="text-[12.5px] leading-relaxed text-secondary-foreground">
            {project ? (
              <>
                This permanently deletes{" "}
                <strong className="font-semibold text-foreground">
                  {project.name}
                </strong>{" "}
                along with its workflow attachment and member assignments.
                Issues tracked under this project will remain available but
                will lose their project link.
              </>
            ) : (
              "This action cannot be undone."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="text-[12px] text-destructive" role="alert">
            {error}
          </p>
        )}

        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel
            disabled={submitting}
            className="mt-0 h-7 rounded-md border border-border bg-transparent px-3 py-0 text-[12px] font-medium text-secondary-foreground hover:bg-secondary/40 hover:text-foreground"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Stay open while the bridge call is in flight so the button can
              // surface the loading spinner — Radix would otherwise close the
              // dialog as soon as the action button is clicked.
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={submitting}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-destructive bg-destructive px-3 py-0 text-[12px] font-medium text-destructive-foreground hover:border-destructive hover:bg-destructive/85"
          >
            {submitting ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Removing…
              </>
            ) : (
              "Remove project"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
