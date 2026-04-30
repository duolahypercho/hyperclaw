"use client";

import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
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
import { getGatewayConnectionState } from "$/lib/openclaw-gateway-ws";

/* ── Props ──────────────────────────────────────────────────── */

interface OpenClawSkillsSectionProps {
  agentId?: string;
  onDiscoveredCount?: (count: number) => void;
}

/* ── Fetch helpers ──────────────────────────────────────────── */

async function fetchViaGateway(): Promise<SkillStatusReport | null> {
  try {
    const { gatewayConnection } = await import("$/lib/openclaw-gateway-ws");
    if (!gatewayConnection.connected) return null;
    const res = await gatewayConnection.request<SkillStatusReport>(
      "skills.status",
      {},
    );
    return res ?? null;
  } catch {
    return null;
  }
}

async function fetchViaBridge(
  agentId?: string,
): Promise<SkillStatusEntry[] | null> {
  try {
    const res = (await bridgeInvoke("openclaw-list-skills", { agentId })) as {
      skills?: Array<{
        skillKey: string;
        name: string;
        description?: string;
        source?: string;
      }>;
    };
    if (!res?.skills?.length) return null;
    // Bridge fallback returns minimal data — build stub SkillStatusEntry objects.
    return res.skills.map(
      (s): SkillStatusEntry => ({
        name: s.name,
        description: s.description ?? "",
        source: s.source ?? "openclaw-managed",
        filePath: "",
        baseDir: "",
        skillKey: s.skillKey,
        always: false,
        disabled: false,
        blockedByAllowlist: false,
        eligible: true,
        requirements: { bins: [], env: [], config: [], os: [] },
        missing: { bins: [], env: [], config: [], os: [] },
        configChecks: [],
        install: [],
      }),
    );
  } catch {
    return null;
  }
}

/* ── Component ──────────────────────────────────────────────── */

export function OpenClawSkillsSection({
  agentId,
  onDiscoveredCount,
}: OpenClawSkillsSectionProps) {
  const [report, setReport] = useState<SkillStatusReport | null>(null);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SkillsStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Try gateway first (full report).
    const fullReport = await fetchViaGateway();
    if (fullReport) {
      setReport(fullReport);
      setSkills(fullReport.skills);
      setDegraded(false);
      onDiscoveredCount?.(fullReport.skills.length);
      setLoading(false);
      return;
    }

    // Fallback: bridge disk scan (degraded — no eligibility info).
    const bridgeSkills = await fetchViaBridge(agentId);
    if (bridgeSkills) {
      setReport(null);
      setSkills(bridgeSkills);
      setDegraded(true);
      onDiscoveredCount?.(bridgeSkills.length);
    } else {
      setSkills([]);
      onDiscoveredCount?.(0);
    }
    setLoading(false);
  }, [agentId, onDiscoveredCount]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleToggle = useCallback(
    async (skillKey: string, enabled: boolean) => {
      if (degraded) return; // Can't toggle without gateway.
      setBusyKey(skillKey);
      setError(null);
      const previousSkills = skills;

      // Optimistic update.
      setSkills((prev) =>
        prev.map((s) =>
          s.skillKey === skillKey ? { ...s, disabled: !enabled } : s,
        ),
      );

      try {
        await bridgeInvoke("openclaw-skills-update", { skillKey, enabled });
        // Refetch to get accurate state.
        await loadSkills();
      } catch (err) {
        // Revert optimistic update on failure.
        setSkills(previousSkills);
        setError(
          err instanceof Error ? err.message : "Failed to update skill",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [degraded, loadSkills, skills],
  );

  /* ── Computed ────────────────────────────────────── */

  const counts: Record<SkillsStatusFilter, number> = {
    all: skills.length,
    ready: 0,
    "needs-setup": 0,
    disabled: 0,
  };
  for (const s of skills) {
    if (s.disabled) counts.disabled++;
    else if (s.eligible) counts.ready++;
    else counts["needs-setup"]++;
  }

  const afterStatus =
    statusFilter === "all"
      ? skills
      : skills.filter((s) => skillMatchesStatus(s, statusFilter));

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
    ? skills.find((s) => s.skillKey === detailKey) ?? null
    : null;

  /* ── Render ─────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading OpenClaw skills...
      </div>
    );
  }

  if (skills.length === 0) {
    const gatewayConnected = getGatewayConnectionState().connected;

    // If gateway is not connected, show setup prompt
    if (!gatewayConnected) {
      return (
        <div className="flex items-center justify-center py-6">
          <OpenClawSetupPrompt
            icon={<Sparkles className="w-5 h-5 text-primary" />}
            title="Connect OpenClaw"
            description="Manage and discover OpenClaw skills for your agents."
            onRetry={loadSkills}
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
          onClick={loadSkills}
          disabled={loading}
          className="shrink-0 border-solid border-border/50 text-muted-foreground hover:bg-muted/40"
          title="Refresh skills"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Degraded mode notice */}
      {degraded && (
        <div className="rounded-lg border border-solid border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-400/80">
          Gateway not connected — showing disk-only skills. Toggles disabled.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-solid border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[10px] text-red-400/80">
          {error}
        </div>
      )}

      {/* Search */}
      {skills.length > 6 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${skills.length} skills...`}
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
          <p className="px-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
            {group.label}
          </p>
          {group.skills.map((skill) => (
            <OpenClawSkillCard
              key={skill.skillKey}
              skill={skill}
              busy={busyKey === skill.skillKey}
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
          busy={busyKey === detailSkill.skillKey}
          onToggle={handleToggle}
          onClose={() => setDetailKey(null)}
        />
      )}
    </div>
  );
}
