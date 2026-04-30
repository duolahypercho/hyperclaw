import type { NextApiRequest, NextApiResponse } from "next";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).end("Method Not Allowed");
  }

  const { path: filePath } = req.query;

  if (!filePath || typeof filePath !== "string") {
    return res.status(400).end("Missing path");
  }

  const homeDir = os.homedir();

  // filePath arrives as either:
  //   "/.openclaw/media/..."  (from oracle proxy URL path component)
  //   "/Users/username/.openclaw/..."  (absolute path from MEDIA: prefix)
  let absolutePath: string;
  if (filePath.startsWith(homeDir)) {
    absolutePath = filePath;
  } else {
    // Strip leading slash then join with home dir
    const stripped = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    absolutePath = path.join(homeDir, stripped);
  }

  const resolvedPath = path.resolve(absolutePath);
  const allowedBase = path.join(homeDir, ".openclaw");

  // Security: only allow files under ~/.openclaw/
  if (!resolvedPath.startsWith(allowedBase + path.sep) && resolvedPath !== allowedBase) {
    return res.status(403).end("Forbidden");
  }

  try {
    const buffer = await readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(buffer);
  } catch {
    return res.status(404).end("Not found");
  }
}
