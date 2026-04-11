"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  ChevronRight,
  FolderOpen,
  AlertCircle,
  Globe,
  Search,
  Sparkles,
  Download,
  Shield,
  ToggleRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { hubFetch } from "$/lib/hub-direct";

/* ── Types & sync hook ──────────────────────────────────────── */

// Re-export from the hook for backward compat
export type { AgentSkill } from "./hooks/useAgentSkills";
export { getActiveSkillsContent } from "./hooks/useAgentSkills";
import { useAgentSkills, type AgentSkill } from "./hooks/useAgentSkills";

// Legacy shims — other files may still import these; they read/write the same
// localStorage keys that the hook uses, so data stays in sync.
export function loadSkills(agentId: string): AgentSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`hc-agent-skills:${agentId}`);
    return raw ? (JSON.parse(raw) as AgentSkill[]) : [];
  } catch {
    return [];
  }
}
export function saveSkills(agentId: string, skills: AgentSkill[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`hc-agent-skills:${agentId}`, JSON.stringify(skills));
  } catch { /* storage full */ }
}

interface HermesSkill {
  id: string;
  name: string;
  skillKey: string;
  description?: string;
  category: string;
}

interface OpenClawSkill {
  name: string;
  skillKey: string;
  description?: string;
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

/* ── Runtime config ──────────────────────────────────────────── */

const RUNTIME_LABELS: Record<string, string> = {
  "hermes": "Hermes Agent",
  "claude-code": "Claude Code",
  "codex": "Codex",
  "openclaw": "OpenClaw",
};

const RUNTIME_DESCRIPTIONS: Record<string, string> = {
  "hermes": "Installed Hermes skill bundles from ~/.hermes/skills/, plus custom context.",
  "claude-code": "Skills from ~/.claude/skills/ (global) and project-scoped skills.",
  "codex": "Skills from ~/.codex/skills/ and project .agents/skills/ directory.",
  "openclaw": "Skills from ~/.openclaw/skills/, plus custom context.",
};

/* ── Section header ──────────────────────────────────────────── */

function SectionHeader({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-5 h-5 rounded bg-primary/10">
          <Icon className="w-3 h-3 text-primary" />
        </div>
        <p className="text-[11px] font-semibold text-foreground/80 tracking-wide">
          {title}
        </p>
        {count !== undefined && count > 0 && (
          <span className="text-[9px] bg-muted/60 text-muted-foreground px-1.5 py-px rounded-full tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Source badge ─────────────────────────────────────────────── */

function SourceBadge({ label, variant = "default" }: { label: string; variant?: "default" | "global" | "project" | "system" }) {
  const styles = {
    default: "bg-muted/50 text-muted-foreground",
    global: "bg-blue-500/10 text-blue-400",
    project: "bg-emerald-500/10 text-emerald-400",
    system: "bg-violet-500/10 text-violet-400",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-px rounded-full font-medium shrink-0", styles[variant])}>
      {label}
    </span>
  );
}

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
    <div className="flex flex-col gap-2.5 p-3 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/[0.04] to-transparent">
      <Input
        autoFocus
        placeholder="Skill name (e.g. Code Review Expert)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 text-xs bg-background/60 border-border/40 focus-visible:ring-primary/30"
      />
      <Textarea
        placeholder="Skill content -- describe the behavior, context, or instructions for this skill..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="text-xs min-h-[80px] resize-none bg-background/60 border-border/40 focus-visible:ring-primary/30"
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-muted-foreground" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs px-3"
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

/* ── Skill card ──────────────────────────────────────────────── */

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

  const iconMap: Record<string, typeof Package> = {
    "hermes-bundle": Package,
    system: BookOpen,
    custom: Sparkles,
  };
  const Icon = iconMap[skill.source] ?? Zap;

  return (
    <div
      className={cn(
        "group rounded-xl border transition-all duration-200",
        skill.enabled
          ? "border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          : "border-border/30 bg-muted/5 opacity-50 hover:opacity-70"
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className={cn(
            "flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors",
            skill.enabled
              ? "bg-primary/10"
              : "bg-muted/30"
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", skill.enabled ? "text-primary" : "text-muted-foreground")} />
        </div>

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => skill.content && setExpanded((p) => !p)}
        >
          <p className="text-xs font-medium truncate leading-tight">{skill.name}</p>
          {!expanded && skill.content && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-tight">
              {skill.content.slice(0, 80)}
            </p>
          )}
          {!skill.content && skill.source === "system" && (
            <p className="text-[10px] text-muted-foreground/40 italic mt-0.5">
              Content loaded on enable
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {skill.source === "custom" && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(skill.id)}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => onDelete(skill.id)}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
          {skill.content && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors"
              title="Preview content"
            >
              <ChevronRight
                className={cn(
                  "w-3 h-3 text-muted-foreground transition-transform duration-200",
                  expanded && "rotate-90"
                )}
              />
            </button>
          )}
          <Switch
            checked={skill.enabled}
            onCheckedChange={() => onToggle(skill.id)}
            title={skill.enabled ? "Disable" : "Enable"}
          />
        </div>
      </div>

      {expanded && skill.content && (
        <div className="px-3 pb-3 pt-0">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-background/80 rounded-lg p-3 border border-border/20 max-h-40 overflow-y-auto customScrollbar2 leading-relaxed">
            {skill.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Generic skill list item (used by runtime sections) ──────── */

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
}: {
  icon?: React.ElementType;
  name: string;
  description?: string;
  enabled: boolean;
  badge?: string;
  badgeVariant?: "default" | "global" | "project" | "system";
  loading?: boolean;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-200",
        enabled
          ? "border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          : "border-border/30 bg-muted/5 opacity-50 hover:opacity-70"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors",
          enabled ? "bg-primary/10" : "bg-muted/30"
        )}
      >
        <Icon className={cn("w-3.5 h-3.5", enabled ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate leading-tight">{name}</p>
          {badge && <SourceBadge label={badge} variant={badgeVariant} />}
        </div>
        {description && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-tight">{description}</p>
        )}
      </div>

      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={isLoading}
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
          title="Delete skill file"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          title={enabled ? "Disable" : "Enable"}
        />
      )}
    </div>
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
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 pl-7 pr-2 text-xs rounded-lg border border-border/40 bg-background/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

/* ── Category group ──────────────────────────────────────────── */

function CategoryGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest px-1">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ── Claude Code project-scoped skills section ───────────────── */

interface ClaudeSkillsSectionProps {
  agentId: string;
  skills: AgentSkill[];
  onToggleSkill: (id: string) => void;
  onUpsertSkill: (skill: AgentSkill) => void;
  onDeleteSkill: (id: string) => void;
}

function ClaudeSkillsSection({
  agentId,
  skills,
  onToggleSkill,
  onUpsertSkill,
  onDeleteSkill,
}: ClaudeSkillsSectionProps) {
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
        const res = (await bridgeInvoke("claude-skills-list", { agentId })) as {
          skills?: ClaudeSkillFile[];
          error?: string;
        };
        if (!cancelled) {
          if (res?.error) setError(res.error);
          else setSystemSkills(res?.skills ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Bridge action not supported");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  useEffect(() => {
    return reload();
  }, [reload]);

  const toggleSkill = useCallback(
    async (file: ClaudeSkillFile) => {
      const skillKey = file.skillKey || file.name;
      const id = `system:${skillKey}`;
      const existing = skills.find((s) => s.id === id);
      if (existing) {
        onToggleSkill(id);
        return;
      }
      // First enable: fetch content from connector, then upsert
      setLoadingSkillId(id);
      try {
        const res = (await bridgeInvoke("claude-skill-read", {
          agentId,
          name: skillKey,
        })) as { content?: string };
        onUpsertSkill({
          id,
          name: file.name,
          content: res?.content ?? "",
          enabled: true,
          source: "system",
          filePath: file.path,
        });
      } catch {
        onUpsertSkill({
          id,
          name: file.name,
          content: "",
          enabled: true,
          source: "system",
          filePath: file.path,
        });
      } finally {
        setLoadingSkillId(null);
      }
    },
    [agentId, skills, onToggleSkill, onUpsertSkill]
  );

  const createSkill = useCallback(
    async (name: string, content: string) => {
      setLoadingSkillId("creating");
      try {
        await bridgeInvoke("claude-skill-write", { agentId, name, content });
        const id = `system:${name}`;
        onUpsertSkill({ id, name, content, enabled: true, source: "system" });
        setAddingSkill(false);
        reload();
      } catch {
        // silently fail
      } finally {
        setLoadingSkillId(null);
      }
    },
    [agentId, onUpsertSkill, reload]
  );

  const deleteSkill = useCallback(
    async (name: string) => {
      const id = `system:${name}`;
      setLoadingSkillId(id);
      try {
        await bridgeInvoke("claude-skill-delete", { agentId, name });
        onDeleteSkill(id);
        setSystemSkills((prev) => prev.filter((s) => s.name !== name));
      } catch {
        /* ignore */
      } finally {
        setLoadingSkillId(null);
      }
    },
    [agentId, onDeleteSkill]
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
      <div className="flex items-start gap-2.5 py-3 px-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p className="text-xs font-medium text-amber-400">Skills unavailable</p>
          <p className="text-[10px] mt-1 text-muted-foreground">
            Update the connector to enable <code className="font-mono bg-muted/50 px-1 py-px rounded text-[9px]">claude-skills-list</code>.
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
            onDelete={!isGlobal ? () => !isLoadingThis && deleteSkill(skillKey) : undefined}
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
            <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">~/.claude/skills/</code>
          </p>
        </div>
      )}

      {addingSkill ? (
        <EditSkillForm
          onSave={createSkill}
          onCancel={() => setAddingSkill(false)}
        />
      ) : (
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border/40 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/[0.02] transition-all w-full"
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
}: {
  agentId: string;
  skills: AgentSkill[];
  onToggle: (id: string) => void;
}) {
  const [hermesSkills, setHermesSkills] = useState<HermesSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("hermes-list-skills", { agentId })) as {
          skills?: HermesSkill[];
        };
        if (!cancelled) setHermesSkills(res?.skills ?? []);
      } catch {
        if (!cancelled) setHermesSkills([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

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
          <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">~/.hermes/skills/</code>
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
          (s.description ?? "").toLowerCase().includes(search.toLowerCase())
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
        <p className="text-xs text-muted-foreground py-2 text-center">No skills match &ldquo;{search}&rdquo;</p>
      )}
      {Object.entries(byCategory).map(([category, catSkills]) => (
        <CategoryGroup key={category} label={category}>
          {catSkills.map((skill, idx) => {
            const skillId = `hermes:${skill.id}`;
            const activeSkill = skills.find((s) => s.id === skillId);
            const enabled = activeSkill?.enabled ?? false;
            return (
              <SkillListItem
                key={`${skill.id}-${idx}`}
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

/* ── OpenClaw skills section ─────────────────────────────────── */

function OpenClawSkillsSection({
  skills,
  onToggle,
}: {
  skills: AgentSkill[];
  onToggle: (id: string) => void;
}) {
  const [openclawSkills, setOpenclawSkills] = useState<OpenClawSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("openclaw-list-skills", {})) as {
          skills?: Array<{
            skillKey: string;
            name: string;
            description?: string;
          }>;
        };
        const mapped: OpenClawSkill[] = (res?.skills ?? []).map((s) => ({
          skillKey: s.skillKey,
          name: s.name,
          description: s.description,
        }));
        if (!cancelled) setOpenclawSkills(mapped);
      } catch {
        if (!cancelled) setOpenclawSkills([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading OpenClaw skills...
      </div>
    );
  }

  if (openclawSkills.length === 0) {
    return (
      <div className="flex flex-col items-center py-5 text-center gap-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
          <BookOpen className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground">No OpenClaw skills found</p>
        <p className="text-[10px] text-muted-foreground/50">
          <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">~/.openclaw/skills/</code>
        </p>
      </div>
    );
  }

  const filtered = search.trim()
    ? openclawSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.skillKey.toLowerCase().includes(search.toLowerCase()) ||
          (s.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : openclawSkills;

  return (
    <div className="flex flex-col gap-1.5">
      {openclawSkills.length > 6 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${openclawSkills.length} skills...`}
        />
      )}
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">No skills match &ldquo;{search}&rdquo;</p>
      )}
      {filtered.map((skill) => {
        const skillId = `openclaw:${skill.skillKey}`;
        const activeSkill = skills.find((s) => s.id === skillId);
        const enabled = activeSkill?.enabled ?? false;
        return (
          <SkillListItem
            key={skill.skillKey}
            icon={BookOpen}
            name={skill.name}
            description={skill.description}
            enabled={enabled}
            onToggle={() => onToggle(skillId)}
          />
        );
      })}
    </div>
  );
}

/* ── Codex skills section ────────────────────────────────────── */

function CodexSkillsSection({
  skills,
  onToggle,
  projectPath,
}: {
  skills: AgentSkill[];
  onToggle: (id: string) => void;
  projectPath?: string;
}) {
  const [codexSkills, setCodexSkills] = useState<CodexSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("codex-list-skills", { projectPath })) as {
          skills?: CodexSkill[];
        };
        if (!cancelled) setCodexSkills(res?.skills ?? []);
      } catch {
        if (!cancelled) setCodexSkills([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectPath]);

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
          <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">~/.codex/skills/</code>
        </p>
      </div>
    );
  }

  const filtered = search.trim()
    ? codexSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.skillKey.toLowerCase().includes(search.toLowerCase()) ||
          (s.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : codexSkills;

  const systemSkills = filtered.filter((s) => s.source === "system");
  const globalSkills = filtered.filter((s) => s.source === "global");
  const projectSkills = filtered.filter((s) => s.source === "project");

  const renderGroup = (groupSkills: CodexSkill[], label: string, variant: "system" | "global" | "project") => {
    if (groupSkills.length === 0) return null;
    return (
      <CategoryGroup key={label} label={label}>
        {groupSkills.map((skill) => {
          const skillId = `codex:${skill.skillKey}`;
          const activeSkill = skills.find((s) => s.id === skillId);
          const enabled = activeSkill?.enabled ?? false;
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
        <p className="text-xs text-muted-foreground py-2 text-center">No skills match &ldquo;{search}&rdquo;</p>
      )}
      {renderGroup(systemSkills, "System", "system")}
      {renderGroup(globalSkills, "Global", "global")}
      {renderGroup(projectSkills, "Project", "project")}
    </div>
  );
}

/* ── Marketplace result card ─────────────────────────────────── */

function MarketplaceCard({
  name,
  meta,
  installing,
  installed,
  onInstall,
}: {
  name: string;
  meta: string;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/30 bg-muted/[0.03] hover:bg-muted/[0.06] transition-colors">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/20 shrink-0">
        <Globe className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate leading-tight">{name}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-tight">
          {meta}
        </p>
      </div>
      <button
        onClick={() => { if (!installing && !installed) onInstall(); }}
        disabled={installing || installed}
        className={cn(
          "text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-all shrink-0 flex items-center gap-1",
          installed
            ? "border-primary/20 bg-primary/10 text-primary cursor-default"
            : installing
            ? "border-border/30 text-muted-foreground cursor-wait"
            : "border-border/40 bg-background hover:bg-muted/40 hover:border-primary/30 text-foreground"
        )}
      >
        {installing ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
        ) : installed ? (
          <><Check className="w-2.5 h-2.5" /> Saved</>
        ) : (
          <><Download className="w-2.5 h-2.5" /> Install</>
        )}
      </button>
    </div>
  );
}

/* ── Hypercho Cloud marketplace ──────────────────────────────── */

interface CloudSkill {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  version: string;
  downloads: number;
}

function HyperchoCloudSection({
  agentId,
  runtime,
}: {
  agentId: string;
  runtime: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CloudSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await hubFetch(`/api/cloud-skills/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { success?: boolean; data?: CloudSkill[] };
      setResults(json?.data ?? []);
    } catch {
      setError("Failed to reach Hypercho marketplace");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const install = useCallback(
    async (skill: CloudSkill) => {
      setInstallingId(skill._id);
      try {
        await bridgeInvoke("agent-skill-add", {
          agentId,
          name: skill.name,
          description: skill.description,
          content: "",
          source: "cloud",
          cloudId: skill._id,
          author: skill.author,
          version: skill.version,
          tags: skill.tags,
        });
        await hubFetch(`/api/cloud-skills/${skill._id}/install`, { method: "POST" });
        setInstalledIds((prev) => new Set([...prev, skill._id]));
      } catch {
        /* silent */
      }
      setInstallingId(null);
    },
    [agentId]
  );

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search Hypercho cloud skills..."
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Searching...
        </div>
      )}
      {error && <p className="text-xs text-destructive px-1">{error}</p>}
      {!loading && !error && results.length === 0 && query.trim() && (
        <p className="text-xs text-muted-foreground py-2 text-center">No results for &ldquo;{query}&rdquo;</p>
      )}
      {!loading && results.length === 0 && !query.trim() && (
        <p className="text-[10px] text-muted-foreground/60 py-1 px-1">
          Discover community skills published to Hypercho
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {results.map((r) => (
          <MarketplaceCard
            key={r._id}
            name={r.name}
            meta={`${r.author ? `${r.author} · ` : ""}${r.downloads.toLocaleString()} installs${r.version ? ` · v${r.version}` : ""}${r.tags.length > 0 ? ` · ${r.tags.slice(0, 3).join(", ")}` : ""}`}
            installing={installingId === r._id}
            installed={installedIds.has(r._id)}
            onInstall={() => install(r)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Marketplace section (skills.sh) ────────────────────────── */

interface MarketplaceSkill {
  name: string;
  slug: string;
  source: string;
  installs: number;
}

function MarketplaceSection({ runtime }: { runtime: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketplaceSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("skills-sh-search", { query: q })) as {
        skills?: Array<{ name: string; skillId?: string; id: string; installs?: number; source?: string }>;
      };
      setResults(
        (res?.skills ?? []).map((s) => ({
          name: s.name,
          slug: s.skillId || s.id.split("/").pop() || s.id,
          source: s.source ?? s.id,
          installs: s.installs ?? 0,
        }))
      );
    } catch {
      setError("Failed to reach skills.sh");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const install = useCallback(async (skill: MarketplaceSkill) => {
    setInstallingSlug(skill.slug);
    try {
      await bridgeInvoke("skills-sh-install", {
        source: skill.source,
        slug: skill.slug,
        runtime,
      });
      setInstalledSlugs((prev) => new Set([...prev, skill.slug]));
    } catch {
      // silent
    }
    setInstallingSlug(null);
  }, [runtime]);

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search skills.sh marketplace..."
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Searching...
        </div>
      )}
      {error && <p className="text-xs text-destructive px-1">{error}</p>}
      {!loading && !error && results.length === 0 && query.trim() && (
        <p className="text-xs text-muted-foreground py-2 text-center">No results for &ldquo;{query}&rdquo;</p>
      )}
      {!loading && results.length === 0 && !query.trim() && (
        <p className="text-[10px] text-muted-foreground/60 py-1 px-1">
          Browse 1,000+ community skills from skills.sh
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {results.map((r, idx) => (
          <MarketplaceCard
            key={`${r.slug}-${idx}`}
            name={r.name}
            meta={`${r.source} · ${r.installs.toLocaleString()} installs`}
            installing={installingSlug === r.slug}
            installed={installedSlugs.has(r.slug)}
            onInstall={() => install(r)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Main AgentSkillsTab ─────────────────────────────────────── */

interface AgentSkillsTabProps {
  agentId: string;
  runtime?: string;
  /** Project path for Codex skills */
  projectPath?: string;
}

export function AgentSkillsTab({
  agentId,
  runtime = "openclaw",
  projectPath,
}: AgentSkillsTabProps) {
  const sk = useAgentSkills(agentId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  /** Toggle for runtime-discovered skills — upserts on first use. */
  const runtimeToggle = useCallback(
    (id: string) => {
      if (sk.skills.find((s) => s.id === id)) {
        sk.toggle(id);
      } else {
        let name = id;
        let source = "system";
        if (id.startsWith("hermes:")) { name = id.replace("hermes:", "").split("/").pop() ?? id; source = "hermes-bundle"; }
        else if (id.startsWith("openclaw:")) { name = id.replace("openclaw:", ""); }
        else if (id.startsWith("codex:")) { name = id.replace("codex:", ""); }
        sk.upsert({ id, name, content: "", enabled: true, source });
      }
    },
    [sk],
  );

  const customSkills = useMemo(() => sk.skills.filter((s) => s.source === "custom"), [sk.skills]);
  const activeCount = useMemo(() => sk.skills.filter((s) => s.enabled).length, [sk.skills]);
  const runtimeLabel = RUNTIME_LABELS[runtime] ?? runtime;
  const runtimeDesc = RUNTIME_DESCRIPTIONS[runtime] ?? "";
  const isClaudeCode = runtime === "claude-code";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{runtimeLabel} Skills</p>
              <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{runtimeDesc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sk.syncing && (
              <span title="Syncing with connector…">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              </span>
            )}
            {!sk.bridgeOk && !sk.syncing && (
              <span
                className="text-[9px] text-muted-foreground/50 font-medium"
                title="Skill sync unavailable — using local cache. Update the connector to enable cross-device sync."
              >
                local
              </span>
            )}
            {activeCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                <ToggleRight className="w-3 h-3" />
                {activeCount} active
              </div>
            )}
            <Button
              variant="ghost"
              size="iconSm"
              className="h-7 w-7 rounded-lg hover:bg-muted/60"
              onClick={sk.refresh}
              title="Refresh skills from runtime"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", sk.syncing && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              className="h-7 w-7 rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={() => { setAddingNew(true); setEditingId(null); }}
              title="Add custom skill"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-4 py-4">
        <div className="flex flex-col gap-6">

          {/* ── Runtime skills ── */}
          {runtime === "hermes" && (
            <section className="flex flex-col gap-2.5">
              <SectionHeader icon={Package} title="Installed Skills" count={sk.skills.filter((s) => s.source === "hermes-bundle").length} />
              <HermesSkillsSection
                agentId={agentId}
                skills={sk.skills}
                onToggle={runtimeToggle}
              />
            </section>
          )}

          {runtime === "openclaw" && (
            <section className="flex flex-col gap-2.5">
              <SectionHeader icon={BookOpen} title="Installed Skills" count={sk.skills.filter((s) => s.source === "system").length} />
              <OpenClawSkillsSection
                skills={sk.skills}
                onToggle={runtimeToggle}
              />
            </section>
          )}

          {runtime === "codex" && (
            <section className="flex flex-col gap-2.5">
              <SectionHeader icon={BookOpen} title="Installed Skills" count={sk.skills.filter((s) => s.source === "system").length} />
              <CodexSkillsSection
                skills={sk.skills}
                onToggle={runtimeToggle}
                projectPath={projectPath}
              />
            </section>
          )}

          {isClaudeCode && (
            <section className="flex flex-col gap-2.5">
              <SectionHeader icon={BookOpen} title="Available Skills" count={sk.skills.filter((s) => s.source === "system").length} />
              <ClaudeSkillsSection
                agentId={agentId}
                skills={sk.skills}
                onToggleSkill={runtimeToggle}
                onUpsertSkill={sk.upsert}
                onDeleteSkill={sk.remove}
              />
            </section>
          )}

          {/* ── Custom skills ── */}
          <section className="flex flex-col gap-2.5">
            {(customSkills.length > 0 || addingNew || !isClaudeCode) && (
              <SectionHeader
                icon={Sparkles}
                title="Custom Skills"
                count={customSkills.length}
                action={
                  customSkills.length > 0 && !addingNew ? (
                    <button
                      className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                      onClick={() => setAddingNew(true)}
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  ) : undefined
                }
              />
            )}

            {addingNew && (
              <EditSkillForm
                onSave={(name, content) => { sk.add(name, content); setAddingNew(false); }}
                onCancel={() => setAddingNew(false)}
              />
            )}

            {customSkills.length === 0 && !addingNew && (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-muted/30 to-muted/10">
                  <Sparkles className="w-6 h-6 text-muted-foreground/20" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">No custom skills yet</p>
                  <p className="text-[10px] text-muted-foreground/50 max-w-[200px]">
                    {isClaudeCode
                      ? "Add custom context injected alongside selected skills above."
                      : `Add skills to inject context into ${runtimeLabel} conversations.`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 mt-1 rounded-lg border-dashed hover:border-primary/30 hover:bg-primary/[0.02]"
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
                onToggle={sk.toggle}
                onEdit={(id) => { setEditingId(id); setAddingNew(false); }}
                onDelete={sk.remove}
                isEditing={editingId === skill.id}
                onSaveEdit={(name, content) => { sk.update(skill.id, name, content); setEditingId(null); }}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </section>

          {/* ── Marketplace ── */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <SectionHeader icon={Globe} title="Hypercho Cloud" />
              <HyperchoCloudSection agentId={agentId} runtime={runtime} />
            </div>
            <div className="h-px bg-border/20" />
            <div className="flex flex-col gap-2.5">
              <SectionHeader icon={Download} title="skills.sh" />
              <MarketplaceSection runtime={runtime} />
            </div>
          </section>

          {/* Active injection note */}
          {activeCount > 0 && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary/[0.04] to-transparent border border-primary/10">
              <div className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 shrink-0 mt-0.5">
                <Zap className="w-3 h-3 text-primary" />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">
                  {activeCount} skill{activeCount !== 1 ? "s" : ""} active
                </span>
                {" -- "}
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
