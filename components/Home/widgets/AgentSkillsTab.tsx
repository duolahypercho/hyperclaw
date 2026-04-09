"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  BookOpen,
  Zap,
  Check,
  X,
  Loader2,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  FolderOpen,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/* ── Types ───────────────────────────────────────────────────── */

export interface AgentSkill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  /** "custom" = user-created, "hermes-bundle" = hermes profile, "system" = from ~/.claude/skills/ */
  source: "custom" | "hermes-bundle" | "system";
  /** For system skills: the original file path on disk */
  filePath?: string;
}

interface HermesBundle {
  name: string;
  description?: string;
  fileCount: number;
}

interface ClaudeSkillFile {
  name: string;        // slug, e.g. "tdd-workflow" (no .md extension)
  description?: string;
  path: string;        // absolute path on disk (returned by connector, used for display only)
}

/* ── localStorage skill store ────────────────────────────────── */

function storageKey(agentId: string) {
  return `hc-agent-skills:${agentId}`;
}

export function loadSkills(agentId: string): AgentSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(agentId));
    return raw ? (JSON.parse(raw) as AgentSkill[]) : [];
  } catch {
    return [];
  }
}

export function saveSkills(agentId: string, skills: AgentSkill[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(agentId), JSON.stringify(skills));
  } catch {
    /* storage full */
  }
}

/** Returns markdown of all enabled skills for injection into sends. */
export function getActiveSkillsContent(agentId: string): string {
  const skills = loadSkills(agentId).filter((s) => s.enabled && s.content.trim());
  if (skills.length === 0) return "";
  return skills
    .map((s) => `## Skill: ${s.name}\n\n${s.content.trim()}`)
    .join("\n\n---\n\n");
}

/* ── Runtime config ──────────────────────────────────────────── */

const RUNTIME_LABELS: Record<string, string> = {
  "hermes": "Hermes Agent",
  "claude-code": "Claude Code",
  "codex": "Codex",
  "openclaw": "OpenClaw",
};

const RUNTIME_DESCRIPTIONS: Record<string, string> = {
  "hermes": "Installed Hermes skill bundles from your profile, plus custom context skills.",
  "claude-code": "Skills from ~/.claude/skills/ selected for this project, plus custom context.",
  "codex": "Custom context injected into Codex sessions as system prompt.",
  "openclaw": "Custom context injected into OpenClaw agent conversations.",
};

/* ── Edit skill form ─────────────────────────────────────────── */

interface EditSkillFormProps {
  initial?: Partial<AgentSkill>;
  onSave: (name: string, content: string) => void;
  onCancel: () => void;
}

function EditSkillForm({ initial, onSave, onCancel }: EditSkillFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const valid = name.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
      <Input
        autoFocus
        placeholder="Skill name (e.g. Code Review Expert)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-xs"
      />
      <Textarea
        placeholder="Skill content — describe the behavior, context, or instructions for this skill…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="text-xs min-h-[80px] resize-none"
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={onCancel}>
          <X className="w-3 h-3 mr-1" />
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-6 text-xs px-2"
          disabled={!valid}
          onClick={() => onSave(name.trim(), content.trim())}
        >
          <Check className="w-3 h-3 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
}

/* ── Skill row ───────────────────────────────────────────────── */

interface SkillRowProps {
  skill: AgentSkill;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
  onSaveEdit: (name: string, content: string) => void;
  onCancelEdit: () => void;
}

function SkillRow({
  skill,
  onToggle,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}: SkillRowProps) {
  const [expanded, setExpanded] = useState(false);

  if (isEditing) {
    return (
      <EditSkillForm
        initial={skill}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
      />
    );
  }

  return (
    <div
      className={cn(
        "group rounded-lg border transition-colors",
        skill.enabled
          ? "border-primary/30 bg-primary/5"
          : "border-border/40 bg-muted/10 opacity-60"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {skill.source === "hermes-bundle" ? (
          <Package className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : skill.source === "system" ? (
          <BookOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Zap className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        )}

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => skill.content && setExpanded((p) => !p)}
        >
          <p className="text-xs font-medium truncate">{skill.name}</p>
          {!expanded && skill.content && (
            <p className="text-[10px] text-muted-foreground truncate">
              {skill.content.slice(0, 80)}
            </p>
          )}
          {!skill.content && skill.source === "system" && (
            <p className="text-[10px] text-muted-foreground/50 italic">
              Content loaded on enable
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {skill.source === "custom" && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(skill.id)}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Edit"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => onDelete(skill.id)}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                title="Delete"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          {skill.content && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted"
              title="Preview content"
            >
              <ChevronRight
                className={cn(
                  "w-2.5 h-2.5 text-muted-foreground transition-transform",
                  expanded && "rotate-90"
                )}
              />
            </button>
          )}
          <button
            onClick={() => onToggle(skill.id)}
            className="shrink-0"
            title={skill.enabled ? "Disable" : "Enable"}
          >
            {skill.enabled ? (
              <ToggleRight className="w-4 h-4 text-primary" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {expanded && skill.content && (
        <div className="px-3 pb-3">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-background/50 rounded p-2 border border-border/30 max-h-40 overflow-y-auto customScrollbar2">
            {skill.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Claude Code system skills section ──────────────────────── */

interface ClaudeSkillsSectionProps {
  agentId: string;
  projectPath?: string;
  skills: AgentSkill[];
  onSkillsChange: (next: AgentSkill[]) => void;
}

function ClaudeSkillsSection({
  agentId,
  projectPath,
  skills,
  onSkillsChange,
}: ClaudeSkillsSectionProps) {
  const [systemSkills, setSystemSkills] = useState<ClaudeSkillFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = (await bridgeInvoke("claude-skills-list", {
          ...(projectPath && { projectPath }),
        })) as { skills?: ClaudeSkillFile[]; error?: string };
        if (!cancelled) {
          if (res?.error) setError(res.error);
          else setSystemSkills(res?.skills ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Not supported by connector");
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectPath]);

  const toggleSystemSkill = useCallback(
    async (file: ClaudeSkillFile) => {
      const id = `system:${file.name}`;
      const existing = skills.find((s) => s.id === id);

      if (existing) {
        // Toggle existing entry
        const next = skills.map((s) =>
          s.id === id ? { ...s, enabled: !s.enabled } : s
        );
        onSkillsChange(next);
        saveSkills(agentId, next);
        return;
      }

      // First enable: fetch content then add
      setLoadingContent(id);
      try {
        const res = (await bridgeInvoke("claude-skill-read", {
          path: file.path,
        })) as { content?: string; error?: string };

        const content = res?.content ?? "";
        const next = [
          ...skills,
          {
            id,
            name: file.name,
            content,
            enabled: true,
            source: "system" as const,
            filePath: file.path,
          },
        ];
        onSkillsChange(next);
        saveSkills(agentId, next);
      } catch {
        // Add with empty content — will still show the toggle
        const next = [
          ...skills,
          {
            id,
            name: file.name,
            content: "",
            enabled: true,
            source: "system" as const,
            filePath: file.path,
          },
        ];
        onSkillsChange(next);
        saveSkills(agentId, next);
      } finally {
        setLoadingContent(null);
      }
    },
    [agentId, skills, onSkillsChange]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Scanning ~/.claude/skills/…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 py-2 text-xs text-muted-foreground">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p className="font-medium text-amber-500/90">Skill listing unavailable</p>
          <p className="text-[10px] mt-0.5 opacity-70">
            Connector doesn't support <code className="font-mono bg-muted px-0.5 rounded">claude-skills-list</code> yet.
            Add custom skills below in the meantime.
          </p>
        </div>
      </div>
    );
  }

  if (systemSkills.length === 0) {
    return (
      <div className="flex items-start gap-2 py-2 text-xs text-muted-foreground">
        <FolderOpen className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <div>
          <p>No skills found in <code className="font-mono text-[10px] bg-muted px-1 rounded">~/.claude/skills/</code></p>
          {projectPath && (
            <p className="text-[10px] opacity-70 mt-0.5">
              Also checked <code className="font-mono bg-muted px-0.5 rounded">{projectPath}/.claude/skills/</code>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {systemSkills.map((file) => {
        const id = `system:${file.name}`;
        const stored = skills.find((s) => s.id === id);
        const enabled = stored?.enabled ?? false;
        const isLoadingThis = loadingContent === id;

        return (
          <div
            key={file.name}
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
              enabled
                ? "border-primary/30 bg-primary/5"
                : "border-border/40 bg-muted/10 opacity-60"
            )}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium font-mono truncate">{file.name}</p>
              {file.description && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {file.description}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/50 truncate font-mono">
                {file.path}
              </p>
            </div>
            <button
              onClick={() => !isLoadingThis && toggleSystemSkill(file)}
              disabled={isLoadingThis}
              title={enabled ? "Disable for this agent" : "Enable for this agent"}
              className="shrink-0"
            >
              {isLoadingThis ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : enabled ? (
                <ToggleRight className="w-4 h-4 text-primary" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Hermes bundles section ──────────────────────────────────── */

function HermesBundlesSection({
  agentId,
  skills,
  onToggle,
}: {
  agentId: string;
  skills: AgentSkill[];
  onToggle: (id: string) => void;
}) {
  const [bundles, setBundles] = useState<HermesBundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("hermes-list-skills", { agentId })) as {
          skills?: HermesBundle[];
        };
        if (!cancelled) setBundles(res?.skills ?? []);
      } catch {
        if (!cancelled) setBundles([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading Hermes skill bundles…
      </div>
    );
  }

  if (bundles.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No Hermes skill bundles installed.{" "}
        <code className="font-mono text-[10px] bg-muted px-1 rounded">
          hermes skills install &lt;name&gt;
        </code>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {bundles.map((bundle) => {
        const skillId = `hermes-bundle:${bundle.name}`;
        const activeSkill = skills.find((s) => s.id === skillId);
        const enabled = activeSkill?.enabled ?? true;
        return (
          <div
            key={bundle.name}
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
              enabled
                ? "border-primary/30 bg-primary/5"
                : "border-border/40 bg-muted/10 opacity-60"
            )}
          >
            <Package className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium font-mono truncate">{bundle.name}</p>
              {bundle.description && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {bundle.description}
                </p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/60 shrink-0 mr-1">
              {bundle.fileCount} file{bundle.fileCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => onToggle(skillId)}
              title={enabled ? "Disable bundle" : "Enable bundle"}
            >
              {enabled ? (
                <ToggleRight className="w-4 h-4 text-primary" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main AgentSkillsTab ─────────────────────────────────────── */

interface AgentSkillsTabProps {
  agentId: string;
  runtime?: string;
  /** For Claude Code agents: the project directory path */
  projectPath?: string;
}

export function AgentSkillsTab({
  agentId,
  runtime = "openclaw",
  projectPath,
}: AgentSkillsTabProps) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    setSkills(loadSkills(agentId));
  }, [agentId]);

  const persistAndSet = useCallback(
    (next: AgentSkill[]) => {
      setSkills(next);
      saveSkills(agentId, next);
    },
    [agentId]
  );

  const toggleSkill = useCallback(
    (id: string) => {
      setSkills((prev) => {
        const existing = prev.find((s) => s.id === id);
        let next: AgentSkill[];
        if (existing) {
          next = prev.map((s) =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
          );
        } else if (id.startsWith("hermes-bundle:")) {
          next = [
            ...prev,
            {
              id,
              name: id.replace("hermes-bundle:", ""),
              content: "",
              enabled: false,
              source: "hermes-bundle" as const,
            },
          ];
        } else {
          return prev;
        }
        saveSkills(agentId, next);
        return next;
      });
    },
    [agentId]
  );

  const addSkill = useCallback(
    (name: string, content: string) => {
      const next = [
        ...skills,
        {
          id: `custom-${Date.now()}`,
          name,
          content,
          enabled: true,
          source: "custom" as const,
        },
      ];
      persistAndSet(next);
      setAddingNew(false);
    },
    [skills, persistAndSet]
  );

  const saveEdit = useCallback(
    (id: string, name: string, content: string) => {
      const next = skills.map((s) =>
        s.id === id ? { ...s, name, content } : s
      );
      persistAndSet(next);
      setEditingId(null);
    },
    [skills, persistAndSet]
  );

  const deleteSkill = useCallback(
    (id: string) => {
      persistAndSet(skills.filter((s) => s.id !== id));
    },
    [skills, persistAndSet]
  );

  const customSkills = skills.filter((s) => s.source === "custom");
  const activeCount = skills.filter((s) => s.enabled).length;
  const runtimeLabel = RUNTIME_LABELS[runtime] ?? runtime;
  const runtimeDesc = RUNTIME_DESCRIPTIONS[runtime] ?? "";
  const isClaudeCode = runtime === "claude-code";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/30">
        <p className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
          {runtimeDesc}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {activeCount > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {activeCount} active
            </span>
          )}
          <Button
            variant="ghost"
            size="iconSm"
            className="h-6 w-6"
            onClick={() => { setAddingNew(true); setEditingId(null); }}
            title="Add custom skill"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-3">
        <div className="flex flex-col gap-4">

          {/* ── Hermes bundles ── */}
          {runtime === "hermes" && (
            <section className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Installed Bundles
              </p>
              <HermesBundlesSection
                agentId={agentId}
                skills={skills}
                onToggle={toggleSkill}
              />
            </section>
          )}

          {/* ── Claude Code system skills ── */}
          {isClaudeCode && (
            <section className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  ~/.claude/skills/
                </p>
                {projectPath && (
                  <span className="text-[10px] text-muted-foreground/50 truncate font-mono">
                    + {projectPath}/.claude/skills/
                  </span>
                )}
              </div>
              <ClaudeSkillsSection
                agentId={agentId}
                projectPath={projectPath}
                skills={skills}
                onSkillsChange={setSkills}
              />
            </section>
          )}

          {/* ── Custom skills ── */}
          <section className="flex flex-col gap-1.5">
            {(customSkills.length > 0 || addingNew || !isClaudeCode) && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Custom Skills
              </p>
            )}

            {addingNew && (
              <EditSkillForm
                onSave={addSkill}
                onCancel={() => setAddingNew(false)}
              />
            )}

            {customSkills.length === 0 && !addingNew && (
              <div className="flex flex-col items-center justify-center py-5 text-center text-muted-foreground gap-2">
                <Zap className="w-6 h-6 opacity-25" />
                <p className="text-xs">No custom skills yet</p>
                <p className="text-[10px] opacity-70">
                  {isClaudeCode
                    ? "Add custom context that gets injected alongside the selected skills above."
                    : `Add skills to inject context into ${runtimeLabel} conversations.`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 mt-1"
                  onClick={() => setAddingNew(true)}
                >
                  <Plus className="w-3 h-3" />
                  Add skill
                </Button>
              </div>
            )}

            {customSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                onToggle={toggleSkill}
                onEdit={(id) => { setEditingId(id); setAddingNew(false); }}
                onDelete={deleteSkill}
                isEditing={editingId === skill.id}
                onSaveEdit={(name, content) => saveEdit(skill.id, name, content)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </section>

          {/* Active injection note */}
          {activeCount > 0 && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-muted/30 border border-border/30">
              <Zap className="w-3 h-3 shrink-0 text-primary mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                <span className="text-foreground font-medium">
                  {activeCount} skill{activeCount !== 1 ? "s" : ""} active
                </span>
                {" — "}
                {isClaudeCode
                  ? "their content is injected as system context via --append-system-prompt."
                  : `context injected into each ${runtimeLabel} conversation.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
