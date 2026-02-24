import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getMyIdeas, fetchIdeaData } from "$/services/tools/aurum";
import { handleError } from "$/utils/errorHandler";
import {
  IdeaAnalysis,
  IdeaReport,
  TabType,
} from "$/components/Tool/Aurum/type";
import { AppSchema } from "@OS/Layout/types";
import { Lightbulb, Plus } from "lucide-react";
import { useOS } from "@OS/Provider/OSProv";

interface AurumContextType {
  // Define context properties here
  currentTab: TabType;
  handleTabChange: (tab: TabType) => void;
  handleOnClickIdea: (ideaId: string) => void;
  ideaReport: IdeaAnalysis | null;
  appendNewIdeas: (idea: IdeaReport) => void;
  appSchema: AppSchema;
  loading: boolean;
  ideasLoading: boolean;
  selectedIdeaId: string | null;
  loadingIdeaReport: boolean;
}

const AurumContext = createContext<AurumContextType | undefined>(undefined);

export const useAurum = () => {
  const context = useContext(AurumContext);
  if (!context) {
    throw new Error("useAurum must be used within a AurumProvider");
  }
  return context;
};

interface AurumProviderProps {
  children: ReactNode;
}

export const AurumProvider = ({ children }: AurumProviderProps) => {
  // Add state and functions here
  const { currentAppSettings, updateAppSettings } = useOS();
  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    const tab = currentAppSettings?.currentActiveTab;
    return tab ? (tab as TabType) : "aurum-home-item";
  });
  const [ideaReport, setIdeaReport] = useState<IdeaAnalysis | null>(null);
  const [myIdeas, setMyIdeas] = useState<IdeaReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [loadingIdeaReport, setLoadingIdeaReport] = useState(false);

  const fetchMyIdeas = useCallback(async () => {
    try {
      setIdeasLoading(true);
      const response = await getMyIdeas();
      setMyIdeas(response.data.data);
    } catch (error) {
      handleError(error, "Failed to fetch my ideas");
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  const handleOnClickIdea = async (ideaId: string) => {
    try {
      setLoadingIdeaReport(true);
      setSelectedIdeaId(ideaId);
      // Clear previous data to show loading state
      setIdeaReport(null);
      handleTabChange("aurum-idea-report-item");
      const response = await fetchIdeaData(ideaId);
      setIdeaReport(response.data.data);
    } catch (error) {
      handleError(error, "Failed to fetch idea report");
      setIdeaReport(null);
    } finally {
      setLoadingIdeaReport(false);
    }
  };

  const appendNewIdeas = useCallback((idea: IdeaReport) => {
    setMyIdeas((prev) => [idea, ...prev]);
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    setCurrentTab(tab);
  }, []);

  useEffect(() => {
    fetchMyIdeas();
    if (currentAppSettings?.meta?.ideaId) {
      handleOnClickIdea(currentAppSettings.meta.ideaId);
    }
  }, []);

  useEffect(() => {
    if (!currentTab) return;
    if (selectedIdeaId && currentTab === "aurum-idea-report-item") {
      updateAppSettings("aurum", {
        currentActiveTab: currentTab,
        meta: {
          ideaId: selectedIdeaId,
        },
      });
    } else if (currentTab === "aurum-home-item") {
      updateAppSettings("aurum", {
        currentActiveTab: currentTab,
        meta: {
          ideaId: null,
        },
      });
    }
  }, [currentTab, selectedIdeaId]);

  const appSchema: AppSchema = React.useMemo(() => {
    const schema: AppSchema = {
      sidebar: {
        sections: [
          {
            id: "aurum-section",
            items: [
              {
                id: "aurum-home-item",
                title: "New Idea",
                icon: Plus,
                isActive: currentTab === "aurum-home-item",
                onClick: () => handleTabChange("aurum-home-item"),
              },
            ],
          },
          {
            id: "aurum-my-ideas-section",
            title: "My Ideas",
            type: "collapsible" as const,
            items: [
              ...myIdeas.map((idea) => ({
                id: idea._id,
                title: idea.title,
                icon: Lightbulb,
                isActive:
                  selectedIdeaId === idea._id &&
                  currentTab === "aurum-idea-report-item",
                onClick: () => handleOnClickIdea(idea._id),
                isStaticTab: true,
              })),
            ],
          },
        ],
      },
    };

    // If viewing an idea report, customize the header to show the title
    if (currentTab === "aurum-idea-report-item" && ideaReport) {
      schema.header = {
        centerUI: {
          type: "breadcrumbs" as const,
          breadcrumbs: [
            {
              label: "My Ideas",
              icon: Plus,
            },
            {
              label: ideaReport.title,
              icon: Lightbulb,
            },
          ],
        },
      };
    }

    return schema;
  }, [
    currentTab,
    selectedIdeaId,
    ideaReport,
    handleTabChange,
    handleOnClickIdea,
  ]);

  const value = {
    currentTab,
    handleTabChange,
    handleOnClickIdea,
    appendNewIdeas,
    loading,
    ideaReport,
    appSchema,
    ideasLoading,
    selectedIdeaId,
    loadingIdeaReport,
  };

  return (
    <AurumContext.Provider value={value}>{children}</AurumContext.Provider>
  );
};
