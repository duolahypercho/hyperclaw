"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Section } from "$/components/ensemble";
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplateSeed,
} from "$/lib/workflow-templates";

export type WorkflowGalleryTemplate = WorkflowTemplateSeed & {
  source?: "sqlite" | "static";
};

/**
 * `WorkflowTemplateGallery` is the empty-state experience on `/Tool/Workflows`.
 * Instead of a static "no workflows yet" banner, it surfaces six editorial
 * starter templates the user can scaffold with one click. Each card seeds the
 * editor (name, description, emoji, trigger) via `?template=<id>`, so the user
 * lands on a populated form they can review and rename instead of a blank one.
 *
 * The component is purely presentational — the parent provides:
 *   - `onPickTemplate(id)`    : navigate to /Tool/ProjectEditor?template=<id>
 *   - `onStartFromBlank()`    : navigate to /Tool/ProjectEditor with no seed
 *
 * Visual language re-uses the existing project-card grammar (`ens-prj-grid`,
 * `ens-prj-card`, `.pt`, `.ptitle`, `.pdesc`, `ens-pill`) so the gallery feels
 * like the same surface, not a different page.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

interface WorkflowTemplateGalleryProps {
  onPickTemplate: (id: string) => void;
  onStartFromBlank: () => void;
  templates?: WorkflowGalleryTemplate[];
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export function WorkflowTemplateGallery({
  onPickTemplate,
  onStartFromBlank,
  templates,
  eyebrow = "STARTERS",
  title = "Pick a template to start.",
  subtitle = "Six editorial starters, pre-wired with a trigger and an outline. We seed the editor — you keep the keyboard.",
}: WorkflowTemplateGalleryProps) {
  const galleryTemplates = templates ?? WORKFLOW_TEMPLATES.map((template) => ({ ...template, source: "static" as const }));
  return (
    <Section flat className="wfgallery">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-5"
      >
        {/* Eyebrow + headline + subline */}
        <motion.div variants={fadeUp} className="wfgallery-head">
          <div className="wfgallery-eyebrow">
            <Sparkles size={11} strokeWidth={2.25} />
            {eyebrow}
          </div>
          <h2 className="wfgallery-headline">{title}</h2>
          <p className="wfgallery-subline">
            {subtitle}
          </p>
        </motion.div>

        {/* Template card grid */}
        <motion.div variants={stagger} className="ens-prj-grid">
          {galleryTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onClick={() => onPickTemplate(tpl.id)}
            />
          ))}
        </motion.div>

        {/* Footer: blank-canvas escape hatch */}
        <motion.div
          variants={fadeUp}
          className="wfgallery-foot"
        >
          <span className="wfgallery-foot-label">
            Or start from a blank canvas —
          </span>
          <button
            type="button"
            className="wfgallery-blank-btn"
            onClick={onStartFromBlank}
          >
            Start from blank
            <ArrowRight size={13} strokeWidth={2} />
          </button>
        </motion.div>
      </motion.div>

      <GalleryStyles />
    </Section>
  );
}

interface TemplateCardProps {
  template: WorkflowGalleryTemplate;
  onClick: () => void;
}

function TemplateCard({ template, onClick }: TemplateCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="ens-prj-card wfgallery-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="pt">
        <span className="ens-pill idle">
          <span className="pdot" />
          {template.trigger}
        </span>
        <span className="meta wfgallery-trigger">{template.triggerLabel}</span>
      </div>

      <div className="ptitle">
        <span aria-hidden="true" style={{ fontSize: 18 }}>
          {template.emoji}
        </span>
        <span>{template.name}</span>
      </div>

      <div className="pdesc">{template.tagline}</div>

      <div className="wfgallery-cta">
        {template.source === "sqlite" ? "Clone template" : "Use template"}
        <ArrowRight size={11} strokeWidth={2.25} />
      </div>
    </motion.div>
  );
}

/**
 * Inline styles scoped to the gallery — keeps the component self-contained
 * and avoids polluting the global stylesheet with one-off classes.
 */
function GalleryStyles() {
  return (
    <style>{`
      .wfgallery {
        padding: 28px 24px;
      }

      .wfgallery-head {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .wfgallery-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-3);
        line-height: 1;
      }

      .wfgallery-headline {
        font-family: var(--font-serif, ui-serif, Georgia, serif);
        font-size: 26px;
        line-height: 1.15;
        font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--ink);
        margin: 2px 0 0;
      }

      .wfgallery-subline {
        font-size: 13.5px;
        line-height: 1.5;
        color: var(--ink-3);
        max-width: 52ch;
        margin: 0;
      }

      .wfgallery-card {
        cursor: pointer;
      }

      .wfgallery-trigger {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10.5px;
        color: var(--ink-3);
        letter-spacing: 0.02em;
      }

      .wfgallery-cta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed var(--line);
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-3);
        line-height: 1;
        transition: color 0.18s ease, gap 0.18s ease;
      }

      .wfgallery-card:hover .wfgallery-cta,
      .wfgallery-card:focus-visible .wfgallery-cta {
        color: var(--ink);
        gap: 8px;
      }

      .wfgallery-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 4px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
      }

      .wfgallery-foot-label {
        font-size: 12.5px;
        color: var(--ink-3);
        font-style: italic;
      }

      .wfgallery-blank-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper-2);
        color: var(--ink-2);
        font-size: 12.5px;
        font-weight: 500;
        cursor: pointer;
        transition: border-color 0.18s ease, color 0.18s ease,
          background 0.18s ease;
      }

      .wfgallery-blank-btn:hover {
        border-color: var(--line-strong);
        color: var(--ink);
        background: var(--paper-3);
      }
    `}</style>
  );
}
