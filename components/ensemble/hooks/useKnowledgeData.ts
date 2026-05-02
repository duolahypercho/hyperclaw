"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import React from "react";
import {
  Folder,
  FileText,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Trash2,
  Save,
  Loader2,
  Library,
  Network,
} from "lucide-react";
import {
  knowledgeList,
  knowledgeGetDoc,
  knowledgeWriteDoc,
  knowledgeDeleteDoc,
  knowledgeCreateCollection,
  knowledgeDeleteCollection,
  knowledgeUploadFile,
  type KnowledgeCollectionEntry,
  type KnowledgeFileEntry,
} from "$/lib/hyperclaw-bridge-client";
import { useHyperclawContext, type HyperclawAgent } from "$/Providers/HyperclawProv";
import { dashboardState } from "$/lib/dashboard-state";
import { getCompanyName } from "$/components/ensemble/shared/toolSchema";
import { useRouter } from "next/router";
import type { AppSchema } from "@OS/Layout/types";
import type { SidebarItem } from "@OS/Layout/Sidebar/SidebarSchema";
import type { DialogData, DialogSchema } from "@OS/Layout/Dialog/DialogSchema";

export type { KnowledgeCollectionEntry, KnowledgeFileEntry, HyperclawAgent };
export type KnowledgeViewMode = "library" | "graph";

/** Derive companyId slug from the stored hyperclaw-company value. */
export function resolveCompanyId(): string {
  try {
    const raw = dashboardState.get("hyperclaw-company");
    if (!raw) return "default";
    const parsed = JSON.parse(raw) as { id?: string; name?: string };
    if (parsed?.id?.trim()) return parsed.id.trim();
    if (parsed?.name?.trim()) {
      return parsed.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    return "default";
  } catch {
    return "default";
  }
}

interface KnowledgeContextValue {
  companyId: string;
  agents: HyperclawAgent[];
  currentAgentId: string | null;
  setCurrentAgentId: (id: string | null) => void;
  collections: KnowledgeCollectionEntry[];
  selectedCollection: string | null;
  selectedPath: string | null;
  content: string | null;
  originalContent: string | null;
  loading: boolean;
  listLoading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  hasUnsavedChanges: boolean;
  viewMode: KnowledgeViewMode;
  setViewMode: (mode: KnowledgeViewMode) => void;
  confirmDiscardUnsavedChanges: () => boolean;
  appSchema: AppSchema;
  selectCollection: (id: string | null) => void;
  selectDoc: (relativePath: string | null) => void;
  refreshList: () => Promise<void>;
  setContent: (value: string | null) => void;
  saveDoc: () => Promise<boolean>;
  createDoc: (collection: string, name: string, initialContent?: string) => Promise<boolean>;
  createCollection: (name: string) => Promise<boolean>;
  deleteDoc: (relativePath: string) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  uploadFiles: (
    collection: string,
    files: File[],
  ) => Promise<{ uploaded: string[]; failed: { name: string; error: string }[] }>;
}

const KnowledgeContext = createContext<KnowledgeContextValue | undefined>(undefined);

export function useKnowledgeData() {
  const ctx = useContext(KnowledgeContext);
  if (!ctx) throw new Error("useKnowledgeData must be used within KnowledgeProvider");
  return ctx;
}

function isMarkdownKnowledgeFile(file: KnowledgeFileEntry): boolean {
  const path = file.relativePath.toLowerCase();
  return path.endsWith(".md") || path.endsWith(".mdx");
}

function buildSidebarSections(
  collections: KnowledgeCollectionEntry[],
  selectedCollection: string | null,
  selectedPath: string | null,
  selectCollection: (id: string | null) => void,
  selectDoc: (path: string | null) => void,
  onDeleteDoc: (path: string) => void,
  onDeleteCollection: (id: string) => void,
  confirmDiscardUnsavedChanges: () => boolean,
): { id: string; title: string; type: "collapsible"; items: SidebarItem[] }[] {
  return [
    {
      id: "collections",
      title: "Collections",
      type: "collapsible" as const,
      items: collections.map((col) => ({
        id: `col-${col.id}`,
        title: col.name,
        icon: Folder,
        isActive: selectedCollection === col.id && !selectedPath,
        onClick: () => {
          if (!confirmDiscardUnsavedChanges()) return;
          selectCollection(col.id);
          selectDoc(null);
        },
        isDraggable: false,
        contextMenu: [
          {
            type: "item" as const,
            label: "New document",
            icon: FilePlus,
            dialog: { id: "knowledge-new-doc", data: { collection: col.id } },
          },
          {
            type: "item" as const,
            label: "Delete collection",
            icon: Trash2,
            variant: "destructive" as const,
            onClick: () => onDeleteCollection(col.id),
          },
        ],
        items: (col.files ?? [])
          .filter(isMarkdownKnowledgeFile)
          .map((file) => ({
            id: file.relativePath,
            title: file.name,
            icon: FileText,
            isActive: selectedPath === file.relativePath,
            isDraggable: false,
            onClick: () => {
              if (!confirmDiscardUnsavedChanges()) return;
              selectCollection(col.id);
              selectDoc(file.relativePath);
            },
            contextMenu: [
              {
                type: "item" as const,
                label: "Delete",
                icon: Trash2,
                variant: "destructive" as const,
                onClick: () => onDeleteDoc(file.relativePath),
              },
            ],
          })),
      })),
    },
  ];
}

export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const companyId = useMemo(() => resolveCompanyId(), []);
  const router = useRouter();
  const companyName = useMemo(() => getCompanyName(), []);

  const { agents: hyperclawAgents = [] } = useHyperclawContext();
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [collections, setCollections] = useState<KnowledgeCollectionEntry[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContentState] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>("library");

  const refreshList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const result = await knowledgeList(companyId);
      if (result.success) {
        setCollections(result.collections ?? []);
      } else {
        setCollections([]);
        setError(result.error ?? "Failed to load knowledge base");
      }
    } catch (e) {
      setCollections([]);
      setError(e instanceof Error ? e.message : "Failed to load knowledge base");
    } finally {
      setListLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedCollection(id);
  }, []);

  const selectDoc = useCallback(
    (relativePath: string | null) => {
      setSelectedPath(relativePath);
      setContentState(null);
      setOriginalContent(null);
      setError(null);
      setSaveError(null);
      if (!relativePath) return;
      setLoading(true);
      knowledgeGetDoc(companyId, relativePath)
        .then((res) => {
          if (res.success && typeof res.content === "string") {
            setContentState(res.content);
            setOriginalContent(res.content);
          } else {
            setError(res.error ?? "Failed to load document");
          }
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Failed to load document");
        })
        .finally(() => setLoading(false));
    },
    [companyId]
  );

  const setContent = useCallback((value: string | null) => {
    setContentState(value);
    setSaveError(null);
  }, []);

  const saveDoc = useCallback(async (): Promise<boolean> => {
    if (!selectedPath || content === null) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await knowledgeWriteDoc(
        companyId,
        selectedPath,
        content,
        currentAgentId ?? undefined,
      );
      if (result.success) {
        setOriginalContent(content);
        return true;
      }
      setSaveError(result.error ?? "Failed to save");
      return false;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [companyId, selectedPath, content, currentAgentId]);

  const createDoc = useCallback(
    async (collection: string, name: string, initialContent = ""): Promise<boolean> => {
      const fileName = name.endsWith(".md") ? name : `${name}.md`;
      const relativePath = `${collection}/${fileName}`;
      try {
        const result = await knowledgeWriteDoc(
          companyId,
          relativePath,
          initialContent,
          currentAgentId ?? undefined,
        );
        if (result.success) {
          await refreshList();
          setSelectedCollection(collection);
          setSelectedPath(relativePath);
          setContentState(initialContent);
          setOriginalContent(initialContent);
          return true;
        }
        setError(result.error ?? "Failed to create document");
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create document");
        return false;
      }
    },
    [companyId, refreshList, currentAgentId]
  );

  const createCollection = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const result = await knowledgeCreateCollection(companyId, name);
        if (result.success) {
          await refreshList();
          return true;
        }
        setError(result.error ?? "Failed to create collection");
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create collection");
        return false;
      }
    },
    [companyId, refreshList]
  );

  const deleteDoc = useCallback(
    async (relativePath: string): Promise<boolean> => {
      try {
        const result = await knowledgeDeleteDoc(companyId, relativePath);
        if (result.success) {
          if (selectedPath === relativePath) {
            setSelectedPath(null);
            setContentState(null);
            setOriginalContent(null);
          }
          await refreshList();
          return true;
        }
        setError(result.error ?? "Failed to delete");
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
        return false;
      }
    },
    [companyId, selectedPath, refreshList]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const result = await knowledgeDeleteCollection(companyId, id);
        if (result.success) {
          if (selectedCollection === id) {
            setSelectedCollection(null);
            setSelectedPath(null);
            setContentState(null);
            setOriginalContent(null);
          }
          await refreshList();
          return true;
        }
        setError(result.error ?? "Failed to delete collection");
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete collection");
        return false;
      }
    },
    [companyId, selectedCollection, refreshList]
  );

  const uploadFiles = useCallback(
    async (
      collection: string,
      files: File[],
    ): Promise<{ uploaded: string[]; failed: { name: string; error: string }[] }> => {
      const uploaded: string[] = [];
      const failed: { name: string; error: string }[] = [];
      for (const file of files) {
        try {
          const result = await knowledgeUploadFile(companyId, collection, file);
          if (result.success && result.relativePath) {
            uploaded.push(result.relativePath);
          } else {
            failed.push({ name: file.name, error: result.error ?? "Upload failed" });
          }
        } catch (e) {
          failed.push({
            name: file.name,
            error: e instanceof Error ? e.message : "Upload failed",
          });
        }
      }
      if (uploaded.length > 0) {
        await refreshList();
      }
      if (failed.length > 0 && uploaded.length === 0) {
        setError(failed[0].error);
      }
      return { uploaded, failed };
    },
    [companyId, refreshList],
  );

  const hasUnsavedChanges =
    content !== null && originalContent !== null && content !== originalContent;

  const confirmDiscardUnsavedChanges = useCallback(
    () =>
      !hasUnsavedChanges ||
      (typeof window !== "undefined" &&
        window.confirm("You have unsaved changes. Discard them and open another knowledge item?")),
    [hasUnsavedChanges],
  );

  const appSchema: AppSchema = useMemo(() => {
    const sections = buildSidebarSections(
      collections,
      selectedCollection,
      selectedPath,
      selectCollection,
      selectDoc,
      (path) => void deleteDoc(path),
      (id) => void deleteCollection(id),
      confirmDiscardUnsavedChanges,
    );

    // Build dynamic breadcrumbs for the site header
    const activeCollection = collections.find((c) => c.id === selectedCollection);
    const activeFile = activeCollection?.files?.find((f) => f.relativePath === selectedPath);

    const breadcrumbs: { label: string; onClick?: () => void }[] = [
      { label: companyName, onClick: () => router.push("/dashboard") },
      {
        label: "Knowledge",
        onClick: selectedCollection
          ? () => { selectCollection(null); selectDoc(null); }
          : undefined,
      },
    ];
    if (activeCollection) {
      breadcrumbs.push({
        label: activeCollection.name.charAt(0).toUpperCase() + activeCollection.name.slice(1),
        onClick: selectedPath ? () => selectDoc(null) : undefined,
      });
    }
    if (activeFile) {
      breadcrumbs.push({
        label: activeFile.name.replace(/\.md$/, ""),
      });
    }

    return {
      header: {
        centerUI: {
          type: "breadcrumbs" as const,
          breadcrumbs,
        },
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "knowledge-library-view",
              label: "Library",
              icon: React.createElement(Library, { className: "h-4 w-4" }),
              onClick: () => setViewMode("library"),
              variant: viewMode === "library" ? "secondary" : "ghost",
              className: viewMode === "library"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground",
            },
            {
              id: "knowledge-graph-view",
              label: "Graph",
              icon: React.createElement(Network, { className: "h-4 w-4" }),
              onClick: () => setViewMode("graph"),
              variant: viewMode === "graph" ? "secondary" : "ghost",
              className: viewMode === "graph"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground",
            },
            {
              id: "knowledge-save",
              label: saving ? "Saving…" : "Save",
              icon: saving
                ? React.createElement(Loader2, { className: "h-4 w-4 animate-spin" })
                : React.createElement(Save, { className: "h-4 w-4" }),
              onClick: () => void saveDoc(),
              disabled: !selectedPath || content === null || saving,
              variant: hasUnsavedChanges ? "success" : "ghost",
              className: hasUnsavedChanges
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                : "text-muted-foreground",
            },
          ],
        },
      },
      sidebar: {
        sections,
      },
      dialogs: [
        {
          id: "knowledge-new-collection",
          title: "New collection",
          description: "Create a new knowledge collection folder.",
          type: "form",
          formProps: {
            formId: "knowledge-new-collection",
            schemaConfig: {
              name: {
                key: "name",
                type: "input" as const,
                display: "Collection name",
                placeholder: "e.g. brand-voice or engineering-notes",
                required: true,
                requiredMessage: "Collection name is required",
                minLength: 1,
                maxLength: 80,
                defaultValue: "",
                layout: "column",
                hintMessage: "Used as folder name under ~/.hyperclaw/",
              },
            },
          },
          actions: {
            primary: {
              id: "knowledge-new-collection-create",
              label: "Create",
              onClick: async (data?: DialogData) => {
                const name = (data?.formData?.name ?? "").trim();
                if (name) await createCollection(name);
              },
            },
            close: { id: "knowledge-new-collection-cancel", label: "Cancel" },
          },
        },
        {
          id: "knowledge-new-doc",
          title: "New document",
          description: "Add a markdown document to a collection.",
          type: "form",
          formProps: {
            formId: "knowledge-new-doc",
            schemaConfig: {
              collection: {
                key: "collection",
                type: "input" as const,
                display: "Collection",
                placeholder: "brand",
                required: true,
                requiredMessage: "Collection is required",
                defaultValue: "",
                layout: "column",
              },
              name: {
                key: "name",
                type: "input" as const,
                display: "Document name",
                placeholder: "my-doc",
                required: true,
                requiredMessage: "Name is required",
                defaultValue: "",
                layout: "column",
                hintMessage: ".md will be added if missing",
              },
            },
          },
          actions: {
            primary: {
              id: "knowledge-new-doc-create",
              label: "Create",
              onClick: async (data?: DialogData) => {
                const colFromDialog = (data?.dialogData?.collection ?? "") as string;
                const col = (colFromDialog || (data?.formData?.collection ?? "")).trim();
                const name = (data?.formData?.name ?? "").trim();
                if (col && name) await createDoc(col, name);
              },
            },
            close: { id: "knowledge-new-doc-cancel", label: "Cancel" },
          },
        },
      ] as DialogSchema[],
    };
  }, [
    collections,
    selectedCollection,
    selectedPath,
    selectCollection,
    selectDoc,
    deleteDoc,
    deleteCollection,
    confirmDiscardUnsavedChanges,
    saving,
    viewMode,
    saveDoc,
    content,
    hasUnsavedChanges,
    createCollection,
    createDoc,
    companyName,
    router,
  ]);

  const value: KnowledgeContextValue = useMemo(
    () => ({
      companyId,
      agents: hyperclawAgents,
      currentAgentId,
      setCurrentAgentId,
      collections,
      selectedCollection,
      selectedPath,
      content,
      originalContent,
      loading,
      listLoading,
      error,
      saving,
      saveError,
      hasUnsavedChanges,
      viewMode,
      setViewMode,
      confirmDiscardUnsavedChanges,
      appSchema,
      selectCollection,
      selectDoc,
      refreshList,
      setContent,
      saveDoc,
      createDoc,
      createCollection,
      deleteDoc,
      deleteCollection,
      uploadFiles,
    }),
    [
      companyId,
      hyperclawAgents,
      currentAgentId,
      collections,
      selectedCollection,
      selectedPath,
      content,
      originalContent,
      loading,
      listLoading,
      error,
      saving,
      saveError,
      hasUnsavedChanges,
      viewMode,
      confirmDiscardUnsavedChanges,
      appSchema,
      selectCollection,
      selectDoc,
      refreshList,
      setContent,
      saveDoc,
      createDoc,
      createCollection,
      deleteDoc,
      deleteCollection,
      uploadFiles,
    ]
  );

  return React.createElement(KnowledgeContext.Provider, { value }, children);
}
