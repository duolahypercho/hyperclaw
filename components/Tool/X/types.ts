import { XUserLoginParams } from "$/services/tools/x";

export type TabType = "home" | "auth" | "schedule" | "editor" | "list";
export type TwitterConnectionStatus =
  | "loading"
  | "disconnected"
  | "connecting"
  | "connected";

export type postStatus =
  | "draft"
  | "scheduled"
  | "inprogress"
  | "failed"
  | "active"
  | "deleted";

export type mediaType = {
  _id: string;
  type: "photo" | "video" | "gif";
  url: string;
  previewUrl?: string;
  altText?: string;
  mediaKey?: string;
  promptUsed?: string;
  aiGenerated: boolean;
};

export type TwitterAccountType = Omit<
  XUserLoginParams,
  "oauthResponse" | "userId"
>;

export interface XTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count: number;
  };
  entities?: {
    mentions?: Array<{
      start: number;
      end: number;
      username: string;
      id: string;
    }>;
    urls?: Array<{
      start: number;
      end: number;
      url: string;
      expanded_url: string;
      display_url: string;
    }>;
    hashtags?: Array<{
      start: number;
      end: number;
      tag: string;
    }>;
  };
  attachments?: {
    media_keys?: string[];
    poll_ids?: string[];
  };
  referenced_tweets?: Array<{
    type: "replied_to" | "quoted" | "retweeted";
    id: string;
  }>;
}

export interface XTweetResponse {
  data: XTweet[];
  meta: {
    result_count: number;
    newest_id: string;
    oldest_id: string;
    next_token?: string;
  };
}

export interface AIPostType {
  _id: string;
  postId?: string;
  content: string;
  media: mediaType[];
  status: postStatus;
  metrics: {
    impressions: number;
    engagements: number;
    clicks: number;
    likes: number;
    retweets: number;
    shares: number;
    comments: number;
    sentiment: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  metadata: {
    hashtags: { tag: string; aiRecommended: boolean }[];
    mentions: { username: string; id: string }[];
    urls: {
      url: string;
      expandedUrl: string;
      displayUrl: string;
      trackingEnabled: boolean;
    }[];
    categories: string[];
    topics: string[];
  };
  updatedAt: Date;
  postedAt?: Date;
}

export interface xType {
  _id: string;
  platformId: string;
  postId: AIPostType[];
  status: postStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  postedAt?: Date;
  scheduledAt?: Date;
}

export interface paginationAIPostType {
  posts: xType[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
