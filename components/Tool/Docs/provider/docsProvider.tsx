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
import {
  FileText,
  RefreshCw,
  Save,
  Loader2,
  Folder,
  Trash2,
  FilePlus,
  FolderInput,
  FolderPlus,
} from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { AppSchema } from "@OS/Layout/types";
import type { SidebarItem } from "@OS/Layout/Sidebar/SidebarSchema";
import type { DocEntry } from "../types";
import type {
  DialogData,
  DialogSchema,
} from "@OS/Layout/Dialog/DialogSchema";

/** Maps workspace folder name (first path segment) → agent name from identity.md */
export type WorkspaceLabels = Record<string, string>;

interface DocsContextValue {
  docs: DocEntry[];
  workspaceLabels: WorkspaceLabels;
  selectedPath: string | null;
  content: string | null;
  loading: boolean;
  listLoading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  appSchema: AppSchema;
  selectDoc: (relativePath: string | null) => void;
  refreshList: () => Promise<void>;
  setContent: (value: string | null) => void;
  saveDoc: () => Promise<boolean>;
  createDoc: (relativePath: string, initialContent?: string) => Promise<boolean>;
  createFolder: (relativePath: string) => Promise<boolean>;
  moveDoc: (fromPath: string, toPath: string) => Promise<boolean>;
}

const DocsContext = createContext<DocsContextValue | undefined>(undefined);

export function useDocs() {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error("useDocs must be used within DocsProvider");
  return ctx;
}

interface TreeFolder {
  [key: string]: DocEntry | TreeFolder;
}

function isDocEntry(x: unknown): x is DocEntry {
  return typeof x === "object" && x !== null && "relativePath" in x && "name" in x;
}

/** Build a nested tree from doc paths (e.g. workspace/memory/123.md → workspace > memory > 123.md). */
function buildDocTree(docs: DocEntry[]): TreeFolder {
  const root: TreeFolder = {};
  for (const doc of docs) {
    const parts = doc.relativePath.split("/");
    let current: TreeFolder = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || isDocEntry(current[part])) {
        current[part] = {};
      }
      current = current[part] as TreeFolder;
    }
    const fileName = parts[parts.length - 1];
    current[fileName] = doc;
  }
  return root;
}

/** Convert tree node to sidebar items (nested folders and files). */
function treeToSidebarItems(
  node: TreeFolder,
  pathPrefix: string,
  selectDoc: (path: string) => void,
  selectedPath: string | null,
  onDelete: (path: string, isFolder: boolean) => void,
  onMoveFile: (relativePath: string) => void,
  onNewFileInFolder: (folderPath: string) => void
): SidebarItem[] {
  const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, value]) => {
    const fullPath = pathPrefix ? `${pathPrefix}/${key}` : key;
    if (isDocEntry(value)) {
      return {
        id: value.relativePath,
        title: value.name,
        icon: FileText,
        isActive: selectedPath === value.relativePath,
        isDraggable: true,
        onClick: () => selectDoc(value.relativePath),
        contextMenu: [
          {
            type: "item",
            label: "New file",
            icon: FilePlus,
            dialog: {
              id: "docs-new-file",
              data: {
                folderPath: value.relativePath.includes("/")
                  ? value.relativePath.replace(/\/[^/]+$/, "")
                  : "",
              },
            },
          },
          {
            type: "item",
            label: "Move file",
            icon: FolderInput,
            dialog: { id: "docs-move-file", data: { fromPath: value.relativePath } },
          },
          {
            type: "item",
            label: "Delete file",
            icon: Trash2,
            variant: "destructive",
            onClick: () => onDelete(value.relativePath, false),
          },
        ],
      };
    }
    const children = treeToSidebarItems(
      value as TreeFolder,
      fullPath,
      selectDoc,
      selectedPath,
      onDelete,
      onMoveFile,
      onNewFileInFolder
    );
    return {
      id: `folder-${fullPath}`,
      title: key,
      icon: Folder,
      items: children,
      isDraggable: false,
      isDropTarget: true,
      contextMenu: [
        {
          type: "item",
          label: "New file",
          icon: FilePlus,
          dialog: { id: "docs-new-file", data: { folderPath: fullPath } },
        },
        {
          type: "item",
          label: "New folder",
          icon: FolderPlus,
          dialog: { id: "docs-new-folder", data: { parentPath: fullPath } },
        },
        {
          type: "item",
          label: "Delete folder",
          icon: Trash2,
          variant: "destructive",
          onClick: () => onDelete(fullPath, true),
        },
      ],
    };
  });
}

/** Build sidebar sections: one per top-level directory, with nested items inside. Uses workspaceLabels so folders with identity.md show agent name (e.g. Doraemon) instead of folder name. */
function buildDocsSections(
  docs: DocEntry[],
  workspaceLabels: WorkspaceLabels,
  selectDoc: (path: string) => void,
  selectedPath: string | null,
  onDelete: (path: string, isFolder: boolean) => void,
  onMoveFile: (relativePath: string) => void,
  onNewFileInFolder: (folderPath: string) => void
): { id: string; title: string; type: "collapsible"; items: SidebarItem[] }[] {
  const tree = buildDocTree(docs);
  const sections: { id: string; title: string; type: "collapsible"; items: SidebarItem[] }[] = [];
  const topKeys = Object.keys(tree).sort((a, b) => a.localeCompare(b));
  const rootFiles: SidebarItem[] = [];
  const folderSections: { id: string; title: string; items: SidebarItem[] }[] = [];
  for (const key of topKeys) {
    const value = tree[key];
    const displayTitle = workspaceLabels[key] ?? key;
    if (isDocEntry(value)) {
      rootFiles.push({
        id: value.relativePath,
        title: value.name,
        icon: FileText,
        isActive: selectedPath === value.relativePath,
        isDraggable: true,
        onClick: () => selectDoc(value.relativePath),
        contextMenu: [
          {
            type: "item",
            label: "Move file",
            icon: FolderInput,
            dialog: { id: "docs-move-file", data: { fromPath: value.relativePath } },
          },
          {
            type: "item",
            label: "Delete file",
            icon: Trash2,
            variant: "destructive",
            onClick: () => onDelete(value.relativePath, false),
          },
        ],
      });
    } else {
      folderSections.push({
        id: `folder-${key}`,
        title: displayTitle,
        items: treeToSidebarItems(
          value as TreeFolder,
          key,
          selectDoc,
          selectedPath,
          onDelete,
          onMoveFile,
          onNewFileInFolder
        ),
      });
    }
  }
  if (rootFiles.length > 0) {
    sections.push({ id: "root", title: "Workspace", type: "collapsible", items: rootFiles });
  }
  sections.push(
    ...folderSections.map((s) => ({ ...s, type: "collapsible" as const }))
  );
  return sections;
}

export function DocsProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [workspaceLabels, setWorkspaceLabels] = useState<WorkspaceLabels>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContentState] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const result = (await bridgeInvoke("list-openclaw-docs", {})) as {
        success?: boolean;
        data?: { files?: DocEntry[]; workspaceLabels?: WorkspaceLabels };
      };
      if (result?.success && result.data) {
        const files = Array.isArray(result.data.files) ? result.data.files : [];
        const labels = result.data.workspaceLabels && typeof result.data.workspaceLabels === "object"
          ? result.data.workspaceLabels
          : {};
        setDocs(files);
        setWorkspaceLabels(labels);
      } else {
        setDocs([]);
        setWorkspaceLabels({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load docs");
      setDocs([]);
      setWorkspaceLabels({});
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const selectDoc = useCallback((relativePath: string | null) => {
    setSelectedPath(relativePath);
    setContentState(null);
    setOriginalContent(null);
    setError(null);
    setSaveError(null);
    if (!relativePath) return;
    setLoading(true);
    bridgeInvoke("get-openclaw-doc", { relativePath })
      .then((res) => {
        const r = res as { success?: boolean; content?: string; error?: string };
        if (r?.success && typeof r.content === "string") {
          setContentState(r.content);
          setOriginalContent(r.content);
          setError(null);
        } else {
          setContentState(null);
          setOriginalContent(null);
          setError(r?.error ?? "Failed to load document");
        }
      })
      .catch((e) => {
        setContentState(null);
        setOriginalContent(null);
        setError(e instanceof Error ? e.message : "Failed to load document");
      })
      .finally(() => setLoading(false));
  }, []);

  // Open doc from URL query ?path=relativePath (e.g. from Home Docs widget)
  useEffect(() => {
    if (typeof window === "undefined" || listLoading) return;
    const params = new URLSearchParams(window.location.search);
    const path = params.get("path");
    if (path) selectDoc(path);
  }, [listLoading, selectDoc]);

  const setContent = useCallback((value: string | null) => {
    setContentState(value);
    setSaveError(null);
  }, []);

  const saveDoc = useCallback(async (): Promise<boolean> => {
    if (!selectedPath || content === null) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const result = (await bridgeInvoke("write-openclaw-doc", {
        relativePath: selectedPath,
        content,
      })) as { success?: boolean; error?: string };
      if (result?.success) {
        setOriginalContent(content);
        setSaveError(null);
        return true;
      }
      setSaveError(result?.error ?? "Failed to save");
      return false;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedPath, content]);

  const deleteDoc = useCallback(
    async (relativePath: string, _isFolder: boolean) => {
      try {
        const result = (await bridgeInvoke("delete-openclaw-doc", {
          relativePath,
        })) as { success?: boolean; error?: string };
        if (result?.success) {
          if (
            selectedPath === relativePath ||
            selectedPath?.startsWith(relativePath + "/")
          ) {
            setSelectedPath(null);
            setContentState(null);
            setError(null);
          }
          await refreshList();
        } else {
          setError(result?.error ?? "Failed to delete");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [selectedPath, refreshList]
  );

  const createDoc = useCallback(
    async (relativePath: string, initialContent = ""): Promise<boolean> => {
      const path = relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`;
      try {
        const result = (await bridgeInvoke("write-openclaw-doc", {
          relativePath: path,
          content: initialContent,
        })) as { success?: boolean; error?: string };
        if (result?.success) {
          await refreshList();
          setSelectedPath(path);
          setContentState(initialContent);
          setError(null);
          return true;
        }
        setError(result?.error ?? "Failed to create file");
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create file");
        return false;
      }
    },
    [refreshList]
  );

  const createFolder = useCallback(
    async (relativePath: string): Promise<boolean> => {
      const normalized = relativePath.replace(/\/+$/, "").replace(/^\/+/, "");
      if (!normalized) return false;
      try {
        const result = (await bridgeInvoke("create-openclaw-folder", {
          relativePath: normalized,
        })) as { success?: boolean; error?: string };
        if (result?.success) {
          await refreshList();
          setError(null);
          return true;
        }
        setError(result?.error ?? "Failed to create folder");
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [refreshList]
  );

  const moveDoc = useCallback(
    async (fromPath: string, toPath: string): Promise<boolean> => {
      const to = toPath.endsWith(".md") ? toPath : `${toPath}.md`;
      if (fromPath === to) return true;
      try {
        const getResult = (await bridgeInvoke("get-openclaw-doc", {
          relativePath: fromPath,
        })) as { success?: boolean; content?: string; error?: string };
        if (!getResult?.success || typeof getResult.content !== "string") {
          setError(getResult?.error ?? "Failed to read file");
          return false;
        }
        const writeResult = (await bridgeInvoke("write-openclaw-doc", {
          relativePath: to,
          content: getResult.content,
        })) as { success?: boolean; error?: string };
        if (!writeResult?.success) {
          setError(writeResult?.error ?? "Failed to write file");
          return false;
        }
        const deleteResult = (await bridgeInvoke("delete-openclaw-doc", {
          relativePath: fromPath,
        })) as { success?: boolean; error?: string };
        if (!deleteResult?.success) {
          setError(deleteResult?.error ?? "Failed to remove original file");
          return false;
        }
        if (selectedPath === fromPath) {
          setSelectedPath(to);
          setContentState(getResult.content);
        }
        setError(null);
        await refreshList();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move file");
        return false;
      }
    },
    [selectedPath, refreshList]
  );

  const hasUnsavedChanges =
    content !== null && originalContent !== null && content !== originalContent;

  const appSchema: AppSchema = useMemo(() => {
    const sections = buildDocsSections(
      docs,
      workspaceLabels,
      selectDoc,
      selectedPath,
      deleteDoc,
      () => {},
      () => {}
    );

    const sectionsWithRoot = [
      ...sections,
    ];
    return {
      id: "hypercho-docs",
      name: "Docs",
      header: {
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "docs-save",
              label: saving ? "Saving…" : "Save",
              icon: saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />,
              onClick: () => saveDoc(),
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
        header: {
          title: "OpenClaw Docs",
          rightButtons: [
            {
              id: "docs-refresh",
              label: "Refresh",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => refreshList(),
            },
            {
              id: "docs-new-file",
              label: "New file",
              icon: <FilePlus className="h-4 w-4" />,
              dialog: { id: "docs-new-file", data: { folderPath: "" } },
            },
          ],
        },
        sections: sectionsWithRoot,
        onDrop: (draggedId: string, targetId: string) => {
          if (targetId.startsWith("folder-")) {
            const folderPath = targetId.slice(7);
            const fileName = draggedId.includes("/")
              ? draggedId.slice(draggedId.lastIndexOf("/") + 1)
              : draggedId;
            moveDoc(draggedId, `${folderPath}/${fileName}`);
          }
        },
      },
      dialogs: [
        {
          id: "docs-new-file",
          title: "New file",
          description:
            "Create a new markdown file. Optionally specify a folder path (e.g. workspace/memory).",
          type: "form",
          formProps: {
            formId: "docs-new-file",
            schemaConfig: {
              folderPath: {
                key: "folderPath",
                type: "input" as const,
                display: "Folder (optional)",
                placeholder: "e.g. workspace/memory or leave empty for root",
                defaultValue: "",
                layout: "column",
              },
              fileName: {
                key: "fileName",
                type: "input" as const,
                display: "File name",
                placeholder: "my-doc",
                required: true,
                requiredMessage: "File name is required",
                minLength: 1,
                maxLength: 200,
                defaultValue: "",
                layout: "column",
                hintMessage: ".md will be added if missing",
              },
            },
          },
          actions: {
            primary: {
              id: "docs-new-file-create",
              label: "Create",
              onClick: async (data?: DialogData) => {
                const name = (data?.formData?.fileName ?? "").trim() || "untitled";
                const parentFromDialog = (data?.dialogData?.folderPath ?? "") as string;
                let relativePath: string;
                if (parentFromDialog) {
                  relativePath = `${parentFromDialog}/${name}`;
                } else {
                  const folder = (data?.formData?.folderPath ?? "")
                    .trim()
                    .replace(/\/+$/, "");
                  relativePath = folder ? `${folder}/${name}` : name;
                }
                await createDoc(relativePath);
              },
            },
            close: { id: "docs-new-file-cancel", label: "Cancel" },
          },
        },
        {
          id: "docs-move-file",
          title: "Move file",
          description: "Enter the new path for this file (relative to workspace).",
          type: "form",
          formProps: {
            formId: "docs-move-file",
            schemaConfig: {
              targetPath: {
                key: "targetPath",
                type: "input" as const,
                display: "Target path",
                placeholder: "folder/new-name.md",
                required: true,
                requiredMessage: "Target path is required",
                defaultValue: "",
                layout: "column",
                hintMessage: "Relative path including filename",
              },
            },
          },
          actions: {
            primary: {
              id: "docs-move-file-submit",
              label: "Move",
              onClick: async (data?: DialogData) => {
                const fromPath = data?.dialogData?.fromPath as string | undefined;
                const targetPath = (data?.formData?.targetPath ?? "").trim();
                if (fromPath && targetPath) await moveDoc(fromPath, targetPath);
              },
            },
            close: { id: "docs-move-file-cancel", label: "Cancel" },
          },
        },
        {
          id: "docs-new-folder",
          title: "New folder",
          description:
            "Create a new folder. Parent path is pre-filled when you right-click a folder.",
          type: "form",
          formProps: {
            formId: "docs-new-folder",
            schemaConfig: {
              parentPath: {
                key: "parentPath",
                type: "input" as const,
                display: "Parent folder (optional)",
                placeholder: "e.g. workspace or leave empty for root",
                defaultValue: "",
                layout: "column",
              },
              folderName: {
                key: "folderName",
                type: "input" as const,
                display: "Folder name",
                placeholder: "my-folder",
                required: true,
                requiredMessage: "Folder name is required",
                minLength: 1,
                maxLength: 200,
                defaultValue: "",
                layout: "column",
              },
            },
          },
          actions: {
            primary: {
              id: "docs-new-folder-create",
              label: "Create",
              onClick: async (data?: DialogData) => {
                const parentFromDialog = (data?.dialogData?.parentPath ?? "") as string;
                const name = (data?.formData?.folderName ?? "").trim().replace(/^\/+|\/+$/g, "");
                if (!name) return;
                const parentFromForm = (data?.formData?.parentPath ?? "").trim().replace(/\/+$/, "");
                const parent = parentFromDialog || parentFromForm;
                const relativePath = parent ? `${parent}/${name}` : name;
                await createFolder(relativePath);
              },
            },
            close: { id: "docs-new-folder-cancel", label: "Cancel" },
          },
        },
      ] as DialogSchema[],
    };
  }, [
    docs,
    workspaceLabels,
    selectedPath,
    selectDoc,
    refreshList,
    saving,
    saveDoc,
    content,
    hasUnsavedChanges,
    deleteDoc,
    createDoc,
    createFolder,
    moveDoc,
  ]);

  const value: DocsContextValue = useMemo(
    () => ({
      docs,
      workspaceLabels,
      selectedPath,
      content,
      loading,
      listLoading,
      error,
      saving,
      saveError,
      appSchema,
      selectDoc,
      refreshList,
      setContent,
      saveDoc,
      createDoc,
      createFolder,
      moveDoc,
    }),
    [
      docs,
      workspaceLabels,
      selectedPath,
      content,
      loading,
      listLoading,
      error,
      saving,
      saveError,
      appSchema,
      selectDoc,
      refreshList,
      setContent,
      saveDoc,
      createDoc,
      createFolder,
      moveDoc,
    ]
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}
