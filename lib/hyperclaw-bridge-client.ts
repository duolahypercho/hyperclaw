/**
 * Single entry point for all bridge calls.
 *
 * All commands route through Hub API → Connector (cross-device compatible).
 * Claude Code, Codex, and other runtime actions are handled by the connector
 * daemon — no Electron IPC needed.
 *
 * hubCommand() handles the full routing tier:
 *   1. Same-machine local connector HTTP (http://127.0.0.1:18790/bridge)
 *   2. Gateway WebSocket via Hub relay (streaming-capable)
 *   3. Hub REST API fallback (POST /api/devices/:id/command)
 *
 * We deliberately do NOT use the Electron IPC shortcut
 * (window.electronAPI.hyperClawBridge.invoke). That path skips the local
 * fastpath and the gateway WS, which breaks cross-machine support and
 * streaming. Keep everything flowing through hubCommand.
 */
import { hubCommand } from "$/lib/hub-direct";

export type BridgeBody = Record<string, unknown>;

export async function bridgeInvoke(action: string, body: BridgeBody = {}): Promise<unknown> {
  return hubCommand({ action, ...body });
}

// Local usage storage helpers
export interface LocalUsageData {
  daily: Record<string, {
    input: number;
    output: number;
    totalTokens: number;
    totalCost: number;
    inputCost: number;
    outputCost: number;
    cacheRead: number;
    cacheWrite: number;
    cacheReadCost: number;
    cacheWriteCost: number;
  }>;
  lastUpdated: string;
}

export async function saveLocalUsage(usageData: LocalUsageData): Promise<{ success: boolean; error?: string }> {
  return await bridgeInvoke("save-local-usage", { usageData }) as { success: boolean; error?: string };
}

export async function loadLocalUsage(): Promise<{ success: boolean; data: LocalUsageData | null; error?: string }> {
  return await bridgeInvoke("load-local-usage", {}) as { success: boolean; data: LocalUsageData | null; error?: string };
}

// Agent event storage helpers

export interface AgentEvent {
  id: number;
  agentId: string;
  runId?: string;
  sessionKey?: string;
  eventType: string;
  status: string;
  data?: Record<string, unknown>;
  createdAt: number;
}

export async function getAgentEvents(agentId?: string, limit = 50): Promise<AgentEvent[]> {
  const result = await bridgeInvoke("get-agent-events", {
    ...(agentId ? { agentId } : {}),
    limit,
  }) as { events?: AgentEvent[] } | AgentEvent[];
  if (Array.isArray(result)) return result;
  return (result as { events?: AgentEvent[] })?.events ?? [];
}

export async function addAgentEvent(event: {
  agentId: string;
  eventType: string;
  status?: string;
  runId?: string;
  sessionKey?: string;
  data?: Record<string, unknown>;
}): Promise<{ success: boolean; id?: number }> {
  return await bridgeInvoke("add-agent-event", event) as { success: boolean; id?: number };
}

/* ── Ensemble rooms ──────────────────────────────────────────────────────── */

export interface BridgeRoom {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  createdAt: number;
}

export async function listRooms(): Promise<BridgeRoom[]> {
  const result = await bridgeInvoke("room-list", {});
  if (Array.isArray(result)) return result as BridgeRoom[];
  return [];
}

export async function createRoom(room: {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
}): Promise<BridgeRoom> {
  return await bridgeInvoke("room-create", room) as BridgeRoom;
}

export async function deleteRoom(id: string): Promise<void> {
  await bridgeInvoke("room-delete", { id });
}

/* ── Room messages ───────────────────────────────────────────────────────────── */

export interface RoomMessage {
  id: string;
  roomId: string;
  role: "user" | "assistant";
  agentId: string;
  agentName: string;
  runtime: string;
  content: string;
  createdAt: number;
}

export async function listRoomMessages(roomId: string, limit = 50): Promise<RoomMessage[]> {
  const result = await bridgeInvoke("room-msg-list", { roomId, limit });
  if (Array.isArray(result)) return result as RoomMessage[];
  return [];
}

export async function addRoomMessage(msg: Omit<RoomMessage, "id" | "createdAt"> & { id?: string }): Promise<RoomMessage> {
  return await bridgeInvoke("room-msg-add", msg) as RoomMessage;
}

/* ── Room send (streaming) ───────────────────────────────────────────────────── */

export interface RoomAgentStreamEvent {
  requestId: string;
  roomId: string;
  agentId: string;
  agentName: string;
  runtime: string;
  chunk: string;
  done: boolean;
  messageId?: string;
}

export async function roomSend(params: {
  roomId: string;
  targetAgentId: string;
  message: string;
  contextLimit?: number;
}): Promise<void> {
  await bridgeInvoke("room-send", params);
}

/* ── Projects ──────────────────────────────────────────────────────────────── */

export interface BridgeProject {
  id: string;
  name: string;
  description: string;
  emoji: string;
  kind?: "project" | "workflow";
  status: "active" | "archived" | "completed";
  leadAgentId?: string;
  teamModeEnabled?: boolean;
  defaultWorkflowTemplateId?: string;
  createdAt: number;
  updatedAt: number;
  members?: Array<{ projectId: string; agentId: string; role: string; addedAt: number }>;
}

export async function listProjects(filter: { status?: string; kind?: BridgeProject["kind"] } | string = {}): Promise<BridgeProject[]> {
  const params = typeof filter === "string" ? { status: filter } : filter;
  const result = await bridgeInvoke("project-list", params);
  const r = result as { success?: boolean; data?: BridgeProject[] };
  return r?.data ?? (Array.isArray(result) ? (result as BridgeProject[]) : []);
}

export async function getProject(id: string): Promise<BridgeProject | null> {
  const result = await bridgeInvoke("project-get", { id });
  const r = result as { success?: boolean; data?: BridgeProject };
  return r?.data ?? null;
}

/* ── Workflow templates & runs ─────────────────────────────────────────────── */

export interface BridgeWorkflowTemplate {
  id: string;
  projectId: string;
  name: string;
  description: string;
  triggerExamples?: string[];
  category?: string;
  tags?: string[];
  version?: number;
  visibility?: "private" | "team" | "system" | string;
  source?: "manual" | "prompt" | "agent_json" | "wirebuilder" | "clone" | "static_seed" | string;
  prompt?: string;
  preview?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  steps?: BridgeWorkflowStep[];
}

export interface BridgeWorkflowStep {
  id: string;
  name: string;
  stepType:
    | "manual_trigger"
    | "agent_task"
    | "human_approval"
    | "notification"
    | "wait"
    | "condition"
    | "sql_query"
    | "chart"
    | "component"
    | string;
  dependsOn?: string[];
  preferredAgentId?: string;
  preferredRole?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  position: number;
}

export interface BridgeWorkflowGraph {
  id: string;
  projectId?: string;
  templateId?: string;
  graph: Record<string, unknown>;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface BridgeWorkflowComponent {
  id: string;
  kind: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  spec: Record<string, unknown>;
  tags: string[];
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface BridgeWorkflowChartSpec {
  id: string;
  projectId?: string;
  templateId?: string;
  stepId?: string;
  name: string;
  chartType: string;
  dataSource: Record<string, unknown>;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface BridgeWorkflowDraft {
  id: string;
  projectId?: string;
  templateId?: string;
  name: string;
  source: string;
  draft: Record<string, unknown>;
  warnings: string[];
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowTemplateDraftStep {
  id: string;
  type?: string;
  stepType?: BridgeWorkflowStep["stepType"];
  title?: string;
  name?: string;
  assignedAgentId?: string;
  preferredAgentId?: string;
  preferredRole?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  dependsOn?: string[];
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowTemplateDraft {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  ownerIntent?: string;
  createdBy?: string;
  prompt?: string;
  visibility?: string;
  steps?: WorkflowTemplateDraftStep[];
  components?: Array<Record<string, unknown>>;
  graph?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BridgeWorkflowRun {
  id: string;
  templateId: string;
  projectId: string;
  status: "pending" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
  startedBy?: string;
  currentGateStepId?: string;
  createdAt: number;
  updatedAt: number;
  steps?: BridgeWorkflowStepRun[];
}

export interface BridgeWorkflowStepRun {
  id: string;
  workflowRunId: string;
  stepTemplateId: string;
  name: string;
  stepType: string;
  status: "pending" | "running" | "waiting_approval" | "completed" | "failed" | "skipped";
  assignedAgentId?: string;
  dependsOn?: string[];
  position: number;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

function unwrapBridgeData<T>(result: unknown, fallback: T): T {
  const record = result as { success?: boolean; data?: T };
  return record?.data ?? fallback;
}

export async function listWorkflowTemplates(projectId?: string): Promise<BridgeWorkflowTemplate[]> {
  const result = await bridgeInvoke("workflow-template-list", projectId ? { projectId } : {});
  return unwrapBridgeData<BridgeWorkflowTemplate[]>(result, []);
}

export async function getWorkflowTemplate(id: string): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-get", { id });
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function createWorkflowTemplate(input: {
  projectId: string;
  name: string;
  description?: string;
  triggerExamples?: string[];
  category?: string;
  tags?: string[];
  visibility?: string;
  source?: string;
  prompt?: string;
  preview?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  steps?: BridgeWorkflowStep[];
}): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-create", input);
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function updateWorkflowTemplate(id: string, patch: Partial<BridgeWorkflowTemplate>): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-update", { id, ...patch });
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function publishWorkflowTemplate(id: string): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-publish", { id });
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function archiveWorkflowTemplate(id: string): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-archive", { id });
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function deleteWorkflowTemplate(id: string): Promise<boolean> {
  const result = await bridgeInvoke("workflow-template-delete", { id });
  const r = result as { success?: boolean };
  return r?.success ?? false;
}

export async function cloneWorkflowTemplate(id: string, projectId?: string, name?: string): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-clone", {
    id,
    ...(projectId ? { projectId } : {}),
    ...(name ? { name } : {}),
  });
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function saveWorkflowGraph(input: {
  projectId?: string;
  templateId?: string;
  graph: Record<string, unknown>;
}): Promise<BridgeWorkflowGraph | null> {
  const result = await bridgeInvoke("workflow-graph-save", input);
  return unwrapBridgeData<BridgeWorkflowGraph | null>(result, null);
}

export async function getWorkflowGraph(input: {
  projectId?: string;
  templateId?: string;
}): Promise<BridgeWorkflowGraph | null> {
  const result = await bridgeInvoke("workflow-graph-get", input);
  return unwrapBridgeData<BridgeWorkflowGraph | null>(result, null);
}

export async function publishWorkflowGraphTemplate(input: {
  projectId: string;
  name: string;
  description?: string;
  graph?: Record<string, unknown>;
}): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-graph-publish-template", input);
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function listWorkflowComponents(filter: { kind?: string; category?: string } = {}): Promise<BridgeWorkflowComponent[]> {
  const result = await bridgeInvoke("workflow-component-list", filter);
  return unwrapBridgeData<BridgeWorkflowComponent[]>(result, []);
}

export async function listWorkflowChartSpecs(filter: {
  projectId?: string;
  templateId?: string;
  stepId?: string;
} = {}): Promise<BridgeWorkflowChartSpec[]> {
  const result = await bridgeInvoke("workflow-chart-spec-list", filter);
  return unwrapBridgeData<BridgeWorkflowChartSpec[]>(result, []);
}

export async function listWorkflowCharts(filter: {
  projectId?: string;
  templateId?: string;
  stepId?: string;
} = {}): Promise<BridgeWorkflowChartSpec[]> {
  const result = await bridgeInvoke("workflow-chart-list", filter);
  return unwrapBridgeData<BridgeWorkflowChartSpec[]>(result, []);
}

export async function saveWorkflowChartSpec(input: Partial<BridgeWorkflowChartSpec> & { name: string }): Promise<BridgeWorkflowChartSpec | null> {
  const result = await bridgeInvoke("workflow-chart-spec-save", input);
  return unwrapBridgeData<BridgeWorkflowChartSpec | null>(result, null);
}

export async function saveWorkflowDraft(input: {
  id?: string;
  projectId?: string;
  templateId?: string;
  name?: string;
  source?: string;
  draft: Record<string, unknown>;
  status?: string;
}): Promise<{ draft: BridgeWorkflowDraft | null; warnings: string[]; valid: boolean }> {
  const result = await bridgeInvoke("workflow-draft-save", input);
  const r = result as { success?: boolean; warnings?: string[] };
  return {
    draft: unwrapBridgeData<BridgeWorkflowDraft | null>(result, null),
    warnings: r?.warnings ?? [],
    valid: r?.success ?? false,
  };
}

export async function createWorkflowDraft(input: {
  id?: string;
  projectId?: string;
  templateId?: string;
  name?: string;
  source?: string;
  draft: WorkflowTemplateDraft | Record<string, unknown>;
  status?: string;
}): Promise<{ draft: BridgeWorkflowDraft | null; warnings: string[]; valid: boolean }> {
  const result = await bridgeInvoke("workflow-draft-create", input);
  const r = result as { success?: boolean; warnings?: string[] };
  return {
    draft: unwrapBridgeData<BridgeWorkflowDraft | null>(result, null),
    warnings: r?.warnings ?? [],
    valid: r?.success ?? false,
  };
}

export async function promoteWorkflowDraft(id: string, projectId?: string): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-draft-promote", {
    id,
    ...(projectId ? { projectId } : {}),
  });
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function createWorkflowTemplateFromPrompt(input: {
  projectId: string;
  prompt: string;
  name?: string;
  createdBy?: string;
}): Promise<BridgeWorkflowTemplate | null> {
  const result = await bridgeInvoke("workflow-template-create-from-prompt", input);
  return unwrapBridgeData<BridgeWorkflowTemplate | null>(result, null);
}

export async function listWorkflowDrafts(filter: { projectId?: string; status?: string } = {}): Promise<BridgeWorkflowDraft[]> {
  const result = await bridgeInvoke("workflow-draft-list", filter);
  return unwrapBridgeData<BridgeWorkflowDraft[]>(result, []);
}

export async function listWorkflowRuns(projectId?: string, status?: string): Promise<BridgeWorkflowRun[]> {
  const params: Record<string, string> = {};
  if (projectId) params.projectId = projectId;
  if (status) params.status = status;
  const result = await bridgeInvoke("workflow-run-list", params);
  return unwrapBridgeData<BridgeWorkflowRun[]>(result, []);
}

export async function getWorkflowRun(id: string): Promise<BridgeWorkflowRun | null> {
  const result = await bridgeInvoke("workflow-run-get", { id });
  return unwrapBridgeData<BridgeWorkflowRun | null>(result, null);
}

export async function startWorkflowRun(templateId: string, startedBy?: string): Promise<BridgeWorkflowRun | null> {
  const result = await bridgeInvoke("workflow-run-start", {
    templateId,
    ...(startedBy ? { startedBy } : {}),
  });
  return unwrapBridgeData<BridgeWorkflowRun | null>(result, null);
}

export async function cancelWorkflowRun(id: string): Promise<boolean> {
  const result = await bridgeInvoke("workflow-run-cancel", { id });
  const r = result as { success?: boolean };
  return r?.success ?? false;
}

/* ── Intel (agent database) ────────────────────────────────────────────────── */

export interface IntelTableColumn {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: string | null;
}

export interface IntelTableInfo {
  name: string;
  columns: IntelTableColumn[];
  rowCount?: number;
}

export async function intelSchema(): Promise<IntelTableInfo[]> {
  const result = await bridgeInvoke("intel-schema", {});
  const r = result as { tables?: IntelTableInfo[] };
  return r?.tables ?? [];
}

export async function intelQuery(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  const result = await bridgeInvoke("intel-query", { sql });
  return (result as { columns: string[]; rows: unknown[][] }) ?? { columns: [], rows: [] };
}

export async function intelExecute(sql: string, agentId?: string): Promise<{ rowsAffected: number }> {
  const result = await bridgeInvoke("intel-execute", {
    sql,
    ...(agentId ? { agent_id: agentId } : {}),
  });
  return (result as { rowsAffected: number }) ?? { rowsAffected: 0 };
}

/* ── Knowledge base (~/.hyperclaw/<companyId>/<collection>/) ─────────────── */

export type KnowledgeFileType =
  | "markdown"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "csv"
  | "unknown";

export interface KnowledgeFileEntry {
  relativePath: string;   // relative to companyDir, e.g. "brand/voice.md"
  name: string;
  collection: string;     // top-level folder name
  updatedAt: string;
  sizeBytes: number;
  fileType?: KnowledgeFileType; // app-level preview type, e.g. "markdown" or "image"
  mimeType?: string;      // best-effort MIME type from the connector/local scan
  agentId?: string;       // agent that last wrote this file (if known)
}

export interface KnowledgeCollectionEntry {
  id: string;             // folder slug, e.g. "brand"
  name: string;           // display name
  fileCount: number;
  lastModified: string;
  files: KnowledgeFileEntry[];
}

export interface KnowledgeListResult {
  success: boolean;
  collections: KnowledgeCollectionEntry[];
  error?: string;
}

function canUseLocalKnowledgeMediaFallback(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

function isKnowledgeFileEntry(value: unknown): value is KnowledgeFileEntry {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<KnowledgeFileEntry>;
  return (
    typeof file.relativePath === "string" &&
    typeof file.name === "string" &&
    typeof file.collection === "string" &&
    typeof file.updatedAt === "string" &&
    typeof file.sizeBytes === "number"
  );
}

async function listLocalKnowledgeMedia(companyId: string): Promise<KnowledgeFileEntry[]> {
  if (!canUseLocalKnowledgeMediaFallback()) return [];

  try {
    const response = await fetch(
      `/api/knowledge-local-media?companyId=${encodeURIComponent(companyId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];

    const result = await response.json() as { success?: boolean; files?: unknown[] };
    if (!result.success || !Array.isArray(result.files)) return [];
    return result.files.filter(isKnowledgeFileEntry);
  } catch {
    return [];
  }
}

async function getLocalKnowledgeText(
  companyId: string,
  relativePath: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!canUseLocalKnowledgeMediaFallback()) return { success: false };

  try {
    const response = await fetch(
      `/api/knowledge-local-text?companyId=${encodeURIComponent(companyId)}&relativePath=${encodeURIComponent(relativePath)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return { success: false };

    const result = await response.json() as { success?: boolean; content?: unknown; error?: string };
    if (result.success && typeof result.content === "string") {
      return { success: true, content: result.content };
    }
    return { success: false, error: result.error };
  } catch {
    return { success: false };
  }
}

function mergeKnowledgeMediaFiles(
  collections: KnowledgeCollectionEntry[],
  mediaFiles: KnowledgeFileEntry[],
): KnowledgeCollectionEntry[] {
  if (mediaFiles.length === 0) return collections;

  const byCollection = new Map<string, KnowledgeCollectionEntry>();
  for (const collection of collections) {
    byCollection.set(collection.id, {
      ...collection,
      files: [...(collection.files ?? [])],
    });
  }

  for (const mediaFile of mediaFiles) {
    const existing = byCollection.get(mediaFile.collection) ?? {
      id: mediaFile.collection,
      name: mediaFile.collection,
      fileCount: 0,
      lastModified: mediaFile.updatedAt,
      files: [],
    };

    if (!existing.files.some((file) => file.relativePath === mediaFile.relativePath)) {
      existing.files.push(mediaFile);
    }
    byCollection.set(existing.id, existing);
  }

  return Array.from(byCollection.values())
    .map((collection) => {
      const files = [...collection.files].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      return {
        ...collection,
        files,
        fileCount: files.length,
        lastModified: files[0]?.updatedAt ?? collection.lastModified,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function knowledgeList(companyId: string): Promise<KnowledgeListResult> {
  const result = await bridgeInvoke("knowledge-list", { companyId });
  const list = (result as KnowledgeListResult) ?? { success: false, collections: [] };
  if (!list.success) return list;

  const mediaFiles = await listLocalKnowledgeMedia(companyId);
  return {
    ...list,
    collections: mergeKnowledgeMediaFiles(list.collections ?? [], mediaFiles),
  };
}

export async function knowledgeGetDoc(
  companyId: string,
  relativePath: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const result = await bridgeInvoke("knowledge-get-doc", { companyId, relativePath });
    const doc = (result as { success: boolean; content?: string; error?: string }) ??
      { success: false };
    if (doc.success && typeof doc.content === "string") return doc;
    const localDoc = await getLocalKnowledgeText(companyId, relativePath);
    return localDoc.success ? localDoc : doc;
  } catch {
    return getLocalKnowledgeText(companyId, relativePath);
  }
}

export async function knowledgeWriteDoc(
  companyId: string,
  relativePath: string,
  content: string,
  agentId?: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await bridgeInvoke("knowledge-write-doc", {
    companyId,
    relativePath,
    content,
    ...(agentId ? { agentId } : {}),
  });
  return (result as { success: boolean; error?: string }) ?? { success: false };
}

export async function knowledgeDeleteDoc(
  companyId: string,
  relativePath: string
): Promise<{ success: boolean; error?: string }> {
  const result = await bridgeInvoke("knowledge-delete-doc", { companyId, relativePath });
  return (result as { success: boolean; error?: string }) ?? { success: false };
}

export async function knowledgeCreateCollection(
  companyId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const result = await bridgeInvoke("knowledge-create-collection", { companyId, name });
  return (result as { success: boolean; error?: string }) ?? { success: false };
}

export async function knowledgeDeleteCollection(
  companyId: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await bridgeInvoke("knowledge-delete-collection", { companyId, id });
  return (result as { success: boolean; error?: string }) ?? { success: false };
}

export async function knowledgeGetFileBinary(
  companyId: string,
  relativePath: string
): Promise<{ success: boolean; content?: string; mimeType?: string; error?: string }> {
  const result = await bridgeInvoke("knowledge-get-binary", { companyId, relativePath });
  return (result as { success: boolean; content?: string; mimeType?: string; error?: string }) ??
    { success: false, error: "Binary preview not supported by connector" };
}
