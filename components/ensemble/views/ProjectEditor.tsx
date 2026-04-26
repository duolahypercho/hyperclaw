"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Check,
  Zap,
  Trash,
  Calendar,
  Clock,
  Play,
  Activity,
  Webhook,
  Loader2,
  Search,
  Database,
  RefreshCw,
} from "lucide-react";
import {
  ProjectsProvider,
  useProjects,
} from "$/components/Tool/Projects/provider/projectsProvider";
import { buildMissionControlProjectHref } from "./mission-control-routing";
import { useHyperclawContext, type HyperclawAgent } from "$/Providers/HyperclawProv";
import {
  bridgeInvoke,
  cloneWorkflowTemplate,
  createWorkflowDraft,
  createWorkflowTemplate,
  createWorkflowTemplateFromPrompt,
  getWorkflowTemplate as getPersistedWorkflowTemplate,
  promoteWorkflowDraft,
  saveWorkflowDraft,
  type WorkflowTemplateDraft,
} from "$/lib/hyperclaw-bridge-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AgentGlyph } from "$/components/ensemble";
import { resolveProjectAgentDisplay } from "./project-agent-display";
import { getWorkflowTemplate as getStaticWorkflowTemplate } from "$/lib/workflow-templates";
import {
  validateWorkflowTemplateDraft,
  workflowDraftFromPrompt,
  WORKFLOW_TEMPLATE_DRAFT_EXAMPLE,
} from "$/lib/workflow-template-draft";

type Trigger = "manual" | "schedule" | "cron" | "webhook" | "event";

const TRIGGER_OPTIONS: Array<{
  id: Trigger;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "manual",
    title: "Manual",
    description: "You press run.",
    icon: <Play size={14} />,
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Hourly, daily, or weekly.",
    icon: <Clock size={14} />,
  },
  {
    id: "cron",
    title: "Cron",
    description: "Custom expression.",
    icon: <Calendar size={14} />,
  },
  {
    id: "webhook",
    title: "Webhook",
    description: "HTTP POST triggers a run.",
    icon: <Webhook size={14} />,
  },
  {
    id: "event",
    title: "On event",
    description: "New row, new file, reply.",
    icon: <Activity size={14} />,
  },
];

const EMOJI_OPTIONS = [
  "📦", "🚀", "⚡", "🧠", "🎯", "🔬", "💡", "🛠️",
  "🌐", "🤖", "🔥", "✨", "📊", "📁", "🎪",
];

type DataAccessKind = "collection";

interface DataAccessItem {
  id: string;
  kind: DataAccessKind;
  name: string;
  description: string;
  meta: string;
}

interface SchemaTableInfo {
  columns?: Array<{ name: string; type: string }>;
  row_count?: number;
  rowCount?: number;
}

function agentSubtitle(agent: HyperclawAgent): string {
  return [agent.role, agent.runtime, agent.status]
    .filter(Boolean)
    .join(" · ") || agent.id;
}

function matchesAgentSearch(agent: HyperclawAgent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [agent.name, agent.id, agent.runtime, agent.role, agent.status]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function matchesDataSearch(item: DataAccessItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.description, item.meta]
    .some((value) => value.toLowerCase().includes(q));
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function pruneDataAccessIds(ids: string[], validIds?: Set<string>): string[] {
  return ids.filter((id) => id.startsWith("table:") && (!validIds || validIds.has(id)));
}

function formatDataCount(count?: number): string {
  return typeof count === "number" ? count.toLocaleString() : "0";
}

function projectAccessKey(projectId: string): string {
  return `hyperclaw:project-data-access:${projectId}`;
}

function readSavedDataAccess(projectId: string): { reads: string[]; writes: string[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(projectAccessKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { reads?: unknown; writes?: unknown };
    return {
      reads: Array.isArray(parsed.reads)
        ? parsed.reads.filter((item): item is string => typeof item === "string")
        : [],
      writes: Array.isArray(parsed.writes)
        ? parsed.writes.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function saveDataAccess(projectId: string, reads: string[], writes: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(projectAccessKey(projectId), JSON.stringify({ reads, writes }));
  } catch {
    // Local persistence is best-effort until project permissions are part of the connector schema.
  }
}

function tableIconFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("agent")) return "🤖";
  if (n.includes("customer") || n.includes("contact")) return "👥";
  if (n.includes("metric") || n.includes("event")) return "📈";
  if (n.includes("ticket") || n.includes("issue")) return "🎫";
  return "🗄️";
}

function normalizeIntelTables(result: unknown): DataAccessItem[] {
  if (!result || typeof result !== "object") return [];
  const tables = (result as { tables?: unknown }).tables;

  if (Array.isArray(tables)) {
    return tables
      .filter((table): table is { name: string; columns?: unknown[]; rowCount?: number } =>
        Boolean(
          table &&
          typeof table === "object" &&
          "name" in table &&
          typeof (table as { name?: unknown }).name === "string"
        )
      )
      .map((table) => ({
        id: `table:${table.name}`,
        kind: "collection" as const,
        name: table.name,
        description: "Intelligence data collection",
        meta: `${formatDataCount(table.rowCount)} rows · ${(table.columns ?? []).length} columns`,
      }));
  }

  if (!tables || typeof tables !== "object") return [];
  return Object.entries(tables as Record<string, SchemaTableInfo>).map(([name, info]) => ({
    id: `table:${name}`,
    kind: "collection" as const,
    name,
    description: "Intelligence data collection",
    meta: `${formatDataCount(info.row_count ?? info.rowCount)} rows · ${(info.columns ?? []).length} columns`,
  }));
}

function DataIcon({ name }: { name: string }) {
  return <span className="text-lg w-6 text-center">{tableIconFor(name)}</span>;
}

function AgentAvatar({ agent, size = 28 }: { agent: HyperclawAgent; size?: number }) {
  const display = resolveProjectAgentDisplay(agent);
  return <AgentGlyph agent={display} size={size} className="shrink-0" />;
}

function useProjectDataAccessItems() {
  const [items, setItems] = useState<DataAccessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const refresh = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const schemaResult = await bridgeInvoke("intel-schema", {});
      const tables = normalizeIntelTables(schemaResult);
      const schemaError = schemaResult && typeof schemaResult === "object"
        ? (schemaResult as { error?: unknown }).error
        : undefined;

      if (mountedRef.current && requestId === requestIdRef.current) {
        if (typeof schemaError === "string" && tables.length === 0) {
          setError(schemaError);
        }
        setItems(tables);
      }
    } catch (e) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load data access sources");
        setItems([]);
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { items, loading, error, refresh };
}

function ProjectEditorInner({
  projectId,
  templateId,
}: {
  projectId: string | null;
  /**
   * Optional template seed id from `?template=...`. When present and we are
   * creating a new workflow (no `projectId`), the form is pre-filled with the
   * template's name/description/emoji/trigger so the user lands on a populated
   * draft instead of a blank canvas. The seed is applied exactly once per
   * template id — subsequent edits by the user are not overwritten.
   */
  templateId: string | null;
}) {
  const router = useRouter();
  const { agents: availableAgents } = useHyperclawContext();
  const {
    items: dataAccessItems,
    loading: dataAccessLoading,
    error: dataAccessError,
    refresh: refreshDataAccess,
  } = useProjectDataAccessItems();
  const {
    projects,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    addMember,
    removeMember,
  } = useProjects();

  const existing = projectId ? projects.find((p) => p.id === projectId) : null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📦");
  const [trigger, setTrigger] = useState<Trigger>("manual");
  const [cadence, setCadence] = useState("daily");
  const [time, setTime] = useState("07:00");
  const [cron, setCron] = useState("0 */6 * * *");
  const [crew, setCrew] = useState<string[]>([]);
  // `null` = "Unassigned". Owner must be one of the selected crew members.
  const [leadAgentId, setLeadAgentId] = useState<string | null>(null);
  const [crewSearchDraft, setCrewSearchDraft] = useState("");
  const [crewSearch, setCrewSearch] = useState("");
  const [dataSearchDraft, setDataSearchDraft] = useState("");
  const [dataSearch, setDataSearch] = useState("");
  const [reads, setReads] = useState<string[]>([]);
  const [writes, setWrites] = useState<string[]>([]);
  const [templateSeedSource, setTemplateSeedSource] = useState<"static" | "sqlite" | null>(null);
  const [budget, setBudget] = useState("5.00");
  const [humanApprove, setHumanApprove] = useState(true);
  const [budgetStop, setBudgetStop] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingProject, setFetchingProject] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [agentDraftText, setAgentDraftText] = useState(() =>
    JSON.stringify(WORKFLOW_TEMPLATE_DRAFT_EXAMPLE, null, 2)
  );
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentDraft, setAgentDraft] = useState<WorkflowTemplateDraft | null>(null);
  const [agentWarnings, setAgentWarnings] = useState<string[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);

  // Fetch full project details (including members) from connector on mount
  useEffect(() => {
    if (!projectId) return;
    setFetchingProject(true);
    void Promise.resolve(selectProject(projectId)).finally(() =>
      setFetchingProject(false)
    );
  }, [projectId, selectProject]);

  // Sync form state when the project hydrates from the connector
  // Dependency on existing?.id ensures we only reset on project identity change, not every re-render
  useEffect(() => {
    if (!existing) return;
    setName(existing.name || "");
    setDescription(existing.description || "");
    setEmoji(existing.emoji || "📦");
    setCrew(existing.members?.map((m) => m.agentId) ?? []);
    setLeadAgentId(existing.leadAgentId ?? null);
    const savedAccess = readSavedDataAccess(existing.id);
    setReads(savedAccess?.reads ?? []);
    setWrites(savedAccess?.writes ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  // Seed the form from a `?template=...` query param (one-shot, new workflow only).
  // The router populates `query` after hydration in the Pages Router, so we wait
  // for the id to actually arrive and then apply once. The ref guards against
  // re-applying the same seed if the component re-renders, preserving any
  // edits the user has made to the pre-filled draft.
  const seededTemplateRef = useRef<string | null>(null);
  useEffect(() => {
    if (projectId) return; // editing existing — never overwrite
    if (!templateId) return;
    if (seededTemplateRef.current === templateId) return;
    seededTemplateRef.current = templateId;
    const staticSeed = getStaticWorkflowTemplate(templateId);
    if (staticSeed) {
      setTemplateSeedSource("static");
      setName(staticSeed.name);
      setDescription(staticSeed.description);
      setEmoji(staticSeed.emoji);
      setTrigger(staticSeed.trigger);
      return;
    }
    void getPersistedWorkflowTemplate(templateId)
      .then((seed) => {
        if (!seed) return;
        setTemplateSeedSource("sqlite");
        setName(seed.name);
        setDescription(seed.description);
        if (typeof seed.preview?.emoji === "string") setEmoji(seed.preview.emoji);
        setTrigger("manual");
      })
      .catch(() => {
        setTemplateSeedSource(null);
      });
  }, [projectId, templateId]);

  const filteredAgents = useMemo(
    () => availableAgents.filter((agent) => matchesAgentSearch(agent, crewSearch)),
    [availableAgents, crewSearch]
  );

  const selectedAgents = useMemo(
    () => crew
      .map((id) => availableAgents.find((agent) => agent.id === id))
      .filter((agent): agent is HyperclawAgent => Boolean(agent)),
    [availableAgents, crew]
  );

  const filteredDataAccessItems = useMemo(
    () => dataAccessItems.filter((item) => matchesDataSearch(item, dataSearch)),
    [dataAccessItems, dataSearch]
  );

  useEffect(() => {
    if (dataAccessLoading) return;
    const validIds = new Set(dataAccessItems.map((item) => item.id));
    setReads((prev) => {
      const next = pruneDataAccessIds(prev, validIds);
      return sameStringArray(prev, next) ? prev : next;
    });
    setWrites((prev) => {
      const next = pruneDataAccessIds(prev, validIds);
      return sameStringArray(prev, next) ? prev : next;
    });
  }, [dataAccessItems, dataAccessLoading, existing?.id]);

  const toggle = (arr: string[], set: (v: string[]) => void, value: string) => {
    set(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const triggerSummary = useMemo(() => {
    if (trigger === "manual") return "Run only when started by a human.";
    if (trigger === "schedule")
      return `Runs every ${cadence}${cadence === "hourly" ? "" : ` at ${time}`}.`;
    if (trigger === "cron") return `Runs on cron · ${cron}`;
    if (trigger === "webhook") return "Runs on POST to the webhook URL.";
    return "Runs when a watched event fires.";
  }, [trigger, cadence, time, cron]);

  const applyWorkflowDraft = (draft: WorkflowTemplateDraft) => {
    setAgentDraft(draft);
    setName(draft.name);
    if (draft.description) setDescription(draft.description);
    if (draft.steps?.some((step) => (step.stepType ?? step.type) === "sql_query")) {
      setTrigger("event");
    }
  };

  const importAgentDraft = () => {
    setFormError(null);
    try {
      const parsed = JSON.parse(agentDraftText) as unknown;
      const validation = validateWorkflowTemplateDraft(parsed);
      setAgentWarnings(validation.warnings);
      if (!validation.draft || !validation.valid) {
        throw new Error(validation.warnings[0] ?? "Invalid workflow draft JSON");
      }
      applyWorkflowDraft(validation.draft);
    } catch (err) {
      setAgentDraft(null);
      setFormError(err instanceof Error ? err.message : "Invalid workflow draft JSON");
    }
  };

  const generateAgentDraft = async () => {
    const prompt = agentPrompt.trim();
    if (!prompt) return;
    setAgentBusy(true);
    setFormError(null);
    try {
      if (existing?.id) {
        const template = await createWorkflowTemplateFromPrompt({
          projectId: existing.id,
          prompt,
          name: name || undefined,
          createdBy: "human:project-editor",
        });
        if (!template) throw new Error("Prompt generation failed");
        setAgentPrompt("");
        setAgentWarnings([]);
        setName(template.name);
        setDescription(template.description);
        return;
      }
      const draft = workflowDraftFromPrompt(prompt);
      setAgentDraftText(JSON.stringify(draft, null, 2));
      const validation = validateWorkflowTemplateDraft(draft);
      setAgentWarnings(validation.warnings);
      if (!validation.valid) {
        throw new Error(validation.warnings[0] ?? "Generated draft is invalid");
      }
      applyWorkflowDraft(draft);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Prompt generation failed");
    } finally {
      setAgentBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const validDataIds = dataAccessItems.length > 0 || !dataAccessLoading
        ? new Set(dataAccessItems.map((item) => item.id))
        : undefined;
      const safeReads = pruneDataAccessIds(reads, validDataIds);
      const safeWrites = pruneDataAccessIds(writes, validDataIds);

      // Track the project we just created so we can deep-link the user
      // straight into Mission Control instead of bouncing through the list.
      let createdProjectId: string | null = null;

      // Owner must be a current crew member, otherwise it's silently dropped.
      const safeLeadId =
        leadAgentId && crew.includes(leadAgentId) ? leadAgentId : null;

      if (existing) {
        const updated = await updateProject(existing.id, {
          name,
          description,
          emoji,
          leadAgentId: safeLeadId,
        });
        if (!updated) throw new Error("Failed to save workflow");
        saveDataAccess(existing.id, safeReads, safeWrites);
        // Sync crew member changes to connector
        const existingAgentIds = existing.members?.map((m) => m.agentId) ?? [];
        const toAdd = crew.filter((id) => !existingAgentIds.includes(id));
        const toRemove = existingAgentIds.filter((id) => !crew.includes(id));
        const memberResults = await Promise.all([
          ...toAdd.map((agentId) => addMember(existing.id, agentId)),
          ...toRemove.map((agentId) => removeMember(existing.id, agentId)),
        ]);
        if (memberResults.some((ok) => !ok)) {
          throw new Error("Workflow saved, but some crew changes failed");
        }
        if (agentDraft) {
          const draftResult = await createWorkflowDraft({
            projectId: existing.id,
            name: agentDraft.name,
            source: "agent_json",
            draft: {
              ...agentDraft,
              metadata: {
                ...(agentDraft.metadata ?? {}),
                reads: safeReads,
                writes: safeWrites,
                crew,
                budget,
                humanApprove,
                budgetStop,
              },
            },
          });
          if (!draftResult.draft) {
            throw new Error(draftResult.warnings[0] ?? "Agent workflow draft is invalid");
          }
          await promoteWorkflowDraft(draftResult.draft.id, existing.id);
        }
      } else {
        const project = await createProject(name, description, emoji);
        if (project) {
          createdProjectId = project.id;
          saveDataAccess(project.id, safeReads, safeWrites);
          const memberResults = await Promise.all(crew.map((agentId) => addMember(project.id, agentId)));
          if (memberResults.some((ok) => !ok)) {
            throw new Error("Project created, but some crew members could not be added");
          }
          // createProject() doesn't accept leadAgentId — patch it after.
          if (safeLeadId) {
            await updateProject(project.id, { leadAgentId: safeLeadId });
          }
          if (agentDraft) {
            const draftResult = await createWorkflowDraft({
              projectId: project.id,
              name: agentDraft.name,
              source: agentDraft.prompt ? "prompt" : "agent_json",
              draft: {
                ...agentDraft,
                metadata: {
                  ...(agentDraft.metadata ?? {}),
                  reads: safeReads,
                  writes: safeWrites,
                  crew,
                  budget,
                  humanApprove,
                  budgetStop,
                },
              },
            });
            if (!draftResult.draft) {
              throw new Error(draftResult.warnings[0] ?? "Agent workflow draft is invalid");
            }
            await promoteWorkflowDraft(draftResult.draft.id, project.id);
          } else if (templateId && templateSeedSource === "sqlite") {
            await cloneWorkflowTemplate(templateId, project.id, name);
          } else {
            const template = await createWorkflowTemplate({
              projectId: project.id,
              name,
              description,
              category: templateSeedSource === "static" ? "starter" : "custom",
              tags: [trigger, ...safeReads.map((id) => id.replace(/^table:/, "data:"))],
              visibility: "private",
              source: templateSeedSource === "static" ? "static_seed" : "manual",
              preview: { emoji, trigger, triggerSummary },
              metadata: { reads: safeReads, writes: safeWrites, cadence, time, cron, budget, humanApprove, budgetStop },
              createdBy: "human:project-editor",
              triggerExamples: [triggerSummary],
              steps: [
                {
                  id: `${project.id}-trigger`,
                  name: `${trigger[0].toUpperCase()}${trigger.slice(1)} trigger`,
                  stepType: "manual_trigger",
                  dependsOn: [],
                  position: 0,
                  metadata: { trigger, cadence, time, cron },
                },
                {
                  id: `${project.id}-agent-step`,
                  name: "Run crew workflow",
                  stepType: "agent_task",
                  dependsOn: [`${project.id}-trigger`],
                  preferredAgentId: safeLeadId ?? crew[0],
                  position: 1,
                  metadata: { crew, reads: safeReads, writes: safeWrites },
                },
                {
                  id: `${project.id}-output`,
                  name: "Deliver result",
                  stepType: "notification",
                  dependsOn: [`${project.id}-agent-step`],
                  position: 2,
                  metadata: { channel: "mission_control" },
                },
              ],
            });
            await saveWorkflowDraft({
              projectId: project.id,
              templateId: template?.id,
              name,
              source: templateSeedSource === "static" ? "static_seed" : "manual",
              draft: {
                name,
                description,
                trigger,
                crew,
                reads: safeReads,
                writes: safeWrites,
                templateId: template?.id,
              },
              status: "published",
            });
          }
        } else {
          throw new Error("Failed to create project");
        }
      }

      if (createdProjectId) {
        // New project → drop the user straight onto its Mission Control canvas.
        router.push(buildMissionControlProjectHref(createdProjectId));
      } else {
        router.push("/Tool/Workflows");
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!existing) return;
    if (!confirm(`Archive "${existing.name}"?`)) return;
    setFormError(null);
    try {
      const deleted = await deleteProject(existing.id);
      if (!deleted) throw new Error("Failed to archive project");
      router.push("/Tool/Workflows");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to archive project");
    }
  };

  if (projectId && fetchingProject && !existing) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 gap-1.5 text-muted-foreground hover:text-foreground -ml-1"
        onClick={() => router.back()}
      >
        <ArrowLeft size={14} />
        Back
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {existing ? "Edit workflow" : "New workflow"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{triggerSummary}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* ── Main form ───────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="border-sky-400/20 bg-sky-400/[0.03]">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-sky-200/80">
                    Agent setup kit
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Agents can emit this JSON contract directly, or you can generate a draft from a prompt and edit it before saving.
                  </p>
                </div>
                {agentDraft && <Badge variant="secondary">Draft loaded</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={agentPrompt}
                  onChange={(event) => setAgentPrompt(event.target.value)}
                  placeholder="Generate from prompt, e.g. Query Stripe revenue -> chart trend -> notify founders"
                />
                <Button type="button" variant="secondary" onClick={generateAgentDraft} disabled={agentBusy || !agentPrompt.trim()}>
                  {agentBusy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Zap size={14} className="mr-2" />}
                  Generate
                </Button>
              </div>
              <Textarea
                value={agentDraftText}
                onChange={(event) => setAgentDraftText(event.target.value)}
                className="min-h-[170px] font-mono text-xs"
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={importAgentDraft}>
                  Import JSON draft
                </Button>
                <span className="text-xs text-muted-foreground">
                  Required: `name`; recommended: `description`, `steps`, `components`, `metadata`.
                </span>
              </div>
              {agentWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  {agentWarnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Identity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Icon
                </Label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-label={`Select ${e} as workflow icon`}
                      aria-pressed={emoji === e}
                      onClick={() => setEmoji(e)}
                      className={cn(
                        "w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all",
                        emoji === e
                          ? "bg-primary/15 ring-1 ring-primary/50 scale-110"
                          : "bg-muted hover:bg-muted/70 hover:scale-105"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Earnings brief"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-desc">Description</Label>
                <Textarea
                  id="project-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One sentence the team can read at a glance."
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="w-48 space-y-2">
                <Label htmlFor="project-budget">Budget (USD / run)</Label>
                <Input
                  id="project-budget"
                  type="number"
                  step={0.5}
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Trigger */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Trigger
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {TRIGGER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={trigger === opt.id}
                    onClick={() => setTrigger(opt.id)}
                    className={cn(
                      "p-3 rounded-lg border border-solid text-left transition-all",
                      trigger === opt.id
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                    )}
                  >
                    <div className="mb-1">{opt.icon}</div>
                    <div className="text-xs font-medium leading-tight">{opt.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                      {opt.description}
                    </div>
                  </button>
                ))}
              </div>

              {trigger === "schedule" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Every</span>
                  <Select value={cadence} onValueChange={setCadence}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hour</SelectItem>
                      <SelectItem value="daily">Day</SelectItem>
                      <SelectItem value="weekly">Week</SelectItem>
                    </SelectContent>
                  </Select>
                  {cadence !== "hourly" && (
                    <>
                      <span className="text-sm text-muted-foreground">at</span>
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-32"
                      />
                    </>
                  )}
                </div>
              )}

              {trigger === "cron" && (
                <div className="space-y-1.5">
                  <Label htmlFor="cron-expr">Cron expression</Label>
                  <Input
                    id="cron-expr"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    className="font-mono"
                    placeholder="0 */6 * * *"
                  />
                  <p className="text-xs text-muted-foreground">min · hour · day · month · weekday</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check size={12} className="text-primary shrink-0" />
                {triggerSummary}
              </div>
            </CardContent>
          </Card>

          {/* Crew */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Crew
              </CardTitle>
              <Badge variant="secondary">{crew.length} selected</Badge>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="mb-4 flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Label
                    htmlFor="workflow-lead"
                    className="text-[11px] font-medium uppercase tracking-wider text-primary"
                  >
                    Workflow lead
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    The accountable agent for this workflow — shown on the
                    workflow card and Workflows header.
                  </p>
                </div>
                <Select
                  value={leadAgentId ?? "__none__"}
                  onValueChange={(value) =>
                    setLeadAgentId(value === "__none__" ? null : value)
                  }
                  disabled={selectedAgents.length === 0}
                >
                  <SelectTrigger
                    id="workflow-lead"
                    className="w-full sm:w-[220px]"
                    aria-label="Assign workflow lead"
                  >
                    <SelectValue
                      placeholder={
                        selectedAgents.length === 0
                          ? "Add a crew member first"
                          : "Unassigned"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {selectedAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Search and add any agent currently registered in HyperClaw.
              </p>
              <form
                className="mb-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setCrewSearch(crewSearchDraft.trim());
                }}
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input
                    aria-label="Search agents"
                    value={crewSearchDraft}
                    onChange={(e) => setCrewSearchDraft(e.target.value)}
                    placeholder="Search agents by name, runtime, role..."
                    className="pl-9"
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  className="gap-1.5"
                >
                  <Search size={14} />
                  Search
                </Button>
              </form>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredAgents.map((a) => {
                  const active = crew.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(crew, setCrew, a.id)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border border-solid text-left transition-all",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-foreground/20"
                      )}
                    >
                      <AgentAvatar agent={a} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {agentSubtitle(a)}
                        </div>
                      </div>
                      {active && <Check size={14} className="text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {availableAgents.length === 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  No agents are available yet. Hire or sync agents first, then return here.
                </p>
              )}
              {availableAgents.length > 0 && filteredAgents.length === 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  No agents match <span className="font-mono">{crewSearch}</span>.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Data access */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Data Access
              </CardTitle>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void refreshDataAccess()}
                disabled={dataAccessLoading}
              >
                <RefreshCw size={12} className={cn(dataAccessLoading && "animate-spin")} />
                Sync
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Intelligence data collections the crew may read or write during a run.
              </p>
              <form
                className="mb-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setDataSearch(dataSearchDraft.trim());
                }}
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input
                    aria-label="Search intelligence data collections"
                    value={dataSearchDraft}
                    onChange={(e) => setDataSearchDraft(e.target.value)}
                    placeholder="Search intelligence collections..."
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="secondary" className="gap-1.5">
                  <Search size={14} />
                  Search
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mb-3">
                Access choices are saved with this editor locally until the workflow API exposes a server-side permission field.
              </p>
              {dataAccessError && (
                <p className="text-xs text-destructive mb-3">{dataAccessError}</p>
              )}
              <div className="rounded-lg border border-solid border-border">
                {dataAccessLoading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Loading data sources...
                  </div>
                ) : dataAccessItems.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Database size={14} />
                    No intelligence data collections found.
                  </div>
                ) : filteredDataAccessItems.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Search size={14} />
                    No data collections match <span className="font-mono">{dataSearch}</span>.
                  </div>
                ) : filteredDataAccessItems.map((d, i) => (
                  <React.Fragment key={d.id}>
                    {i > 0 && <Separator />}
                    <div className="flex items-center gap-3 px-3 py-3">
                      <DataIcon name={d.name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{d.name}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {d.kind}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {d.description} · {d.meta}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Read access for ${d.name}`}
                          aria-pressed={reads.includes(d.id)}
                          onClick={() => toggle(reads, setReads, d.id)}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-full border border-solid transition-colors",
                            reads.includes(d.id)
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:border-foreground/30"
                          )}
                        >
                          read
                        </button>
                        <button
                          type="button"
                          aria-label={`Write access for ${d.name}`}
                          aria-pressed={writes.includes(d.id)}
                          onClick={() => toggle(writes, setWrites, d.id)}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-full border border-solid transition-colors",
                            writes.includes(d.id)
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:border-foreground/30"
                          )}
                        >
                          write
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Guardrails */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Guardrails
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="guardrail-human" className="text-sm font-medium">
                    Human approval before send
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Outputs to email, Slack, or customer channels wait for sign-off.
                  </p>
                </div>
                <Switch
                  id="guardrail-human"
                  checked={humanApprove}
                  onCheckedChange={setHumanApprove}
                />
              </div>
              <Separator />
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="guardrail-budget" className="text-sm font-medium">
                    Stop on budget breach
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Halt if cost exceeds ${parseFloat(budget || "0").toFixed(2)}.
                  </p>
                </div>
                <Switch
                  id="guardrail-budget"
                  checked={budgetStop}
                  onCheckedChange={setBudgetStop}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {formError && (
            <div className="rounded-lg border border-solid border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            {existing && (
              <Button
                variant="destructive"
                size="sm"
                onClick={archive}
                className="gap-1.5"
              >
                <Trash size={12} />
                Archive
              </Button>
            )}
            <div className="flex-1" />
            <Button
              onClick={save}
              disabled={saving || !name.trim()}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : existing ? (
                <Check size={12} />
              ) : (
                <Zap size={12} />
              )}
              {saving ? "Saving…" : existing ? "Save changes" : "Create workflow"}
            </Button>
          </div>
        </div>

        {/* ── Summary sidebar ─────────────────────────────── */}
        <aside>
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <SumRow
                label="Name"
                value={
                  name || (
                    <em className="text-muted-foreground/50 not-italic">Untitled</em>
                  )
                }
              />
              <SumRow label="Trigger" value={trigger} />
              <SumRow label="Crew" value={`${crew.length} agents`} />
              <SumRow label="Reads" value={`${reads.length} collections`} />
              <SumRow label="Writes" value={`${writes.length} collections`} />
              <SumRow
                label="Budget"
                value={`$${parseFloat(budget || "0").toFixed(2)}/run`}
              />

              <Separator className="my-3" />

              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Crew preview
              </p>
              {crew.length === 0 ? (
                <p className="text-xs text-muted-foreground">No crew selected.</p>
              ) : (
                selectedAgents.map((a) => {
                  return (
                    <div key={a.id} className="flex items-center gap-2 py-1">
                      <AgentAvatar agent={a} size={22} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {agentSubtitle(a)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

export default function ProjectEditor() {
  const router = useRouter();
  const id = (router.query.id as string) || null;
  const templateId = (router.query.template as string) || null;
  return (
    <ProjectsProvider>
      <ProjectEditorInner projectId={id} templateId={templateId} />
    </ProjectsProvider>
  );
}
