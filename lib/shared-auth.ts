import Jwt from "jsonwebtoken";

/**
 * Sign a JWT with standardized { sub: userId, tier } claims.
 * Compatible across Hyperclaw_app, UserManager, and Hub.
 * 30-day expiration matches the NextAuth session maxAge.
 */
export function signToken(
  userId: string,
  secret: string,
  tier = "free"
): string {
  return Jwt.sign({ sub: userId, tier }, secret, { expiresIn: "30d" });
}

/**
 * Verify a JWT token and extract the userId.
 * Handles legacy formats for backward compatibility.
 */
export function verifyToken(
  token: string,
  secret: string
): { userId: string } {
  const decoded = Jwt.verify(token, secret) as any;

  if (typeof decoded === "string") {
    return { userId: decoded };
  }

  // Legacy fallback for object tokens
  const userId = decoded.id || decoded.sub || decoded;
  return { userId };
}
