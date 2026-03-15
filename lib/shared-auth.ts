import Jwt from "jsonwebtoken";

/**
 * Sign a JWT token as a raw userId string.
 * All services in the Hyperclaw/Hypercho ecosystem use this same format.
 */
export function signToken(
  userId: string,
  secret: string
): string {
  return Jwt.sign(userId, secret);
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
