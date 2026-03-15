import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Network, RefreshCw, Loader2, Plus } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { syncToIdentityMd, saveAgentName } from "$/lib/identity-md";
import { AppSchema } from "@OS/Layout/types";
import type { SidebarSection, SidebarItem } from "@OS/Layout/Sidebar/SidebarSchema";
import { useAgentIdentities, resolveAvatarUrl, patchIdentityCache } from "$/hooks/useAgentIdentity";

export interface OrgDepartment {
  id: string;
  name: string;
  color: string;
}

export interface OrgNode {
  id: string;
  name: string;
  role: string;
  agentId: string;
  type: "orchestrator" | "lead" | "specialist";
  department?: string;
  status: "idle" | "working" | "offline";
  liveStatus?: string;
}

export interface OrgEdge {
  from: string;
  to: string;
  label?: string;
}

export interface OrgTask {
  id: string;
  title: string;
  assignedTo: string;
  delegatedBy?: string;
  description?: string;
  status: "pending" | "in-progress" | "done";
  createdAt: string;
  updatedAt: string;
}

export interface OrgChartData {
  nodes: OrgNode[];
  edges: OrgEdge[];
  tasks: OrgTask[];
  departments: OrgDepartment[];
}

interface OrgChartContextValue {
  activeData: OrgChartData | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  loading: boolean;
  error: string | null;
  appSchema: AppSchema;
  refresh: () => Promise<void>;
  assignTask: (nodeId: string, title: string, description?: string) => Promise<void>;
  updateTask: (taskId: string, patch: Record<string, unknown>) => Promise<void>;
  updateNode: (id: string, patch: Record<string, unknown>) => Promise<void>;
  moveNodeToDepartment: (nodeId: string, deptId: string | null) => void;
  addDepartment: (dept: OrgDepartment) => void;
  removeDepartment: (deptId: string) => void;
  addAgentOpen: boolean;
  setAddAgentOpen: (open: boolean) => void;
}

const OrgChartContext = createContext<OrgChartContextValue | undefined>(undefined);

export function useOrgChart() {
  const ctx = useContext(OrgChartContext);
  if (!ctx) throw new Error("useOrgChart must be used within OrgChartProvider");
  return ctx;
}

interface BridgeAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
}

async function fetchOrgStatus(contextAgents: BridgeAgent[]): Promise<OrgChartData> {
  let res: unknown;
  try {
    res = await bridgeInvoke("get-org-status", {});
  } catch (e) {
    throw e;
  }
  const obj = res as Record<string, unknown> | null;
  if (!obj || (obj as { success?: boolean }).success === false) {
    const err = (obj as { error?: string })?.error || "Bridge call failed";
    throw new Error(err);
  }
  const data = obj as unknown as OrgChartData;
  const orgNodes: OrgNode[] = data.nodes ?? [];
  const orgAgentIds = new Set(orgNodes.map((n) => n.agentId));

  // Merge unlisted agents from context (no extra bridge call)
  const unlistedNodes: OrgNode[] = contextAgents
    .filter((a) => !orgAgentIds.has(a.id) && !orgAgentIds.has(a.name))
    .map((a) => ({
      id: `unlisted-${a.id}`,
      name: a.name,
      role: a.role || "",
      agentId: a.id,
      type: "specialist" as const,
      status: (a.status === "active" || a.status === "working" ? "working" : "idle") as "idle" | "working" | "offline",
      liveStatus: a.status,
    }));

  return {
    nodes: [...orgNodes, ...unlistedNodes],
    edges: data.edges ?? [],
    tasks: data.tasks ?? [],
    departments: data.departments ?? [],
  };
}

/**
 * Sync allowAgents in openclaw.json for all leads.
 * Each lead gets the agentIds of all other nodes in the same department.
 * Agents that are no longer leads get their allowAgents removed.
 */
async function syncAllowAgentsToConfig(nodes: OrgNode[]) {
  try {
    const res = (await bridgeInvoke("get-openclaw-doc", {
      relativePath: "openclaw.json",
    })) as { success?: boolean; content?: string };
    if (!res?.success || !res.content) return;

    const config = JSON.parse(res.content);
    if (!config.agents) config.agents = {};
    if (!Array.isArray(config.agents.list)) config.agents.list = [];

    const list = config.agents.list as Record<string, unknown>[];

    // Build a lookup: agentId → entry index
    const entryByAgentId = new Map<string, number>();
    for (let i = 0; i < list.length; i++) {
      const id = list[i].id as string;
      if (id) entryByAgentId.set(id, i);
    }

    // Collect all teammates per agentId across all departments
    // (handles the same agent being lead in multiple departments)
    const leadAllowMap = new Map<string, Set<string>>();

    for (const node of nodes) {
      if (node.type !== "lead" || !node.department) continue;

      if (!leadAllowMap.has(node.agentId)) {
        leadAllowMap.set(node.agentId, new Set());
      }
      const allowed = leadAllowMap.get(node.agentId)!;

      // Gather teammate agentIds in the same department (excluding the lead node itself)
      for (const n of nodes) {
        if (
          n.id !== node.id &&
          n.department === node.department &&
          n.type !== "orchestrator" &&
          n.agentId !== node.agentId
        ) {
          allowed.add(n.agentId);
        }
      }
    }

    // Write merged allowAgents for each lead
    for (const [agentId, allowed] of leadAllowMap) {
      let idx = entryByAgentId.get(agentId);
      if (idx === undefined) {
        idx = list.length;
        list.push({ id: agentId });
        entryByAgentId.set(agentId, idx);
      }
      const teammates = [...allowed];
      if (teammates.length > 0) {
        list[idx].subagents = { allowAgents: teammates };
      } else {
        delete list[idx].subagents;
      }
    }

    const leadAgentIds = new Set(leadAllowMap.keys());

    // Remove subagents from agents that are no longer leads
    for (const entry of list) {
      const id = entry.id as string;
      if (id && !leadAgentIds.has(id) && "subagents" in entry) {
        delete entry.subagents;
      }
    }

    // Clean up entries that have only an id and nothing else
    config.agents.list = list.filter(
      (entry) => Object.keys(entry).length > 1 || leadAgentIds.has(entry.id as string)
    );
    // If list ended up empty, keep the original structure
    if (config.agents.list.length === 0) delete config.agents.list;

    await bridgeInvoke("write-openclaw-doc", {
      relativePath: "openclaw.json",
      content: JSON.stringify(config, null, 2),
    });

    // Also persist to SQLite agent config for each affected agent
    const allAgentIds = new Set([...leadAgentIds]);
    // Include agents that had subagents removed
    for (const entry of config.agents.list ?? []) {
      if (entry.id) allAgentIds.add(entry.id as string);
    }
    for (const agentId of allAgentIds) {
      const entry = (config.agents.list ?? []).find(
        (e: Record<string, unknown>) => e.id === agentId
      );
      const agentConfig = entry?.subagents
        ? { subagents: entry.subagents }
        : {};
      bridgeInvoke("update-agent-config", {
        agentId,
        config: agentConfig,
      }).catch(() => {});
    }
  } catch {
    // Non-fatal — config sync failure shouldn't break the UI
  }
}

/**
 * Sync Teammate and TeamLead fields to each agent's IDENTITY.md.
 * - Specialists get a TeamLead field (the lead of their department).
 * - Leads get a Teammate field (comma-separated list of members in their department).
 */
async function syncTeamFieldsToIdentity(nodes: OrgNode[], departments: OrgDepartment[]) {
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  for (const node of nodes) {
    if (node.type === "orchestrator" || !node.department) continue;

    const deptNodes = nodes.filter(
      (n) => n.department === node.department && n.id !== node.id && n.type !== "orchestrator"
    );

    if (node.type === "lead") {
      // Lead gets Teammate = comma-separated list of specialist names/agentIds
      const teammates = deptNodes.map((n) => n.name || n.agentId).join(", ");
      syncToIdentityMd(node.agentId, {
        teammate: teammates || "(none)",
        department: deptNameById.get(node.department) || node.department,
      }).catch(() => {});
    } else {
      // Specialist gets TeamLead = the lead's name/agentId
      const lead = nodes.find(
        (n) => n.department === node.department && n.type === "lead"
      );
      syncToIdentityMd(node.agentId, {
        teamLead: lead ? (lead.name || lead.agentId) : "(none)",
        department: deptNameById.get(node.department) || node.department,
      }).catch(() => {});
    }
  }
}

export function OrgChartProvider({ children }: { children: React.ReactNode }) {
  const { agents: openClawAgents } = useOpenClawContext();
  const [orgData, setOrgData] = useState<OrgChartData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(0); // count of in-flight background ops
  const [error, setError] = useState<string | null>(null);
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  const activeData = orgData;

  // Fetch agent identities for sidebar icons
  const agentIds = useMemo(
    () => (activeData?.nodes ?? []).map((n) => n.agentId),
    [activeData]
  );
  const identities = useAgentIdentities(agentIds);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrgStatus(openClawAgents as BridgeAgent[]);
      setOrgData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load org chart");
    } finally {
      setLoading(false);
    }
  }, [openClawAgents]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    refresh();
  }, [refresh]);

  // --- Mutations (all optimistic) ---
  // Helper to optimistically apply a node patch to orgData
  const applyOptimisticPatch = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setOrgData((prev) => {
        if (!prev) return prev;
        const nodes = prev.nodes.map((n) =>
          n.id === id ? ({ ...n, ...patch } as OrgNode) : n
        );
        let edges = prev.edges;
        if ("department" in patch) {
          const deptId = patch.department as string | undefined;
          edges = edges.filter((e) => e.to !== id);
          if (deptId) {
            const lead = nodes.find(
              (n) => n.department === deptId && n.type === "lead" && n.id !== id
            );
            edges = [...edges, { from: lead ? lead.id : "orchestrator", to: id }];
          } else {
            edges = [...edges, { from: "orchestrator", to: id }];
          }
        }
        return { ...prev, nodes, edges };
      });
    },
    []
  );

  const updateNode = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      // Optimistic update — apply immediately so UI doesn't block
      applyOptimisticPatch(id, patch);

      // Fire remote calls in background with syncing indicator
      const node = orgData?.nodes.find((n) => n.id === id);
      setSyncing((c) => c + 1);

      const done = () => setSyncing((c) => Math.max(0, c - 1));

      bridgeInvoke("update-org-node", { nodeId: id, patch })
        .catch(() => refresh())
        .finally(done);

      // Sync name/role to IDENTITY.md + name to openclaw.json
      if (node) {
        const identityPatch: { name?: string; role?: string } = {};
        if (typeof patch.name === "string") identityPatch.name = patch.name;
        if (typeof patch.role === "string") identityPatch.role = patch.role;
        if (Object.keys(identityPatch).length > 0) {
          // Update identity cache immediately so sidebar + cards reflect the change
          patchIdentityCache(node.agentId, identityPatch);
          syncToIdentityMd(node.agentId, identityPatch).catch(() => {});
        }
        if (typeof patch.name === "string") {
          saveAgentName(node.agentId, patch.name).catch(() => {});
        }
      }

      // Sync allowAgents in openclaw.json when type or department changes
      if ("type" in patch || "department" in patch) {
        const updatedNodes = (orgData?.nodes ?? []).map((n) =>
          n.id === id ? ({ ...n, ...patch } as OrgNode) : n
        );
        syncAllowAgentsToConfig(updatedNodes).catch(() => {});
        syncTeamFieldsToIdentity(updatedNodes, orgData?.departments ?? []).catch(() => {});
      }
    },
    [orgData, applyOptimisticPatch, refresh]
  );

  const moveNodeToDepartment = useCallback(
    (nodeId: string, deptId: string | null) => {
      // Optimistic local update
      setOrgData((prev) => {
        if (!prev) return prev;
        const node = prev.nodes.find((n) => n.id === nodeId);
        if (!node || node.type === "orchestrator") return prev;
        if ((node.department ?? null) === deptId) return prev;

        const nodes = prev.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const updated = { ...n };
          if (deptId) {
            updated.department = deptId;
          } else {
            delete updated.department;
          }
          return updated;
        });

        let edges = prev.edges.filter((e) => e.to !== nodeId);
        if (deptId) {
          const lead = nodes.find(
            (n) => n.department === deptId && n.type === "lead" && n.id !== nodeId
          );
          edges.push({ from: lead ? lead.id : "orchestrator", to: nodeId });
        } else {
          edges.push({ from: "orchestrator", to: nodeId });
        }
        return { ...prev, nodes, edges };
      });

      // Persist in background
      setSyncing((c) => c + 1);
      const done = () => setSyncing((c) => Math.max(0, c - 1));
      bridgeInvoke("update-org-node", {
        nodeId,
        patch: { department: deptId || undefined },
      })
        .catch(() => refresh())
        .finally(done);

      // Sync allowAgents since department changed
      const updatedNodes = (orgData?.nodes ?? []).map((n) =>
        n.id === nodeId
          ? ({ ...n, department: deptId || undefined } as OrgNode)
          : n
      );
      syncAllowAgentsToConfig(updatedNodes).catch(() => {});
      syncTeamFieldsToIdentity(updatedNodes, orgData?.departments ?? []).catch(() => {});
    },
    [orgData, refresh]
  );

  const addDepartment = useCallback(
    (dept: OrgDepartment) => {
      // Optimistic local update
      setOrgData((prev) => {
        if (!prev) return prev;
        return { ...prev, departments: [...prev.departments, dept] };
      });

      // Persist full orgchart in background
      setSyncing((c) => c + 1);
      const done = () => setSyncing((c) => Math.max(0, c - 1));
      setOrgData((current) => {
        if (current) {
          bridgeInvoke("write-orgchart", { orgChartData: current })
            .catch(() => refresh())
            .finally(done);
        } else {
          done();
        }
        return current;
      });
    },
    [refresh]
  );

  const removeDepartment = useCallback(
    (deptId: string) => {
      // Optimistic local update
      setOrgData((prev) => {
        if (!prev) return prev;
        const displacedIds = new Set(
          prev.nodes.filter((n) => n.department === deptId).map((n) => n.id)
        );
        const nodes = prev.nodes.map((n) => {
          if (n.department !== deptId) return n;
          const { department, ...rest } = n;
          return rest as OrgNode;
        });
        let edges = prev.edges.filter((e) => !displacedIds.has(e.to));
        for (const id of displacedIds) {
          edges.push({ from: "orchestrator", to: id });
        }
        return {
          ...prev,
          departments: prev.departments.filter((d) => d.id !== deptId),
          nodes,
          edges,
        };
      });

      // Persist full orgchart in background
      setSyncing((c) => c + 1);
      const done = () => setSyncing((c) => Math.max(0, c - 1));
      setOrgData((current) => {
        if (current) {
          bridgeInvoke("write-orgchart", { orgChartData: current })
            .catch(() => refresh())
            .finally(done);
        } else {
          done();
        }
        return current;
      });

      // Sync allowAgents since nodes may have lost departments
      const updatedNodes = (orgData?.nodes ?? []).map((n) =>
        n.department === deptId
          ? ({ ...n, department: undefined } as OrgNode)
          : n
      );
      syncAllowAgentsToConfig(updatedNodes).catch(() => {});
      syncTeamFieldsToIdentity(updatedNodes, orgData?.departments ?? []).catch(() => {});
    },
    [orgData, refresh]
  );

  const assignTask = useCallback(
    async (nodeId: string, title: string, description?: string) => {
      await bridgeInvoke("assign-orgchart-task", {
        nodeId,
        title,
        description,
        delegatedBy: "orchestrator",
      });
      await refresh();
    },
    [refresh]
  );

  const updateTask = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      await bridgeInvoke("update-orgchart-task", { id: taskId, patch });
      await refresh();
    },
    [refresh]
  );

  // --- Sidebar ---
  const sidebarSections = useMemo((): SidebarSection[] => {
    if (!activeData) return [];
    const departments = activeData.departments ?? [];
    const tasks = activeData.tasks ?? [];

    const makeNodeItem = (node: OrgNode): SidebarItem => {
      const taskCount = tasks.filter(
        (t) => t.assignedTo === node.id && t.status !== "done"
      ).length;
      const identity = identities.get(node.agentId);
      const avatarUrl = resolveAvatarUrl(identity?.avatar);
      return {
        id: node.id,
        title: identity?.name || node.name,
        subtitle:
          taskCount > 0
            ? `${taskCount} task${taskCount > 1 ? "s" : ""}`
            : node.role,
        emoji: identity?.emoji || undefined,
        avatarUrl: avatarUrl || undefined,
        icon: !identity?.emoji && !avatarUrl ? Network : undefined,
        isActive: selectedNodeId === node.id,
        onClick: () => setSelectedNodeId(node.id),
      };
    };

    const sections: SidebarSection[] = [];
    const orchestrators = activeData.nodes.filter((n) => n.type === "orchestrator");
    if (orchestrators.length > 0) {
      sections.push({
        id: "org-orchestrators",
        type: "default" as const,
        title: "Leadership",
        items: orchestrators.map(makeNodeItem),
      });
    }
    for (const dept of departments) {
      const deptNodes = activeData.nodes.filter(
        (n) => n.department === dept.id && n.type !== "orchestrator"
      );
      if (deptNodes.length === 0) continue;
      sections.push({
        id: `dept-${dept.id}`,
        type: "collapsible" as const,
        title: dept.name,
        items: deptNodes.map(makeNodeItem),
      });
    }
    const unassigned = activeData.nodes.filter(
      (n) => n.type !== "orchestrator" && !n.department
    );
    if (unassigned.length > 0) {
      sections.push({
        id: "org-unassigned",
        type: "collapsible" as const,
        title: "Unassigned",
        items: unassigned.map(makeNodeItem),
      });
    }
    return sections;
  }, [activeData, selectedNodeId, identities]);

  // --- Header ---
  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        title: "Org Chart",
        icon: Network,
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "add-agent",
              icon: <Plus className="h-4 w-4" />,
              onClick: () => setAddAgentOpen(true),
              label: "Add Agent",
              variant: "ghost" as const,
            },
            {
              id: "refresh-org",
              icon: loading || syncing > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              ),
              onClick: () => refresh(),
              label: "Refresh",
            },
          ],
        },
      },
      sidebar: { sections: sidebarSections },
    }),
    [sidebarSections, refresh, loading, syncing]
  );

  const value = useMemo<OrgChartContextValue>(
    () => ({
      activeData,
      selectedNodeId,
      setSelectedNodeId,
      loading,
      error,
      appSchema,
      refresh,
      assignTask,
      updateTask,
      updateNode,
      moveNodeToDepartment,
      addDepartment,
      removeDepartment,
      addAgentOpen,
      setAddAgentOpen,
    }),
    [
      activeData, selectedNodeId, loading, error, appSchema,
      refresh, assignTask, updateTask, updateNode,
      moveNodeToDepartment, addDepartment, removeDepartment,
      addAgentOpen,
    ]
  );

  return (
    <OrgChartContext.Provider value={value}>{children}</OrgChartContext.Provider>
  );
}
