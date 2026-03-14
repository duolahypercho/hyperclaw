import Jwt from "jsonwebtoken";

/**
 * Sign a structured JWT token with standardized claims.
 * All services in the Hyperclaw/Hypercho ecosystem should use this format:
 * - `sub`: userId (JWT standard subject claim)
 * - `tier`: user's subscription tier
 */
export function signToken(
  userId: string,
  tier: string,
  secret: string,
  expiresIn: string = "30d"
): string {
  return Jwt.sign({ sub: userId, tier }, secret, { expiresIn });
}

/**
 * Verify a JWT token and extract the userId, handling both old and new formats:
 * - Old format: payload IS the raw userId string
 * - New format: payload is { sub: userId, tier: "free" | ... }
 */
export function verifyToken(
  token: string,
  secret: string
): { userId: string; tier: string } {
  const decoded = Jwt.verify(token, secret) as any;

  if (typeof decoded === "string") {
    // Old format: raw userId string
    return { userId: decoded, tier: "free" };
  }

  const userId = decoded.sub || decoded.id || decoded;
  const tier = decoded.tier || "free";
  return { userId, tier };
}
