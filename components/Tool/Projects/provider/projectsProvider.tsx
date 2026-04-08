"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/* ── Types ────────────────────────────────────────────── */

export interface ProjectMember {
  projectId: string;
  agentId: string;
  role: "owner" | "contributor" | "viewer";
  addedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  emoji: string;
  status: "active" | "archived" | "completed";
  createdAt: number;
  updatedAt: number;
  members?: ProjectMember[];
}

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  error: string | null;
  selectedProject: Project | null;
  selectProject: (id: string | null) => void;
  createProject: (name: string, description: string, emoji: string) => Promise<Project | null>;
  updateProject: (id: string, patch: Partial<Pick<Project, "name" | "description" | "emoji" | "status">>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  addMember: (projectId: string, agentId: string, role?: string) => Promise<boolean>;
  removeMember: (projectId: string, agentId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

/* ── Provider ─────────────────────────────────────────── */

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("project-list", {})) as {
        success?: boolean;
        data?: Project[];
      };
      if (res?.success && Array.isArray(res.data)) {
        setProjects(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // When a project is selected, fetch its full detail (with members)
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedId) ?? null;
  }, [projects, selectedId]);

  const selectProject = useCallback(async (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    try {
      const res = (await bridgeInvoke("project-get", { id })) as {
        success?: boolean;
        data?: Project;
      };
      if (res?.success && res.data) {
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...res.data } : p))
        );
      }
    } catch {}
  }, []);

  const createProject = useCallback(async (name: string, description: string, emoji: string) => {
    try {
      const res = (await bridgeInvoke("project-create", { name, description, emoji })) as {
        success?: boolean;
        data?: Project;
      };
      if (res?.success && res.data) {
        setProjects((prev) => [res.data!, ...prev]);
        return res.data;
      }
    } catch {}
    return null;
  }, []);

  const updateProject = useCallback(async (id: string, patch: Partial<Pick<Project, "name" | "description" | "emoji" | "status">>) => {
    try {
      const res = (await bridgeInvoke("project-update", { id, ...patch })) as {
        success?: boolean;
        data?: Project;
      };
      if (res?.success && res.data) {
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...res.data } : p))
        );
        return res.data;
      }
    } catch {}
    return null;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    try {
      const res = (await bridgeInvoke("project-delete", { id })) as { success?: boolean };
      if (res?.success) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (selectedId === id) setSelectedId(null);
        return true;
      }
    } catch {}
    return false;
  }, [selectedId]);

  const addMember = useCallback(async (projectId: string, agentId: string, role = "contributor") => {
    try {
      const res = (await bridgeInvoke("project-add-member", { projectId, agentId, role })) as { success?: boolean };
      if (res?.success) {
        // Refresh the selected project members
        await selectProject(projectId);
        return true;
      }
    } catch {}
    return false;
  }, [selectProject]);

  const removeMember = useCallback(async (projectId: string, agentId: string) => {
    try {
      const res = (await bridgeInvoke("project-remove-member", { projectId, agentId })) as { success?: boolean };
      if (res?.success) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, members: (p.members ?? []).filter((m) => m.agentId !== agentId) }
              : p
          )
        );
        return true;
      }
    } catch {}
    return false;
  }, []);

  const value = useMemo<ProjectsContextValue>(() => ({
    projects,
    loading,
    error,
    selectedProject,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    addMember,
    removeMember,
    refresh: fetchProjects,
  }), [projects, loading, error, selectedProject, selectProject, createProject, updateProject, deleteProject, addMember, removeMember, fetchProjects]);

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}
