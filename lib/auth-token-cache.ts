/**
 * Auth token cache — the ONLY source of truth for the client-side JWT.
 *
 * The token is populated by UserProvider (via setCachedToken) which reads
 * it from the SessionProvider context. We intentionally NEVER call
 * getSession() here because each call makes a fresh fetch to
 * /api/auth/session, and with many components mounting concurrently
 * that adds up to dozens of requests per page load.
 */

let cachedToken: string | null = null;

export const getCachedToken = (): string | null => cachedToken;

export const setCachedToken = (token: string | null): void => {
  cachedToken = token;
};

export const clearCachedToken = (): void => {
  cachedToken = null;
};

/**
 * Returns the cached auth token. Never fetches — the token is populated
 * by UserProvider from the SessionProvider context (single fetch on mount).
 */
export const getAuthToken = async (): Promise<string | null> => {
  return cachedToken;
};
