import { randomUUID } from "crypto";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function safeUserId(userId: unknown): string {
  if (typeof userId !== "string" || !SAFE_SEGMENT.test(userId)) {
    throw new Error("Invalid user ID");
  }
  return userId;
}

function normalizePrefix(prefix: unknown): string {
  if (typeof prefix !== "string") {
    throw new Error("Invalid object key prefix");
  }

  const segments = prefix
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Invalid object key prefix");
  }

  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.includes("..") || !SAFE_SEGMENT.test(segment)) {
      throw new Error("Invalid object key prefix");
    }
  }

  return `${segments.join("/")}/`;
}

function normalizeObjectId(id: unknown): string {
  const value = typeof id === "string" && id.trim() ? id.trim() : randomUUID();
  if (!SAFE_SEGMENT.test(value) || value.includes("..")) {
    throw new Error("Invalid object ID");
  }
  return value;
}

export function buildUserScopedS3Key({
  prefix,
  objectId,
  userId,
}: {
  prefix: unknown;
  objectId: unknown;
  userId: unknown;
}): string {
  const scopedUserId = safeUserId(userId);
  const normalizedPrefix = normalizePrefix(prefix);
  const prefixSegments = normalizedPrefix.split("/").filter(Boolean);

  if (!prefixSegments.includes(scopedUserId)) {
    throw new Error("Object key prefix is not scoped to the authenticated user");
  }

  return `${normalizedPrefix}${normalizeObjectId(objectId)}`;
}

export function isUserScopedS3Key(key: unknown, userId: unknown): boolean {
  try {
    const scopedUserId = safeUserId(userId);
    if (typeof key !== "string" || key.startsWith("/") || key.endsWith("/")) {
      return false;
    }
    const normalized = normalizePrefix(key);
    const segments = normalized.split("/").filter(Boolean);
    return segments.length >= 2 && segments.includes(scopedUserId);
  } catch {
    return false;
  }
}
