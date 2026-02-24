// services/rate-limit-client.ts
import { hyperchoApi } from "./http.config";

export type RateLimitType = "generate_response_daily"; // AI chat messages

export interface RateLimitInfo {
  isExceeded: boolean;
  limit: number;
  remaining: number;
  resetAt: string; // ISO date string: "2025-10-12T04:00:00.000Z"
  resetTime: number; // Computed milliseconds timestamp for easier usage
  timestamp: number; // When this data was fetched
  success: boolean;
}

export async function fetchRateLimit(
  limitType: RateLimitType
): Promise<RateLimitInfo> {
  const response = await hyperchoApi.get(`User/rateLimitInfo/${limitType}`);

  if (response.status !== 200) {
    throw new Error(`Failed to fetch rate limit for ${limitType}`);
  }

  const data = response.data.data;

  // Compute resetTime from resetAt ISO string
  const resetTime = new Date(data.resetAt).getTime();

  return {
    ...data,
    resetTime,
    timestamp: Date.now(),
  };
}