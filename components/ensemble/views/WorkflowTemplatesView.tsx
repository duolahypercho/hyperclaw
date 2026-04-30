"use client";

import React from "react";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";
import { EnsShell } from "$/components/ensemble";
import { WorkflowTemplateGallery } from "./WorkflowTemplateGallery";
import { useWorkflowTemplateLibrary } from "../hooks/useWorkflowTemplateLibrary";

/**
 * `WorkflowTemplatesView` is the dedicated page that hosts the full workflow
 * template library. It exists so the Workflows index can stay focused on the
 * user's *own* workflows once they have any — and still give them (and any
 * agent) a one-click path back into the gallery to start a new one from a
 * reference template.
 *
 * Behaviour mirrors the Workflows empty-state gallery:
 *   - Picking a template seeds the editor via `?template=<id>`
 *   - "Start from blank" routes to a clean editor
 *
 * Persisted SQLite templates and built-in starters merge into one list
 * via `useWorkflowTemplateLibrary`, so humans and agents see the same
 * workflow language.
 */
export default function WorkflowTemplatesView() {
  const router = useRouter();
  const { templates, persistedCount, totalCount, loading } =
    useWorkflowTemplateLibrary();

  const eyebrow = persistedCount > 0 ? "TEMPLATE LIBRARY" : "STARTERS";
  const subtitle =
    persistedCount > 0
      ? "Persisted SQLite templates stay browsable alongside built-in starters, so humans and agents can clone the same workflow language."
      : "Built-in starters you can clone, rename, and rewire. Pick one as a reference and shape it into your own workflow.";

  return (
    <EnsShell>
      {/* Page header — back link + count of templates available */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <button
            type="button"
            onClick={() => router.push("/Tool/Workflows")}
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors mb-2"
          >
            <ArrowLeft size={12} strokeWidth={2.25} />
            Back to workflows
          </button>
          <h1
            className="ens-hero"
            style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}
          >
            Template library
          </h1>
          <p className="ens-sub mt-1">
            Browse every workflow template in one place. Pick one to seed a new
            workflow — the editor opens populated and waiting for you.
          </p>
        </div>
        {!loading && (
          <div
            className="text-[11px] uppercase tracking-[0.14em]"
            style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {totalCount} {totalCount === 1 ? "template" : "templates"} available
          </div>
        )}
      </div>

      <WorkflowTemplateGallery
        templates={templates}
        eyebrow={eyebrow}
        title="Pick a template to start."
        subtitle={subtitle}
        onPickTemplate={(id) =>
          router.push(`/Tool/ProjectEditor?template=${encodeURIComponent(id)}`)
        }
        onStartFromBlank={() => router.push("/Tool/ProjectEditor")}
      />
    </EnsShell>
  );
}
