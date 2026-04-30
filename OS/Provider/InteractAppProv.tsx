import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  AppSchema,
  defaultAppSchema,
  type SidebarItem,
} from "@OS/Layout/types";
import type { SidebarUserItem } from "@OS/Layout/Sidebar/SidebarSchema";
import { useOS } from "./OSProv";

interface LoadingState {
  isLoading: boolean;
  message?: string;
  icon?: React.ReactNode;
}

interface InteractAppContextType {
  appSchema: AppSchema;
  sidebar: boolean;
  detail: boolean;
  toggleSidebar: () => void;
  toggleDetail: ({ show, toolId }: { show?: boolean; toolId?: string }) => void;
  bodyRef: React.RefObject<HTMLDivElement> | null;
  currentActiveTab: string;
  setCurrentActiveTab: (tabId: string) => void;
  loading: LoadingState;
  setLoading: (loading: Partial<LoadingState>) => void;
}

const InteractAppContext = createContext<InteractAppContextType>({
  sidebar: true,
  detail: true,
  toggleSidebar: () => {},
  toggleDetail: () => {},
  appSchema: defaultAppSchema,
  bodyRef: null,
  currentActiveTab: "",
  setCurrentActiveTab: () => {},
  loading: { isLoading: false },
  setLoading: () => {},
});

export const useInteractApp = () => {
  const context = useContext(InteractAppContext);
  if (!context) {
    throw new Error("useInteractApp must be used within a InteractAppProvider");
  }
  return context;
};

interface InteractAppProviderProps {
  children: React.ReactNode;
  appSchema: AppSchema;
}

export const InteractAppProvider = ({
  children,
  appSchema: curAppSchema,
}: InteractAppProviderProps) => {
  const { activeTool, currentAppSettings, updateAppSettings, getAppSettings } =
    useOS();
  const appSchema = useMemo(() => curAppSchema, [curAppSchema]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [loading, setLoadingState] = useState<LoadingState>({
    isLoading: false,
  });

  // Helper function to check if sidebar has any content (items or custom content like dropdown)
  const hasSidebarContent = useCallback((schema: AppSchema): boolean => {
    if (!schema.sidebar) return false;

    if (schema.sidebar.sections && schema.sidebar.sections.length > 0) {
      const hasContent = schema.sidebar.sections.some(
        (section) =>
          section.type === "custom" ||
          ("items" in section && section.items && section.items.length > 0)
      );
      if (hasContent) return true;
    }

    if (schema.sidebar.footer && schema.sidebar.footer.length > 0) {
      const hasItems = schema.sidebar.footer.some(
        (section) =>
          "items" in section && section.items && section.items.length > 0
      );
      if (hasItems) return true;
    }

    return false;
  }, []);

  // Helper function to extract all valid tab IDs from sidebar schema
  const getValidTabIds = useCallback((schema: AppSchema): string[] => {
    const tabIds: string[] = [];

    if (schema.sidebar?.sections) {
      schema.sidebar.sections.forEach((section) => {
        if ("items" in section && section.items) {
          section.items.forEach((item: SidebarItem | SidebarUserItem) => {
            if (item.id) {
              tabIds.push(item.id);
            }
            // Also check nested items (only SidebarItem has items property)
            if ("items" in item && item.items) {
              item.items.forEach((nestedItem: SidebarItem) => {
                if (nestedItem.id) {
                  tabIds.push(nestedItem.id);
                }
              });
            }
          });
        }
      });
    }

    if (schema.sidebar?.footer) {
      schema.sidebar.footer.forEach((section) => {
        if ("items" in section && section.items) {
          section.items.forEach((item: SidebarItem | SidebarUserItem) => {
            if (item.id) {
              tabIds.push(item.id);
            }
          });
        }
      });
    }

    return tabIds;
  }, []);

  // Validate and fix currentActiveTab if it doesn't exist in sidebar items
  useEffect(() => {
    if (!activeTool?.id || !appSchema.sidebar) return;

    const validTabIds = getValidTabIds(appSchema);
    const currentTab = currentAppSettings.currentActiveTab;

    // If currentActiveTab doesn't exist in valid tabs, set to first tab
    if (
      currentTab &&
      validTabIds.length > 0 &&
      !validTabIds.includes(currentTab)
    ) {
      const firstTab = validTabIds[0];
      updateAppSettings(activeTool.id, {
        currentActiveTab: firstTab,
      });
    }
    // If currentActiveTab is empty and we have valid tabs, set to first tab
    else if (!currentTab && validTabIds.length > 0) {
      const firstTab = validTabIds[0];
      updateAppSettings(activeTool.id, {
        currentActiveTab: firstTab,
      });
    }
  }, [
    appSchema,
    activeTool?.id,
    currentAppSettings.currentActiveTab,
    getValidTabIds,
    updateAppSettings,
  ]);

  // Check if sidebar has content
  const sidebarHasContent = useMemo(
    () => hasSidebarContent(appSchema),
    [appSchema, hasSidebarContent]
  );

  // Local state for immediate UI updates
  const [localDetail, setLocalDetail] = useState<boolean>(
    currentAppSettings.detail ?? true
  );
  const [localSidebar, setLocalSidebar] = useState<boolean>(() => {
    // If no sidebar content, default to false
    if (!hasSidebarContent(appSchema)) return false;
    return currentAppSettings.sidebar ?? true;
  });

  // Sync local state with settings when they change externally
  useEffect(() => {
    setLocalDetail(currentAppSettings.detail ?? true);
  }, [currentAppSettings.detail]);

  useEffect(() => {
    // If sidebar has no content, force it to false
    if (!sidebarHasContent) {
      setLocalSidebar(false);
      return;
    }
    setLocalSidebar(currentAppSettings.sidebar ?? true);
  }, [currentAppSettings.sidebar, sidebarHasContent]);

  // Ensure sidebar is hidden if schema has no sidebar content
  useEffect(() => {
    if (!sidebarHasContent && localSidebar) {
      setLocalSidebar(false);
      if (activeTool?.id) {
        updateAppSettings(activeTool.id, {
          sidebar: false,
        });
      }
    }
  }, [sidebarHasContent, localSidebar, activeTool?.id, updateAppSettings]);

  const setLoading = useCallback((loadingUpdate: Partial<LoadingState>) => {
    setLoadingState((prev) => ({ ...prev, ...loadingUpdate }));
  }, []);

  const toggleSidebar = useCallback(
    (show?: boolean) => {
      const newValue = show ?? !localSidebar;
      setLocalSidebar(newValue); // Immediate UI update
      updateAppSettings(activeTool?.id || "", {
        sidebar: newValue,
      });
    },
    [localSidebar, activeTool?.id, updateAppSettings]
  );

  const setCurrentActiveTab = useCallback(
    (tabId: string) => {
      updateAppSettings(activeTool?.id || "", {
        currentActiveTab: tabId,
      });
    },
    [activeTool?.id, updateAppSettings]
  );

  const toggleDetail = useCallback(
    ({ show, toolId }: { show?: boolean; toolId?: string }) => {
      const targetToolId = toolId || activeTool?.id || "";
      const settings = getAppSettings(targetToolId);
      const newValue = show ?? !settings.detail;

      // Immediate UI update for current tool
      if (!toolId || toolId === activeTool?.id) {
        setLocalDetail(newValue);
      }

      // Persist to settings
      updateAppSettings(targetToolId, {
        detail: newValue,
      });
    },
    [activeTool?.id, getAppSettings, updateAppSettings]
  );

  // Memoize validated active tab to ensure it's always valid
  const validatedActiveTab = useMemo(() => {
    const currentTab = currentAppSettings.currentActiveTab;

    if (!appSchema.sidebar) {
      // No sidebar — check header tabs as fallback for InteractContent visibility
      if (currentTab) return currentTab;
      const headerTabs = appSchema.header?.leftUI?.type === "tabs"
        ? appSchema.header.leftUI.tabs
        : undefined;
      if (headerTabs && headerTabs.length > 0) {
        return headerTabs[0].value ?? headerTabs[0].id ?? "";
      }
      return "";
    }

    const validTabIds = getValidTabIds(appSchema);

    // Return current tab if valid, otherwise return first tab or empty string
    if (currentTab && validTabIds.includes(currentTab)) {
      return currentTab;
    }

    return validTabIds.length > 0 ? validTabIds[0] : "";
  }, [appSchema, currentAppSettings.currentActiveTab, getValidTabIds]);

  // Sidebar should be false if there's no sidebar content
  const effectiveSidebar = sidebarHasContent ? localSidebar : false;

  return (
    <InteractAppContext.Provider
      value={{
        appSchema,
        sidebar: effectiveSidebar,
        toggleSidebar,
        detail: localDetail,
        toggleDetail,
        bodyRef,
        currentActiveTab: validatedActiveTab,
        setCurrentActiveTab,
        loading,
        setLoading,
      }}
    >
      {children}
    </InteractAppContext.Provider>
  );
};

export default InteractAppProvider;
