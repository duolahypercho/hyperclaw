"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BookOpen, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  SkillStatusEntry,
  SkillStatusReport,
  SkillsStatusFilter,
} from "./types";
import { groupSkills } from "./skill-grouping";
import { skillMatchesStatus } from "./skill-helpers";
import { SkillStatusFilters } from "./SkillStatusFilters";
import { OpenClawSkillCard } from "./OpenClawSkillCard";
import { SkillDetailDialog } from "./SkillDetailDialog";
import { OpenClawSetupPrompt } from "$/components/shared/OpenClawSetupPrompt";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { getGatewayConnectionState } from "$/lib/openclaw-gateway-ws";

/* ── Props ──────────────────────────────────────────────────── */

interface OpenClawSkillsSectionProps {
  agentId?: string;
  onDiscoveredCount?: (count: number) => void;
}

type LoadSkillsOptions = {
  silent?: boolean;
  preserveExistingOnFallback?: boolean;
};

type OpenClawAgentConfig = {
  id?: unknown;
  skills?: unknown;
  [key: string]: unknown;
};

type OpenClawConfigFile = {
  agents?: {
    list?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/* ── Fetch helpers ──────────────────────────────────────────── */

async function fetchViaGateway(agentId?: string): Promise<SkillStatusReport | null> {
  try {
    const { gatewayConnection } = await import("$/lib/openclaw-gateway-ws");
    // `gatewayConnection.request` can route through the local connector fallback
    // even when the browser WebSocket is not currently connected.
    const res = await gatewayConnection.request<SkillStatusReport>(
      "skills.status",
      agentId ? { agentId } : {},
    );
    return res ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSkillNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

function allSkillNames(skills: SkillStatusEntry[]): string[] {
  return Array.from(new Set(skills.map((skill) => skill.name.trim()).filter(Boolean)));
}

function nextToggleAllowlist(
  current: string[] | undefined,
  allNames: string[],
  skillName: string,
  enabled: boolean,
): string[] {
  const next = new Set(current ?? allNames);
  if (enabled) {
    next.add(skillName);
  } else {
    next.delete(skillName);
  }
  return allNames.filter((name) => next.has(name));
}

function nextBulkAllowlist(
  current: string[] | undefined,
  allNames: string[],
  targetNames: string[],
  enabled: boolean,
): string[] {
  const next = new Set(current ?? allNames);
  for (const name of targetNames) {
    if (enabled) {
      next.add(name);
    } else {
      next.delete(name);
    }
  }
  return allNames.filter((name) => next.has(name));
}

function applyAgentAllowlist(
  skills: SkillStatusEntry[],
  allowlist: string[] | undefined,
): SkillStatusEntry[] {
  if (!allowlist) return skills;
  const allowed = new Set(allowlist);
  return skills.map((skill) => {
    const agentDisabled = !allowed.has(skill.name);
    return {
      ...skill,
      disabled: skill.disabled || agentDisabled,
      eligible: !agentDisabled && skill.eligible,
    };
  });
}

function canBulkToggleSkill(
  skill: SkillStatusEntry,
  enabled: boolean,
  rawSkills: SkillStatusEntry[],
): boolean {
  if (skill.always) return false;
  if (!enabled) return !skill.disabled;

  const rawSkill = rawSkills.find((entry) => entry.skillKey === skill.skillKey);
  return skill.disabled && rawSkill?.disabled !== true;
}

async function readAgentSkillAllowlist(agentId?: string): Promise<string[] | undefined> {
  if (!agentId) return undefined;
  try {
    const res = (await bridgeInvoke("get-openclaw-doc", {
      relativePath: "openclaw.json",
    })) as { success?: boolean; content?: string | null };
    if (!res?.success || !res.content) return undefined;
    const parsed = JSON.parse(res.content) as OpenClawConfigFile;
    const list = Array.isArray(parsed.agents?.list) ? parsed.agents.list : [];
    const entry = list.find(
      (candidate): candidate is OpenClawAgentConfig =>
        isRecord(candidate) && String(candidate.id ?? "").trim() === agentId,
    );
    return normalizeSkillNames(entry?.skills);
  } catch {
    return undefined;
  }
}

async function writeAgentSkillAllowlist(
  agentId: string | undefined,
  nextAllowlist: string[],
): Promise<string[]> {
  const normalizedAgentId = agentId?.trim();
  if (!normalizedAgentId) {
    throw new Error("Missing agent id for skill update");
  }

  const res = (await bridgeInvoke("get-openclaw-doc", {
    relativePath: "openclaw.json",
  })) as { success?: boolean; content?: string | null };
  if (!res?.success || !res.content) {
    throw new Error("Unable to read openclaw.json");
  }

  const config = JSON.parse(res.content) as OpenClawConfigFile;
  const agents = isRecord(config.agents) ? { ...config.agents } : {};
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  let index = list.findIndex(
    (candidate) => isRecord(candidate) && String(candidate.id ?? "").trim() === normalizedAgentId,
  );

  if (index < 0) {
    index = list.length;
    list.push({ id: normalizedAgentId });
  }

  const existing = isRecord(list[index]) ? list[index] : {};
  const entry: OpenClawAgentConfig = {
    ...existing,
    id: normalizedAgentId,
    skills: nextAllowlist,
  };
  list[index] = entry;

  config.agents = {
    ...agents,
    list,
  };

  const writeResult = (await bridgeInvoke("write-openclaw-doc", {
    relativePath: "openclaw.json",
    content: JSON.stringify(config, null, 2),
  })) as { success?: boolean; error?: string };

  if (writeResult?.success !== true) {
    throw new Error(writeResult.error || "Unable to write openclaw.json");
  }

  return nextAllowlist;
}

/* ── Component ──────────────────────────────────────────────── */

export function OpenClawSkillsSection({
  agentId,
  onDiscoveredCount,
}: OpenClawSkillsSectionProps) {
  const [report, setReport] = useState<SkillStatusReport | null>(null);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [agentAllowlist, setAgentAllowlist] = useState<string[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SkillsStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skillsRef = useRef<SkillStatusEntry[]>([]);
  const agentAllowlistRef = useRef<string[] | undefined>(undefined);
  const loadGenerationRef = useRef(0);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    skillsRef.current = skills;
  }, [skills]);

  useEffect(() => {
    agentAllowlistRef.current = agentAllowlist;
  }, [agentAllowlist]);

  const loadSkills = useCallback(async (options: LoadSkillsOptions = {}) => {
    const generation = ++loadGenerationRef.current;
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      // Try gateway first (full report).
      const [fullReport, allowlist] = await Promise.all([
        fetchViaGateway(agentId),
        readAgentSkillAllowlist(agentId),
      ]);
      if (generation !== loadGenerationRef.current) {
        return;
      }

      if (fullReport) {
        setReport(fullReport);
        setSkills(fullReport.skills);
        agentAllowlistRef.current = allowlist;
        setAgentAllowlist(allowlist);
        setDegraded(false);
        onDiscoveredCount?.(fullReport.skills.length);
        return;
      }

      const previousSkills = skillsRef.current;
      agentAllowlistRef.current = undefined;
      setAgentAllowlist(undefined);
      if (options.preserveExistingOnFallback && previousSkills.length > 0) {
        setDegraded(true);
        onDiscoveredCount?.(previousSkills.length);
      } else {
        // Match OpenClaw's web UI: no skills.status report means no skills list.
        // The old bridge disk scan only saw user skill folders, not bundled OpenClaw defaults.
        setReport(null);
        setSkills([]);
        setDegraded(true);
        onDiscoveredCount?.(0);
      }
    } catch (err) {
      if (generation === loadGenerationRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load OpenClaw skills");
        setDegraded(true);
      }
    } finally {
      if (generation === loadGenerationRef.current && !options.silent) {
        setLoading(false);
      }
    }
  }, [agentId, onDiscoveredCount]);

  const queueAllowlistWrite = useCallback(
    (nextAllowlist: string[]) => {
      const write = writeQueueRef.current
        .catch(() => undefined)
        .then(() => writeAgentSkillAllowlist(agentId, nextAllowlist));
      writeQueueRef.current = write.catch(() => undefined);
      return write;
    },
    [agentId],
  );

  useEffect(() => {
    loadSkills({ preserveExistingOnFallback: true });
  }, [loadSkills]);

  const handleToggle = useCallback(
    async (skillKey: string, enabled: boolean) => {
      if (busyKey !== null) return;
      if (degraded) {
        return;
      } // Can't toggle without gateway.
      if (!agentId) {
        setError("Missing agent id for skill update");
        return;
      }
      const skill = skills.find((entry) => entry.skillKey === skillKey);
      if (!skill) {
        setError("Unable to find skill to update");
        return;
      }
      setBusyKey(skillKey);
      setError(null);
      const previousAllowlist = agentAllowlistRef.current;
      const skillName = skill.name;
      const nextAllowlist = nextToggleAllowlist(
        previousAllowlist,
        allSkillNames(skills),
        skillName,
        enabled,
      );

      // Optimistic update.
      agentAllowlistRef.current = nextAllowlist;
      setAgentAllowlist(nextAllowlist);

      try {
        await queueAllowlistWrite(nextAllowlist);
        // Keep the verified optimistic state in place so the list does not unmount
        // and send the user back to the top of the skills tab.
      } catch (err) {
        // Revert optimistic update on failure.
        agentAllowlistRef.current = previousAllowlist;
        setAgentAllowlist(previousAllowlist);
        setError(
          err instanceof Error ? err.message : "Failed to update skill",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, busyKey, degraded, queueAllowlistWrite, skills],
  );

  const handleBulkToggle = useCallback(
    async (targetSkills: SkillStatusEntry[], enabled: boolean, scopeLabel: string) => {
      if (busyKey !== null) return;
      if (degraded) return;
      if (!agentId) {
        setError("Missing agent id for skill update");
        return;
      }

      const targetNames = targetSkills
        .filter((skill) => canBulkToggleSkill(skill, enabled, skills))
        .map((skill) => skill.name);
      if (targetNames.length === 0) return;

      setBusyKey(`bulk:${enabled ? "enable" : "disable"}:${scopeLabel}`);
      setError(null);
      const previousAllowlist = agentAllowlistRef.current;
      const nextAllowlist = nextBulkAllowlist(
        previousAllowlist,
        allSkillNames(skills),
        targetNames,
        enabled,
      );
      agentAllowlistRef.current = nextAllowlist;
      setAgentAllowlist(nextAllowlist);

      try {
        await queueAllowlistWrite(nextAllowlist);
      } catch (err) {
        agentAllowlistRef.current = previousAllowlist;
        setAgentAllowlist(previousAllowlist);
        setError(
          err instanceof Error ? err.message : "Failed to update skills",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, busyKey, degraded, queueAllowlistWrite, skills],
  );

  /* ── Computed ────────────────────────────────────── */
  const displayedSkills = useMemo(
    () => applyAgentAllowlist(skills, agentAllowlist),
    [agentAllowlist, skills],
  );

  const hasAgentAllowlist = agentAllowlist !== undefined;

  const counts: Record<SkillsStatusFilter, number> = {
    all: displayedSkills.length,
    ready: 0,
    "needs-setup": 0,
    disabled: 0,
  };
  for (const s of displayedSkills) {
    if (s.disabled) counts.disabled++;
    else if (s.eligible) counts.ready++;
    else counts["needs-setup"]++;
  }

  const afterStatus =
    statusFilter === "all"
      ? displayedSkills
      : displayedSkills.filter((s) => skillMatchesStatus(s, statusFilter));

  const query = search.trim().toLowerCase();
  const filtered = query
    ? afterStatus.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.skillKey.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query),
      )
    : afterStatus;

  const groups = groupSkills(filtered);
  const detailSkill = detailKey
    ? displayedSkills.find((s) => s.skillKey === detailKey) ?? null
    : null;
  const isBulkBusy = busyKey?.startsWith("bulk:") ?? false;
  const canBulkUpdate = !degraded && busyKey === null;
  const canDisableAll = canBulkUpdate && displayedSkills.some((skill) => canBulkToggleSkill(skill, false, skills));
  const canEnableAll = canBulkUpdate && displayedSkills.some((skill) => canBulkToggleSkill(skill, true, skills));

  /* ── Render ─────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading OpenClaw skills...
      </div>
    );
  }

  if (displayedSkills.length === 0) {
    const gatewayConnected = getGatewayConnectionState().connected;

    // If gateway is not connected, show setup prompt
    if (!gatewayConnected) {
      return (
        <div className="flex items-center justify-center py-6">
          <OpenClawSetupPrompt
            icon={<Sparkles className="w-5 h-5 text-primary" />}
            title="Connect OpenClaw"
            description="Manage and discover OpenClaw skills for your agents."
            onRetry={() => loadSkills({ preserveExistingOnFallback: true })}
            retrying={loading}
            size="sm"
          />
        </div>
      );
    }

    // Gateway connected but no skills found
    return (
      <div className="flex flex-col items-center py-5 text-center gap-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
          <BookOpen className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground">
          No OpenClaw skills found
        </p>
        <p className="text-[10px] text-muted-foreground/50">
          <code className="font-mono bg-muted/30 px-1 py-px rounded text-[9px]">
            ~/.openclaw/skills/
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {/* Header row — filters + refresh */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <SkillStatusFilters
            active={statusFilter}
            counts={counts}
            onChange={setStatusFilter}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="iconSm"
          onClick={() => loadSkills({ preserveExistingOnFallback: true })}
          disabled={loading}
          className="shrink-0 border-solid border-border/50 text-muted-foreground hover:bg-muted/40"
          title="Refresh skills"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!canDisableAll}
          onClick={() => handleBulkToggle(displayedSkills, false, "all")}
          className="h-6 border-solid border-border/50 px-2 text-[10px]"
        >
          Disable all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!canEnableAll}
          onClick={() => handleBulkToggle(displayedSkills, true, "all")}
          className="h-6 px-2 text-[10px] text-muted-foreground"
        >
          Enable all
        </Button>
      </div>

      {hasAgentAllowlist && (
        <div className="rounded-lg border border-solid border-primary/10 bg-primary/[0.04] px-3 py-1.5 text-[10px] text-muted-foreground">
          This agent is using a custom skill allowlist. Changes apply only to this agent.
        </div>
      )}

      {/* Degraded mode notice */}
      {degraded && displayedSkills.length > 0 && (
        <div className="rounded-lg border border-solid border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-400/80">
          Gateway not connected — showing last loaded skills. Toggles disabled.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-solid border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[10px] text-red-400/80">
          {error}
        </div>
      )}

      {/* Search */}
      {displayedSkills.length > 6 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${displayedSkills.length} skills...`}
            className="h-8 border-solid border-border/50 bg-background/60 pl-8 text-xs placeholder:text-muted-foreground/50 focus-visible:ring-primary/30"
          />
        </div>
      )}

      {/* No matches */}
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          {search.trim()
            ? `No skills match \u201c${search}\u201d`
            : "No skills in this category"}
        </p>
      )}

      {/* Grouped skills */}
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
              {group.label}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canBulkUpdate || !group.skills.some((skill) => canBulkToggleSkill(skill, false, skills))}
                onClick={() => handleBulkToggle(group.skills, false, group.id)}
                className="rounded-md px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                Disable section
              </button>
              <button
                type="button"
                disabled={!canBulkUpdate || !group.skills.some((skill) => canBulkToggleSkill(skill, true, skills))}
                onClick={() => handleBulkToggle(group.skills, true, group.id)}
                className="rounded-md px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                Enable section
              </button>
            </div>
          </div>
          {group.skills.map((skill) => (
            <OpenClawSkillCard
              key={skill.skillKey}
              skill={skill}
              busy={busyKey === skill.skillKey || isBulkBusy}
              onToggle={handleToggle}
              onClick={setDetailKey}
            />
          ))}
        </div>
      ))}

      {/* Detail dialog */}
      {detailSkill && (
        <SkillDetailDialog
          skill={detailSkill}
          busy={busyKey === detailSkill.skillKey || isBulkBusy}
          onToggle={handleToggle}
          onClose={() => setDetailKey(null)}
        />
      )}
    </div>
  );
}
