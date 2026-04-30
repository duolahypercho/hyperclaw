"use client";

import React, {
  createContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  AppSchema,
  defaultAppSchema,
  HeaderButtonsConfig,
} from "@OS/Layout/types";
import {
  Library,
  Plus,
  History,
  Send,
  Compass,
  FerrisWheel,
  GitCompare,
  TestTube,
  MessageCircle,
  Pencil,
} from "lucide-react";
import { CategoryType, Prompt } from "../types";
import { GetorCreatePrompt, patchUpdatePrompt } from "../api/Prompt";
import { CreatePromptLibrary, getPromptCategories } from "../api/PromptLibrary";
import { useOS } from "@OS/Provider/OSProv";
import { useToast } from "@/components/ui/use-toast";
import { DialogData } from "@OS/Layout/Dialog/DialogSchema";
import PromptConfigDetailWrapper from "../ui/components/PromptConfigDetail";
import { OptimizeProvider } from "./OptimizeProv";
import { useUser } from "$/Providers/UserProv";
import { cn } from "$/utils";

type TabType = "explore" | "playground" | "history" | "chat";

type LoadingAction =
  | "optimizing"
  | "testing"
  | "saving"
  | "loading"
  | "auto-saving";

interface LoadingState {
  [key: string]: boolean;
}

interface PromptLibraryContextType {
  currentTab: TabType;
  handleTabChange: (tab: TabType) => void;
  appSchema: AppSchema;
  handlePromptUpdate: (promptId: string, updateData?: any) => void;
  loading: {
    isLoading: (action: LoadingAction) => boolean;
    startLoading: (action: LoadingAction) => void;
    stopLoading: (action: LoadingAction) => void;
  };
  createNewPromptLibrary: () => void;
  devPrompt: Prompt | null;
  setDevPrompt: React.Dispatch<React.SetStateAction<Prompt | null>>;
  userPrompt: Prompt | null;
  handlePromptChange: (promptId: string) => void;
  showPublishDialog: boolean;
  setShowPublishDialog: (show: boolean) => void;
  category: CategoryType[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  setPage: (page: number) => void;
  page: number;
  playgroundTab: "experiment" | "compare-prompts";
  updatePlaygroundHeaderButtons: (buttons: any[]) => void;
  playgroundHeaderButtons: any[];
}

const initialState: PromptLibraryContextType = {
  currentTab: "explore",
  handleTabChange: () => {},
  appSchema: defaultAppSchema,
  handlePromptUpdate: () => {},
  loading: {
    isLoading: () => false,
    startLoading: () => {},
    stopLoading: () => {},
  },
  selectedCategory: "",
  setSelectedCategory: () => {},
  setPage: () => {},
  page: 1,
  createNewPromptLibrary: () => {},
  devPrompt: null,
  userPrompt: null,
  setDevPrompt: () => {},
  category: [],
  handlePromptChange: () => {},
  showPublishDialog: false,
  setShowPublishDialog: () => {},
  playgroundTab: "experiment",
  updatePlaygroundHeaderButtons: () => {},
  playgroundHeaderButtons: [],
};

const PromptLibraryContext =
  createContext<PromptLibraryContextType>(initialState);

interface PromptLibraryProviderProps {
  children: React.ReactNode;
}

export function PromptLibraryProvider({
  children,
}: PromptLibraryProviderProps) {
  const { updateAppSettings, currentAppSettings } = useOS();
  const [currentTab, setCurrentTab] = useState<TabType>(
    (currentAppSettings.currentActiveTab as TabType) || "explore"
  );
  const [loadingState, setLoadingState] = useState<LoadingState>({});
  const [devPrompt, setDevPrompt] = useState<Prompt | null>(null);
  const [userPrompt, setUserPrompt] = useState<Prompt | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [category, setCategory] = useState<CategoryType[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const { status } = useUser();

  const { toast } = useToast();
  const [playgroundTab, setPlaygroundTab] = useState<
    "experiment" | "compare-prompts"
  >("experiment");
  const [playgroundHeaderButtons, setPlaygroundHeaderButtons] = useState<any[]>(
    []
  );

  const loading = useMemo(
    () => ({
      isLoading: (action: LoadingAction) => loadingState[action] || false,
      startLoading: (action: LoadingAction) =>
        setLoadingState((prev) => ({ ...prev, [action]: true })),
      stopLoading: (action: LoadingAction) =>
        setLoadingState((prev) => ({ ...prev, [action]: false })),
    }),
    [loadingState]
  );

  const updatePlaygroundHeaderButtons = useCallback((buttons: any[]) => {
    setPlaygroundHeaderButtons(buttons);
  }, []);

  const handleTabChange = (tab: TabType) => {
    setCurrentTab(tab);
  };

  const fetchPrompt = useCallback(
    async (promptId?: string) => {
      if (status === "unauthenticated") {
        return;
      }
      try {
        loading.startLoading("loading");
        const response = await GetorCreatePrompt(promptId);
        if (response.data) {
          if (response.data.owner) {
            setDevPrompt(response.data);
          }
          setUserPrompt(response.data);
        }
        loading.stopLoading("loading");
      } catch (error) {
        console.error(error);
        toast({
          title: "Error",
          description: "Failed to fetch prompt",
          variant: "destructive",
        });
      }
    },
    [loading, toast]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const response = await getPromptCategories();
      if (response.data) {
        setCategory(response.data);
        setSelectedCategory(response.data[0].value);
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to fetch categories",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handlePromptChange = useCallback(
    (promptId: string) => {
      setCurrentTab("chat");
      fetchPrompt(promptId);
    },
    [fetchPrompt]
  );

  const createNewPromptLibrary = useCallback(async () => {
    setCurrentTab("playground");
    const response = await CreatePromptLibrary();
    if (response.data) {
      setDevPrompt(response.data);
    }
  }, []);

  const handlePromptUpdate = useCallback(
    async (promptId: string, updateData?: any) => {
      if (!promptId) return;

      try {
        loading.startLoading("saving");
        const response = await patchUpdatePrompt(promptId, updateData);

        if (response.success) {
          fetchPrompt(response.data?._id || "");
        } else {
          throw new Error(response.message || "Failed to unpublish prompt");
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to unpublish prompt",
          variant: "destructive",
        });
      } finally {
        loading.stopLoading("saving");
      }
    },
    [fetchPrompt, loading, toast]
  );

  useEffect(() => {
    updateAppSettings("prompt-library", {
      currentActiveTab: currentTab || "",
    });
  }, [currentTab, updateAppSettings]);

  const getHeaderButtons = useCallback(
    (
      prompt: Prompt | null,
      createNewPromptLibraryFn: () => void,
      isLoading: boolean
    ) => {
      const baseButtons = [
        {
          id: "new-prompt",
          label: "New Prompt",
          icon: <Plus className="w-4 h-4" />,
          variant: "outline" as const,
          className: cn(
            "text-xs font-semibold",
            status === "unauthenticated" && "hidden"
          ),
          onClick: () => createNewPromptLibraryFn(),
        },
      ];

      if (!prompt) {
        return [
          {
            id: "Explore",
            label: "Explore",
            icon: <Compass className="w-4 h-4" />,
            variant: "outline" as const,
            className: cn(
              "text-xs font-semibold",
              currentTab === "explore" && "bg-primary/20"
            ),
            onClick: () => handleTabChange("explore"),
          },
          ...baseButtons,
        ];
      }

      if (currentTab === "playground") {
        return [...playgroundHeaderButtons];
      }

      if (currentTab === "explore") {
        return [...baseButtons];
      }

      if (currentTab === "history") {
        return [...baseButtons];
      }

      if (currentTab === "chat") {
        return [
          prompt?.owner && {
            id: "edit-prompt",
            label: "Edit Prompt",
            icon: <Pencil className="w-4 h-4" />,
            variant: "outline" as const,
            className: "text-xs font-semibold",
            onClick: () => {
              if (prompt?.owner) {
                setCurrentTab("playground");
              } else {
                setCurrentTab("chat");
              }
            },
          },
          ...baseButtons,
        ];
      }

      return [...baseButtons];
    },
    [currentTab, playgroundHeaderButtons, status]
  );

  const handleCategoryClick = useCallback(
    (categoryValue: string) => {
      setSelectedCategory(
        categoryValue === selectedCategory ? "" : categoryValue
      );
      setPage(1);
    },
    [selectedCategory]
  );

  const initialLoad = useCallback(() => {
    fetchCategories();
    if (currentAppSettings.currentActiveTab === "playground") {
      fetchPrompt();
    }
  }, [currentAppSettings.currentActiveTab, fetchCategories, fetchPrompt]);

  useEffect(() => {
    initialLoad();
  }, []);

  const isSaving = useMemo(
    () => loading.isLoading("saving") && status === "authenticated",
    [loading, status]
  );

  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        title: "Prompt Library",
        icon: Library,
        rightUI: {
          type: "buttons",
          buttons: getHeaderButtons(
            devPrompt,
            createNewPromptLibrary,
            isSaving
          ),
        } as HeaderButtonsConfig,
        ...(currentTab === "playground" && {
          centerUI: {
            type: "tabs",
            tabs: [
              {
                id: "experiment",
                label: "Experiment",
                icon: TestTube,
                value: "experiment",
              },
              {
                id: "compare-prompts",
                label: "Compare",
                icon: GitCompare,
                value: "compare-prompts",
              },
            ],
            activeValue: playgroundTab,
            onValueChange: (value: string) => {
              setPlaygroundTab(value as "experiment" | "compare-prompts");
            },
          },
        }),
      },
      sidebar: {
        sections: [
          {
            id: "prompt-tools",
            title: "Tabs",
            items: [
              {
                id: "explore",
                title: "Explore",
                icon: Compass,
                onClick: () => handleTabChange("explore"),
              },
              {
                id: "chat",
                title: "Chat",
                icon: MessageCircle,
                onClick: () => handleTabChange("chat"),
              },
              {
                id: "playground",
                title: "Playground",
                icon: FerrisWheel,
                onClick: () => handleTabChange("playground"),
              },
              {
                id: "history",
                title: "My Prompts",
                icon: History,
                onClick: () => handleTabChange("history"),
              },
            ],
          },
          {
            id: "categories",
            title: "Categories",
            type: "collapsible",
            items: category.map((category) => ({
              id: category.value,
              title: category.name,
              isStaticTab: true,
              isActive: selectedCategory === category.value,
              onClick: () => {
                handleCategoryClick(category.value);
                setCurrentTab("explore");
              },
            })),
          },
        ],
      },
      ...(currentTab === "playground" && {
        detail: {
          animationKey: "prompt-config-detail",
          body: <PromptConfigDetailWrapper />,
          width: "480px",
          animation: "Right",
        },
      }),
      dialogs: [
        {
          id: "unpublish-prompt",
          title: "Unpublish Prompt",
          description: "Are you sure you want to unpublish this prompt?",
          type: "alert",
          actions: {
            confirm: {
              id: "unpublish-prompt-action",
              label: "Unpublish",
              onClick: (data?: DialogData) =>
                handlePromptUpdate(data?.dialogData?.libraryId, {
                  status: "archived",
                }),
            },
            close: {
              id: "cancel-unpublish-action",
              label: "Cancel",
              onClick: () => setShowPublishDialog(false),
            },
          },
        },
      ],
    }),
    [
      currentTab,
      devPrompt,
      playgroundTab,
      selectedCategory,
      getHeaderButtons,
      handleCategoryClick,
      handlePromptUpdate,
      isSaving,
      createNewPromptLibrary,
      category,
    ]
  );

  const value: PromptLibraryContextType = {
    currentTab,
    handleTabChange,
    handlePromptUpdate,
    appSchema,
    createNewPromptLibrary,
    loading,
    selectedCategory,
    setSelectedCategory,
    setPage,
    page,
    devPrompt,
    setDevPrompt,
    userPrompt,
    handlePromptChange,
    showPublishDialog,
    setShowPublishDialog,
    playgroundTab,
    category,
    updatePlaygroundHeaderButtons,
    playgroundHeaderButtons,
  };

  return (
    <PromptLibraryContext.Provider value={value}>
      <OptimizeProvider>{children}</OptimizeProvider>
    </PromptLibraryContext.Provider>
  );
}

export const usePromptLibrary = () => React.useContext(PromptLibraryContext);
