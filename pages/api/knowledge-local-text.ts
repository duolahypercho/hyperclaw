import type { NextApiRequest, NextApiResponse } from "next";
import { readFile, realpath, stat } from "fs/promises";
import os from "os";
import path from "path";

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".graphql",
  ".gql",
  ".vue",
  ".svelte",
  ".r",
  ".lua",
  ".dart",
  ".tf",
  ".hcl",
]);

const MAX_TEXT_BYTES = 512 * 1024;

function sanitizeCompanyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeRelativePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  if (normalized.split("/").some((part) => part === "..")) return null;
  return normalized;
}

function isLocalRequest(req: NextApiRequest): boolean {
  const remoteAddress = req.socket.remoteAddress;
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).end("Method Not Allowed");
  }

  if (!isLocalRequest(req)) {
    return res.status(403).json({ success: false, error: "Local requests only" });
  }

  const companyId = sanitizeCompanyId(req.query.companyId);
  const relativePath = sanitizeRelativePath(req.query.relativePath);
  if (!companyId || !relativePath) {
    return res.status(400).json({ success: false, error: "Invalid path" });
  }

  const ext = path.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    return res.status(415).json({ success: false, error: "Unsupported text preview type" });
  }

  const knowledgeRoot = path.resolve(os.homedir(), ".hyperclaw", "knowledge");
  const companyRoot = path.resolve(knowledgeRoot, companyId);
  const absolutePath = path.resolve(companyRoot, relativePath);
  if (!absolutePath.startsWith(`${companyRoot}${path.sep}`)) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const resolvedCompanyRoot = await realpath(companyRoot);
    const resolvedPath = await realpath(absolutePath);
    if (!resolvedPath.startsWith(`${resolvedCompanyRoot}${path.sep}`)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const info = await stat(resolvedPath);
    if (!info.isFile()) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    if (info.size > MAX_TEXT_BYTES) {
      return res.status(413).json({ success: false, error: "File is too large for inline preview" });
    }

    const content = await readFile(resolvedPath, "utf8");
    return res.status(200).json({ success: true, content });
  } catch {
    return res.status(404).json({ success: false, error: "Not found" });
  }
}
