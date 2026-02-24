/**
 * Auth token cache to avoid repeated getSession() calls
 * This prevents the infinite loop of /api/auth/session requests
 */

let cachedToken: string | null = null;
let tokenPromise: Promise<string | null> | null = null;

/**
 * Get the cached auth token
 * Returns null if no token is cached
 */
export const getCachedToken = (): string | null => {
  return cachedToken;
};

/**
 * Set the cached auth token
 */
export const setCachedToken = (token: string | null): void => {
  cachedToken = token;
};

/**
 * Clear the cached token (useful for logout)
 */
export const clearCachedToken = (): void => {
  cachedToken = null;
  tokenPromise = null;
};

/**
 * Get or fetch the auth token with caching
 * This prevents multiple simultaneous getSession() calls
 */
export const getAuthToken = async (): Promise<string | null> => {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }

  // If there's already a request in flight, wait for it
  if (tokenPromise) {
    return tokenPromise;
  }

  // Create a new request
  tokenPromise = (async () => {
    try {
      const { getSession } = await import("next-auth/react");
      const session = await getSession();
      const token = session?.user?.token || null;
      cachedToken = token;
      return token;
    } catch (error) {
      console.error("Failed to get session token:", error);
      return null;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
};
