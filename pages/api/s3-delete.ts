// pages/api/deleteObject.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import logger from "$/lib/logger";

import { S3 } from "@aws-sdk/client-s3";

const s3 = new S3({ region: process.env.S3_UPLOAD_REGION!, credentials: { accessKeyId: process.env.S3_UPLOAD_KEY!, secretAccessKey: process.env.S3_UPLOAD_SECRET! }});

async function deleteObjectFromS3(objectKey: string): Promise<void> {
  try {
    const params = {
      Bucket: process.env.S3_UPLOAD_BUCKET!,
      Key: objectKey,
    };

    await s3.deleteObject(params);
  } catch (error) {
    throw error;
  }
}

/**
 * Validate and sanitize an S3 object key to prevent path traversal attacks.
 * Rejects keys containing ".." segments (including obfuscated variants like "....//"),
 * empty segments, or keys starting with "/".
 */
function isValidObjectKey(key: string): boolean {
  // Reject keys starting with "/"
  if (key.startsWith("/")) return false;

  // Split on "/" and check each segment
  const segments = key.split("/");
  for (const segment of segments) {
    // Reject empty segments (consecutive slashes)
    if (segment === "") return false;
    // Reject any segment that is ".." or contains ".." anywhere
    if (segment === "." || segment === "..") return false;
    if (segment.includes("..")) return false;
  }

  // Additional safety: normalize and compare — if normalization changes the path, it's suspicious
  // Use a simple approach: resolve the path and ensure it doesn't escape
  const normalized = segments.filter(Boolean).join("/");
  if (normalized !== key) return false;

  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { objectKey } = req.body;

  if (!objectKey || typeof objectKey !== "string") {
    return res.status(400).json({ message: "Invalid object key." });
  }

  if (!isValidObjectKey(objectKey)) {
    return res.status(400).json({ message: "Invalid object key." });
  }

  try {
    await deleteObjectFromS3(objectKey);
    res.status(200).json({ message: 'Object deleted successfully.' });
  } catch (error: any) {
    logger.error({ err: error, objectKey }, "S3 delete failed");
    res.status(500).json({ message: 'Failed to delete object.' });
  }
}
