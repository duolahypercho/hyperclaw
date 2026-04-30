"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AppSchema } from "@OS/Layout/types";
import { FileText, FolderOpen, RefreshCw, Sparkles } from "lucide-react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  groupFilesByDate,
  wordCount,
  formatSize,
  type MemoryFileForGrouping,
} from "../utils/journalGrouping";
import { stripSessionFromContent } from "../utils/sessionHeader";
import { MemorySidebarFilter } from "../MemorySidebarFilter";
import type { SidebarSection } from "@OS/Layout/Sidebar/SidebarSchema";
import type { SidebarItem } from "@OS/Layout/types";

export interface MemoryDayEntry {
  dateKey: string;
  display: string;
  files: MemoryFile[];
}

function getTodayDateString(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export interface MemoryFile {
  name: string;
  path: string;
  content: string;
  updatedAt?: string;
  sizeBytes?: number;
  /** Display tag for the memory folder (from identity.md Name or folder name). */
  sourceTag?: string;
}

interface MemorySourceFromBridge {
  tag: string;
  basePath: string;
  files: { name: string; path: string; updatedAt: string; sizeBytes: number }[];
}

interface MemoryState {
  files: MemoryFile[];
  selectedFile: MemoryFile | null;
  selectedDayEntry: MemoryDayEntry | null;
  mergedDayContent: string | null;
  mergedDayLoading: boolean;
  loading: boolean;
  error: string | null;
  searchTerm: string;
  tagFilter: string;
  /** Paths of files whose content matched the search (for name + content search). */
  contentSearchMatchPaths: string[];
  todaySummary: string | null;
  todaySummaryLoading: boolean;
}

interface MemoryContextType extends MemoryState {
  appSchema: AppSchema;
  setSelectedFile: (file: MemoryFile | null) => void;
  setSelectedDayEntry: (entry: MemoryDayEntry | null) => void;
  refresh: () => Promise<void>;
  setSearchTerm: (value: string) => void;
  setTagFilter: (value: string) => void;
}

const MemoryContext = createContext<MemoryContextType | null>(null);

export function useMemoryTool() {
  const ctx = useContext(MemoryContext);
  if (!ctx) throw new Error("useMemoryTool must be used within MemoryProvider");
  return ctx;
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchBridge(body: Record<string, unknown>) {
  const action = body.action as string;
  const { action: _a, ...rest } = body;
  return bridgeInvoke(action, rest);
}

/** List all memory sources (each folder with a /memory subfolder) and their files. Uses identity.md Name for tags. */
async function listOpenClawMemory(): Promise<MemoryFile[]> {
  const raw = await fetchBridge({ action: "list-openclaw-memory" });
  console.log("[Memory] listOpenClawMemory raw response:", JSON.stringify(raw).slice(0, 500));
  const json = raw as {
    success?: boolean;
    data?: MemorySourceFromBridge[];
  };
  if (!json.success || !Array.isArray(json.data)) {
    console.warn("[Memory] listOpenClawMemory: success=", json.success, "data type=", typeof json.data, Array.isArray(json.data));
    return [];
  }
  const files: MemoryFile[] = [];
  for (const source of json.data as MemorySourceFromBridge[]) {
    if (!source.files) continue;
    for (const f of source.files) {
      files.push({
        name: f.name,
        path: f.path,
        content: "",
        updatedAt: f.updatedAt,
        sizeBytes: f.sizeBytes,
        sourceTag: source.tag,
      });
    }
  }
  return files;
}

/** Read a single file from ~/.openclaw by relative path (e.g. memory/2025-02-22.md). */
async function readOpenClawDoc(relativePath: string): Promise<string | null> {
  const json = (await fetchBridge({ action: "get-openclaw-doc", relativePath })) as { success?: boolean; content?: string | null };
  return json.success && json.content != null ? json.content : null;
}

/** Get today's memory from ~/.openclaw/memory (e.g. memory/YYYY-MM-DD.md) if it exists. */
async function fetchTodayMemoryFromOpenClaw(): Promise<string | null> {
  const today = getTodayDateString();
  return readOpenClawDoc(`memory/${today}.md`);
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null);
  const [selectedDayEntry, setSelectedDayEntryState] = useState<MemoryDayEntry | null>(null);
  const [mergedDayContent, setMergedDayContent] = useState<string | null>(null);
  const [mergedDayLoading, setMergedDayLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [contentSearchMatchPaths, setContentSearchMatchPaths] = useState<string[]>([]);
  const [todaySummary, setTodaySummary] = useState<string | null>(null);
  const contentSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(false);
  const [processingAllSummaries, setProcessingAllSummaries] = useState(false);

  function getLast7DaysRange(): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: fmt(start), endDate: fmt(end) };
  }

  // ── Load sidebar list from ~/.openclaw/memory ────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("[Memory] refresh: calling listOpenClawMemory...");
      const data = await listOpenClawMemory();
      console.log("[Memory] refresh: got", data.length, "files", data.slice(0, 3));
      setFiles(data);
    } catch (err: unknown) {
      console.error("[Memory] refresh error:", err);
      setError(err instanceof Error ? err.message : "Failed to load memory files");
    } finally {
      setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  const defaultTagSet = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    refresh();
  }, [refresh]);

  // Default agent filter to first agent when files first load
  useEffect(() => {
    if (defaultTagSet.current || files.length === 0) return;
    const tags = [...new Set(files.map((f) => f.sourceTag ?? "Memory").filter(Boolean))].sort();
    if (tags.length > 0) {
      setTagFilter(tags[0]);
      defaultTagSet.current = true;
    }
  }, [files]);

  // Debounced content search: update contentSearchMatchPaths when searchTerm changes
  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      setContentSearchMatchPaths([]);
      return;
    }
    if (contentSearchDebounceRef.current) clearTimeout(contentSearchDebounceRef.current);
    contentSearchDebounceRef.current = setTimeout(() => {
      contentSearchDebounceRef.current = null;
      fetchBridge({ action: "search-openclaw-memory-content", query: searchTerm.trim() })
        .then((json) => {
          const data = json as { success?: boolean; paths?: string[] };
          if (data.success && Array.isArray(data.paths)) setContentSearchMatchPaths(data.paths);
          else setContentSearchMatchPaths([]);
        })
        .catch(() => setContentSearchMatchPaths([]));
    }, 300);
    return () => {
      if (contentSearchDebounceRef.current) clearTimeout(contentSearchDebounceRef.current);
    };
  }, [searchTerm]);

  // ── Load today's memory from ~/.openclaw/memory for the card ─────────────
  useEffect(() => {
    setTodaySummaryLoading(true);
    fetchTodayMemoryFromOpenClaw()
      .then((text) => setTodaySummary(text))
      .finally(() => setTodaySummaryLoading(false));
  }, []);

  // ── When a single file is selected, load its content ────────────────────
  useEffect(() => {
    if (!selectedFile?.path) return;
    readOpenClawDoc(selectedFile.path)
      .then((content) => {
        if (content != null) {
          setSelectedFile((prev) =>
            prev?.path === selectedFile.path ? { ...prev, content } : prev
          );
        }
      })
      .catch(() => {});
  }, [selectedFile?.path]);

  // ── When a day is selected, load all files for that day and merge ───────
  useEffect(() => {
    if (!selectedDayEntry || selectedDayEntry.files.length === 0) {
      setMergedDayContent(null);
      return;
    }
    setMergedDayLoading(true);
    Promise.all(
      selectedDayEntry.files.map((f) => readOpenClawDoc(f.path))
    )
      .then((contents) => {
        const merged = contents
          .filter((c): c is string => c != null && c.trim() !== "")
          .map((c) => stripSessionFromContent(c))
          .join("\n\n---\n\n");
        setMergedDayContent(merged);
      })
      .catch(() => setMergedDayContent(null))
      .finally(() => setMergedDayLoading(false));
  }, [selectedDayEntry]);

  const setSelectedFileWrapper = useCallback((file: MemoryFile | null) => {
    setSelectedFile(file);
    setSelectedDayEntryState(null);
  }, []);

  const setSelectedDayEntry = useCallback((entry: MemoryDayEntry | null) => {
    setSelectedDayEntryState(entry);
    setSelectedFile(null);
  }, []);

  // ── Sidebar: filter section on top, then grouped by tag and date ─
  const sidebarSections = useMemo((): SidebarSection[] => {
    const list = files as (MemoryFileForGrouping & { sourceTag?: string })[];
    const q = searchTerm.trim().toLowerCase();
    const tagFilterTrimmed = tagFilter.trim();
    const contentMatchSet = new Set(contentSearchMatchPaths);
    let filtered = list;
    if (q) {
      filtered = filtered.filter(
        (f) => f.name.toLowerCase().includes(q) || contentMatchSet.has(f.path)
      );
    }
    if (tagFilterTrimmed)
      filtered = filtered.filter((f) => (f.sourceTag ?? "Memory") === tagFilterTrimmed);

    const byTag = new Map<string, (MemoryFileForGrouping & { sourceTag?: string })[]>();
    for (const f of filtered) {
      const tag = f.sourceTag ?? "Memory";
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(f);
    }

    const sections: SidebarSection[] = [
      {
        id: "memory-sidebar-filter",
        type: "custom",
        content: <MemorySidebarFilter />,
      },
    ];

    for (const [tag, tagFiles] of byTag.entries()) {
      // When showing all agents, add a header so sections are clearly differentiated
      if (!tagFilterTrimmed) {
        sections.push({
          id: `memory-tag-header-${tag.replace(/\s+/g, "-")}`,
          type: "default",
          title: tag,
          items: [],
        });
      }
      const grouped = groupFilesByDate(tagFiles);
      for (const section of grouped) {
        if (section.entries.length === 0) continue;
        const items: SidebarItem[] =
          section.kind === "other"
            ? section.entries.flatMap((entry) =>
                entry.files.map((f) => {
                  const file = f as MemoryFile;
                  const isSelected = selectedFile?.path === file.path;
                  const sizeStr = formatSize(file.sizeBytes);
                  const sub = [sizeStr, file.sourceTag ?? tag].filter(Boolean).join(" · ");
                  return {
                    id: file.path,
                    title: file.name,
                    subtitle: sub || tag,
                    icon: FileText,
                    isActive: isSelected,
                    onClick: () => {
                      if (isSelected) return;
                      setSelectedFile(file);
                    },
                  };
                })
              )
            : section.entries.map((entry) => {
                const dayEntry: MemoryDayEntry = {
                  dateKey: entry.dateKey,
                  display: entry.display,
                  files: entry.files as MemoryFile[],
                };
                const isSelected =
                  selectedDayEntry?.dateKey === entry.dateKey &&
                  selectedDayEntry?.files[0]?.path === entry.files[0]?.path;
                return {
                  id: `day-${tag}-${entry.dateKey}`.replace(/\s+/g, "-"),
                  title: `${entry.display} (${entry.files.length})`,
                  subtitle: tag,
                  icon: FileText,
                  isActive: !!isSelected,
                  onClick: () => {
                    if (isSelected) return;
                    setSelectedDayEntry(dayEntry);
                  },
                };
              });
        sections.push({
          id: `section-${tag}-${section.title}`.replace(/\s+/g, "-"),
          title: `${section.title} (${section.count})`,
          type: "collapsible",
          items,
        });
      }
    }

    if (sections.length === 1 && !loading) {
      const noMatch = files.length > 0 && filtered.length === 0;
      sections.push({
        id: "memory-empty",
        type: "default",
        items: [
          {
            id: "empty",
            title: noMatch
              ? "No items match the filter"
              : "No memory folders found (~/.openclaw/…/memory)",
            icon: FolderOpen,
          },
        ],
      });
    }

    return sections;
  }, [files, searchTerm, tagFilter, contentSearchMatchPaths, selectedFile?.path, selectedDayEntry, loading, setSelectedFile, setSelectedDayEntry]);

  const appSchema: AppSchema = useMemo(
    () => ({
      header: { title: "Memory", icon: FolderOpen },
      sidebar: { sections: sidebarSections },
    }),
    [sidebarSections]
  );

  const value = useMemo(
    () => ({
      appSchema,
      files,
      selectedFile,
      selectedDayEntry,
      mergedDayContent,
      mergedDayLoading,
      loading,
      error,
      searchTerm,
      tagFilter,
      contentSearchMatchPaths,
      todaySummary,
      todaySummaryLoading,
      setSelectedFile: setSelectedFileWrapper,
      setSelectedDayEntry,
      refresh,
      setSearchTerm,
      setTagFilter,
    }),
    [
      appSchema,
      files,
      selectedFile,
      selectedDayEntry,
      mergedDayContent,
      mergedDayLoading,
      loading,
      error,
      searchTerm,
      tagFilter,
      contentSearchMatchPaths,
      todaySummary,
      todaySummaryLoading,
      setSelectedFileWrapper,
      setSelectedDayEntry,
      refresh,
    ]
  );

  return (
    <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
  );
}
