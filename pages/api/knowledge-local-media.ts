import type { NextApiRequest, NextApiResponse } from "next";
import { readdir, stat } from "fs/promises";
import os from "os";
import path from "path";
import type { KnowledgeFileType } from "$/lib/hyperclaw-bridge-client";

type LocalKnowledgeMediaFile = {
  relativePath: string;
  name: string;
  collection: string;
  updatedAt: string;
  sizeBytes: number;
  fileType: KnowledgeFileType;
  mimeType: string;
};

const MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
  ".tiff",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".ogv",
  ".m4v",
  ".flv",
  ".csv",
  ".tsv",
  ".pdf",
]);

const MAX_MEDIA_FILES = 500;
const MAX_SCAN_DEPTH = 8;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".tiff": "image/tiff",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/avi",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
  ".m4v": "video/mp4",
  ".flv": "video/x-flv",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".pdf": "application/pdf",
};

function fileTypeFromExtension(extension: string): KnowledgeFileType {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif", ".tiff"].includes(extension)) {
    return "image";
  }
  if ([".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv", ".m4v", ".flv"].includes(extension)) {
    return "video";
  }
  if (extension === ".csv") return "csv";
  if (extension === ".tsv") return "code";
  if (extension === ".pdf") return "pdf";
  return "unknown";
}

function sanitizeCompanyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function isLocalRequest(req: NextApiRequest): boolean {
  const remoteAddress = req.socket.remoteAddress;
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

async function collectMediaFiles(
  directory: string,
  root: string,
  files: LocalKnowledgeMediaFile[],
  depth = 0,
): Promise<void> {
  if (files.length >= MAX_MEDIA_FILES) return;
  if (depth > MAX_SCAN_DEPTH) return;

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (files.length >= MAX_MEDIA_FILES) return;
    if (entry.name.startsWith(".")) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await collectMediaFiles(absolutePath, root, files, depth + 1);
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) continue;

    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const [collection] = relativePath.split("/");
    if (!collection || collection === relativePath) continue;

    const info = await stat(absolutePath);
    files.push({
      relativePath,
      name: entry.name,
      collection,
      updatedAt: info.mtime.toISOString(),
      sizeBytes: info.size,
      fileType: fileTypeFromExtension(ext),
      mimeType: MIME_BY_EXTENSION[ext] ?? "application/octet-stream",
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).end("Method Not Allowed");
  }

  if (!isLocalRequest(req)) {
    return res.status(403).json({ success: false, files: [], error: "Local requests only" });
  }

  const companyId = sanitizeCompanyId(req.query.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, files: [], error: "Invalid companyId" });
  }

  const knowledgeRoot = path.resolve(os.homedir(), ".hyperclaw", "knowledge");
  const root = path.resolve(knowledgeRoot, companyId);
  if (!root.startsWith(`${knowledgeRoot}${path.sep}`)) {
    return res.status(403).json({ success: false, files: [], error: "Forbidden" });
  }

  const files: LocalKnowledgeMediaFile[] = [];
  await collectMediaFiles(root, root, files);

  return res.status(200).json({
    success: true,
    files: files.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  });
}
