"use client";

import * as React from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { AgentGlyph } from "./agent-glyph";
import { AGENTS, TEMPLATES } from "./data";
import type { ProjectTemplate } from "./types";

interface ProjectFormProps {
  className?: string;
}

interface FormState {
  name: string;
  description: string;
  templateId: string;
  agentIds: string[];
}

const INITIAL_STATE: FormState = {
  name: "",
  description: "",
  templateId: TEMPLATES[0]?.id ?? "blank",
  agentIds: TEMPLATES[0]?.agents ?? [],
};

/**
 * ProjectForm — create-new wizard.
 * Two columns: form on the left, template + crew preview on the right.
 */
export function ProjectForm({ className }: ProjectFormProps) {
  const router = useRouter();
  const [state, setState] = React.useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = React.useState(false);

  const selectedTemplate: ProjectTemplate | undefined = TEMPLATES.find(
    (t) => t.id === state.templateId
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const onTemplateChange = (templateId: string) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    setState((prev) => ({
      ...prev,
      templateId,
      agentIds: tpl?.agents ?? prev.agentIds,
    }));
  };

  const toggleAgent = (id: string) => {
    setState((prev) => ({
      ...prev,
      agentIds: prev.agentIds.includes(id)
        ? prev.agentIds.filter((a) => a !== id)
        : [...prev.agentIds, id],
    }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.name.trim()) return;
    setSubmitting(true);
    // Mock create — wire to API later.
    setTimeout(() => {
      router.push("/Tool/Projects");
    }, 400);
  };

  const valid = state.name.trim().length > 0 && state.agentIds.length > 0;

  return (
    <div
      data-ensemble
      className={cn(
        "h-full overflow-y-auto bg-[var(--paper)] text-[var(--ink)]",
        className
      )}
    >
      <div className="mx-auto max-w-[1080px] px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href="/Tool/Projects" aria-label="Back to projects">
                <ArrowLeft size={14} />
              </Link>
            </Button>
            <div className="flex flex-col">
              <span
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-4)]"
                style={{ fontFamily: "var(--mono)" }}
              >
                Ensemble · New project
              </span>
              <h1
                className="text-[26px] font-semibold leading-tight tracking-[-0.02em]"
                style={{ fontFamily: "var(--display)" }}
              >
                Wire a new crew.
              </h1>
            </div>
          </div>
        </div>

        <Separator />

        <form
          onSubmit={onSubmit}
          className="grid gap-6 lg:grid-cols-[1fr_360px] mt-6"
        >
          {/* Left: form fields */}
          <div className="flex flex-col gap-5">
            <Field>
              <Label htmlFor="prj-name">Project name</Label>
              <Input
                id="prj-name"
                placeholder="e.g. Earnings brief"
                value={state.name}
                onChange={(e) => update("name", e.target.value)}
                autoFocus
                required
              />
            </Field>

            <Field>
              <Label htmlFor="prj-desc">Description</Label>
              <Textarea
                id="prj-desc"
                rows={3}
                placeholder="What does this crew do? One or two sentences."
                value={state.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>

            <Field>
              <Label>Starting template</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onTemplateChange(t.id)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-colors",
                      state.templateId === t.id
                        ? "border-[var(--ink)] bg-[var(--paper-2)]"
                        : "border-[var(--line)] bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[13px] font-semibold tracking-tight"
                        style={{ fontFamily: "var(--display)" }}
                      >
                        {t.name}
                      </span>
                      {state.templateId === t.id && (
                        <Check size={13} className="text-[var(--ink)]" />
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
                      {t.desc}
                    </p>
                    <div
                      className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]"
                      style={{ fontFamily: "var(--mono)" }}
                    >
                      {t.chain.join(" → ")}
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            <Field>
              <Label>Crew</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {AGENTS.map((agent) => {
                  const active = state.agentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-[var(--ink)] bg-[var(--paper-2)]"
                          : "border-[var(--line)] bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                      )}
                    >
                      <AgentGlyph agentId={agent.id} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold text-[var(--ink)]">
                            {agent.name}
                          </span>
                          {active && (
                            <Check size={13} className="text-[var(--ink)]" />
                          )}
                        </div>
                        <span className="text-[10.5px] text-[var(--ink-3)] block">
                          {agent.title}
                        </span>
                        <p className="text-[11px] text-[var(--ink-3)] line-clamp-2 mt-1">
                          {agent.tagline}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button asChild variant="ghost" size="lg">
                <Link href="/Tool/Projects">Cancel</Link>
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!valid || submitting}
              >
                {submitting ? "Wiring…" : "Create project"}
              </Button>
            </div>
          </div>

          {/* Right: preview */}
          <aside className="rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-5 h-fit sticky top-6">
            <span
              className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-4)]"
              style={{ fontFamily: "var(--mono)" }}
            >
              Preview
            </span>
            <h3
              className="mt-1 text-[18px] font-semibold tracking-tight text-[var(--ink)]"
              style={{ fontFamily: "var(--display)" }}
            >
              {state.name || "Untitled project"}
            </h3>
            <p className="text-[12px] text-[var(--ink-3)] leading-relaxed mt-1 min-h-[36px]">
              {state.description || "No description yet."}
            </p>

            <Separator className="my-3" />

            <div>
              <span
                className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]"
                style={{ fontFamily: "var(--mono)" }}
              >
                Flow
              </span>
              <div
                className="mt-1 text-[12px] text-[var(--ink-2)]"
                style={{ fontFamily: "var(--mono)" }}
              >
                {selectedTemplate?.chain.join(" → ") ?? "—"}
              </div>
            </div>

            <Separator className="my-3" />

            <div>
              <span
                className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]"
                style={{ fontFamily: "var(--mono)" }}
              >
                Crew · {state.agentIds.length}
              </span>
              <ul className="mt-2 flex flex-wrap gap-2">
                {state.agentIds.length === 0 && (
                  <span className="text-[12px] text-[var(--ink-3)]">
                    Pick at least one agent.
                  </span>
                )}
                {state.agentIds.map((id) => (
                  <AgentGlyph key={id} agentId={id} size="md" />
                ))}
              </ul>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}
