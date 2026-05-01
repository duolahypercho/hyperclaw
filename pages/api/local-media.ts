import type { NextApiRequest, NextApiResponse } from "next";
import { readFile, realpath } from "fs/promises";
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

const isLoopbackHost = (hostHeader: string | undefined): boolean => {
  const header = hostHeader || "";
  const host = header.startsWith("[")
    ? header.slice(1, header.indexOf("]"))
    : header.split(":")[0];
  return ["localhost", "127.0.0.1", "::1"].includes(host);
};

const isLocalRequest = (req: NextApiRequest): boolean =>
  isLoopbackHost(req.headers.host) &&
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).end("Method Not Allowed");
  }

  if (!isLocalRequest(req)) {
    return res.status(403).end("Forbidden");
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

  try {
    const [realBase, realRequested] = await Promise.all([
      realpath(allowedBase),
      realpath(resolvedPath),
    ]);
    if (!realRequested.startsWith(realBase + path.sep) && realRequested !== realBase) {
      return res.status(403).end("Forbidden");
    }

    const ext = path.extname(realRequested).toLowerCase();
    const contentType = MIME_TYPES[ext];
    if (!contentType) {
      return res.status(403).end("Forbidden");
    }

    const buffer = await readFile(realRequested);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(buffer);
  } catch {
    return res.status(404).end("Not found");
  }
}
