"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Folder,
  Loader2,
  AlertCircle,
  ChevronRight,
  Image as ImageIcon,
  Film,
  BarChart3,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EnsShell,
  Kpi,
} from "$/components/ensemble";
import { useKnowledgeData } from "../hooks/useKnowledgeData";
import type { KnowledgeCollectionEntry, KnowledgeFileEntry, HyperclawAgent } from "../hooks/useKnowledgeData";
import { resolveAvatarUrl, resolveAvatarText } from "$/hooks/useAgentIdentity";
import { FileManagerPanel } from "./knowledge/FileManager";
import { KnowledgeGraphView } from "./knowledge/KnowledgeGraphView";
import {
  knowledgeGetDoc,
  knowledgeGetFileBinary,
} from "$/lib/hyperclaw-bridge-client";

/* ─────────── helpers ─────────────────────────────────────────────────── */

function relTime(iso: string): string {
  try {
    const d = Date.now() - new Date(iso).getTime();
    if (isNaN(d) || d < 0) return iso;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDisplayName(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type MediaKind = "image" | "video" | "chart" | "brand";

const MEDIA_IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tiff",
]);

const MEDIA_VIDEO_EXTS = new Set([
  "mp4", "webm", "mov", "avi", "mkv", "ogv", "m4v", "flv",
]);

const CHART_EXTS = new Set(["csv", "tsv"]);

const MEDIA_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

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

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function classifyMediaFile(file: KnowledgeFileEntry): MediaKind | null {
  const ext = getExt(file.name);
  const haystack = `${file.collection}/${file.relativePath}/${file.name}`.toLowerCase();

  if (MEDIA_VIDEO_EXTS.has(ext)) return "video";
  if (haystack.match(/\b(brand|logo|wordmark|palette|styleguide|style-guide)\b/)) {
    return MEDIA_IMAGE_EXTS.has(ext) || ext === "pdf" ? "brand" : null;
  }
  if (MEDIA_IMAGE_EXTS.has(ext)) return "image";
  if (
    CHART_EXTS.has(ext) ||
    (
      ext === "pdf" &&
      haystack.match(/\b(chart|graph|plot|diagram|viz|visual|metrics|screenshot|capture|render)\b/)
    )
  ) {
    return "chart";
  }

  return null;
}

function mediaKindLabel(kind: MediaKind): string {
  switch (kind) {
    case "video":
      return "Video";
    case "chart":
      return "Chart";
    case "brand":
      return "Brand";
    default:
      return "Image";
  }
}

function mediaKindIcon(kind: MediaKind) {
  switch (kind) {
    case "video":
      return <Film size={14} />;
    case "chart":
      return <BarChart3 size={14} />;
    case "brand":
      return <Palette size={14} />;
    default:
      return <ImageIcon size={14} />;
  }
}

function mediaDisplayName(file: KnowledgeFileEntry): string {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

function resolveFileAgents(
  files: KnowledgeFileEntry[],
  agents: HyperclawAgent[],
): HyperclawAgent[] {
  if (agents.length === 0) return [];

  const seen = new Set<string>();
  const result: HyperclawAgent[] = [];

  for (const f of files) {
    // Use the tracked agentId, or fall back to the first (primary) agent
    const agentId = f.agentId ?? agents[0].id;
    if (seen.has(agentId)) continue;
    seen.add(agentId);
    const agent = agents.find((a) => a.id === agentId);
    if (agent) result.push(agent);
    if (result.length >= 4) break;
  }

  // No files at all but agents exist — still show primary agent
  if (result.length === 0 && files.length === 0) {
    result.push(agents[0]);
  }

  return result;
}

/* ─────────── design primitives ──────────────────────────────────────── */

function SctLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="dept-label"
      style={{
        fontSize: 10.5,
        fontFamily: "var(--mono)",
        color: "var(--ink-4)",
        letterSpacing: "0.05em",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
      <style>
        {`
          .dept-label::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--line);
            display: block;
            margin-left: 0.5em;
          }
        `}
      </style>
    </div>
  );
}

const MONO_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#ef4444", "#0ea5e9",
];

function Monogram({ label, size = 24 }: { label: string; size?: number }) {
  const initials = label
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  const bg = MONO_COLORS[label.charCodeAt(0) % MONO_COLORS.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "var(--mono)",
        letterSpacing: 0,
      }}
    >
      {initials}
    </div>
  );
}

function AgentAvatar({ agent, size = 22, overlap = true }: { agent: HyperclawAgent; size?: number; overlap?: boolean }) {
  const avatarUrl = resolveAvatarUrl(agent.avatarData);
  const avatarText = resolveAvatarText(agent.avatarData) ?? agent.emoji;
  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  const bg = MONO_COLORS[agent.id.charCodeAt(agent.id.length - 1) % MONO_COLORS.length];

  return (
    <div
      title={agent.name}
      className="rounded-sm"
      style={{
        width: size,
        height: size,
        background: avatarUrl ? "transparent" : (avatarText ? "var(--paper-3)" : bg),
        color: avatarText ? "inherit" : "#fff",
        fontSize: avatarText ? Math.round(size * 0.6) : Math.round(size * 0.36),
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "var(--mono)",
        letterSpacing: 0,
        border: "2px solid var(--paper-2)",
        marginLeft: overlap ? -4 : 0,
        overflow: "hidden",
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={agent.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        avatarText ?? initials
      )}
    </div>
  );
}

// --- Changed: KbDocRow relTime moved to right, before chevron ---
function KbDocRow({
  file,
  agents,
  onClick,
}: {
  file: KnowledgeFileEntry;
  agents: HyperclawAgent[];
  onClick: () => void;
}) {
  const editor = agents.length > 0
    ? (agents.find((a) => a.id === file.agentId) ?? agents[0])
    : null;
  const colInitials = file.collection;

  return (
    <button
      type="button"
      onClick={onClick}
      className="kbdocrow w-full text-left bg-transparent border border-solid border-1 border-border hover:bg-secondary/60 hover:border-primary/30 active:bg-secondary active:border-primary/40"
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr auto 20px",
        alignItems: "center",
        columnGap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <style>{`
        .kbdocrow {
          transition: background 0.12s ease, transform 0.1s ease, box-shadow 0.12s ease, border-color 0.12s ease;
        }
        .kbdocrow .row-chevron {
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 0.12s ease, transform 0.12s ease;
        }
        .kbdocrow:hover .row-chevron {
          opacity: 1;
          transform: translateX(0);
        }
        .kbdocrow .row-updated {
          min-width: 56px;
          display: flex;
          justify-content: flex-end;
          font-size: 10.5px;
          color: var(--ink-4);
          font-family: var(--mono);
        }
      `}</style>

      {/* file icon tile */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "var(--paper-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <FileText size={13} style={{ color: "var(--ink-3)" }} />
      </div>

      {/* info */}
      <div className="min-w-0">
        <div
          className="truncate text-foreground/80"
          style={{ fontSize: 12.5, fontWeight: 500 }}
        >
          {(() => {
            const name = file.name.replace(/\.md$/, "");
            return name.charAt(0).toUpperCase() + name.slice(1);
          })()}
          {/* file type badge */}
          <span
            className=" ml-1 bg-secondary text-secondary-foreground"
            style={{
              padding: "1px 5px",
              borderRadius: 4,
              letterSpacing: "0.04em",
              fontSize: 9.5,
            }}
          >
            .md
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap" style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>
          {/* company/collection badge */}
          <span>
            {colInitials}
          </span>
          {/* edited by agent */}
          {editor && (
            <>
              <span>·</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                edited by {" "}
                {editor.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* relTime updatedAt at the end, before chevron */}
      <div className="row-updated">
        {relTime(file.updatedAt)}
      </div>

      {/* chevron */}
      <div className="row-chevron flex items-center justify-center">
        <ChevronRight size={12} style={{ color: "var(--ink-4)" }} />
      </div>
    </button>
  );
}
// --- End KbDocRow change ---

function KbColCard({
  collection,
  agents: allAgents,
  onSelect,
}: {
  collection: KnowledgeCollectionEntry;
  agents: HyperclawAgent[];
  onSelect: () => void;
}) {
  const contributors = useMemo(
    () => resolveFileAgents(collection.files ?? [], allAgents),
    [collection.files, allAgents]
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className="kbcolcard w-full text-left"
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 14,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
      }}
    >
      <style>{`
        .kbcolcard {
          transition: background 0.12s ease, transform 0.12s ease, box-shadow 0.15s ease, border-color 0.12s ease;
        }
        .kbcolcard:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(0,0,0,0.10);
          border-color: var(--accent-wash, var(--line));
          background: var(--paper-3) !important;
        }
        .kbcolcard:active {
          transform: translateY(0) scale(0.985);
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
      `}</style>

      {/* title */}
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.015em" }}>
        {collection.name.charAt(0).toUpperCase() + collection.name.slice(1)}
      </span>

      {/* docs count + update time */}
      <span
        style={{
          fontSize: 10.5,
          color: "var(--ink-4)",
          fontFamily: "var(--mono)",
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <span>{collection.fileCount} docs</span>
        <span>updated {relTime(collection.lastModified)}</span>
      </span>
 

      {/* agent avatar strip */}
      {contributors.length > 0 && (
        <div className="flex items-center mt-1 gap-0" style={{ paddingLeft: 4 }}>
          {contributors.map((a) => (
            <AgentAvatar key={a.id} agent={a} size={20} />
          ))}
          <span
            style={{
              fontSize: 10,
              color: "var(--ink-4)",
              fontFamily: "var(--mono)",
              marginLeft: 8,
            }}
          >
            {contributors.length} agent{contributors.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </button>
  );
}

function MediaThumb({
  file,
  kind,
  companyId,
}: {
  file: KnowledgeFileEntry;
  kind: MediaKind;
  companyId: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "image" && kind !== "brand") {
      setSrc(null);
      return;
    }

    let cancelled = false;
    const ext = getExt(file.name);
    setSrc(null);

    if ((file.sizeBytes ?? 0) > MEDIA_THUMBNAIL_MAX_BYTES) {
      return;
    }

    const load = async () => {
      try {
        if (ext === "svg") {
          const result = await knowledgeGetDoc(companyId, file.relativePath);
          if (!cancelled && result.success && result.content) {
            setSrc(`data:image/svg+xml,${encodeURIComponent(result.content)}`);
          }
          return;
        }

        const result = await knowledgeGetFileBinary(companyId, file.relativePath);
        if (!cancelled && result.success && result.content) {
          setSrc(`data:${IMAGE_MIME[ext] ?? "image/png"};base64,${result.content}`);
        }
      } catch {
        if (!cancelled) setSrc(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, file.name, file.relativePath, file.sizeBytes, kind]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Knowledge thumbnails are local data URLs from the connector.
      <img
        src={src}
        alt={file.name}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          kind === "video"
            ? "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(59,130,246,0.12))"
            : kind === "brand"
              ? "linear-gradient(135deg, rgba(236,72,153,0.22), rgba(99,102,241,0.14))"
              : "linear-gradient(135deg, rgba(59,130,246,0.20), rgba(16,185,129,0.12))",
        color: "var(--ink-3)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 36,
          height: 36,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {mediaKindIcon(kind)}
      </div>
    </div>
  );
}

function MediaCard({
  file,
  kind,
  companyId,
  onClick,
}: {
  file: KnowledgeFileEntry;
  kind: MediaKind;
  companyId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={mediaDisplayName(file)}
      onClick={onClick}
      className="kb-tile kbmediacard group w-full text-left"
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ background: "var(--paper-3)" }}
      >
        <MediaThumb file={file} kind={kind} companyId={companyId} />
        <span className="kb-kind-badge absolute left-2 top-2">
          <span aria-hidden="true">{mediaKindIcon(kind)}</span>
          {mediaKindLabel(kind)}
        </span>
      </div>

      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          padding: "10px 10px 10px",
          background: "linear-gradient(180deg, rgba(0,3,25,0), rgba(0,3,25,0.76))",
        }}
      >
        <div
          className="truncate capitalize"
          style={{ color: "#fff", fontSize: 12.5, fontWeight: 600 }}
        >
          {mediaDisplayName(file)}
        </div>
      </div>
    </button>
  );
}

/* ─────────── sub-components ─────────────────────────────────────────── */

/* ─────────── overview (no selection) ────────────────────────────────── */

function OverviewPanel({
  collections,
  companyId,
  agents,
  onSelectCollection,
  onSelectDoc,
}: {
  collections: KnowledgeCollectionEntry[];
  companyId: string;
  agents: HyperclawAgent[];
  onSelectCollection: (id: string) => void;
  onSelectDoc: (relativePath: string, collection: string) => void;
}) {
  const totalDocs = collections.reduce((s, c) => s + c.fileCount, 0);

  const allFiles = useMemo(
    () => collections.flatMap((c) => c.files ?? []).filter(Boolean),
    [collections]
  );

  const recentFiles = useMemo(
    () =>
      [...allFiles]
        .filter((file) => classifyMediaFile(file) === null)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [allFiles]
  );

  const lastEditFile = recentFiles[0] ?? null;

  const mediaFiles = useMemo(
    () =>
      [...allFiles]
        .map((file) => ({ file, kind: classifyMediaFile(file) }))
        .filter((entry): entry is { file: KnowledgeFileEntry; kind: MediaKind } => entry.kind !== null)
        .sort((a, b) => new Date(b.file.updatedAt).getTime() - new Date(a.file.updatedAt).getTime())
        .slice(0, 8),
    [allFiles]
  );

  return (
    <EnsShell>
          {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="ens-hero" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>
            Knowledge
          </h1>
          <p className="ens-sub mt-1">
          Shared memory for the company. Docs, datasets, renders, screenshots, and video — every agent can read, only some can write.
          </p>
        </div>
      </div>
      {/* KPI strip */}
      <div className="ens-grid-kpi mb-7">
        <Kpi label="Collections" value={collections.length} />
        <Kpi label="Documents" value={totalDocs} detail="across all collections" />
        <Kpi label="Company ID" value={companyId} detail="storage root" />
        <Kpi
          label="Last edit"
          value={lastEditFile ? relTime(lastEditFile.updatedAt) : "—"}
          detail={
            lastEditFile
              ? `${lastEditFile.collection} / ${lastEditFile.name}`
              : "no documents yet"
          }
        />
      </div>

      {/* 2-col layout: main content + private shelves sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

        {/* ── Left column ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-7">

          {/* MEDIA · RECENT RENDERS & CAPTURES */}
          <div>
            <SctLabel>MEDIA · RECENT RENDERS &amp; CAPTURES</SctLabel>
            {mediaFiles.length === 0 ? (
              <div
                className="mt-3 flex items-center gap-3 rounded-xl border border-dashed"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--paper-2)",
                  padding: "18px 16px",
                }}
              >
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{
                    width: 38,
                    height: 38,
                    background: "var(--paper-3)",
                    color: "var(--ink-4)",
                  }}
                >
                  <ImageIcon size={16} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                    No media captures yet.
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>
                    Screenshots, renders, charts, videos, and brand files will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="kb-media-strip mt-3">
                {mediaFiles.map(({ file, kind }) => (
                  <MediaCard
                    key={file.relativePath}
                    file={file}
                    kind={kind}
                    companyId={companyId}
                    onClick={() => onSelectDoc(file.relativePath, file.collection)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* COLLECTIONS · SHARED */}
          <div>
            <SctLabel>COLLECTIONS · SHARED</SctLabel>
            {collections.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center mt-4">
                <Folder size={28} className="mb-3 opacity-30" style={{ color: "var(--ink-3)" }} />
                <p className="ens-sub text-sm">No shared collections yet.</p>
                <p className="ens-sub text-xs mt-1">
                  Create one from the sidebar to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {collections.map((col) => (
                  <KbColCard
                    key={col.id}
                    collection={col}
                    agents={agents}
                    onSelect={() => onSelectCollection(col.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RECENT EDITS */}
          {recentFiles.length > 0 && (
            <div>
              <SctLabel>RECENT EDITS</SctLabel>
              <div className="flex flex-col gap-1.5 mt-3">
                {recentFiles.map((f) => (
                  <KbDocRow
                    key={f.relativePath}
                    file={f}
                    agents={agents}
                    onClick={() => onSelectDoc(f.relativePath, f.collection)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Private Shelves ───────────────────────────────── */}
        <div
          style={{
            background: "var(--paper-2)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <span
            className="text-[10.5px] font-mono text-muted-foreground"
            style={{ letterSpacing: "0.1em" }}
          >
            PRIVATE SHELVES
          </span>
          <p
            style={{
              fontSize: 12,
              color: "var(--ink-4)",
              lineHeight: 1.5,
              marginTop: 8,
              marginBottom: 14,
            }}
          >
            Per-agent memory. Only the owning agent can read and write.
          </p>
     

          {(() => {
            // Build agent → file count distribution across all collections
            const agentFileCounts = new Map<string, number>();
            for (const col of collections) {
              for (const f of col.files ?? []) {
                const aid = f.agentId ?? (agents[0]?.id ?? "__unknown");
                agentFileCounts.set(aid, (agentFileCounts.get(aid) ?? 0) + 1);
              }
            }

            const agentRows: { agent: HyperclawAgent; count: number }[] = [];
            for (const [aid, count] of agentFileCounts.entries()) {
              const agent = agents.find((a) => a.id === aid);
              if (agent) agentRows.push({ agent, count });
            }
            // Sort descending by count
            agentRows.sort((a, b) => b.count - a.count);

            if (agentRows.length === 0) {
              return <p style={{ fontSize: 12, color: "var(--ink-4)" }}>No agent activity yet.</p>;
            }

            return (
              <div className="flex flex-col gap-0.5">
                {agentRows.map(({ agent, count }) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2.5 rounded-lg"
                    style={{ padding: "7px 6px" }}
                  >
                    <AgentAvatar agent={agent} size={28} overlap={false} />
                    <span
                      className="flex-1 truncate"
                      style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}
                    >
                      {agent.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--ink-4)",
                        fontFamily: "var(--mono)",
                        flexShrink: 0,
                      }}
                    >
                      {count} note{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </EnsShell>
  );
}

/* ─────────── loading / error states ─────────────────────────────────── */

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground h-full">
      <Loader2 className="h-9 w-9 animate-spin" />
      <p className="text-sm">Loading knowledge base…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 h-full">
      <AlertCircle className="h-10 w-10 text-destructive opacity-70" />
      <p className="text-sm font-medium text-destructive">Could not load knowledge base</p>
      <p className="text-xs text-muted-foreground text-center max-w-xs">{message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/* ─────────── main exported component ────────────────────────────────── */

export default function Knowledge() {
  const {
    companyId,
    agents,
    collections,
    selectedCollection,
    selectedPath,
    content,
    loading,
    listLoading,
    error,
    saving,
    hasUnsavedChanges,
    viewMode,
    setViewMode,
    confirmDiscardUnsavedChanges,
    selectCollection,
    selectDoc,
    refreshList,
    setContent,
    saveDoc,
    createDoc,
  } = useKnowledgeData();

  const activeCollection = collections.find((c) => c.id === selectedCollection);

  const handleSelectCollection = (id: string) => {
    if (!confirmDiscardUnsavedChanges()) return;
    selectCollection(id);
    selectDoc(null);
    setViewMode("library");
  };

  if (listLoading) return <LoadingState />;

  if (error && !collections.length) {
    return <ErrorState message={error} onRetry={() => void refreshList()} />;
  }

  if (viewMode === "graph") {
    return (
      <KnowledgeGraphView
        collections={collections}
        agents={agents}
        selectedCollection={selectedCollection}
        selectedPath={selectedPath}
        onSelectCollection={(id) => {
          if (!confirmDiscardUnsavedChanges()) return;
          selectCollection(id);
          selectDoc(null);
          setViewMode("library");
        }}
        onSelectFile={(relativePath, collection) => {
          if (!confirmDiscardUnsavedChanges()) return;
          selectCollection(collection);
          selectDoc(relativePath);
          setViewMode("library");
        }}
      />
    );
  }

  // Collection selected → full file manager (handles file preview internally)
  if (selectedCollection && activeCollection) {
    return (
      <FileManagerPanel
        key={activeCollection.id}
        collection={activeCollection}
        companyId={companyId}
        agents={agents}
        selectedPath={selectedPath}
        content={content}
        loading={loading}
        error={error}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        onSelectFile={(relativePath) => {
          if (!confirmDiscardUnsavedChanges()) return;
          selectDoc(relativePath);
        }}
        onDeselectFile={() => {
          if (!confirmDiscardUnsavedChanges()) return;
          selectDoc(null);
        }}
        onBackToCollections={() => {
          if (!confirmDiscardUnsavedChanges()) return;
          selectDoc(null);
          selectCollection(null);
        }}
        onContentChange={setContent}
        onSave={() => void saveDoc()}
        onCreateFile={(name) => void createDoc(activeCollection.id, name)}
        onOpenGraph={() => setViewMode("graph")}
      />
    );
  }

  // Default → overview with all collections + recent edits
  return (
    <OverviewPanel
      collections={collections}
      companyId={companyId}
      agents={agents}
      onSelectCollection={handleSelectCollection}
      onSelectDoc={(relativePath, collection) => {
        if (!confirmDiscardUnsavedChanges()) return;
        selectCollection(collection);
        selectDoc(relativePath);
        setViewMode("library");
      }}
    />
  );
}
