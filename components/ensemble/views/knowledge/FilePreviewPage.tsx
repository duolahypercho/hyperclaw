"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Music,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { AlertDelete } from "$/components/UI/AlertDelete";

import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { resolveAvatarText, resolveAvatarUrl } from "$/hooks/useAgentIdentity";
import {
  MemoizedReactMarkdown,
  memoizedMarkdownComponents,
} from "$/components/Home/widgets/gateway-chat/EnhancedMessageBubble";
import { rehypePlugins } from "@OS/AI/components/rehypeConfig";
import {
  knowledgeGetDoc,
  knowledgeGetFileBinary,
} from "$/lib/hyperclaw-bridge-client";
import type {
  HyperclawAgent,
  KnowledgeCollectionEntry,
  KnowledgeFileEntry,
} from "../../hooks/useKnowledgeData";
import {
  fileExtension,
  getCodeLanguage,
  getFileViewType,
  isPreviewableTextMimeType,
  type FileViewType,
} from "./file-preview-routing";

interface FilePreviewPageProps {
  file: KnowledgeFileEntry;
  collection: KnowledgeCollectionEntry;
  companyId: string;
  agents: HyperclawAgent[];
  content: string | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  hasUnsavedChanges: boolean;
  editMode: boolean;
  onEditModeChange: (value: boolean) => void;
  onContentChange: (value: string | null) => void;
  onSave: () => void;
  onBack: () => void;
  onSelectFile: (relativePath: string) => void;
  onDeleteFile?: (relativePath: string) => Promise<boolean>;
  onOpenGraph?: () => void;
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  tiff: "image/tiff",
};

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/avi",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  m4v: "video/mp4",
  flv: "video/x-flv",
};

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/ogg",
  weba: "audio/webm",
};

function isEditableType(type: FileViewType): boolean {
  return type === "markdown" || type === "code";
}

function isTextBasedType(type: FileViewType): boolean {
  return type === "markdown" || type === "code" || type === "csv";
}

function getImageMime(name: string): string {
  return IMAGE_MIME[fileExtension(name)] ?? "image/png";
}

function getVideoMime(name: string): string {
  return VIDEO_MIME[fileExtension(name)] ?? "video/mp4";
}

function getAudioMime(name: string): string {
  return AUDIO_MIME[fileExtension(name)] ?? "audio/mpeg";
}

function getFileIcon(type: FileViewType, size = 14): React.ReactElement {
  switch (type) {
    case "markdown": return <FileText size={size} />;
    case "code": return <FileCode size={size} />;
    case "image": return <ImageIcon size={size} />;
    case "video": return <Film size={size} />;
    case "audio": return <Music size={size} />;
    case "pdf": return <File size={size} />;
    case "csv": return <FileSpreadsheet size={size} />;
    default: return <File size={size} />;
  }
}

function fmtBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function relTime(iso: string): string {
  try {
    const delta = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(delta) || delta < 0) return iso;
    if (delta < 60_000) return "just now";
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function displayCollectionName(collection: KnowledgeCollectionEntry): string {
  return collection.name || collection.id.replace(/[-_]+/g, " ");
}

function displayFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

function fileNameForType(file: KnowledgeFileEntry): string {
  if (fileExtension(file.name)) return file.name;
  return file.relativePath.split("/").pop() ?? file.relativePath;
}

function getKnowledgeFileType(file: KnowledgeFileEntry): FileViewType {
  if (
    file.fileType === "markdown" ||
    file.fileType === "code" ||
    file.fileType === "image" ||
    file.fileType === "video" ||
    file.fileType === "audio" ||
    file.fileType === "pdf" ||
    file.fileType === "csv" ||
    file.fileType === "unknown"
  ) {
    return file.fileType;
  }
  return getFileViewType(fileNameForType(file));
}

function docKind(file: KnowledgeFileEntry): string {
  const type = getKnowledgeFileType(file);
  if (type === "markdown") return "doc";
  if (type !== "unknown") return type;
  const extension = fileExtension(fileNameForType(file));
  if (!extension) return "file";
  return extension;
}

function wordCount(content: string | null): number | null {
  if (!content) return null;
  const words = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length || null;
}

function fileFolder(file: KnowledgeFileEntry): string {
  const lastSlash = file.relativePath.lastIndexOf("/");
  if (lastSlash <= -1) return "";
  return file.relativePath.slice(0, lastSlash);
}

function normalizeLinkTarget(value: string): string {
  return value
    .split("#")[0]
    .replace(/^\.?\//, "")
    .trim()
    .toLowerCase();
}

function parseMarkdownTargets(content: string | null): Set<string> {
  const targets = new Set<string>();
  if (!content) return targets;

  const wikiLinkPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  const markdownLinkPattern = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g;

  for (const match of content.matchAll(wikiLinkPattern)) {
    targets.add(normalizeLinkTarget(match[1]));
  }
  for (const match of content.matchAll(markdownLinkPattern)) {
    targets.add(normalizeLinkTarget(match[1]));
  }

  return targets;
}

function fileMatchesLink(file: KnowledgeFileEntry, targets: Set<string>): boolean {
  if (!targets.size) return false;
  const path = normalizeLinkTarget(file.relativePath);
  const name = normalizeLinkTarget(file.name);
  const title = normalizeLinkTarget(displayFileName(file.name));
  return Array.from(targets).some((target) => (
    path === target ||
    path.endsWith(`/${target}`) ||
    name === target ||
    title === target ||
    name === `${target}.md` ||
    name === `${target}.mdx`
  ));
}

function createBlobUrlFromBase64(base64: string, mimeType: string): string {
  const bytes = Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function decodeBase64Text(base64: string): string {
  const bytes = Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseCSV(raw: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return { headers: rows[0] ?? [], rows: rows.slice(1) };
}

function AgentBadge({ agent, size = 22 }: { agent: HyperclawAgent; size?: number }) {
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

function ViewerLoading() {
  return (
    <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2.5 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin opacity-70" />
      <p className="text-[12px]">Loading...</p>
    </div>
  );
}

function ViewerError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
      <AlertCircle size={22} className="text-muted-foreground/50" />
      <p className="text-[12px] text-muted-foreground">{message}</p>
    </div>
  );
}

function BinaryUnsupported({ name, reason }: { name: string; reason?: string }) {
  return (
    <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border border-solid bg-secondary/70">
        <AlertCircle size={18} className="text-muted-foreground/60" />
      </div>
      <p className="text-[12.5px] font-medium text-foreground">{name}</p>
      <p className="max-w-xs text-[11.5px] leading-5 text-muted-foreground">
        {reason ?? "Binary preview requires knowledge-get-binary support from the connector."}
      </p>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => setCopied(false));
      }}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * FileSurface — mirrors the file editor format used in
 * components/Tool/Agents/AgentDetailDialog.tsx (FileEditorTab):
 *   • bg-secondary container, no inner border, no focus ring
 *   • monospace, text-xs, leading-relaxed
 *   • filename label at the bottom-right (text-[10px] muted)
 *   • Cmd/Ctrl+S triggers save when in edit mode
 *
 * The same surface is used for both preview (readonly) and edit modes so
 * the file always looks identical — only the editability changes.
 */
function FileSurface({
  file,
  type,
  typeName,
  content,
  editMode,
  onContentChange,
  onSave,
  loading,
  error,
  knownText,
  hasLoadedPlainText,
  text,
  companyId,
}: {
  file: KnowledgeFileEntry;
  type: FileViewType;
  typeName: string;
  content: string | null;
  editMode: boolean;
  onContentChange: (value: string | null) => void;
  onSave: () => void;
  loading: boolean;
  error: string | null;
  knownText: boolean;
  hasLoadedPlainText: boolean;
  text: boolean;
  companyId: string;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editMode) onSave();
      }
    },
    [editMode, onSave],
  );

  const filenameTag = (
    <div className="flex items-center justify-end px-3 pb-2">
      {error && (
        <span className="mr-auto text-[10px] text-destructive">{error}</span>
      )}
      <span className="text-[10px] text-muted-foreground/60">{file.name}</span>
    </div>
  );

  if (loading && text) {
    return (
      <div className="flex flex-col gap-2 bg-secondary">
        <ViewerLoading />
        {filenameTag}
      </div>
    );
  }

  if (error && knownText) {
    return (
      <div className="flex flex-col gap-2 bg-secondary">
        <ViewerError message={error} />
        {filenameTag}
      </div>
    );
  }

  const isTextual =
    type === "markdown" || type === "code" || type === "csv" || hasLoadedPlainText;

  if (isTextual) {
    // Markdown + preview mode → render with the same memoized markdown
    // components used by the chat (createMarkdownComponents from
    // OS/AI/components/createMarkdownComponents.tsx). This gives us h1-h6,
    // tables, code blocks with copy button, blockquotes, lists, etc. all
    // styled identically to assistant messages.
    if (type === "markdown" && !editMode) {
      return (
        <div className="flex flex-col gap-2 bg-secondary">
          <div className="min-h-[640px] px-6 py-5">
            <MemoizedReactMarkdown
              components={memoizedMarkdownComponents.assistant}
              remarkPlugins={[
                remarkGfm,
                remarkBreaks,
                [remarkMath, { singleDollarTextMath: false }],
              ]}
              rehypePlugins={rehypePlugins}
            >
              {content ?? ""}
            </MemoizedReactMarkdown>
          </div>
          {filenameTag}
        </div>
      );
    }

    const placeholder =
      type === "markdown"
        ? "Start writing markdown..."
        : `Start writing ${typeName} content...`;

    return (
      <div
        className="flex flex-col gap-2 bg-secondary"
        onKeyDown={handleKeyDown}
      >
        <Textarea
          value={content ?? ""}
          onChange={(event) => onContentChange(event.target.value)}
          readOnly={!editMode}
          spellCheck={false}
          placeholder={placeholder}
          className="w-full min-h-[640px] text-xs font-mono leading-relaxed resize-none border-none focus-visible:ring-0"
        />
        {filenameTag}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 bg-secondary">
      {type === "image" ? (
        <ImageViewer file={file} companyId={companyId} />
      ) : type === "video" ? (
        <VideoViewer file={file} companyId={companyId} />
      ) : type === "audio" ? (
        <AudioViewer file={file} companyId={companyId} />
      ) : type === "pdf" ? (
        <PDFViewer file={file} companyId={companyId} />
      ) : (
        <BinaryFileViewer file={file} companyId={companyId} />
      )}
      {filenameTag}
    </div>
  );
}

function CsvViewer({ content }: { content: string }) {
  const { headers, rows } = useMemo(() => parseCSV(content), [content]);
  if (!headers.length) return <div className="p-8 text-sm text-muted-foreground">Empty CSV</div>;

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/60">
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                scope="col"
                className="border border-border px-3 py-2 text-left font-mono font-semibold text-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="transition-colors hover:bg-secondary/40">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className="max-w-[220px] border border-border px-3 py-1.5 font-mono text-muted-foreground"
                >
                  <span className="line-clamp-2">{cell}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const typeName = fileNameForType(file);
  const ext = fileExtension(typeName);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSrc(null);

    if (ext === "svg") {
      knowledgeGetDoc(companyId, file.relativePath).then((res) => {
        if (cancelled) return;
        if (res.success && res.content) {
          setSrc(`data:image/svg+xml,${encodeURIComponent(res.content)}`);
        } else {
          setError(res.error ?? "Failed to load SVG");
        }
        setLoading(false);
      }).catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    } else {
      knowledgeGetFileBinary(companyId, file.relativePath).then((res) => {
        if (cancelled) return;
        if (res.success && res.content) {
          objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || file.mimeType || getImageMime(typeName));
          setSrc(objectUrl);
        } else {
          setError(res.error ?? null);
        }
        setLoading(false);
      }).catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, ext, file.mimeType, file.relativePath, typeName]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="flex min-h-[300px] flex-1 items-center justify-center overflow-auto p-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- Knowledge previews are local blob/data URLs from the connector. */}
      <img
        src={src}
        alt={file.name}
        className="max-h-[480px] max-w-full rounded-lg object-contain"
      />
    </div>
  );
}

function VideoViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const typeName = fileNameForType(file);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSrc(null);

    knowledgeGetFileBinary(companyId, file.relativePath).then((res) => {
      if (cancelled) return;
      if (res.success && res.content) {
        objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || file.mimeType || getVideoMime(typeName));
        setSrc(objectUrl);
      } else {
        setError(res.error ?? null);
      }
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, file.mimeType, file.relativePath, typeName]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="flex min-h-[300px] flex-1 items-center justify-center p-6">
      <video
        src={src}
        controls
        aria-label={file.name}
        className="max-h-[480px] max-w-full rounded-lg"
      />
    </div>
  );
}

function AudioViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const typeName = fileNameForType(file);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSrc(null);

    knowledgeGetFileBinary(companyId, file.relativePath).then((res) => {
      if (cancelled) return;
      if (res.success && res.content) {
        objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || file.mimeType || getAudioMime(typeName));
        setSrc(objectUrl);
      } else {
        setError(res.error ?? null);
      }
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, file.mimeType, file.relativePath, typeName]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="flex min-h-[200px] flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-border border-solid bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/70 text-purple-300">
            <Music size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">{fmtBytes(file.sizeBytes)}</p>
          </div>
        </div>
        <audio src={src} controls aria-label={file.name} className="w-full" />
      </div>
    </div>
  );
}

function PDFViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSrc(null);

    knowledgeGetFileBinary(companyId, file.relativePath).then((res) => {
      if (cancelled) return;
      if (res.success && res.content) {
        objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || file.mimeType || "application/pdf");
        setSrc(objectUrl);
      } else {
        setError(res.error ?? null);
      }
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, file.mimeType, file.relativePath]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="min-h-[420px] flex-1 overflow-hidden p-3">
      <iframe
        src={src}
        sandbox="allow-downloads"
        className="h-full min-h-[400px] w-full rounded-lg border border-border border-solid"
        title={file.name}
      />
    </div>
  );
}

function BinaryFileViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("application/octet-stream");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setDownloadUrl(null);
    setTextContent(null);

    knowledgeGetFileBinary(companyId, file.relativePath).then((res) => {
      if (cancelled) return;
      if (res.success && typeof res.content === "string") {
        const resolvedMime = res.mimeType || "application/octet-stream";
        setMimeType(resolvedMime);
        objectUrl = createBlobUrlFromBase64(res.content, resolvedMime);
        setDownloadUrl(objectUrl);
        if (isPreviewableTextMimeType(resolvedMime)) {
          setTextContent(decodeBase64Text(res.content));
        }
      } else {
        setError(res.error ?? null);
      }
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, file.relativePath]);

  if (loading) return <ViewerLoading />;
  if (error || !downloadUrl) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  if (textContent !== null) {
    return (
      <div className="flex min-h-[260px] flex-col">
        <div className="flex items-center justify-between border-b border-border border-solid px-4 py-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            {mimeType}
          </span>
          <div className="flex items-center gap-2">
            <CopyButton text={textContent} />
            <a
              href={downloadUrl}
              download={file.name}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Download size={11} />
              Download
            </a>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-6 text-foreground/90 [tab-size:2]">
            {textContent}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[260px] flex-1 items-center justify-center p-6 text-center">
      <div className="w-full max-w-sm rounded-xl border border-border border-solid bg-card/60 p-5">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
          <File size={20} />
        </div>
        <p className="truncate text-[13px] font-medium text-foreground">{file.name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {mimeType} · {fmtBytes(file.sizeBytes)}
        </p>
        <p className="mx-auto mt-3 max-w-xs text-[11.5px] leading-5 text-muted-foreground">
          Preview unavailable, but the connector returned the binary file.
        </p>
        <a
          href={downloadUrl}
          download={file.name}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-border border-solid bg-foreground/95 px-3 py-1.5 text-[11.5px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <Download size={12} />
          Download file
        </a>
      </div>
    </div>
  );
}

type RelationKind = "linked" | "agent" | "near" | "collection";

const RELATION_STYLES: Record<RelationKind, {
  label: string;
  pill: string;
  dot: string;
}> = {
  linked: {
    label: "linked in doc",
    pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  agent: {
    label: "same agent",
    pill: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    dot: "bg-sky-400",
  },
  near: {
    label: "same folder",
    pill: "border-border bg-secondary/60 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  collection: {
    label: "same collection",
    pill: "border-border bg-secondary/40 text-muted-foreground/80",
    dot: "bg-muted-foreground/60",
  },
};

function relationKindFor(reasons: string[]): RelationKind {
  if (reasons.includes("linked in doc")) return "linked";
  if (reasons.includes("same agent")) return "agent";
  if (reasons.includes("same folder")) return "near";
  return "collection";
}

function StatusPill({ kind }: { kind: RelationKind }) {
  const style = RELATION_STYLES[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-solid px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em]",
        style.pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}

function HeaderPills({
  kind,
  extension,
  size,
  words,
}: {
  kind: string;
  extension: string;
  size: number;
  words?: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
      <span>{kind}</span>
      {extension && (
        <span className="rounded-sm border border-border border-solid bg-secondary/40 px-1.5 py-0 normal-case tracking-[0.05em] text-muted-foreground">
          .{extension}
        </span>
      )}
      <span className="text-muted-foreground/40">·</span>
      <span>{fmtBytes(size)}</span>
      {words ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span>{words.toLocaleString()} words</span>
        </>
      ) : null}
    </div>
  );
}

function HeaderActionButton({
  icon: Icon,
  label,
  onClick,
  variant = "default",
  disabled,
  loading,
  tone,
  ariaLabel,
}: {
  icon: LucideIcon;
  label?: string;
  onClick?: () => void;
  variant?: "default" | "icon";
  disabled?: boolean;
  loading?: boolean;
  tone?: "neutral" | "success";
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-solid border-border bg-card text-[12px] text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "icon" ? "w-8 justify-center" : "px-2.5",
        tone === "success" && "border-solid border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20",
      )}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Icon size={12} className="opacity-90" />
      )}
      {variant === "default" && label}
    </button>
  );
}

function InlinePathStamp({
  collection,
  file,
}: {
  collection: KnowledgeCollectionEntry;
  file: KnowledgeFileEntry;
}) {
  const path = file.relativePath;
  const collectionPrefix = `${collection.id}/`;
  const inner = path.startsWith(collectionPrefix)
    ? path.slice(collectionPrefix.length)
    : path;
  return (
    <span className="font-mono text-[11px] text-muted-foreground">
      <span className="opacity-70">{collection.id}</span>
      <span className="px-1 opacity-40">/</span>
      <span>{inner}</span>
    </span>
  );
}

function ReferenceRow({
  file,
  kind,
  onSelect,
}: {
  file: KnowledgeFileEntry;
  kind: RelationKind;
  onSelect: () => void;
}) {
  const fileType = getKnowledgeFileType(file);
  const extension = fileExtension(fileNameForType(file));
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center justify-between gap-3 border-b border-border border-solid border-x-0 border-t-0 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-secondary/30"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusPill kind={kind} />
        <span className="shrink-0 text-muted-foreground/80 group-hover:text-foreground/90">
          {getFileIcon(fileType, 12)}
        </span>
        <span className="truncate text-[13px] text-foreground/90 group-hover:text-foreground">
          {displayFileName(file.name)}
        </span>
        {extension && (
          <span className="shrink-0 rounded-sm border border-border border-solid bg-secondary/40 px-1.5 py-0 font-mono text-[10px] lowercase tracking-[0.05em] text-muted-foreground">
            .{extension}
          </span>
        )}
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        cited <span className="text-foreground/80">{relTime(file.updatedAt)}</span>
      </span>
    </button>
  );
}

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border border-solid bg-card">
      <header className="px-4 pt-4">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-baseline gap-3 py-1.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[12.5px] leading-5 text-foreground/90">{children}</dd>
    </div>
  );
}

function RetrievedRow({
  agent,
  meta,
}: {
  agent: HyperclawAgent;
  meta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <AgentBadge agent={agent} size={20} />
        <span className="truncate text-[12.5px] text-foreground/90">{agent.name}</span>
      </div>
      {meta && (
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
          {meta}
        </span>
      )}
    </div>
  );
}

function OtherFileRow({
  file,
  onSelect,
}: {
  file: KnowledgeFileEntry;
  onSelect: () => void;
}) {
  const kind = docKind(file);
  const fileType = getKnowledgeFileType(file);
  const extension = fileExtension(fileNameForType(file));
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full border-b border-t-0 border-l-0 border-r-0 border-dashed border-border py-2 text-left transition-colors last:border-0 last:pb-0 hover:text-foreground"
    >
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {kind} <span className="text-muted-foreground/50">·</span> {relTime(file.updatedAt)}
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-muted-foreground/70">
          {getFileIcon(fileType, 12)}
        </span>
        <span className="truncate text-[12.5px] text-foreground/90">
          {displayFileName(file.name)}
        </span>
        {extension && (
          <span className="shrink-0 rounded-sm border border-border border-solid bg-secondary/40 px-1 py-0 font-mono text-[10px] lowercase tracking-[0.05em] text-muted-foreground">
            .{extension}
          </span>
        )}
      </span>
    </button>
  );
}

export function FilePreviewPage({
  file,
  collection,
  companyId,
  agents,
  content,
  loading,
  error,
  saving,
  hasUnsavedChanges,
  editMode,
  onEditModeChange,
  onContentChange,
  onSave,
  onBack,
  onSelectFile,
  onDeleteFile,
  onOpenGraph,
}: FilePreviewPageProps) {
  const typeName = fileNameForType(file);
  const type = getKnowledgeFileType(file);
  const editable = isEditableType(type);
  const knownText = isTextBasedType(type);
  const hasLoadedPlainText = type === "unknown" && content !== null;
  const waitingForUnknownText = type === "unknown" && loading;
  const text = knownText || hasLoadedPlainText || waitingForUnknownText;
  const author = file.agentId ? agents.find((agent) => agent.id === file.agentId) : undefined;
  const collectionName = displayCollectionName(collection);
  const folder = fileFolder(file);
  const title = displayFileName(file.name);

  const linkedTargets = useMemo(() => parseMarkdownTargets(content), [content]);
  const relatedFiles = useMemo(() => {
    const candidates = (collection.files ?? []).filter(
      (candidate) => candidate.relativePath !== file.relativePath,
    );
    const scored = candidates.map((candidate) => {
      const reasons: string[] = [];
      if (fileMatchesLink(candidate, linkedTargets)) reasons.push("linked in doc");
      if (candidate.agentId && candidate.agentId === file.agentId) reasons.push("same agent");
      if (fileFolder(candidate) === folder && folder) reasons.push("same folder");
      if (candidate.collection === file.collection && !reasons.length) reasons.push("same collection");
      return { candidate, reasons };
    });

    return scored
      .filter((entry) => entry.reasons.length > 0)
      .sort((a, b) => {
        const aLinked = a.reasons.includes("linked in doc") ? 1 : 0;
        const bLinked = b.reasons.includes("linked in doc") ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        return new Date(b.candidate.updatedAt).getTime() - new Date(a.candidate.updatedAt).getTime();
      })
      .slice(0, 6);
  }, [collection.files, file, folder, linkedTargets]);

  const otherFiles = useMemo(
    () => {
      const relatedPaths = new Set(relatedFiles.map(({ candidate }) => candidate.relativePath));
      return [...(collection.files ?? [])]
        .filter((candidate) => (
          candidate.relativePath !== file.relativePath &&
          !relatedPaths.has(candidate.relativePath)
        ))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
    },
    [collection.files, file.relativePath, relatedFiles],
  );

  const retrievedAgents = useMemo<HyperclawAgent[]>(() => {
    if (!agents.length) return [];
    const seen = new Set<string>();
    const result: HyperclawAgent[] = [];

    if (author && !seen.has(author.id)) {
      seen.add(author.id);
      result.push(author);
    }
    for (const sibling of collection.files ?? []) {
      if (!sibling.agentId || seen.has(sibling.agentId)) continue;
      const matched = agents.find((agent) => agent.id === sibling.agentId);
      if (!matched) continue;
      seen.add(matched.id);
      result.push(matched);
      if (result.length >= 4) break;
    }
    if (result.length < 3) {
      for (const agent of agents) {
        if (seen.has(agent.id)) continue;
        seen.add(agent.id);
        result.push(agent);
        if (result.length >= 3) break;
      }
    }
    return result.slice(0, 4);
  }, [agents, author, collection.files]);

  const ext = fileExtension(typeName);
  const words = useMemo(() => wordCount(content), [content]);
  const showCaption = isTextBasedType(type) || type === "unknown";

  return (
    <div className="h-full min-h-0 overflow-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-7 pb-12 pt-8">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <header className="mb-7 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <HeaderPills kind={docKind(file)} extension={ext} size={file.sizeBytes} words={words} />
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground">
              {title}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
              {author ? <AgentBadge agent={author} size={18} /> : null}
              <span>
                edited by{" "}
                <span className="text-foreground/90">{author?.name ?? "system"}</span>
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>{relTime(file.updatedAt)}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1">
                <Folder size={11} className="opacity-70" />
                in {collectionName}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {editable && (
              <HeaderActionButton
                icon={editMode ? Eye : Edit3}
                label={editMode ? "Preview" : "Edit"}
                onClick={() => onEditModeChange(!editMode)}
              />
            )}
            {onOpenGraph ? (
              <HeaderActionButton
                icon={GitBranch}
                ariaLabel="Open knowledge graph"
                variant="icon"
                onClick={onOpenGraph}
              />
            ) : null}
            {onDeleteFile ? (
              <AlertDelete
                dialogTitle={`Delete "${file.name}"?`}
                dialogDescription="This permanently removes the file from the knowledge base. Other agents will lose access to it."
                deleteButtonTitle="Delete"
                onDelete={() => {
                  void onDeleteFile(file.relativePath);
                }}
              >
                <button
                  type="button"
                  aria-label={`Delete ${file.name}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-solid border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  title="Delete file"
                >
                  <Trash2 size={12} className="opacity-90" />
                </button>
              </AlertDelete>
            ) : null}
          </div>
        </header>

        {/* ── Main grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">

          {/* Left column */}
          <div className="min-w-0 space-y-5">

            {/* File preview card */}
            <section className="overflow-hidden rounded-xl border border-border border-solid bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-t-0 border-l-0 border-r-0 border-l-0 border-r-0 border-dashed border-border px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2 font-mono text-[11.5px] text-foreground/90">
                  <span className="opacity-70">{getFileIcon(type, 12)}</span>
                  <span className="truncate">{file.name}</span>
                </div>
                <InlinePathStamp collection={collection} file={file} />
              </div>

              <FileSurface
                file={file}
                type={type}
                typeName={typeName}
                content={content}
                editMode={editMode}
                onContentChange={onContentChange}
                onSave={onSave}
                loading={loading}
                error={error}
                knownText={knownText}
                hasLoadedPlainText={hasLoadedPlainText}
                text={text}
                companyId={companyId}
              />
            </section>

            {/* Referenced by card */}
            <section className="overflow-hidden rounded-xl border border-border border-solid bg-card">
              <header className="flex items-center gap-1.5 border-b border-border border-t-0 border-l-0 border-r-0 border-solid px-4 py-2.5 text-[11px] text-muted-foreground">
                <Clock size={11} className="opacity-80" />
                <span className="font-mono tracking-[0.04em]">referenced by</span>
              </header>
              {relatedFiles.length > 0 ? (
                <div>
                  {relatedFiles.map(({ candidate, reasons }) => (
                    <ReferenceRow
                      key={candidate.relativePath}
                      file={candidate}
                      kind={relationKindFor(reasons)}
                      onSelect={() => onSelectFile(candidate.relativePath)}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-4 py-4 text-[12px] leading-5 text-muted-foreground">
                  Nothing references this yet. Add wiki links like{" "}
                  <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[11px] text-foreground/80">
                    [[{title}]]
                  </code>{" "}
                  in another doc to connect them.
                </p>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <SidebarCard title="details">
              <dl>
                <DetailRow label="path">
                  <span className="block break-all font-mono text-[11.5px] leading-5 text-foreground/90">
                    {file.relativePath}
                  </span>
                </DetailRow>
                <DetailRow label="size">{fmtBytes(file.sizeBytes)}</DetailRow>
                <DetailRow label="kind">{docKind(file)}</DetailRow>
                <DetailRow label="owner">{author?.name ?? "System"}</DetailRow>
                <DetailRow label="updated">{relTime(file.updatedAt)}</DetailRow>
                <DetailRow label="embeddings">
                  <span className="text-foreground/90">indexed</span>
                  <span className="text-muted-foreground/60"> · 384d</span>
                </DetailRow>
              </dl>
            </SidebarCard>

            <SidebarCard title="retrieved by">
              {retrievedAgents.length > 0 ? (
                <div className="space-y-1">
                  {retrievedAgents.map((agent) => (
                    <RetrievedRow
                      key={agent.id}
                      agent={agent}
                      meta={agent.runtime ? `${agent.runtime}` : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-1 text-[12px] text-muted-foreground">
                  No agents have retrieved this yet.
                </p>
              )}
            </SidebarCard>

            <SidebarCard title={`other in ${collectionName}`}>
              {otherFiles.length > 0 ? (
                <div>
                  {otherFiles.map((candidate) => (
                    <OtherFileRow
                      key={candidate.relativePath}
                      file={candidate}
                      onSelect={() => onSelectFile(candidate.relativePath)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-1 text-[12px] text-muted-foreground">
                  This is the only file here.
                </p>
              )}
            </SidebarCard>
          </aside>
        </div>
      </div>
    </div>
  );
}
