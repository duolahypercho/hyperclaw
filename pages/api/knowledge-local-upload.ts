import type { NextApiRequest, NextApiResponse } from "next";
import { mkdir, writeFile, stat } from "fs/promises";
import os from "os";
import path from "path";

export const config = {
  api: {
    bodyParser: {
      // Allow base64 payloads up to ~33MiB raw (so ~25MiB of binary content,
      // matching the connector's knowledgeGetBinary cap).
      sizeLimit: "33mb",
    },
  },
};

const MAX_BINARY_BYTES = 25 * 1024 * 1024;

function sanitizeCompanyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeCollection(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Reject path traversal, slashes, control characters, leading dots.
  if (/[\\/\0]/.test(trimmed)) return null;
  if (trimmed.includes("..")) return null;
  if (trimmed.startsWith(".")) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

function isLocalRequest(req: NextApiRequest): boolean {
  const remoteAddress = req.socket.remoteAddress;
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

async function ensureUniquePath(target: string): Promise<string> {
  try {
    await stat(target);
  } catch {
    return target;
  }

  const ext = path.extname(target);
  const base = ext ? target.slice(0, -ext.length) : target;
  for (let attempt = 1; attempt < 1000; attempt++) {
    const next = `${base}-${attempt}${ext}`;
    try {
      await stat(next);
    } catch {
      return next;
    }
  }
  throw new Error("Could not pick a unique filename");
}

interface UploadBody {
  companyId?: unknown;
  collection?: unknown;
  fileName?: unknown;
  contentBase64?: unknown;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!isLocalRequest(req)) {
    return res.status(403).json({ success: false, error: "Local requests only" });
  }

  const body = (req.body ?? {}) as UploadBody;
  const companyId = sanitizeCompanyId(body.companyId);
  const collection = sanitizeCollection(body.collection);
  const fileName = sanitizeFileName(body.fileName);
  const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : null;

  if (!companyId) return res.status(400).json({ success: false, error: "Invalid companyId" });
  if (!collection) return res.status(400).json({ success: false, error: "Invalid collection" });
  if (!fileName) return res.status(400).json({ success: false, error: "Invalid fileName" });
  if (!contentBase64) return res.status(400).json({ success: false, error: "Missing contentBase64" });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(contentBase64, "base64");
  } catch {
    return res.status(400).json({ success: false, error: "Invalid base64 payload" });
  }

  if (buffer.byteLength === 0) {
    return res.status(400).json({ success: false, error: "Empty file" });
  }
  if (buffer.byteLength > MAX_BINARY_BYTES) {
    return res
      .status(413)
      .json({ success: false, error: "File exceeds 25 MiB upload limit" });
  }

  const knowledgeRoot = path.resolve(os.homedir(), ".hyperclaw", "knowledge");
  const companyRoot = path.resolve(knowledgeRoot, companyId);
  const collectionRoot = path.resolve(companyRoot, collection);
  if (!collectionRoot.startsWith(`${companyRoot}${path.sep}`)) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  const candidatePath = path.resolve(collectionRoot, fileName);
  if (!candidatePath.startsWith(`${collectionRoot}${path.sep}`)) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    await mkdir(collectionRoot, { recursive: true });
    const targetPath = await ensureUniquePath(candidatePath);
    await writeFile(targetPath, new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));

    const written = path.basename(targetPath);
    const relativePath = `${collection}/${written}`;
    return res.status(200).json({ success: true, relativePath, name: written });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
    });
  }
}
