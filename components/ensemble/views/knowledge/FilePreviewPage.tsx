"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Music,
  Save,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markdownComponents } from "$/OS/utils/MarkdownComponents";
import { resolveAvatarText, resolveAvatarUrl } from "$/hooks/useAgentIdentity";
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

function docKind(file: KnowledgeFileEntry): string {
  const extension = fileExtension(file.name);
  if (!extension) return "file";
  if (extension === "md" || extension === "mdx") return "doc";
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

function FileIconTile({ name, size = 40 }: { name: string; size?: number }) {
  const type = getFileViewType(name);
  const color = TYPE_COLOR[type];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        flexShrink: 0,
        border: `1px solid ${color}30`,
      }}
    >
      {getFileIcon(type)}
    </div>
  );
}

function ViewerLoading() {
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-[13px]">Loading...</p>
    </div>
  );
}

function ViewerError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertCircle size={28} className="text-muted-foreground/50" />
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  );
}

function BinaryUnsupported({ name, reason }: { name: string; reason?: string }) {
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-secondary">
        <AlertCircle size={22} className="text-muted-foreground/50" />
      </div>
      <p className="text-[13px] font-medium text-foreground">{name}</p>
      <p className="max-w-xs text-[12px] leading-5 text-muted-foreground">
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

function MarkdownViewer({
  content,
  editMode,
  onChange,
}: {
  content: string;
  editMode: boolean;
  onChange: (value: string) => void;
}) {
  if (editMode) {
    return (
      <textarea
        className="min-h-[560px] w-full resize-none bg-transparent px-8 py-7 font-mono text-[12.5px] leading-7 text-foreground outline-none"
        value={content}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder="Start writing markdown..."
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents as Components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function CodeViewer({
  content,
  filename,
  editMode,
  onChange,
}: {
  content: string;
  filename: string;
  editMode: boolean;
  onChange: (value: string) => void;
}) {
  const lang = getCodeLanguage(filename);

  if (editMode) {
    return (
      <textarea
        className="min-h-[560px] w-full resize-none bg-transparent px-8 py-7 font-mono text-[12.5px] leading-7 text-foreground outline-none"
        value={content}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    );
  }

  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {lang}
        </span>
        <CopyButton text={content} />
      </div>
      <div className="flex-1 overflow-auto px-6 py-5">
        <pre className="m-0 whitespace-pre font-mono text-[12.5px] leading-7 text-foreground [tab-size:2]">
          {content}
        </pre>
      </div>
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
  const ext = fileExtension(file.name);

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
          objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || getImageMime(file.name));
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
  }, [companyId, ext, file.name, file.relativePath]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="flex min-h-[560px] flex-1 items-center justify-center overflow-auto p-8">
      {/* eslint-disable-next-line @next/next/no-img-element -- Knowledge previews are local blob/data URLs from the connector. */}
      <img
        src={src}
        alt={file.name}
        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
      />
    </div>
  );
}

function VideoViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
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
        objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || getVideoMime(file.name));
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
  }, [companyId, file.name, file.relativePath]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="flex min-h-[560px] flex-1 items-center justify-center p-8">
      <video
        src={src}
        controls
        aria-label={file.name}
        className="max-h-full max-w-full rounded-xl shadow-2xl"
      />
    </div>
  );
}

function AudioViewer({ file, companyId }: { file: KnowledgeFileEntry; companyId: string }) {
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
        objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || getAudioMime(file.name));
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
  }, [companyId, file.name, file.relativePath]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="flex min-h-[560px] flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-purple-400">
            <Music size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{fmtBytes(file.sizeBytes)}</p>
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
        objectUrl = createBlobUrlFromBase64(res.content, res.mimeType || "application/pdf");
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
  }, [companyId, file.relativePath]);

  if (loading) return <ViewerLoading />;
  if (error || !src) return <BinaryUnsupported name={file.name} reason={error ?? undefined} />;

  return (
    <div className="min-h-[560px] flex-1 overflow-hidden p-4">
      <iframe
        src={src}
        sandbox="allow-downloads"
        className="h-full min-h-[540px] w-full rounded-xl border border-border"
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
      <div className="flex min-h-[560px] flex-col">
        <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
            {mimeType}
          </span>
          <div className="flex items-center gap-2">
            <CopyButton text={textContent} />
            <a
              href={downloadUrl}
              download={file.name}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Download size={11} />
              Download
            </a>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-7 text-foreground [tab-size:2]">
            {textContent}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[560px] flex-1 items-center justify-center p-8 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <File size={24} />
        </div>
        <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {mimeType} · {fmtBytes(file.sizeBytes)}
        </p>
        <p className="mx-auto mt-4 max-w-xs text-xs leading-5 text-muted-foreground">
          Preview is not available for this file type, but the connector returned the
          binary file successfully.
        </p>
        <a
          href={downloadUrl}
          download={file.name}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          <Download size={13} />
          Download file
        </a>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
        {Icon && <Icon size={13} className="text-muted-foreground/70" />}
      </div>
      {children}
    </section>
  );
}

function RelatedFileRow({
  file,
  reason,
  onSelect,
}: {
  file: KnowledgeFileEntry;
  reason: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-2 border-b border-dashed border-border pb-2 text-left transition-colors last:border-0 last:pb-0 hover:text-foreground"
    >
      <FileIconTile name={file.name} size={22} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {displayFileName(file.name)}
        </span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {reason}
        </span>
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
  onOpenGraph,
}: FilePreviewPageProps) {
  const type = getFileViewType(file.name);
  const editable = isEditableType(type);
  const knownText = isTextBasedType(type);
  const hasLoadedPlainText = type === "unknown" && content !== null;
  const waitingForUnknownText = type === "unknown" && loading;
  const text = knownText || hasLoadedPlainText || waitingForUnknownText;
  const author = file.agentId ? agents.find((agent) => agent.id === file.agentId) : undefined;
  const words = wordCount(content);
  const collectionName = displayCollectionName(collection);
  const folder = fileFolder(file);
  const title = displayFileName(file.name);
  const referenceText = `Knowledge: ${file.relativePath}`;

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
      .slice(0, 5);
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

  return (
    <div className="h-full min-h-0 overflow-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-5 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft size={12} />
            Knowledge
          </button>
          <span>/</span>
          <span className="truncate">{collectionName}</span>
          <span>/</span>
          <span className="truncate text-foreground">{title}</span>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
          <main className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {type === "image" && (
              <div className="h-52 border-b border-border bg-[linear-gradient(135deg,hsl(var(--border)_/_0.38)_25%,transparent_25%,transparent_50%,hsl(var(--border)_/_0.38)_50%,hsl(var(--border)_/_0.38)_75%,transparent_75%,transparent)] bg-[length:36px_36px]" />
            )}

            <div className="border-b border-border px-6 py-5 sm:px-8">
              <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>{docKind(file)}</span>
                <span>·</span>
                <span>{fmtBytes(file.sizeBytes)}</span>
                {words !== null && (
                  <>
                    <span>·</span>
                    <span>{words.toLocaleString()} words</span>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.05em] text-foreground sm:text-[40px]">
                    {title}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    {author && <AgentBadge agent={author} size={20} />}
                    <span>{author ? `edited by ${author.name}` : "edited by system"}</span>
                    <span>·</span>
                    <span>{relTime(file.updatedAt)}</span>
                    <span>·</span>
                    <span>in {collectionName}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {editable && (
                    <div
                      role="group"
                      aria-label="View mode"
                      className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary/60 p-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => onEditModeChange(false)}
                        aria-pressed={!editMode}
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                          !editMode
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Eye size={12} />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditModeChange(true)}
                        aria-pressed={editMode}
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                          editMode
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Edit3 size={12} />
                        Edit
                      </button>
                    </div>
                  )}

                  <CopyButton text={referenceText} label="Reference" />

                  {editMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant={hasUnsavedChanges ? "default" : "ghost"}
                      className={cn(
                        "h-8 gap-1.5 text-xs",
                        hasUnsavedChanges && "border-0 bg-emerald-600 text-white hover:bg-emerald-500",
                      )}
                      disabled={saving || content === null}
                      onClick={onSave}
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-[560px] bg-card">
              {loading && text ? (
                <ViewerLoading />
              ) : error && knownText ? (
                <ViewerError message={error} />
              ) : type === "markdown" ? (
                <MarkdownViewer
                  content={content ?? ""}
                  editMode={editMode}
                  onChange={(value) => onContentChange(value)}
                />
              ) : type === "code" ? (
                <CodeViewer
                  content={content ?? ""}
                  filename={file.name}
                  editMode={editMode}
                  onChange={(value) => onContentChange(value)}
                />
              ) : type === "csv" ? (
                <CsvViewer content={content ?? ""} />
              ) : hasLoadedPlainText ? (
                <CodeViewer
                  content={content ?? ""}
                  filename={file.name}
                  editMode={false}
                  onChange={() => undefined}
                />
              ) : type === "image" ? (
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
            </div>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <InfoCard title="Details" icon={File}>
              <dl className="space-y-2 text-[12px]">
                {[
                  ["Path", file.relativePath],
                  ["Size", fmtBytes(file.sizeBytes)],
                  ["Kind", docKind(file)],
                  ["Owner", author?.name ?? "System"],
                  ["Updated", relTime(file.updatedAt)],
                  ["Embeddings", "indexed"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="truncate text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </InfoCard>

            <InfoCard title="Referenced by" icon={GitBranch}>
              <div className="space-y-2">
                {relatedFiles.length > 0 ? relatedFiles.map(({ candidate, reasons }) => (
                  <RelatedFileRow
                    key={candidate.relativePath}
                    file={candidate}
                    reason={reasons[0]}
                    onSelect={() => onSelectFile(candidate.relativePath)}
                  />
                )) : (
                  <p className="text-[12px] leading-5 text-muted-foreground">
                    No explicit links yet. Add markdown links like `[[Briefs]]` or use the graph
                    to connect this file with nearby knowledge.
                  </p>
                )}
                {onOpenGraph && (
                  <button
                    type="button"
                    onClick={onOpenGraph}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary hover:text-foreground"
                  >
                    <GitBranch size={12} />
                    Open graph
                  </button>
                )}
              </div>
            </InfoCard>

            <InfoCard title={`Other in ${collectionName}`} icon={Activity}>
              <div className="space-y-2">
                {otherFiles.length > 0 ? otherFiles.map((candidate) => (
                  <RelatedFileRow
                    key={candidate.relativePath}
                    file={candidate}
                    reason={relTime(candidate.updatedAt)}
                    onSelect={() => onSelectFile(candidate.relativePath)}
                  />
                )) : (
                  <p className="text-[12px] text-muted-foreground">This is the only file here.</p>
                )}
              </div>
            </InfoCard>
          </aside>
        </div>
      </div>
    </div>
  );
}
