"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  Plus,
  Trash2,
  BookOpen,
  Zap,
  Loader2,
  FolderOpen,
  AlertCircle,
  Search,
  ToggleRight,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { OpenClawSkillsSection } from "./openclaw-skills/OpenClawSkillsSection";
import {
  normalizeAgentSkillsRuntime,
  type AgentSkillsRuntime,
} from "./agent-skills-runtime";
import { getActiveSkillsContent as getStoredActiveSkillsContent } from "./hooks/useAgentSkills";

/* ── Types ───────────────────────────────────────────────────── */

export interface AgentSkill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  source: "custom" | "hermes-bundle" | "system";
  filePath?: string;
}

interface HermesSkill {
  id: string;
  name: string;
  skillKey: string;
  description?: string;
  category: string;
}

interface ClaudeSkillFile {
  name: string;
  skillKey: string;
  description?: string;
  path: string;
  source?: "global" | "project";
}

interface CodexSkill {
  name: string;
  skillKey: string;
  description?: string;
  path?: string;
  source?: "global" | "project" | "system";
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

/** Compatibility wrapper for legacy chat hooks that still inject enabled custom skills. */
export function getActiveSkillsContent(agentId: string): string {
  return getStoredActiveSkillsContent(agentId);
}

/* ── Runtime config ──────────────────────────────────────────── */

type SupportedAgentSkillsRuntime = Exclude<AgentSkillsRuntime, "unsupported">;

const RUNTIME_LABELS: Record<SupportedAgentSkillsRuntime, string> = {
  hermes: "Hermes Agent",
  "claude-code": "Claude Code",
  codex: "Codex",
  openclaw: "OpenClaw",
};

const RUNTIME_DESCRIPTIONS: Record<SupportedAgentSkillsRuntime, string> = {
  hermes:
    "Installed Hermes skill bundles from ~/.hermes/skills/, plus custom context.",
  "claude-code":
    "Skills from ~/.claude/skills/ (global) and project-scoped skills.",
  codex: "Skills from ~/.codex/skills/ and project .agents/skills/ directory.",
  openclaw: "Skills from ~/.openclaw/skills/, plus custom context.",
};

/* ── Accordion section header ────────────────────────────────── */

function SectionTrigger({
  icon: Icon,
  title,
  count,
  activeCount,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  activeCount?: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-solid border-primary/10 bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <span className="truncate text-xs font-semibold text-foreground">
        {title}
      </span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 rounded-full border border-solid border-border/60 bg-muted/40 px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
      {activeCount !== undefined && activeCount > 0 && (
        <span className="shrink-0 rounded-full border border-solid border-primary/20 bg-primary/10 px-1.5 py-px text-[10px] font-medium tabular-nums text-primary">
          {activeCount} on
        </span>
      )}
    </div>
  );
}

/* ── Source badge ─────────────────────────────────────────────── */

function SourceBadge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "global" | "project" | "system";
}) {
  const styles = {
    default: "border-border/60 bg-muted/40 text-muted-foreground",
    global: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    project: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    system: "border-violet-500/20 bg-violet-500/10 text-violet-400",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-solid px-1.5 py-px text-[9px] font-medium",
        styles[variant],
      )}
    >
      {label}
    </span>
  );
}

/* ── Search input ────────────────────────────────────────────── */

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 border-solid border-border/50 bg-background/60 pl-8 pr-2 text-xs placeholder:text-muted-foreground/50 focus-visible:ring-primary/30"
      />
    </div>
  );
}

/* ── Category group ──────────────────────────────────────────── */

function CategoryGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest px-1">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ── Edit skill form ─────────────────────────────────────────── */

/* ── Inline form for creating skill files (Claude Code) ────────── */

function InlineSkillForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string, content: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const valid = name.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-solid border-primary/20 bg-primary/[0.04] p-3">
      <Input
        autoFocus
        placeholder="Skill file name (e.g. code-review)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && valid) onSave(name.trim(), ""); if (e.key === "Escape") onCancel(); }}
        className="h-8 border-solid border-border/50 bg-background/70 text-xs placeholder:text-muted-foreground/50 focus-visible:ring-primary/30"
      />
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={!valid}
          onClick={() => onSave(name.trim(), "")}
        >
          Create
        </Button>
      </div>
    </div>
  );
}

/* ── Skill list item (shared by all runtime sections) ────────── */

function SkillListItem({
  icon: Icon = BookOpen,
  name,
  description,
  enabled,
  badge,
  badgeVariant,
  loading: isLoading,
  onToggle,
  onDelete,
  readOnly,
}: {
  icon?: React.ElementType;
  name: string;
  description?: string;
  enabled: boolean;
  badge?: string;
  badgeVariant?: "default" | "global" | "project" | "system";
  loading?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-xl border border-solid px-3 py-2.5 transition-all duration-200",
        enabled
          ? "border-border/70 bg-card/70 shadow-sm hover:border-primary/30"
          : "border-border/50 bg-muted/20 opacity-70 hover:opacity-90",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-solid transition-colors",
          enabled
            ? "border-primary/10 bg-primary/10"
            : "border-border/40 bg-muted/30",
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            enabled ? "text-primary" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-xs font-medium leading-tight text-foreground">
            {name}
          </p>
          {badge && <SourceBadge label={badge} variant={badgeVariant} />}
        </div>
        {description && (
          <p className="mt-1 line-clamp-2 min-w-0 max-w-full text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        )}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isLoading}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="Delete skill file"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : readOnly ? (
        <span className="shrink-0 rounded-full border border-solid border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
          loaded
        </span>
      ) : onToggle ? (
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
          title={enabled ? "Disable" : "Enable"}
        />
      ) : null}
    </div>
  );
}

/* ── Claude Code skills section ──────────────────────────────── */

function ClaudeSkillsSection({
  agentId,
  skills,
  onSkillsChange,
  onDiscoveredCount,
}: {
  agentId: string;
  skills: AgentSkill[];
  onSkillsChange: (next: AgentSkill[]) => void;
  onDiscoveredCount?: (count: number) => void;
}) {
  const [systemSkills, setSystemSkills] = useState<ClaudeSkillFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSkillId, setLoadingSkillId] = useState<string | null>(null);
  const [addingSkill, setAddingSkill] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = (await bridgeInvoke("claude-skills-list", {
          agentId,
        })) as { skills?: ClaudeSkillFile[]; error?: string };
        if (!cancelled) {
          if (res?.error) {
            setError(res.error);
            onDiscoveredCount?.(0);
          } else {
            const fetched = res?.skills ?? [];
            setSystemSkills(fetched);
            onDiscoveredCount?.(fetched.length);
          }
        }
      } catch (err) {
        if (!cancelled) {
          onDiscoveredCount?.(0);
          setError(
            err instanceof Error
              ? err.message
              : "Bridge action not supported",
          );
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, onDiscoveredCount]);

  useEffect(() => {
    return reload();
  }, [reload]);

  const toggleSkill = useCallback(
    async (file: ClaudeSkillFile) => {
      const skillKey = file.skillKey || file.name;
      const id = `system:${skillKey}`;
      const existing = skills.find((s) => s.id === id);
      if (existing) {
        const next = skills.map((s) =>
          s.id === id ? { ...s, enabled: !s.enabled } : s,
        );
        onSkillsChange(next);
        saveSkills(agentId, next);
        return;
      }
      setLoadingSkillId(id);
      try {
        const res = (await bridgeInvoke("claude-skill-read", {
          agentId,
          name: skillKey,
        })) as { content?: string };
        const next = [
          ...skills,
          {
            id,
            name: file.name,
            content: res?.content ?? "",
            enabled: true,
            source: "system" as const,
            filePath: file.path,
          },
        ];
        onSkillsChange(next);
        saveSkills(agentId, next);
      } catch {
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
        setLoadingSkillId(null);
      }
    },
    [agentId, skills, onSkillsChange],
  );

  const createSkill = useCallback(
    async (name: string, content: string) => {
      setLoadingSkillId("creating");
      try {
        await bridgeInvoke("claude-skill-write", { agentId, name, content });
        const id = `system:${name}`;
        const next = [
          ...skills.filter((s) => s.id !== id),
          { id, name, content, enabled: true, source: "system" as const },
        ];
        onSkillsChange(next);
        saveSkills(agentId, next);
        setAddingSkill(false);
        reload();
      } catch {
        /* silently fail */
      } finally {
        setLoadingSkillId(null);
      }
    },
    [agentId, skills, onSkillsChange, reload],
  );

  const deleteSkill = useCallback(
    async (name: string) => {
      const id = `system:${name}`;
      setLoadingSkillId(id);
      try {
        await bridgeInvoke("claude-skill-delete", { agentId, name });
        const next = skills.filter((s) => s.id !== id);
        onSkillsChange(next);
        saveSkills(agentId, next);
        setSystemSkills((prev) => prev.filter((s) => s.name !== name));
      } catch {
        /* ignore */
      } finally {
        setLoadingSkillId(null);
      }
    },
    [agentId, skills, onSkillsChange],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading project skills...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-solid border-amber-500/20 bg-amber-500/[0.04] px-3 py-3">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p className="text-xs font-medium text-amber-400">
            Skills unavailable
          </p>
          <p className="text-[10px] mt-1 text-muted-foreground">
            Update the connector to enable{" "}
            <code className="rounded bg-muted/50 px-1 py-px font-mono text-[9px]">
              claude-skills-list
            </code>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {systemSkills.map((file) => {
        const skillKey = file.skillKey || file.name;
        const id = `system:${skillKey}`;
        const stored = skills.find((s) => s.id === id);
        const enabled = stored?.enabled ?? false;
        const isLoadingThis = loadingSkillId === id;
        const isGlobal = file.source === "global";
        return (
          <SkillListItem
            key={skillKey}
            icon={BookOpen}
            name={file.name}
            description={file.description}
            enabled={enabled}
            badge={isGlobal ? "global" : undefined}
            badgeVariant="global"
            loading={isLoadingThis}
            onToggle={() => toggleSkill(file)}
            onDelete={
              !isGlobal
                ? () => !isLoadingThis && deleteSkill(skillKey)
                : undefined
            }
          />
        );
      })}
      {systemSkills.length === 0 && !addingSkill && (
        <div className="flex flex-col items-center py-5 text-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
            <FolderOpen className="w-5 h-5 text-muted-foreground/30" />
          </div>
          <p className="text-xs text-muted-foreground">No skills found</p>
          <p className="text-[10px] text-muted-foreground/50">
            <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">
              ~/.claude/skills/
            </code>
          </p>
        </div>
      )}
      {addingSkill ? (
        <InlineSkillForm
          onSave={createSkill}
          onCancel={() => setAddingSkill(false)}
        />
      ) : (
        <button
          className="flex w-full items-center gap-2 rounded-xl border border-solid border-border/50 px-3 py-2 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/[0.03] hover:text-foreground"
          onClick={() => setAddingSkill(true)}
          disabled={loadingSkillId === "creating"}
        >
          <Plus className="w-3 h-3" />
          New skill file
        </button>
      )}
    </div>
  );
}

/* ── Hermes skills section ───────────────────────────────────── */

function HermesSkillsSection({
  agentId,
  skills,
  onToggle,
  onDiscoveredCount,
}: {
  agentId: string;
  skills: AgentSkill[];
  onToggle: (id: string) => void;
  onDiscoveredCount?: (count: number) => void;
}) {
  const [hermesSkills, setHermesSkills] = useState<HermesSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("hermes-list-skills", {
          agentId,
        })) as { skills?: HermesSkill[] };
        const fetched = res?.skills ?? [];
          if (!cancelled) {
            setHermesSkills(fetched);
            onDiscoveredCount?.(fetched.length);
          }
      } catch {
        if (!cancelled) {
          setHermesSkills([]);
          onDiscoveredCount?.(0);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, onDiscoveredCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading Hermes skills...
      </div>
    );
  }

  if (hermesSkills.length === 0) {
    return (
      <div className="flex flex-col items-center py-5 text-center gap-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
          <Package className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground">No Hermes skills found</p>
        <p className="text-[10px] text-muted-foreground/50">
          <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">
            ~/.hermes/skills/
          </code>
        </p>
      </div>
    );
  }

  const filtered = search.trim()
    ? hermesSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.skillKey.toLowerCase().includes(search.toLowerCase()) ||
          s.category.toLowerCase().includes(search.toLowerCase()) ||
          (s.description ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : hermesSkills;

  const byCategory: Record<string, HermesSkill[]> = {};
  for (const s of filtered) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {hermesSkills.length > 6 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${hermesSkills.length} skills...`}
        />
      )}
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No skills match &ldquo;{search}&rdquo;
        </p>
      )}
      {Object.entries(byCategory).map(([category, catSkills]) => (
        <CategoryGroup key={category} label={category}>
          {catSkills.map((skill) => {
            const skillId = `hermes:${skill.id}`;
            const activeSkill = skills.find((s) => s.id === skillId);
            const enabled = activeSkill?.enabled ?? true;
            return (
              <SkillListItem
                key={skill.skillKey || skill.id}
                icon={Package}
                name={skill.name}
                description={skill.description}
                enabled={enabled}
                onToggle={() => onToggle(skillId)}
              />
            );
          })}
        </CategoryGroup>
      ))}
    </div>
  );
}

/* ── Codex skills section ────────────────────────────────────── */

function CodexSkillsSection({
  skills,
  onToggle,
  projectPath,
  onDiscoveredCount,
}: {
  skills: AgentSkill[];
  onToggle: (id: string) => void;
  projectPath?: string;
  onDiscoveredCount?: (count: number) => void;
}) {
  const [codexSkills, setCodexSkills] = useState<CodexSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("codex-list-skills", {
          projectPath,
        })) as { skills?: CodexSkill[] };
        const fetched = res?.skills ?? [];
        if (!cancelled) {
          setCodexSkills(fetched);
          onDiscoveredCount?.(fetched.length);
        }
      } catch {
        if (!cancelled) {
          setCodexSkills([]);
          onDiscoveredCount?.(0);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath, onDiscoveredCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading Codex skills...
      </div>
    );
  }

  if (codexSkills.length === 0) {
    return (
      <div className="flex flex-col items-center py-5 text-center gap-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
          <BookOpen className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground">No Codex skills found</p>
        <p className="text-[10px] text-muted-foreground/50">
          <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">
            ~/.codex/skills/
          </code>
        </p>
      </div>
    );
  }

  const filtered = search.trim()
    ? codexSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.skillKey.toLowerCase().includes(search.toLowerCase()) ||
          (s.description ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : codexSkills;

  const systemGroup = filtered.filter((s) => s.source === "system");
  const globalGroup = filtered.filter((s) => s.source === "global");
  const projectGroup = filtered.filter((s) => s.source === "project");

  const renderGroup = (
    groupSkills: CodexSkill[],
    label: string,
    variant: "system" | "global" | "project",
  ) => {
    if (groupSkills.length === 0) return null;
    return (
      <CategoryGroup key={label} label={label}>
        {groupSkills.map((skill) => {
          const skillId = `codex:${skill.skillKey}`;
          const activeSkill = skills.find((s) => s.id === skillId);
          const enabled = activeSkill?.enabled ?? true;
          return (
            <SkillListItem
              key={skill.skillKey}
              icon={BookOpen}
              name={skill.name}
              description={skill.description}
              enabled={enabled}
              badge={variant}
              badgeVariant={variant}
              onToggle={() => onToggle(skillId)}
            />
          );
        })}
      </CategoryGroup>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {codexSkills.length > 6 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${codexSkills.length} skills...`}
        />
      )}
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No skills match &ldquo;{search}&rdquo;
        </p>
      )}
      {renderGroup(systemGroup, "System", "system")}
      {renderGroup(globalGroup, "Global", "global")}
      {renderGroup(projectGroup, "Project", "project")}
    </div>
  );
}

/* ── Workspace skills — project-scoped, agent-isolated ────────── */

interface WorkspaceSkill {
  name: string;
  skillKey: string;
  description?: string;
  path?: string;
}

function WorkspaceSkillsSection({
  agentId,
  runtime,
  projectPath,
}: {
  agentId: string;
  runtime: string;
  projectPath: string;
}) {
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let fetched: WorkspaceSkill[] = [];
      try {
        // Discover skills scoped to this agent's project directory.
        // Each runtime stores project skills differently:
        //   claude-code: {projectPath}/.claude/commands/
        //   codex:       {projectPath}/.agents/skills/
        //   openclaw:    {projectPath}/.openclaw/skills/
        //   hermes:      {projectPath}/.hermes/skills/
        const res = (await bridgeInvoke("workspace-skills-list", {
          agentId,
          runtime,
          projectPath,
        })) as { skills?: WorkspaceSkill[] };
        fetched = res?.skills ?? [];
      } catch {
        // Bridge action may not exist yet — that's fine, show empty state
      }
      if (!cancelled) {
        setSkills(fetched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, runtime, projectPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading workspace skills...
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center py-5 text-center gap-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
          <FolderOpen className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground">
          No workspace skills found
        </p>
        <p className="text-[10px] text-muted-foreground/50 max-w-[220px] leading-relaxed">
          Skills placed in this agent&apos;s project directory are isolated to this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {skills.map((skill) => (
        <SkillListItem
          key={skill.skillKey}
          icon={FolderOpen}
          name={skill.name}
          description={skill.description}
          enabled
          badge="workspace"
          badgeVariant="project"
          readOnly
        />
      ))}
    </div>
  );
}

/* ── Main AgentSkillsTab ─────────────────────────────────────── */

interface AgentSkillsTabProps {
  agentId: string;
  runtime?: string;
  projectPath?: string;
}

export function AgentSkillsTab({
  agentId,
  runtime = "openclaw",
  projectPath,
}: AgentSkillsTabProps) {
  const runtimeKey = normalizeAgentSkillsRuntime(runtime);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  // Track how many skills the runtime discovered — these are active by default
  // unless the user explicitly toggled them off in localStorage.
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const handleDiscoveredCount = useCallback((count: number) => {
    setDiscoveredCount(count);
  }, []);

  useEffect(() => {
    setSkills(loadSkills(agentId));
    setDiscoveredCount(0);
  }, [agentId]);

  const toggleSkill = useCallback(
    (id: string) => {
      setSkills((prev) => {
        const existing = prev.find((s) => s.id === id);
        let next: AgentSkill[];
        if (existing) {
          // Already in localStorage — flip its state
          next = prev.map((s) =>
            s.id === id ? { ...s, enabled: !s.enabled } : s,
          );
        } else {
          // First toggle on a discovered skill that defaults to active.
          // Create an entry with enabled=false to opt out.
          const source: AgentSkill["source"] = id.startsWith("hermes:")
            ? "hermes-bundle"
            : "system";
          const name = id.replace(/^(hermes|openclaw|codex):/, "").split("/").pop() ?? id;
          next = [...prev, { id, name, content: "", enabled: false, source }];
        }
        saveSkills(agentId, next);
        return next;
      });
    },
    [agentId],
  );

  const runtimeSkills = skills.filter((s) => s.source !== "custom");
  const isClaudeCode = runtimeKey === "claude-code";
  const isUnsupported = runtimeKey === "unsupported";
  // Discovered runtime skills default to active (enabled ?? true).
  // Count = discoveredCount minus those explicitly disabled in localStorage.
  const explicitlyDisabledCount = runtimeSkills.filter((s) => !s.enabled).length;
  const enabledRuntimeCount = runtimeSkills.filter((s) => s.enabled).length;
  const activeCount = isClaudeCode
    ? enabledRuntimeCount
    : Math.max(0, discoveredCount - explicitlyDisabledCount);
  const runtimeLabel = runtimeKey !== "unsupported" ? RUNTIME_LABELS[runtimeKey] : runtime;
  const runtimeDesc = runtimeKey !== "unsupported"
    ? RUNTIME_DESCRIPTIONS[runtimeKey]
    : "Skills are not available for this runtime yet.";
  const availableCount = discoveredCount || runtimeSkills.length;

  return (
    <div className="flex h-[min(760px,calc(100vh-260px))] min-h-[360px] flex-col overflow-hidden rounded-2xl border border-solid border-border/70 bg-card/80 shadow-sm">
      {/* Header */}
      <div className="shrink-0 border-b border-solid border-border/60 bg-background/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-solid border-primary/10 bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {runtimeLabel} Skills
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {runtimeDesc}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeCount > 0 && (
              <div className="flex items-center gap-1 rounded-full border border-solid border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                <ToggleRight className="h-3 w-3" />
                {activeCount} active
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden customScrollbar2 px-4 py-3">
        <Accordion
          type="multiple"
          defaultValue={["available", "workspace"]}
          className="space-y-2"
        >
          {/* Available (runtime) skills */}
          <AccordionItem
            value="available"
            className="overflow-hidden rounded-xl border border-solid border-border/60 bg-background/35 px-3"
          >
            <AccordionTrigger className="py-3 hover:no-underline [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted-foreground">
              <SectionTrigger
                icon={BookOpen}
                title={isClaudeCode ? "Available Skills" : "Installed Skills"}
                count={availableCount || undefined}
                activeCount={activeCount || undefined}
              />
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-0">
              {runtimeKey === "hermes" && (
                <HermesSkillsSection
                  agentId={agentId}
                  skills={skills}
                  onToggle={toggleSkill}
                  onDiscoveredCount={handleDiscoveredCount}
                />
              )}
              {runtimeKey === "openclaw" && (
                <OpenClawSkillsSection
                  agentId={agentId}
                  onDiscoveredCount={handleDiscoveredCount}
                />
              )}
              {runtimeKey === "codex" && (
                <CodexSkillsSection
                  skills={skills}
                  onToggle={toggleSkill}
                  projectPath={projectPath}
                  onDiscoveredCount={handleDiscoveredCount}
                />
              )}
              {isClaudeCode && (
                <ClaudeSkillsSection
                  agentId={agentId}
                  skills={skills}
                  onSkillsChange={setSkills}
                  onDiscoveredCount={handleDiscoveredCount}
                />
              )}
              {isUnsupported && (
                <div className="flex flex-col items-center py-5 text-center gap-2">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
                    <BookOpen className="w-5 h-5 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No skills loader for {runtimeLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 max-w-[220px] leading-relaxed">
                    This runtime does not expose a skill discovery bridge yet.
                  </p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Workspace skills — scoped to this agent's project */}
          {projectPath && (
            <AccordionItem
              value="workspace"
              className="overflow-hidden rounded-xl border border-solid border-border/60 bg-background/35 px-3"
            >
              <AccordionTrigger className="py-3 hover:no-underline [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted-foreground">
                <SectionTrigger
                  icon={FolderOpen}
                  title="Workspace Skills"
                />
              </AccordionTrigger>
              <AccordionContent className="pb-3 pt-0">
                <WorkspaceSkillsSection
                  agentId={agentId}
                  runtime={runtimeKey}
                  projectPath={projectPath}
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {/* Active injection note */}
        {activeCount > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-solid border-primary/10 bg-primary/[0.04] px-3 py-2.5">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Zap className="h-3 w-3 text-primary" />
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              <span className="text-foreground font-medium">
                {activeCount} skill{activeCount !== 1 ? "s" : ""} active
              </span>
              {" — loaded by the "}
              {runtimeLabel}
              {" runtime."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
