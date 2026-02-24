/**
 * Twitter accounts cache to avoid repeated getTwitterAccounts() calls
 * This prevents unnecessary API requests and improves performance
 */

import { AxiosResponse } from "axios";
import { XUserLoginParams } from "$/services/tools/x";

interface CachedTwitterAccountsData {
  data: AxiosResponse<{
    success: boolean;
    status: number;
    code: "ACCOUNTS_RETRIEVED" | "ACCOUNTS_NOT_FOUND";
    message: string;
    data: Omit<XUserLoginParams, "oauthResponse" | "userId">[];
  }>;
  timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

let cachedTwitterAccounts: CachedTwitterAccountsData | null = null;
let twitterAccountsPromise: Promise<
  AxiosResponse<{
    success: boolean;
    status: number;
    code: "ACCOUNTS_RETRIEVED" | "ACCOUNTS_NOT_FOUND";
    message: string;
    data: Omit<XUserLoginParams, "oauthResponse" | "userId">[];
  }>
> | null = null;

/**
 * Get the cached Twitter accounts
 * Returns null if no accounts are cached or cache is expired
 */
export const getCachedTwitterAccounts = (): AxiosResponse<{
  success: boolean;
  status: number;
  code: "ACCOUNTS_RETRIEVED" | "ACCOUNTS_NOT_FOUND";
  message: string;
  data: Omit<XUserLoginParams, "oauthResponse" | "userId">[];
}> | null => {
  if (!cachedTwitterAccounts) {
    return null;
  }

  const now = Date.now();
  const isExpired = now - cachedTwitterAccounts.timestamp > CACHE_DURATION;

  if (isExpired) {
    cachedTwitterAccounts = null;
    return null;
  }

  return cachedTwitterAccounts.data;
};

/**
 * Set the cached Twitter accounts
 */
export const setCachedTwitterAccounts = (
  accounts: AxiosResponse<{
    success: boolean;
    status: number;
    code: "ACCOUNTS_RETRIEVED" | "ACCOUNTS_NOT_FOUND";
    message: string;
    data: Omit<XUserLoginParams, "oauthResponse" | "userId">[];
  }>
): void => {
  cachedTwitterAccounts = {
    data: accounts,
    timestamp: Date.now(),
  };
};

/**
 * Clear the cached Twitter accounts (useful for manual refresh or after account changes)
 */
export const clearCachedTwitterAccounts = (): void => {
  cachedTwitterAccounts = null;
  twitterAccountsPromise = null;
};

/**
 * Get or fetch Twitter accounts with caching
 * This prevents multiple simultaneous getTwitterAccounts() calls
 */
export const getCachedTwitterAccountsAsync = async (): Promise<
  AxiosResponse<{
    success: boolean;
    status: number;
    code: "ACCOUNTS_RETRIEVED" | "ACCOUNTS_NOT_FOUND";
    message: string;
    data: Omit<XUserLoginParams, "oauthResponse" | "userId">[];
  }>
> => {
  // Return cached accounts if available and not expired
  const cached = getCachedTwitterAccounts();
  if (cached) {
    return cached;
  }

  // If there's already a request in flight, wait for it
  if (twitterAccountsPromise) {
    return twitterAccountsPromise;
  }

  // Create a new request - call the API directly to avoid circular dependency
  twitterAccountsPromise = (async () => {
    try {
      const { hyperchoApi } = await import("$/services/http.config");
      const response = await hyperchoApi.get(`/Tools/x/getTwitterAccounts`);
      
      // Cache the result
      setCachedTwitterAccounts(response);
      
      return response;
    } catch (error) {
      console.error("Failed to get Twitter accounts:", error);
      throw error;
    } finally {
      twitterAccountsPromise = null;
    }
  })();

  return twitterAccountsPromise;
};
