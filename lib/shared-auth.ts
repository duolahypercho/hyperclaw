import Jwt from "jsonwebtoken";

/**
 * Sign a JWT token matching Hypercho_UserManager's format: { id: userId }.
 * All services in the Hyperclaw/Hypercho ecosystem use this same format.
 */
export function signToken(
  userId: string,
  secret: string,
  expiresIn: string = "30d"
): string {
  return Jwt.sign({ id: userId }, secret, { expiresIn });
}

/**
 * Verify a JWT token and extract the userId.
 * Handles legacy formats for backward compatibility:
 * - Current format: { id: userId }
 * - Legacy format: { sub: userId, tier: ... }
 * - Legacy format: raw userId string
 */
export function verifyToken(
  token: string,
  secret: string
): { userId: string } {
  const decoded = Jwt.verify(token, secret) as any;

  if (typeof decoded === "string") {
    return { userId: decoded };
  }

  const userId = decoded.id || decoded.sub || decoded;
  return { userId };
}
