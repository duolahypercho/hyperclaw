import { useEffect, useMemo, useState } from "react";
import {
  listWorkflowTemplates,
  type BridgeWorkflowTemplate,
} from "$/lib/hyperclaw-bridge-client";
import {
  isWorkflowTemplateTrigger,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplateSeed,
} from "$/lib/workflow-templates";
import { readMetadataStringArray } from "$/lib/workflow-template-agent-assignment";
import type { WorkflowGalleryTemplate } from "../views/WorkflowTemplateGallery";

/**
 * Merge persisted SQLite templates (loaded from the connector) with the static
 * editorial starters in `WORKFLOW_TEMPLATES`. SQLite entries win on id collision
 * so a customer-authored template can shadow a built-in starter without
 * surprising the user with two cards that share an id.
 *
 * Returns:
 *  - `templates`        : merged list ready for `<WorkflowTemplateGallery />`
 *  - `persistedCount`   : how many SQLite templates we found (drives the
 *                         "TEMPLATE LIBRARY" vs "STARTERS" eyebrow in callers)
 *  - `loading`          : true while the first fetch is in flight
 */
export interface WorkflowTemplateLibrary {
  templates: WorkflowGalleryTemplate[];
  persistedCount: number;
  staticCount: number;
  totalCount: number;
  loading: boolean;
}

export function useWorkflowTemplateLibrary(): WorkflowTemplateLibrary {
  const [persistedTemplates, setPersistedTemplates] = useState<
    BridgeWorkflowTemplate[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listWorkflowTemplates()
      .then((templates) => {
        if (!cancelled) setPersistedTemplates(templates);
      })
      .catch(() => {
        if (!cancelled) setPersistedTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const templates = useMemo<WorkflowGalleryTemplate[]>(() => {
    const persisted: WorkflowTemplateSeed[] = persistedTemplates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      tagline: tpl.description || "Persisted workflow template ready to clone.",
      description: tpl.description,
      emoji: typeof tpl.preview?.emoji === "string" ? tpl.preview.emoji : "🧩",
      trigger: isWorkflowTemplateTrigger(tpl.preview?.trigger) ? tpl.preview.trigger : "manual",
      triggerLabel: tpl.category ? `SQLite · ${tpl.category}` : "SQLite template",
      suggestedRoles: readMetadataStringArray(tpl.metadata, "suggestedRoles"),
    }));
    const seen = new Set(persisted.map((tpl) => tpl.id));
    return [
      ...persisted.map((tpl) => ({ ...tpl, source: "sqlite" as const })),
      ...WORKFLOW_TEMPLATES.filter((tpl) => !seen.has(tpl.id)).map((tpl) => ({
        ...tpl,
        source: "static" as const,
      })),
    ];
  }, [persistedTemplates]);

  return {
    templates,
    persistedCount: persistedTemplates.length,
    staticCount: WORKFLOW_TEMPLATES.length,
    totalCount: templates.length,
    loading,
  };
}
