"use client";

import React, {
  useState, useMemo, useCallback, useEffect, useRef,
} from "react";
import {
  File, FileText, FileCode, Image as ImageIcon, Film, FileSpreadsheet,
  ChevronRight, Folder,
  ArrowLeft,
  Music, Search, Plus, Users, Database, Activity, Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { HyperclawAgent, KnowledgeCollectionEntry, KnowledgeFileEntry } from "../../hooks/useKnowledgeData";
import { resolveAvatarText, resolveAvatarUrl } from "$/hooks/useAgentIdentity";
import {
  knowledgeGetDoc,
  knowledgeGetFileBinary,
} from "$/lib/hyperclaw-bridge-client";
import {
  EnsShell,
} from "$/components/ensemble";
import {
  fileExtension,
  getFileViewType,
  type FileViewType,
} from "./file-preview-routing";
import { FilePreviewPage } from "./FilePreviewPage";
/* ── Types ──────────────────────────────────────────────────────────────────── */

export type FolderNode = {
  path: string;        // relative to collection root, "" = root
  name: string;
  subfolders: FolderNode[];
  files: KnowledgeFileEntry[];
};

/* ── Utilities ──────────────────────────────────────────────────────────────── */

function isTextBasedType(t: FileViewType): boolean {
  return t === "markdown" || t === "code" || t === "csv";
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif",
  tiff: "image/tiff",
};

function getImageMime(name: string): string {
  const ext = fileExtension(name);
  return IMAGE_MIME[ext] ?? "image/png";
}

const TYPE_COLOR: Record<FileViewType, string> = {
  markdown: "#6366f1",
  code: "#10b981",
  image: "#ec4899",
  video: "#f59e0b",
  audio: "#a855f7",
  pdf: "#ef4444",
  csv: "#3b82f6",
  unknown: "#6b7280",
};

const IMAGE_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

function getFileIcon(t: FileViewType): React.ReactElement {
  switch (t) {
    case "markdown": return <FileText size={14} />;
    case "code": return <FileCode size={14} />;
    case "image": return <ImageIcon size={14} />;
    case "video": return <Film size={14} />;
    case "audio": return <Music size={14} />;
    case "pdf": return <File size={14} />;
    case "csv": return <FileSpreadsheet size={14} />;
    default: return <File size={14} />;
  }
}

function buildFolderTree(
  files: KnowledgeFileEntry[],
  collectionId: string,
): FolderNode {
  const root: FolderNode = {
    path: "", name: collectionId, subfolders: [], files: [],
  };
  const byPath = new Map<string, FolderNode>();
  byPath.set("", root);

  for (const file of files) {
    const stripped = file.relativePath.startsWith(`${collectionId}/`)
      ? file.relativePath.slice(collectionId.length + 1)
      : file.relativePath;

    const parts = stripped.split("/");
    if (parts.length === 1) {
      root.files.push(file);
    } else {
      let cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        const next = cur ? `${cur}/${seg}` : seg;
        if (!byPath.has(next)) {
          const parent = byPath.get(cur);
          if (!parent) {
            throw new Error(`Invariant: folder node not found for path "${cur}"`);
          }
          const node: FolderNode = {
            path: next, name: seg, subfolders: [], files: [],
          };
          parent.subfolders.push(node);
          byPath.set(next, node);
        }
        cur = next;
      }
      const parent = byPath.get(cur);
      if (!parent) {
        throw new Error(`Invariant: folder node not found for path "${cur}"`);
      }
      parent.files.push(file);
    }
  }

  return root;
}

function findNode(root: FolderNode, path: string): FolderNode | null {
  if (root.path === path) return root;
  for (const child of root.subfolders) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

function parentFolderPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function folderBreadcrumbs(path: string): { label: string; path: string }[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

function relTime(iso: string): string {
  try {
    const d = Date.now() - new Date(iso).getTime();
    if (isNaN(d) || d < 0) return iso;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return iso; }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function displayCollectionName(collection: KnowledgeCollectionEntry): string {
  return collection.name || collection.id.replace(/[-_]+/g, " ");
}

function displayFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

function getFileMeta(file: KnowledgeFileEntry): string {
  const ext = fileExtension(file.name) || "file";
  return `${ext.toUpperCase()} · ${fmtBytes(file.sizeBytes)}`;
}

function summarizeTextPreview(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function useInViewOnce(rootMargin = "160px"): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isVisible) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return [ref, isVisible];
}

function countNestedItems(node: FolderNode): number {
  return node.files.length + node.subfolders.reduce((sum, child) => sum + 1 + countNestedItems(child), 0);
}

function getCollectionContributors(
  files: KnowledgeFileEntry[],
  agents: HyperclawAgent[],
): HyperclawAgent[] {
  if (!agents.length) return [];

  const seen = new Set<string>();
  const contributors: HyperclawAgent[] = [];

  for (const file of files) {
    const agentId = file.agentId ?? agents[0]?.id;
    if (!agentId || seen.has(agentId)) continue;
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) continue;
    seen.add(agent.id);
    contributors.push(agent);
  }

  if (!contributors.length && files.length) contributors.push(agents[0]);
  return contributors;
}

function describeCollection(files: KnowledgeFileEntry[], contributors: HyperclawAgent[]): string {
  const docs = files.filter((file) => {
    const type = getFileViewType(file.name);
    return type === "markdown" || type === "code" || type === "csv" || type === "pdf";
  }).length;
  const media = files.length - docs;
  const writerNames = contributors.slice(0, 2).map((agent) => agent.name).join(" and ");
  const ownership = writerNames ? `${writerNames} maintain${contributors.length === 1 ? "s" : ""} the collection.` : "Agents can read from this collection as shared context.";
  return `${ownership} ${docs} document${docs !== 1 ? "s" : ""}${media ? ` and ${media} media asset${media !== 1 ? "s" : ""}` : ""} are indexed for team knowledge.`;
}

/* ── File Icon Tile ─────────────────────────────────────────────────────────── */

function FileIconTile({
  name, size = 28,
}: { name: string; size?: number }) {
  const t = getFileViewType(name);
  const color = TYPE_COLOR[t];
  return (
    <div
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.22),
        display: "flex", alignItems: "center", justifyContent: "center",
        color, flexShrink: 0,
      }}
    >
      {getFileIcon(t)}
    </div>
  );
}

function FileListIcon({
  file, companyId, size = 40,
}: {
  file: KnowledgeFileEntry;
  companyId: string;
  size?: number;
}) {
  const type = getFileViewType(file.name);
  const [src, setSrc] = useState<string | null>(null);
  const [ref, isVisible] = useInViewOnce();

  useEffect(() => {
    if (!isVisible || type !== "image" || file.sizeBytes > IMAGE_THUMBNAIL_MAX_BYTES) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    setSrc(null);

    const load = async () => {
      try {
        const ext = fileExtension(file.name);
        if (ext === "svg") {
          const result = await knowledgeGetDoc(companyId, file.relativePath);
          if (!cancelled && result.success && result.content) {
            setSrc(`data:image/svg+xml,${encodeURIComponent(result.content)}`);
          }
          return;
        }

        const result = await knowledgeGetFileBinary(companyId, file.relativePath);
        if (!cancelled && result.success && result.content) {
          setSrc(`data:${result.mimeType || getImageMime(file.name)};base64,${result.content}`);
        }
      } catch {
        if (!cancelled) setSrc(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, file.relativePath, file.name, file.sizeBytes, isVisible, type]);

  if (src) {
    return (
      <div
        ref={ref}
        className="shrink-0 overflow-hidden rounded-md"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Knowledge thumbnails are local data URLs from the connector. */}
        <img src={src} alt={file.name} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div ref={ref} className="shrink-0" style={{ width: size, height: size }}>
      <FileIconTile name={file.name} size={size} />
    </div>
  );
}

function FileTextPreview({
  file, companyId,
}: {
  file: KnowledgeFileEntry;
  companyId: string;
}) {
  const type = getFileViewType(file.name);
  const [preview, setPreview] = useState<string | null>(null);
  const [hasResolved, setHasResolved] = useState(false);
  const [ref, isVisible] = useInViewOnce();
  const canLoadPreview = isTextBasedType(type);

  useEffect(() => {
    if (!isVisible || !canLoadPreview) {
      setPreview(null);
      setHasResolved(!canLoadPreview);
      return;
    }

    let cancelled = false;
    setPreview(null);
    setHasResolved(false);

    const load = async () => {
      try {
        const result = await knowledgeGetDoc(companyId, file.relativePath);
        if (!cancelled && result.success && result.content) {
          setPreview(summarizeTextPreview(result.content) || null);
        }
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setHasResolved(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canLoadPreview, companyId, file.name, file.relativePath, isVisible]);

  const fallback = canLoadPreview && !hasResolved ? "Loading text preview..." : "";
  const description = preview || fallback;
  if (!description) return <div ref={ref} className="hidden" />;

  return (
    <div ref={ref} className="truncate text-[11.5px] leading-5 text-muted-foreground">
      {description}
    </div>
  );
}

function AgentBadge({
  agent, size = 22,
}: {
  agent: HyperclawAgent;
  size?: number;
}) {
  const avatarUrl = resolveAvatarUrl(agent.avatarData);
  const avatarText = resolveAvatarText(agent.avatarData) ?? agent.emoji;
  const initials = agent.name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  return (
    <div
      title={agent.name}
      aria-label={agent.name}
      className="grid shrink-0 place-items-center overflow-hidden rounded-md border border-border border-solid bg-secondary text-[10px] font-semibold text-foreground"
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Agent avatars may be local data URLs.
        <img src={avatarUrl} alt={agent.name} className="h-full w-full object-cover" />
      ) : (
        avatarText ?? initials
      )}
    </div>
  );
}

function CollectionKpiCard({
  label, value, detail, icon: Icon, className,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("border border-border border-l-0 border-r-1 border-t-0 border-b-0 border-solid bg-card/80 p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <Icon size={14} className="text-muted-foreground/70" />
      </div>
      <div className="text-[26px] font-semibold leading-none tracking-[-0.04em] text-foreground">
        {value}
      </div>
      <div className="mt-2 font-mono text-[10.5px] text-muted-foreground">{detail}</div>
    </div>
  );
}

/* ── File Grid ──────────────────────────────────────────────────────────────── */

function SubfolderCard({
  node, onSelect, isList = false,
}: { node: FolderNode; onSelect: () => void; isList?: boolean }) {
  const itemCount = countNestedItems(node);

  if (isList) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border border-solid bg-card/80 px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-secondary/50 active:scale-[0.99]"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
          <Folder size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">{node.name}</div>
        </div>
        <div className="flex items-center gap-1 justify-center">
          <div className="hidden justify-self-end font-mono text-[10.5px] text-muted-foreground md:block">
            Folder
          </div>
          <div className="hidden justify-self-end font-mono text-[10.5px] text-muted-foreground sm:block">
            {node.files.length + node.subfolders.length} item{node.files.length + node.subfolders.length !== 1 ? "s" : ""}
          </div>
          <div className="hidden justify-self-end font-mono text-[10.5px] text-muted-foreground sm:block">
            Open
          </div>
          <ChevronRight size={13} className="justify-self-end text-muted-foreground opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col gap-2 p-3 rounded-lg border border-border border-solid bg-card text-left transition-all hover:border-foreground/20 hover:bg-secondary/60 active:scale-[0.98]"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground">
        <Folder size={15} />
      </div>
      <div className="min-w-0 w-full">
        <div className="truncate font-medium text-[12.5px] text-foreground">
          {node.name}
        </div>
      </div>
    </button>
  );
}

function FileCard({
  file, onClick, companyId, agents, isList = false,
}: {
  file: KnowledgeFileEntry;
  onClick: () => void;
  companyId: string;
  agents: HyperclawAgent[];
  isList?: boolean;
}) {
  const displayName = displayFileName(file.name);
  const writer = file.agentId ? agents.find((agent) => agent.id === file.agentId) : agents[0];

  if (isList) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border border-solid bg-card/80 px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-secondary/50 active:scale-[0.99]"
      >
        <FileListIcon file={file} companyId={companyId} size={18} />
        <div className="min-w-0 flex-1 flex flex-row items-center justify-between gap-3">
          <div className="flex min-h-[20px] flex-col items-start justify-between gap-3">
            <div className="min-w-0 truncate text-[13px] font-medium capitalize text-foreground">
              {displayName}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-2">
              {writer && (
                <div className="hidden min-w-0 items-center gap-1.5 md:flex">
                  <AgentBadge agent={writer} size={18} />
                  <span className="max-w-[80px] truncate font-mono text-[10.5px] text-muted-foreground">
                    {writer.name}
                  </span>
                </div>
              )}
              <span className="hidden whitespace-nowrap font-mono text-[10.5px] text-muted-foreground sm:inline">
                {getFileMeta(file)}
              </span>
              <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                {relTime(file.updatedAt)}
              </span>
              <ChevronRight size={13} className="text-muted-foreground opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 p-3 rounded-lg border border-border border-solid bg-card text-left transition-all hover:border-foreground/20 hover:bg-secondary/60 active:scale-[0.98]"
    >
      <FileIconTile name={file.name} size={28} />
      <div className="min-w-0 w-full">
        <div className="truncate font-medium text-[12.5px] text-foreground">
          {displayName}
        </div>
        <FileTextPreview file={file} companyId={companyId} />
        <div className="mt-1 flex gap-2 font-mono text-[10.5px] text-muted-foreground">
          <span>{getFileMeta(file)}</span>
          <span>·</span>
          <span>{relTime(file.updatedAt)}</span>
        </div>
      </div>
    </button>
  );
}

function FileGrid({
  node, collection, companyId, agents, activeFilter, searchQuery, onFilterChange,
  onSearchChange, onSelectFolder, onSelectFile, onBackToCollections, onCreateFile,
}: {
  node: FolderNode;
  collection: KnowledgeCollectionEntry;
  companyId: string;
  agents: HyperclawAgent[];
  activeFilter: "all" | "docs" | "media";
  searchQuery: string;
  onFilterChange: (filter: "all" | "docs" | "media") => void;
  onSearchChange: (query: string) => void;
  onSelectFolder: (path: string) => void;
  onSelectFile: (file: KnowledgeFileEntry) => void;
  onBackToCollections: () => void;
  onCreateFile?: (name: string) => void;
}) {
  const isEmpty = node.files.length === 0 && node.subfolders.length === 0;
  const breadcrumbs = folderBreadcrumbs(node.path);
  const itemCount = node.files.length + node.subfolders.length;
  const files = useMemo(() => collection.files ?? [], [collection.files]);
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const docs = files.filter((file) => {
    const type = getFileViewType(file.name);
    return type === "markdown" || type === "code" || type === "csv" || type === "pdf" || type === "unknown";
  });
  const media = files.filter((file) => {
    const type = getFileViewType(file.name);
    return type === "image" || type === "video" || type === "audio";
  });
  const contributors = getCollectionContributors(files, agents);
  const newestFile = useMemo(
    () => [...files].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null,
    [files],
  );
  const currentFiles = node.files.filter((file) => {
    const type = getFileViewType(file.name);
    const matchesType =
      activeFilter === "all" ||
      (activeFilter === "media" && (type === "image" || type === "video" || type === "audio")) ||
      (activeFilter === "docs" && !(type === "image" || type === "video" || type === "audio"));
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      file.name.toLowerCase().includes(query) ||
      file.relativePath.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });
  const visibleFolders = activeFilter === "all" && !searchQuery.trim()
    ? node.subfolders
    : [];
  const visibleCount = visibleFolders.length + currentFiles.length;
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const canCreateFile = Boolean(onCreateFile);

  const submitNewFile = () => {
    const nextName = newFileName.trim();
    if (!nextName || !onCreateFile) return;
    onCreateFile(nextName);
    setNewFileName("");
    setIsCreatingFile(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-5">
      <div className="mb-5 grid grid-cols-1 items-end gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold leading-tight tracking-[-0.045em] text-foreground">
            {node.path ? node.name : displayCollectionName(collection)}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {files.length} document{files.length !== 1 ? "s" : ""} · last updated {relTime(collection.lastModified)}
            {contributors.length > 0 ? ` · writers: ${contributors.slice(0, 2).map((agent) => agent.name).join(", ")}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative border border-border border-solid rounded-lg">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search in collection"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search in collection"
              className="h-8 w-[210px] rounded-lg border border-border bg-card pl-8 pr-3 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 text-[12px]"
            onClick={() => setIsCreatingFile((value) => !value)}
            disabled={!canCreateFile}
          >
            <Plus size={13} />
            Add document
          </Button>
        </div>
      </div>

      <div className="ens-grid-kpi mb-7">
        <CollectionKpiCard
          label="Documents"
          value={files.length}
          detail={`${Math.max(0, docs.length)} document files`}
          icon={FileText}
        />
        <CollectionKpiCard
          label="Storage"
          value={fmtBytes(totalBytes)}
          detail="from collection files"
          icon={Database}
        />
        <CollectionKpiCard
          label="Media"
          value={media.length}
          detail="images, audio, video"
          icon={ImageIcon}
        />
        <CollectionKpiCard
          label="Read by"
          value={<>{contributors.length}<span className="ml-1 text-[13px] font-normal text-muted-foreground">agents</span></>}
          detail={newestFile ? `latest ${relTime(newestFile.updatedAt)}` : "no reads yet"}
          icon={Users}
          className="border-r-0"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80">
              Contents
            </span>
            {([
              ["all", `All · ${files.length}`],
              ["docs", `Docs · ${docs.length}`],
              ["media", `Media · ${media.length}`],
            ] as const).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                aria-pressed={activeFilter === filter}
                onClick={() => onFilterChange(filter)}
                className={cn(
                  "ens-mono rounded-full border border-solid border-border px-3 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors",
                  activeFilter === filter
                    ? "border-foreground bg-foreground text-background"
                    : "border-border border-solid bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto hidden font-mono text-[10.5px] text-muted-foreground sm:block">
              {node.path ? `${itemCount} in this folder` : `${visibleCount} shown`}
            </span>
          </div>

          {node.path && (
            <button
              type="button"
              onClick={() => onSelectFolder(parentFolderPath(node.path))}
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border border-solid bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft size={12} />
              Back
            </button>
          )}

          {isCreatingFile && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border border-solid bg-card/80 p-3">
              <input
                autoFocus
                aria-label="New document name"
                value={newFileName}
                onChange={(event) => setNewFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitNewFile();
                  if (event.key === "Escape") {
                    setIsCreatingFile(false);
                    setNewFileName("");
                  }
                }}
                placeholder="new-document"
                className="h-8 min-w-[220px] flex-1 rounded-lg border border-solid border-border bg-background px-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-[12px]"
                disabled={!newFileName.trim()}
                onClick={submitNewFile}
              >
                Create
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-[12px]"
                onClick={() => {
                  setIsCreatingFile(false);
                  setNewFileName("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 py-20 text-center">
              <Folder size={32} className="text-muted-foreground/40" />
              <p className="mt-3 text-[13px] text-muted-foreground">This folder is empty</p>
            </div>
          ) : visibleCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 py-16 text-center">
              <Search size={28} className="text-muted-foreground/40" />
              <p className="mt-3 text-[13px] text-muted-foreground">No files match this view</p>
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  onFilterChange("all");
                }}
                className="mt-3 text-[12px] text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleFolders.map((child) => (
                <SubfolderCard
                  key={child.path}
                  node={child}
                  isList
                  onSelect={() => onSelectFolder(child.path)}
                />
              ))}
              {currentFiles.map((file) => (
                <FileCard
                  key={file.relativePath}
                  file={file}
                  companyId={companyId}
                  agents={agents}
                  isList
                  onClick={() => onSelectFile(file)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border border-solid bg-card/80 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              About this collection
            </div>
            <p className="mt-3 text-[12.5px] leading-5 text-muted-foreground">
              {describeCollection(files, contributors)}
            </p>
          </div>

          <div className="rounded-xl border border-border border-solid bg-card/80 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Access
            </div>
            <div className="mt-3 space-y-2">
              {(agents.length ? agents : contributors).slice(0, 6).map((agent) => {
                const canWrite = contributors.some((candidate) => candidate.id === agent.id);
                return (
                  <div key={agent.id} className="flex items-center gap-2 border-b border-t-0 border-l-0 border-r-0 border-dashed border-border pb-2 last:border-0 last:pb-0">
                    <AgentBadge agent={agent} size={22} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{agent.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      read{canWrite ? " · write" : ""}
                    </span>
                  </div>
                );
              })}
              {!agents.length && !contributors.length && (
                <p className="text-[12px] text-muted-foreground">No agent metadata yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border border-solid bg-card/80 p-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Recent activity
              </div>
              <Activity size={13} className="text-muted-foreground/70" />
            </div>
            <div className="mt-3 space-y-2">
              {[...files]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 4)
                .map((file) => {
                  const writer = file.agentId ? agents.find((agent) => agent.id === file.agentId) : agents[0];
                  return (
                    <div key={file.relativePath} className="flex items-start gap-2 border-b border-t-0 border-l-0 border-r-0 border-dashed border-border pb-2 last:border-0 last:pb-0">
                      {writer ? <AgentBadge agent={writer} size={18} /> : <FileIconTile name={file.name} size={16} />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-muted-foreground">
                          <span className="font-semibold text-foreground">{writer?.name ?? "System"}</span> edited {displayFileName(file.name)}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">{relTime(file.updatedAt)}</p>
                      </div>
                    </div>
                  );
                })}
              {!files.length && (
                <p className="text-[12px] text-muted-foreground">No activity yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ── File Manager Panel ─────────────────────────────────────────────────────── */

interface FileManagerPanelProps {
  collection: KnowledgeCollectionEntry;
  companyId: string;
  agents: HyperclawAgent[];
  selectedPath: string | null;
  content: string | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onSelectFile: (relativePath: string) => void;
  onDeselectFile: () => void;
  onBackToCollections: () => void;
  onContentChange: (v: string | null) => void;
  onSave: () => void;
  onCreateFile?: (name: string) => void;
  onOpenGraph?: () => void;
}

export function FileManagerPanel({
  collection, companyId, agents, selectedPath, content, loading, error,
  saving, hasUnsavedChanges, onSelectFile, onDeselectFile, onBackToCollections,
  onContentChange, onSave, onCreateFile, onOpenGraph,
}: FileManagerPanelProps) {
  const [selectedFolder, setSelectedFolder] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "docs" | "media">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const tree = useMemo(
    () => buildFolderTree(collection.files ?? [], collection.id),
    [collection.files, collection.id],
  );

  const currentNode = useMemo(
    () => (selectedFolder ? findNode(tree, selectedFolder) ?? tree : tree),
    [tree, selectedFolder],
  );

  const selectedFile = useMemo(
    () => (collection.files ?? []).find((f) => f.relativePath === selectedPath) ?? null,
    [collection.files, selectedPath],
  );

  // Reset edit mode when file changes
  useEffect(() => { setEditMode(false); }, [selectedPath]);

  const handleSelectFolder = useCallback((path: string) => {
    setSelectedFolder(path);
  }, []);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {selectedFile ? (
          <FilePreviewPage
            file={selectedFile}
            collection={collection}
            companyId={companyId}
            agents={agents}
            content={content}
            loading={loading}
            error={error}
            saving={saving}
            hasUnsavedChanges={hasUnsavedChanges}
            editMode={editMode}
            onEditModeChange={setEditMode}
            onContentChange={onContentChange}
            onSave={onSave}
            onBack={onDeselectFile}
            onSelectFile={onSelectFile}
            onOpenGraph={onOpenGraph}
          />
        ) : (
          <FileGrid
            node={currentNode}
            collection={collection}
            companyId={companyId}
            agents={agents}
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            onFilterChange={setActiveFilter}
            onSearchChange={setSearchQuery}
            onSelectFolder={handleSelectFolder}
            onSelectFile={(f) => onSelectFile(f.relativePath)}
            onBackToCollections={onBackToCollections}
            onCreateFile={onCreateFile}
          />
        )}
      </div>
    </div>
  );
}
