import { hyperchoApi } from "$/services/http.config";
import { AIPostType, xType } from "$/components/Tool/X/types";
import { AxiosResponse } from "axios";

export interface XUserLoginParams {
  userId: string;
  oauthResponse: {
    access_token: string;
    refresh_token: string;
  };
  twitterUserId: string;
  username: string;
  name: string;
  profileImageUrl: string;
  followersCount: number;
  followingCount: number;
  verified: boolean;
}

/**
 * Connects a user's X (Twitter) account to their Hypercho profile
 *
 * @param {Object} params - Parameters for connecting Twitter account
 * @param {string} params.userId - The ID of the Hypercho user
 * @param {Object} params.oauthResponse - The OAuth response from Twitter containing:
 * @param {string} params.oauthResponse.access_token - Access token for Twitter API
 * @param {string} params.oauthResponse.refresh_token - Refresh token for renewing access
 * @param {string} params.twitterUserId - The user's Twitter ID
 * @param {string} params.username - The user's Twitter handle
 * @param {string} params.name - The user's Twitter name
 * @param {string} params.verified - Whether the user is verified
 * @param {number} params.followersCount - The number of followers the user has
 * @param {number} params.followingCount - The number of users the user follows
 * @param {string} params.profileImageUrl - URL of the user's Twitter profile picture
 * @returns {Promise} A promise that resolves with the API response
 */

export const XUserLogin = async (params: XUserLoginParams) =>
  hyperchoApi.post(`/Tools/x/connectTwitterAccount`, params);

/**
 * Fetches all connected Twitter accounts for a given user
 * Uses caching to prevent unnecessary API requests
 *
 * @param {boolean} [forceRefresh=false] - If true, bypasses cache and fetches fresh data
 * @returns {Promise} A promise that resolves with the list of connected Twitter accounts
 */
export const getTwitterAccounts = async (
  forceRefresh: boolean = false
): Promise<
  AxiosResponse<{
    success: boolean;
    status: number;
    code: "ACCOUNTS_RETRIEVED" | "ACCOUNTS_NOT_FOUND";
    message: string;
    data: Omit<XUserLoginParams, "oauthResponse" | "userId">[];
  }>
> => {
  if (forceRefresh) {
    const { clearCachedTwitterAccounts } = await import(
      "$/lib/twitter-accounts-cache"
    );
    clearCachedTwitterAccounts();
  }

  const { getCachedTwitterAccountsAsync } = await import(
    "$/lib/twitter-accounts-cache"
  );
  return getCachedTwitterAccountsAsync();
};

/**
 * Fetches Twitter posts with pagination and filtering options
 *
 * @param {Object} params - Query parameters for fetching posts
 * @param {string} [params.platformId] - Filter posts by platform (Twitter) ID
 * @param {string} [params.status] - Filter posts by status
 * @param {number} [params.page] - Page number for pagination
 * @param {number} [params.limit] - Number of posts per page
 * @param {string} [params.sortBy] - Field to sort by
 * @param {('asc'|'desc')} [params.sortOrder] - Sort order
 * @returns {Promise<{
 *   success: boolean,
 *   status: number,
 *   code: string,
 *   message: string,
 *   data?: any[],
 *   error?: string,
 *   pagination?: {
 *     total: number,
 *     page: number,
 *     limit: number,
 *     totalPages: number
 *   }
 * }>}
 */
export const getTwitterPosts = async (params: {
  platformId?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) => {
  return hyperchoApi.get("/Tools/x/tweets", {
    params: {
      ...params,
      page: params.page || 1,
      limit: params.limit || 10,
      sortBy: params.sortBy || "createdAt",
      sortOrder: params.sortOrder || "desc",
    },
  });
};

export const getTwitterPostsById = async (postId: string) => {
  return hyperchoApi.get(`/Tools/x/tweets/${postId}`);
};

/**
 * Disconnects a Twitter account by deleting it from the database
 *
 * @param {string} twitterUserId - The ID of the Twitter account to disconnect
 * @returns {Promise} A promise that resolves with the disconnection result
 */
export const deleteTwitterAccount = async (
  twitterUserId: string
): Promise<
  AxiosResponse<{
    success: boolean;
    status: number;
    code:
      | "TWITTER_DISCONNECTED"
      | "ACCOUNT_NOT_FOUND"
      | "TWITTER_DISCONNECT_ERROR"
      | "MISSING_TWITTER_USER_ID";
    message: string;
    error?: string;
  }>
> => {
  return hyperchoApi.delete(`/Tools/x/deleteTwitterAccount`, {
    params: { twitterUserId },
  });
};

/**
 * Disconnects a Twitter account by deleting it from the database
 *
 * @param {string} twitterUserId - The ID of the Twitter account to disconnect
 * @param {string} content - The content of the post
 * @param {string[]} [mediaUrls] - Optional array of media URLs to include in the post
 * @returns {Promise} A promise that resolves with the disconnection result
 */

export const postXPost = async (params: {
  twitterUserId: string;
  content: string;
  mediaUrls?: string[];
}) => {
  return hyperchoApi.post(`/Tools/x/postXPost`, params);
};

/**
 * Deletes a specific X (Twitter) post
 *
 * @param {string} twitterUserId - The ID of the Twitter account
 * @param {string} tweetId - The ID of the post to delete
 * @returns {Promise} A promise that resolves with the deletion result
 */
export const deleteXPost = async (
  postId: string
): Promise<
  AxiosResponse<{
    success: boolean;
    status: number;
    code:
      | "MISSING_REQUIRED_FIELDS"
      | "TWEET_DELETION_ERROR"
      | "TWEET_DELETED_SUCCESSFULLY"
      | "TWITTER_ACCOUNT_NOT_FOUND";
    data: xType;
    message: string;
    error?: string;
  }>
> => {
  return hyperchoApi.delete(`/Tools/x/tweets/${postId}`);
};

/**
 * Updates the status of a specific X (Twitter) post
 *
 * @param {string} twitterUserId - The ID of the Twitter account
 * @param {string} tweetId - The ID of the post to update
 * @param {string} status - The new status of the post
 * @returns {Promise} A promise that resolves with the update result
 */
export const createXPost = async (params: {
  twitterUserId: string;
  postId?: string;
  order?: number;
}) => {
  return hyperchoApi.post(`/Tools/x/tweets`, params);
};

/**
 * Updates a specific X (Twitter) post
 *
 * @param {string} twitterUserId - The ID of the Twitter account
 * @param {string} tweetId - The ID of the post to update
 * @param {string} content - The new content of the post
 * @returns {Promise} A promise that resolves with the update result
 */

export const patchUpdateXPost = async (
  id: string,
  post: Partial<AIPostType>
) => {
  return hyperchoApi.patch(`/Tools/x/tweets/${id}`, post);
};

export const patchUpdateXPostOrder = async (id: string, order: string[]) => {
  return hyperchoApi.patch(`/Tools/x/tweets/${id}/order`, { order });
};

export const publishXPost = async (id: string, twitterUserId: string) => {
  return hyperchoApi.post(`/Tools/x/tweets/publish`, {
    postId: id,
    twitterUserId: twitterUserId,
  });
};
