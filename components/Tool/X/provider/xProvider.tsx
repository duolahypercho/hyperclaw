"use client";

import React, {
  createContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import {
  TabType,
  TwitterConnectionStatus,
  paginationAIPostType,
  TwitterAccountType,
  xType,
  AIPostType,
  postStatus,
} from "../types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getTwitterAccounts,
  getTwitterPosts,
  deleteTwitterAccount,
  postXPost,
  deleteXPost,
  createXPost,
  patchUpdateXPost,
  patchUpdateXPostOrder,
  getTwitterPostsById,
  publishXPost,
} from "$/services/tools/x";
import { clearCachedTwitterAccounts } from "$/lib/twitter-accounts-cache";
import { useUser } from "$/Providers/UserProv";
import { useToast } from "@/components/ui/use-toast";
import {
  AppSchema,
  defaultAppSchema,
  HeaderButtonsConfig,
  HeaderTabItem,
  HeaderTabsConfig,
} from "@OS/Layout/types";
import {
  Home,
  Calendar,
  Plus,
  Trash,
  PencilRuler,
  List,
  PlusCircle,
  Upload,
  Loader2,
  Clock,
  RefreshCw,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import EditorStatus from "../component/EditorStatus";
import { useOS } from "@OS/Provider/OSProv";
import { HeaderButton } from "@OS/Layout/Sidebar/SidebarSchema";

type LoadingAction =
  | "posting"
  | "connecting"
  | "disconnecting"
  | "fetchingPosts"
  | "fetchingAccounts"
  | "generating"
  | "scheduling"
  | "deleting"
  | "creating"
  | "publishing";

type LoadingState = Record<LoadingAction, boolean>;

interface LoadingManager {
  isLoading: (action: LoadingAction) => boolean;
  startLoading: (action: LoadingAction) => void;
  stopLoading: (action: LoadingAction) => void;
  anyLoading: () => boolean;
}

interface exportedValue {
  currentTab: TabType;
  handleTabChange: (tab: TabType) => void;
  activePost: xType | null;
  twitterStatus: TwitterConnectionStatus;
  connectTwitter: () => Promise<void>;
  disconnectTwitter: () => void;
  twitterAccounts: TwitterAccountType[];
  patchEditPost: (postId: string, post: Partial<AIPostType>) => Promise<void>;
  activeAccount: number;
  handleActiveAccountChange: (index: number) => void;
  postsPagination: paginationAIPostType;
  fetchPosts: () => Promise<void>;
  postContent: (content: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  fetchIndividualPost: (postId: string) => Promise<void>;
  loading: LoadingManager;
  appSchema: AppSchema;
  createNewPost: (params?: {
    postId?: string;
    order?: number;
  }) => Promise<void>;
  handleEditPostClick: (postId: string) => void;
  drafts: xType[];
  handleThreadOrder: (postId: string, order: string[]) => Promise<void>;
  postListStatus: string;
  setPostListStatus: (status: string) => void;
  filteredPosts: xType[];
  cachedPosts: Record<string, xType[]>;
  fetchPostsByStatus: (status: string) => Promise<void>;
  isInitialLoading: boolean;
  setTextareaContent: (content: string) => void;
  pendingTextareaContent: string | null;
}

const initialState: exportedValue = {
  currentTab: "home",
  handleTabChange: () => {},
  twitterStatus: "disconnected",
  activePost: null,
  connectTwitter: async () => {},
  patchEditPost: async () => {},
  createNewPost: async () => {},
  handleThreadOrder: async () => {},
  fetchIndividualPost: async () => {},
  disconnectTwitter: () => {},
  twitterAccounts: [],
  activeAccount: 0,
  handleActiveAccountChange: () => {},
  postsPagination: {
    posts: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    },
  },
  fetchPosts: async () => {},
  postContent: async () => {},
  deletePost: async () => {},
  handleEditPostClick: () => {},
  loading: {
    isLoading: () => false,
    startLoading: () => {},
    stopLoading: () => {},
    anyLoading: () => false,
  },
  appSchema: defaultAppSchema,
  drafts: [],
  postListStatus: "all",
  setPostListStatus: () => {},
  filteredPosts: [],
  cachedPosts: {},
  fetchPostsByStatus: async () => {},
  isInitialLoading: true,
  setTextareaContent: () => {},
  pendingTextareaContent: null,
};

const XContext = createContext<exportedValue>(initialState);

interface XProviderProps {
  children: React.ReactNode;
}

export function XProvider({ children }: XProviderProps) {
  const { currentAppSettings, updateAppSettings } = useOS();
  const [currentTab, setCurrentTab] = useState<TabType>(
    (currentAppSettings.currentActiveTab as TabType) || "home"
  );
  const [twitterStatus, setTwitterStatus] =
    useState<TwitterConnectionStatus>("loading");
  const { userId } = useUser();
  const [twitterAccounts, setTwitterAccounts] = useState<TwitterAccountType[]>(
    []
  );
  const [activeAccount, setActiveAccount] = useState<number>(0);
  const [activePost, setActivePost] = useState<xType | null>(null);
  const [drafts, setDrafts] = useState<xType[]>([]);
  const [postsPagination, setPostsPagination] = useState<paginationAIPostType>({
    posts: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    },
  });
  const { toast } = useToast();
  const [loadingState, setLoadingState] = useState<LoadingState>({
    posting: false,
    connecting: false,
    disconnecting: false,
    fetchingPosts: false,
    fetchingAccounts: false,
    generating: false,
    scheduling: false,
    deleting: false,
    creating: false,
    publishing: false,
  });
  const [postListStatus, setPostListStatus] = useState<string>("all");
  const [filteredPosts, setFilteredPosts] = useState<xType[]>([]);
  const [cachedPosts, setCachedPosts] = useState<Record<string, xType[]>>({});
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [pendingTextareaContent, setPendingTextareaContent] = useState<
    string | null
  >(null);

  const loading = useMemo<LoadingManager>(
    () => ({
      isLoading: (action: LoadingAction) => loadingState[action],
      startLoading: (action: LoadingAction) =>
        setLoadingState((prev) => ({ ...prev, [action]: true })),
      stopLoading: (action: LoadingAction) =>
        setLoadingState((prev) => ({ ...prev, [action]: false })),
      anyLoading: () => Object.values(loadingState).some(Boolean),
    }),
    [loadingState]
  );

  const handleTabChange = useCallback((tab: TabType) => {
    setCurrentTab(tab);
    updateAppSettings("x", { currentActiveTab: tab });
  }, []);

  const fetchTwitterAccounts = useCallback(async (forceRefresh: boolean = false) => {
    loading.startLoading("fetchingAccounts");
    try {
      const response = await getTwitterAccounts(forceRefresh);
      if (response.data.success && response.data.data.length > 0) {
        setTwitterAccounts(response.data.data);
        setActiveAccount(0);
        setTwitterStatus("connected");
      } else {
        setTwitterAccounts([]);
        setActiveAccount(-1);
        setTwitterStatus("disconnected");
      }
    } catch (error) {
      console.error("Failed to fetch Twitter accounts:", error);
      setTwitterAccounts([]);
      setActiveAccount(-1);
      setTwitterStatus("disconnected");
      toast({
        title: "Error",
        description: "Failed to fetch Twitter accounts",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("fetchingAccounts");
    }
  }, [loading, toast]);

  const fetchPosts = useCallback(async () => {
    loading.startLoading("fetchingPosts");
    try {
      if (!twitterAccounts[activeAccount]?.twitterUserId) {
        return;
      }
      const response = await getTwitterPosts({
        platformId: twitterAccounts[activeAccount].twitterUserId,
        limit: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (response.data.success) {
        setPostsPagination(response.data.data);

        // Also update filteredPosts based on current status filter
        let posts = response.data.data.posts;
        if (postListStatus !== "all") {
          posts = posts.filter((post: xType) => post.status === postListStatus);
        }
        setFilteredPosts(posts);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch Twitter posts",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Twitter posts",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("fetchingPosts");
    }
  }, [activeAccount, loading, toast, twitterAccounts, userId, postListStatus]);

  const connectTwitter = useCallback(async () => {
    loading.startLoading("connecting");
    try {
      const popup = window.open("", "_blank", "width=500,height=600");

      if (!popup) {
        toast({
          title: "Popup Blocked",
          description:
            "Please allow popups to continue with Twitter authentication",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/auth/x");
      const { url } = await res.json();
      popup.location.href = url;

      const messageHandler = async (event: MessageEvent) => {
        if (event.data.source === "twitter-oauth") {
          if (event.data.success) {
            // Clear cache when a new account is connected
            clearCachedTwitterAccounts();
            setTwitterStatus("connected");
            await fetchTwitterAccounts();
            await fetchPosts();
            handleTabChange("home");
            popup?.close();
          } else {
            setTwitterStatus("disconnected");
            toast({
              title: "Connection Failed",
              description: "Failed to connect Twitter account",
              variant: "destructive",
            });
          }
          window.removeEventListener("message", messageHandler);
        }
      };

      window.addEventListener("message", messageHandler);
    } catch (error) {
      console.error("Twitter connection failed:", error);
      setTwitterStatus("disconnected");
      toast({
        title: "Connection Error",
        description: "Failed to connect to Twitter. Please try again.",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("connecting");
    }
  }, [fetchTwitterAccounts, fetchPosts, loading, toast]);

  const disconnectTwitter = useCallback(async () => {
    loading.startLoading("disconnecting");
    setTwitterStatus("disconnected");
    try {
      await deleteTwitterAccount(twitterAccounts[activeAccount].twitterUserId);
      // Clear cache when an account is disconnected
      clearCachedTwitterAccounts();
      await fetchTwitterAccounts();
    } catch (error) {
      console.error("Failed to disconnect Twitter account:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Twitter account",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("disconnecting");
    }
  }, [activeAccount, fetchTwitterAccounts, loading, toast, twitterAccounts]);

  const handleActiveAccountChange = useCallback(
    (index: number) => {
      if (index < 0 || index >= twitterAccounts.length) {
        console.error("Invalid account index");
        toast({
          title: "Error",
          description: "Invalid account selection",
          variant: "destructive",
        });
        return;
      }
      if (index === activeAccount) {
        return;
      }
      setActiveAccount(index);
    },
    [twitterAccounts.length, activeAccount, toast]
  );

  const fetchIndividualPost = async (postId: string) => {
    try {
      handleTabChange("editor");
      const response = await getTwitterPostsById(postId);
      if (response.data.success) {
        setActivePost(response.data.data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch Twitter posts",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to fetch Twitter posts:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Twitter posts",
        variant: "destructive",
      });
    }
  };

  const postContent = async (content: string) => {
    if (loading.isLoading("posting")) return; // Prevent multiple simultaneous posts

    loading.startLoading("posting");
    try {
      // Validate content and active account
      if (!content.trim()) {
        toast({
          title: "Error",
          description: "Post content cannot be empty",
          variant: "destructive",
        });
        return;
      }

      if (!twitterAccounts[activeAccount]?.twitterUserId) {
        toast({
          title: "Error",
          description: "No active Twitter account selected",
          variant: "destructive",
        });
        return;
      }

      await postXPost({
        twitterUserId: twitterAccounts[activeAccount].twitterUserId,
        content,
      });

      await fetchPosts();
    } catch (error) {
      console.error("Failed to post content:", error);
      toast({
        title: "Error",
        description: "Failed to publish your post. Please try again.",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("posting");
    }
  };

  // Helper function to find a post across all possible sources
  const findPostById = (postId: string): xType | undefined => {
    // Check filtered posts first (most recent view)
    const filteredPost = filteredPosts.find((post) => post._id === postId);
    if (filteredPost) return filteredPost;

    // Check posts pagination
    const paginationPost = postsPagination.posts.find(
      (post) => post._id === postId
    );
    if (paginationPost) return paginationPost;

    // Check drafts
    const draftPost = drafts.find((post) => post._id === postId);
    if (draftPost) return draftPost;

    // Check cached posts
    for (const status in cachedPosts) {
      const cachedPost = cachedPosts[status].find(
        (post) => post._id === postId
      );
      if (cachedPost) return cachedPost;
    }

    return undefined;
  };

  const deletePost = async (postId: string) => {
    loading.startLoading("deleting");
    try {
      await deleteXPost(postId);

      // Clear active post if it's the one being deleted
      if (activePost?._id === postId) {
        setActivePost(null);
        handleTabChange("home");
      }

      // Clear cache to force fresh data
      setCachedPosts({});

      // Refetch posts to get the most recent updates
      await fetchPosts();

      // If we're on the list tab, also refresh the filtered posts
      if (currentTab === "list") {
        await fetchPostsByStatus(postListStatus, true);
      }
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast({
        title: "Error",
        description: "Failed to delete post",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("deleting");
    }
  };

  const createNewPost = useCallback(
    async (params?: { postId?: string; order?: number }) => {
      loading.startLoading("creating");
      try {
        const response = await createXPost({
          twitterUserId: twitterAccounts[activeAccount].twitterUserId,
          ...params,
        });

        setActivePost(response.data.data);

        handleTabChange("editor");

        // Clear cache to force fresh data
        setCachedPosts({});

        // Refetch posts to get the most recent updates
        await fetchPosts();

        return response.data.data;
      } catch (error) {
        console.error("Failed to create post:", error);
      } finally {
        loading.stopLoading("creating");
      }
    },
    [twitterAccounts, activeAccount, loading, fetchPosts]
  );

  const handleEditPostClick = async (postId: string) => {
    await fetchIndividualPost(postId);
    handleTabChange("editor");
  };

  const handleThreadOrder = async (postId: string, order: string[]) => {
    try {
      await patchUpdateXPostOrder(postId, order);

      // Clear cache to force fresh data
      setCachedPosts({});

      // Refetch posts to get the most recent updates
      await fetchPosts();

      // If we're on the list tab, also refresh the filtered posts
      if (currentTab === "list") {
        await fetchPostsByStatus(postListStatus, true);
      }
    } catch (error) {
      console.error("Failed to patch thread order:", error);
      toast({
        title: "Error",
        description: "Failed to update thread order",
        variant: "destructive",
      });
    }
  };

  const patchEditPost = async (postId: string, post: Partial<AIPostType>) => {
    try {
      await patchUpdateXPost(postId, post);

      // Clear cache to force fresh data
      setCachedPosts({});

      // Refetch posts to get the most recent updates
      await fetchPosts();

      // If we're on the list tab, also refresh the filtered posts
      if (currentTab === "list") {
        await fetchPostsByStatus(postListStatus, true);
      }
    } catch (error) {
      console.error("Failed to edit post:", error);
      toast({
        title: "Error",
        description: "Failed to edit post",
        variant: "destructive",
      });
    }
  };

  const publishPost = useCallback(
    async (postId: string) => {
      loading.startLoading("publishing");
      try {
        const response = await publishXPost(
          postId,
          twitterAccounts[activeAccount].twitterUserId
        );
        setActivePost(response.data.data);
        handleTabChange("home");

        // Clear cache to force fresh data
        setCachedPosts({});

        // Refetch posts to get the most recent updates
        await fetchPosts();
      } catch (error: any) {
        console.error("Failed to publish post:", error);
        toast({
          title: "Error",
          description: error.response?.data.message || "Failed to publish post",
          variant: "destructive",
        });
      } finally {
        loading.stopLoading("publishing");
      }
    },
    [twitterAccounts, activeAccount, loading, toast, fetchPosts]
  );

  const fetchPostsByStatus = useCallback(
    async (status: string, forceRefresh = false) => {
      if (!userId || !twitterAccounts[activeAccount]?.twitterUserId) return;

      // If we already have cached posts for this status and not forcing refresh, use them
      if (cachedPosts[status] && !forceRefresh) {
        setFilteredPosts(cachedPosts[status]);
        return;
      }

      loading.startLoading("fetchingPosts");
      try {
        const response = await getTwitterPosts({
          platformId: twitterAccounts[activeAccount].twitterUserId,
          status: status === "all" ? undefined : status,
          limit: 50,
          sortBy: "createdAt",
          sortOrder: "desc",
        });

        if (response.data.success) {
          const posts = response.data.data.posts;
          // Cache the posts for this status
          setCachedPosts((prev) => ({
            ...prev,
            [status]: posts,
          }));
          setFilteredPosts(posts);
        } else {
          toast({
            title: "Error",
            description: `Failed to fetch ${status} posts`,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error(`Failed to fetch ${status} posts:`, error);
        toast({
          title: "Error",
          description: `Failed to fetch ${status} posts`,
          variant: "destructive",
        });
      } finally {
        loading.stopLoading("fetchingPosts");
      }
    },
    [userId, twitterAccounts, activeAccount, cachedPosts, loading, toast]
  );

  const initialLoad = async () => {
    try {
      // Fetch Twitter accounts
      const twitterAccountsResponse = await getTwitterAccounts();

      const twitterAccounts = twitterAccountsResponse.data.success
        ? twitterAccountsResponse.data.data
        : [];

      if (twitterAccounts.length === 0) {
        handleTabChange("auth");
        setTwitterStatus("disconnected");
        setTwitterAccounts([]);
        setActiveAccount(-1);
        setPostsPagination({
          posts: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0,
          },
        });
        setIsInitialLoading(false);
        return;
      }

      const postsResponse = await getTwitterPosts({
        platformId: twitterAccounts[0].twitterUserId,
        limit: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      const posts = postsResponse.data.success
        ? postsResponse.data.data
        : {
            posts: [],
            pagination: {
              total: 0,
              page: 1,
              limit: 10,
              totalPages: 0,
            },
          };

      setTwitterAccounts(twitterAccounts);
      setPostsPagination(posts);
      setTwitterStatus("connected");
      handleTabChange("home");
    } catch (error) {
      console.error("Failed to load Twitter accounts and posts:", error);
      setTwitterStatus("disconnected");
    } finally {
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    if (twitterStatus !== "connected") {
      handleTabChange("auth");
    }
  }, [twitterStatus]);

  useEffect(() => {
    initialLoad();
  }, []);

  useEffect(() => {
    if (postsPagination.posts.length > 0) {
      const post = postsPagination.posts.find(
        (post) => post.status === "draft"
      );
      if (post) {
        setActivePost(post);
      }
    }
  }, [postsPagination]);

  useEffect(() => {
    let posts = postsPagination.posts;
    if (postListStatus !== "all") {
      posts = posts.filter((post) => post.status === postListStatus);
    }
    setFilteredPosts(posts);
  }, [postsPagination.posts, postListStatus]);

  useEffect(() => {
    if (currentTab === "list") {
      fetchPostsByStatus(postListStatus);
    }
  }, [postListStatus, currentTab, fetchPostsByStatus]);

  // Status options are defined inside the memo below to avoid re-creation on each render

  const headerRightButtons: HeaderButton[] = useMemo(() => {
    if (currentTab === "home") {
      return [
        {
          id: "schedule",
          label: "Schedule Post",
          variant: "accent",
          icon: <PlusCircle className="w-4 h-4" />,
          onClick: () => handleTabChange("schedule"),
        },
        {
          id: "add-account",
          label: "Add Account",
          variant: "outline",
          icon: <Plus className="w-4 h-4" />,
          onClick: connectTwitter,
        },
      ];
    }
    if (currentTab === "list") {
      return [
        {
          id: "create_post",
          label: "Create Post",
          icon: <Plus className="w-4 h-4" />,
          variant: "accent",
          onClick: () => createNewPost(),
        },
      ];
    }
    if (currentTab === "editor") {
      if (activePost?.status === "draft") {
        return [
          {
            id: "publish",
            label: "Publish",
            icon: loading.isLoading("publishing") ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-3 w-3 mr-2" />
            ),
            variant: "accent",
            onClick: () => {
              if (activePost?._id) publishPost(activePost?._id);
            },
          },
        ];
      }
      if (activePost?.status === "scheduled") {
        return [
          {
            id: "unschedule",
            label: "Unschedule",
            icon: <Clock className="w-4 h-4" />,
            variant: "destructive",
            onClick: () => {},
          },
        ];
      }
      if (activePost?.status === "inprogress") {
        return [
          {
            id: "cancel",
            label: "Publishing",
            icon: <Loader2 className="h-3 w-3 animate-spin mr-2" />,
            variant: "destructive",
            onClick: () => {},
          },
        ];
      }
      if (activePost?.status === "failed") {
        return [
          {
            id: "retry",
            label: "Retry",
            icon: <RefreshCw className="w-4 h-4" />,
            variant: "destructive",
            onClick: () => {},
          },
          {
            id: "delete",
            label: "Delete",
            icon: <Trash className="w-4 h-4" />,
            variant: "destructive",
            onClick: () => {},
          },
        ];
      }
      if (activePost?.status === "active") {
        return [
          {
            id: "view_live",
            label: "View Live",
            icon: <CheckCircle2 className="w-4 h-4" />,
            variant: "success",
            onClick: () => {},
          },
        ];
      }
      if (activePost?.status === "deleted") {
        return [
          {
            id: "restore",
            label: "Restore",
            icon: <Undo2 className="w-4 h-4" />,
            variant: "outline",
            onClick: () => {},
          },
        ];
      }
      return [];
    }
    return [];
  }, [
    currentTab,
    handleTabChange,
    connectTwitter,
    createNewPost,
    activePost,
    loading,
    publishPost,
  ]);

  const headerCenterTabs: HeaderTabsConfig | undefined = useMemo(() => {
    const statusOptions = [
      { value: "all", label: "All" },
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "inprogress", label: "In Progress" },
      { value: "failed", label: "Failed" },
      { value: "active", label: "Active" },
      { value: "deleted", label: "Deleted" },
    ];
    if (currentTab === "list") {
      return {
        type: "tabs",
        tabs: statusOptions.map((opt) => ({
          id: opt.value,
          label: opt.label,
          value: opt.value,
        })),
        activeValue: postListStatus,
        onValueChange: (value: string) => {
          setPostListStatus(value);
          fetchPostsByStatus(value);
        },
      } as HeaderTabsConfig;
    }
    return undefined;
  }, [currentTab, postListStatus, fetchPostsByStatus]);

  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        rightUI: {
          type: "buttons",
          buttons: headerRightButtons,
        } as HeaderButtonsConfig,
        centerUI: headerCenterTabs,
      },
      sidebar: {
        sections: [
          {
            id: "twitter-sidebar",
            items: [
              {
                id: "home",
                title: "Home",
                icon: Home,
                onClick: () => handleTabChange("home"),
              },
              {
                id: "list",
                title: "Tweets",
                icon: List,
                onClick: () => handleTabChange("list"),
              },
              {
                id: "editor",
                title: "Editor",
                icon: PencilRuler,
                onClick: () => handleTabChange("editor"),
              },
            ],
          },
        ],
        footer: [
          {
            id: "twitter-accounts",
            type: "dropdownUser",
            placeholder: "Select Account",
            items: [
              ...twitterAccounts.map((account) => ({
                id: account.twitterUserId,
                title: account.name,
                description: `@${account.username}`,
                logo: account.profileImageUrl,
                onClick: () =>
                  handleActiveAccountChange(twitterAccounts.indexOf(account)),
              })),
              {
                id: "add-account",
                title: "Add Account",
                icon: Plus,
              },
              {
                id: "delete-account",
                title: "Delete Account",
                icon: Trash,
                variant: "destructive",
                onClick: disconnectTwitter,
              },
            ],
            activeItem: twitterAccounts[activeAccount]
              ? {
                  id: twitterAccounts[activeAccount].twitterUserId,
                  title: twitterAccounts[activeAccount].name,
                  description: `@${twitterAccounts[activeAccount].username}`,
                  logo: twitterAccounts[activeAccount].profileImageUrl,
                }
              : undefined,
          },
        ],
      },
    }),
    [
      twitterAccounts,
      activeAccount,
      disconnectTwitter,
      headerRightButtons,
      headerCenterTabs,
      handleTabChange,
      handleActiveAccountChange,
    ]
  );

  const setTextareaContent = useCallback((content: string) => {
    setPendingTextareaContent(content);
  }, []);

  const value: exportedValue = {
    currentTab,
    handleTabChange,
    activePost,
    twitterStatus,
    connectTwitter,
    disconnectTwitter,
    twitterAccounts,
    activeAccount,
    handleActiveAccountChange,
    postsPagination: postsPagination,
    fetchPosts,
    handleThreadOrder,
    postContent,
    deletePost,
    patchEditPost,
    loading,
    appSchema,
    createNewPost,
    handleEditPostClick,
    drafts,
    fetchIndividualPost,
    postListStatus,
    setPostListStatus,
    filteredPosts,
    cachedPosts,
    fetchPostsByStatus,
    isInitialLoading,
    setTextareaContent,
    pendingTextareaContent,
  };

  return <XContext.Provider value={value}>{children}</XContext.Provider>;
}

export const useX = () => React.useContext(XContext);
