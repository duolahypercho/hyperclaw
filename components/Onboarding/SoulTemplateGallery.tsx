"use client";

/**
 * SoulTemplateGallery
 *
 * Browse and edit curated SOUL.md templates. When the user picks one,
 * we hand the full template back to the caller which fills the agent-
 * creation form. The canonical content is then transformed per-runtime by
 * `renderTemplateForRuntime` at submit time.
 *
 * Data source: `/public/soul-templates.json` (static asset, no API).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ExternalLink,
  ArrowLeft,
  X,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  loadSoulTemplates,
  filterTemplates,
  listCategories,
  attributionUrl,
  type SoulTemplate,
  type SoulTemplateCatalog,
} from "$/lib/soul-templates";

/* ── Props ───────────────────────────────────────────────────────────────── */

export interface SoulTemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called when the user confirms a template. The caller is expected to
   * prefill the agent-creation form with `name`, `role`, `emoji`,
   * `description`, and stash the full template for later render via
   * `renderTemplateForRuntime`.
   */
  onSelect: (template: SoulTemplate) => void;
}

/* ── Category labels ─────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  development: "Development",
  "customer-success": "Customer Success",
  productivity: "Productivity",
  marketing: "Marketing",
  finance: "Finance",
  hr: "HR",
  devops: "DevOps",
  data: "Data",
  automation: "Automation",
  legal: "Legal",
  healthcare: "Healthcare",
};

function labelFor(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */

export function SoulTemplateGallery({
  open,
  onOpenChange,
  onSelect,
}: SoulTemplateGalleryProps) {
  const [catalog, setCatalog] = useState<SoulTemplateCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadSoulTemplates()
      .then((data) => {
        if (!cancelled) {
          setCatalog(data);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset editor when dialog closes.
  useEffect(() => {
    if (!open) {
      setSelectedSlug(null);
      setQuery("");
      setCategory("all");
    }
  }, [open]);

  const categories = useMemo(() => {
    if (!catalog) return ["all"];
    return ["all", ...listCategories(catalog)];
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    return filterTemplates(catalog, { category, query });
  }, [catalog, category, query]);

  const selectedTemplate = useMemo(() => {
    if (!catalog || !selectedSlug) return null;
    return catalog.templates.find((t) => t.slug === selectedSlug) ?? null;
  }, [catalog, selectedSlug]);

  const handleUseTemplate = useCallback(
    (template: SoulTemplate) => {
      onSelect(template);
      onOpenChange(false);
    },
    [onOpenChange, onSelect],
  );

  const handleBackToGallery = useCallback(() => {
    setSelectedSlug(null);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: catalog?.templates.length ?? 0 };
    if (!catalog) return counts;
    for (const t of catalog.templates) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    return counts;
  }, [catalog]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[960px] w-[95vw] h-[82vh] p-0 gap-0 overflow-hidden flex flex-col"
        aria-describedby="soul-gallery-desc"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border border-solid border-l-0 border-r-0 border-t-0 flex-row items-center gap-3 space-y-0">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base">SOUL Template Gallery</DialogTitle>
            <DialogDescription id="soul-gallery-desc" className="text-xs mt-0.5">
              Pick a battle-tested personality for your agent. You can edit everything afterwards.
            </DialogDescription>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] font-normal">
            {catalog?.templates.length ?? 0} templates
          </Badge>
        </DialogHeader>

        {/* Editor view (in-place, not a nested dialog) */}
        <AnimatePresence mode="wait">
          {selectedTemplate ? (
            <TemplateEditor
              key={selectedTemplate.slug}
              template={selectedTemplate}
              onBack={handleBackToGallery}
              onUse={handleUseTemplate}
            />
          ) : (
            <motion.div
              key="gallery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex-1 flex min-h-0"
            >
              {/* Left rail: categories */}
              <aside className="w-[140px] sm:w-[180px] shrink-0 border-r border-l-0 border-t-0 border-b-0 border-border border-solid bg-muted/10">
                <ScrollArea className="h-full">
                  <nav className="py-3 px-2 space-y-0.5" aria-label="Template categories">
                    {categories.map((cat) => {
                      const isActive = category === cat;
                      const count = categoryCounts[cat] ?? 0;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategory(cat)}
                          className={[
                            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground/70 hover:bg-muted/40 hover:text-foreground",
                          ].join(" ")}
                        >
                          <span className="truncate">{labelFor(cat)}</span>
                          <span
                            className={[
                              "text-[10px] tabular-nums",
                              isActive ? "text-primary/70" : "text-muted-foreground/60",
                            ].join(" ")}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </ScrollArea>
              </aside>

              {/* Right: search + cards */}
              <section className="flex-1 flex flex-col min-w-0">
                <div className="px-5 py-3 border-b border-border border-solid border-l-0 border-r-0 border-t-0">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                    <Input
                      aria-label="Search templates"
                      placeholder="Search by name, role, or tag…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-9 h-9"
                      autoFocus
                    />
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-5">
                    {loadError ? (
                      <EmptyState
                        title="Couldn't load templates"
                        hint={loadError}
                      />
                    ) : !catalog ? (
                      <EmptyState title="Loading templates…" />
                    ) : filtered.length === 0 ? (
                      <EmptyState
                        title="No templates match"
                        hint="Try a different category or search term."
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filtered.map((t) => (
                          <TemplateCard
                            key={t.slug}
                            template={t}
                            onOpen={() => setSelectedSlug(t.slug)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */

interface TemplateCardProps {
  template: SoulTemplate;
  onOpen: () => void;
}

function TemplateCard({ template, onOpen }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative text-left rounded-xl border border-solid border-border/60 bg-card px-4 py-3.5 hover:border-primary/50 hover:bg-primary/[0.02] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate leading-tight">{template.name}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {template.description}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Badge
              variant="secondary"
              className="text-[9px] font-normal h-4 px-1.5 uppercase tracking-wide"
            >
              {labelFor(template.category)}
            </Badge>
            {template.isLocal && (
              <Badge
                variant="outline"
                className="text-[9px] font-normal h-4 px-1.5 uppercase tracking-wide border-primary/40 text-primary"
              >
                Custom
              </Badge>
            )}
            {template.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex h-4 shrink-0 items-center text-[10px] leading-none text-muted-foreground/80"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Editor ──────────────────────────────────────────────────────────────── */

interface TemplateEditorProps {
  template: SoulTemplate;
  onBack: () => void;
  onUse: (template: SoulTemplate) => void;
}

function TemplateEditor({ template, onBack, onUse }: TemplateEditorProps) {
  const { slug, content: initialContent } = template;
  const [draftContent, setDraftContent] = useState(initialContent ?? "");
  const isCustomized = draftContent !== (initialContent ?? "");

  useEffect(() => {
    setDraftContent(initialContent ?? "");
  }, [slug, initialContent]);

  const sourceUrl = attributionUrl(template);
  const useEditedTemplate = useCallback(() => {
    onUse({
      ...template,
      content: draftContent,
    });
  }, [draftContent, onUse, template]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex-1 flex flex-col min-h-0"
    >
      {/* Compact identity header */}
      <div className="px-5 py-3 border-b border-border border-solid border-l-0 border-r-0 border-t-0 flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to templates"
          className="h-8 px-2 text-muted-foreground hover:text-foreground shrink-0"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="h-4 w-px bg-border" aria-hidden />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 text-xl leading-none" aria-hidden>
              {template.emoji}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h2 className="text-sm font-semibold text-foreground truncate">
                  {template.name}
                </h2>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {template.role}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className="text-[9px] font-normal h-4 px-1.5 uppercase tracking-wide"
                >
                  {labelFor(template.category)}
                </Badge>
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-muted-foreground/80"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <Badge
              variant="outline"
              aria-hidden={!isCustomized}
              className={[
                "mt-0.5 h-4 px-1.5 text-[9px] font-normal border-primary/40 text-primary transition-opacity",
                isCustomized ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              Customized
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View source
              </a>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isCustomized}
              onClick={() => setDraftContent(initialContent ?? "")}
              className="h-7 px-2 text-[11px]"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Full-container Markdown editor. */}
      <div className="flex flex-1 min-h-0 flex-col bg-muted/20">
        <div className="flex h-8 shrink-0 items-center border-b border-border/60 bg-background/70 px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          SOUL.md
        </div>
        <textarea
          autoFocus
          value={draftContent}
          onChange={(event) => setDraftContent(event.target.value)}
          spellCheck={false}
          aria-label={`${template.name} SOUL.md editor`}
          className="flex-1 min-h-0 w-full resize-none border-0 bg-transparent px-5 py-4 font-mono text-[12.5px] leading-6 text-foreground/90 outline-none placeholder:text-muted-foreground/50 focus:ring-0"
          placeholder="Write this agent's SOUL.md..."
        />
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-3 bg-background">
        <Button size="sm" onClick={useEditedTemplate}>
          Use {isCustomized ? "edited" : "this"} template
        </Button>
      </div>
    </motion.div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
      <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center">
        <X className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-foreground/80">{title}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
