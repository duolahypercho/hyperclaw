import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Workflow,
  Settings,
  LayoutGrid,
  FileText,
  Database,
  MessageSquare,
  Users,
  Home,
  FolderKanban,
} from "lucide-react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "$/hooks/useLocalStorage";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NotificationProvider } from "./NotificationProv";
import { navigateVirtual } from "$/components/VirtualRouter";
import { setupToolRenderers } from "@OS/AI/components/tool-renderers/setup";

interface AppSettings {
  sidebar: boolean;
  detail: boolean;
  currentActiveTab: string;
  meta: Record<string, any>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface OSSettings {
  theme: "light" | "dark" | "system";
  wallpaper: string;
  musicPlayer: boolean;
  copanion: boolean;
  menu: boolean;
  statistics: boolean;
}

/**
 * Represents the base abstract definition for a tool
 * @interface ToolAbstract
 * @property {string} id - Unique identifier for the tool
 * @property {string} name - Display name of the tool
 * @property {string} description - Brief description of the tool's functionality
 * @property {React.ReactNode} icon - Visual representation of the tool (React component or element)
 */
export interface ToolAbstract {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  hidden?: boolean;
}

/**
 * Represents a tool in the Hypercho OS ecosystem
 * @interface Tool
 * @extends ToolAbstract
 * @property {string} href - Route path for the tool
 * @property {() => void} [onClick] - Optional callback function triggered when the tool is activated
 */
export interface Tool extends ToolAbstract {
  href: string;
  onClick?: () => void;
}

export interface DockTool extends ToolAbstract {
  onClick: () => void;
  active: boolean;
}

/**
 * Represents the context for the OSProvider
 * @interface OSContextType
 * @property {ToolAbstract[]} toolAbstracts - Array of tool abstract definitions
 * @property {Tool[]} tools - Array of tools available in the OS
 * @property {DockTool[]} dockTools - Array of tools available in the dock
 * @property {Tool | null} activeTool - The currently active tool
 * @property {() => void} setActiveTool - Function to set the active tool
 * @property {Record<string, AppSettings>} appSettings - Object containing app settings for each tool
 * @property {() => void} setAppSettings - Function to update app settings
 * @property {AppSettings} currentAppSettings - The current app settings for the active tool
 * @property {() => void} updateAppSettings - Function to update app settings
 */
interface OSContextType {
  toolAbstracts: ToolAbstract[];
  tools: Tool[];
  dockTools: DockTool[];
  activeTool: Tool | null;
  setActiveTool: (tool: Tool | null) => void;
  appSettings: Record<string, AppSettings>;
  setAppSettings: (settings: Record<string, AppSettings>) => void;
  currentAppSettings: AppSettings;
  updateAppSettings: (toolId: string, settings: Partial<AppSettings>) => void;
  getAppSettings: (toolId: string) => AppSettings;
  osSettings: OSSettings;
  updateOSSettings: (settings: Partial<OSSettings>) => void;
  publicTools: string[];
  isMounted: boolean;
}

const OSContext = createContext<OSContextType | undefined>(undefined);

// Individual contexts for each widget to prevent cross-widget re-renders
interface BaseWidgetContextType {
  showState: boolean;
  isMounted: boolean;
}

interface MenuContextType {
  showState: boolean;
}

// Use type aliases for consistency
type MusicPlayerContextType = BaseWidgetContextType;
type StatisticsContextType = BaseWidgetContextType;

export interface FloatingDocInstance {
  id: string;
  path: string;
}

export interface FloatingChatTaskContext {
  _id: string;
  title: string;
  description?: string;
  status: string;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  finishedAt?: string | number;
  starred?: boolean;
}

export interface FloatingChatInstance {
  id: string;
  agentId: string;
  sessionKey: string | null;
  taskContext: FloatingChatTaskContext | null;
}

interface DocsFloatingContextType {
  instances: Map<string, FloatingDocInstance>;
  openDoc: (path: string) => void;
  closeDoc: (id: string) => void;
  isMounted: boolean;
}

interface FloatingChatContextType {
  instances: Map<string, FloatingChatInstance>;
  openChat: (agentId: string, sessionKey?: string, task?: FloatingChatTaskContext | null) => void;
  closeChat: (id: string) => void;
  updateChatInstance: (id: string, updates: Partial<FloatingChatInstance>) => void;
  isMounted: boolean;
}


const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(
  undefined
);
const MenuContext = createContext<MenuContextType | undefined>(undefined);
const StatisticsContext = createContext<StatisticsContextType | undefined>(
  undefined
);
const DocsFloatingContext = createContext<DocsFloatingContextType | undefined>(
  undefined
);
const FloatingChatContext = createContext<FloatingChatContextType | undefined>(
  undefined
);

export const useOS = () => {
  const context = useContext(OSContext);
  if (!context) {
    throw new Error("useOS must be used within an OSProvider");
  }
  return context;
};

interface OSProviderProps {
  children: ReactNode;
}

// Static tool definitions outside component to prevent recreation
const STATIC_TOOL_ROUTES = [
  "/Tool/Chat",
  "/Tool/PixelOffice",
  "/Tool/Docs",
  "/Tool/Intelligence",
  "/Settings",
];

export const OSProvider: React.FC<OSProviderProps> = ({ children }) => {
  const Router = useRouter();
  const { setTheme } = useTheme();
  const atRoot = useMemo(() => Router.pathname === "/", [Router.pathname]);
  const [isMounted, setIsMounted] = useState(false);
  const prefetchedRef = useRef(false);

  // Initialize tool renderers once on module load
  setupToolRenderers();

  // Handle client-side mounting to prevent hydration mismatches
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Prefetch routes for faster navigation
  useEffect(() => {
    if (isMounted && !prefetchedRef.current) {
      prefetchedRef.current = true;
      // Prefetch critical routes
      const prefetchRoutes = async () => {
        for (const route of STATIC_TOOL_ROUTES) {
          try {
            await Router.prefetch(route);
          } catch (error) {
            console.warn(`Failed to prefetch ${route}:`, error);
          }
        }
      };

      // Use requestIdleCallback for non-blocking prefetch
      if (typeof window !== "undefined") {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(prefetchRoutes);
        } else {
          setTimeout(prefetchRoutes, 100);
        }
      }
    }
  }, [isMounted, Router]);

  const defaultOSSettings: OSSettings = {
    theme: "system",
    wallpaper: "/OS_wallpaper.jpg",
    musicPlayer: false,
    copanion: false,
    menu: false,
    statistics: false
  };

  const [osSettings, setOsSettings] = useLocalStorage<OSSettings>(
    "os-settings",
    defaultOSSettings
  );

  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [appSettings, setAppSettings] = useLocalStorage<
    Record<string, AppSettings>
  >("app-settings", {});

  // Floating doc windows: Map of instances (multi-window support)
  const [floatingDocs, setFloatingDocs] = useState<Map<string, FloatingDocInstance>>(new Map());
  const openFloatingDoc = useCallback((path: string) => {
    const id = `doc-${path}`;
    setFloatingDocs(prev => {
      const next = new Map(prev);
      next.set(id, { id, path });
      return next;
    });
  }, []);
  const closeFloatingDoc = useCallback((id: string) => {
    setFloatingDocs(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Floating chat windows: Map of instances (multi-window support)
  const [floatingChats, setFloatingChats] = useState<Map<string, FloatingChatInstance>>(new Map());
  const openFloatingChat = useCallback((agentId: string, sessionKey?: string, task?: FloatingChatTaskContext | null) => {
    const id = task ? `chat-task-${task._id}` : `chat-${agentId}`;
    setFloatingChats(prev => {
      const next = new Map(prev);
      next.set(id, { id, agentId, sessionKey: sessionKey ?? null, taskContext: task ?? null });
      return next;
    });
  }, []);
  const closeFloatingChat = useCallback((id: string) => {
    setFloatingChats(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const updateFloatingChatInstance = useCallback((id: string, updates: Partial<FloatingChatInstance>) => {
    setFloatingChats(prev => {
      const inst = prev.get(id);
      if (!inst) return prev;
      const next = new Map(prev);
      next.set(id, { ...inst, ...updates });
      return next;
    });
  }, []);


  // Memoize updateOSSettings to prevent recreation
  const updateOSSettings = useCallback(
    (settings: Partial<OSSettings>) => {
      setOsSettings((prev) => ({
        ...prev,
        ...settings,
      }));

      if (settings.theme === "dark") {
        document.documentElement.classList.add("dark");
        setTheme("dark");
      }
      if (settings.theme === "light") {
        document.documentElement.classList.remove("dark");
        setTheme("light");
      }
    },
    [setTheme]
  );

  // Memoize individual settings to prevent unnecessary re-renders
  const memoizedOsSettings = useMemo(() => osSettings, [osSettings]);

  // Create stable click handlers with virtual instant navigation
  const createToolClickHandler = useCallback(
    (route: string, toolId: string) => {
      return () => {
        // Immediate UI feedback first
        updateOSSettings({ menu: false });

        // Virtual instant navigation - shows immediately
        navigateVirtual(route, true);
      };
    },
    [updateOSSettings]
  );

  const ToolAbstracts = useMemo(() => {
    return [
      {
        id: "docs",
        name: "Docs",
        description: "Browse markdown docs from your OpenClaw workspace",
        icon: <FileText className="w-3.5 h-3.5" />,
      },
    ];
  }, []);

  // Memoize tools with stable click handlers
  const memoizedTools = useMemo(
    () => [
      {
        id: "home",
        name: "Home",
        description: "Home page to see all the status for your agents",
        icon: <Home className="w-4 h-4" />,
        onClick: () => {
          updateOSSettings({ menu: false });
          Router.push("/dashboard");
        },
        href: "/dashboard",
      },
      {
        id: "chat",
        name: "Chat",
        description: "Chat with your AI agents",
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        onClick: () => {
          updateOSSettings({ menu: false });
          Router.push("/Tool/Chat");
        },
        href: "/Tool/Chat",
      },
      {
        id: "team",
        name: "Team",
        description: "Your ensemble of AI employees — roster, roles, and live status",
        icon: <Users className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Tool/Team", "team")();
        },
        href: "/Tool/Team",
      },
      {
        id: "agent",
        name: "Agent",
        description: "Agent profile — identity, soul, skills, and cost",
        icon: <Users className="w-3.5 h-3.5" />,
        onClick: () => {},
        href: "/Tool/Agent/[id]",
        hidden: true,
      },
      {
        id: "pixel-office",
        name: "AI Agent Office",
        description: "Retro pixel-art office view of your AI team",
        icon: <LayoutGrid className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Tool/PixelOffice", "pixel-office")();
        },
        href: "/Tool/PixelOffice",
      },
      {
        id: "docs",
        name: "Knowledge",
        description: "Browse and manage company knowledge collections under ~/.hyperclaw",
        icon: <FileText className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Tool/Docs", "docs")();
        },
        href: "/Tool/Docs",
      },
      {
        id: "intelligence",
        name: "Data",
        description: "Browse agent-created data tables, CRM pipelines, and live agent status",
        icon: <Database className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Tool/Intelligence", "intelligence")();
        },
        href: "/Tool/Intelligence",
      },
      {
        id: "workflows",
        name: "Workflows",
        description: "Workspaces that group agents around a common goal",
        icon: <Workflow className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Tool/Workflows", "workflows")();
        },
        href: "/Tool/Workflows",
      },
      // Hidden sub-routes of the Workflows family. Registered so Router.pathname
      // resolves to a real tool (drives per-page app settings) and the navbar
      // can keep the Workflows entry highlighted across the family. Mirrors
      // the existing /Tool/Agent/[id] → "team" highlight pattern.
      {
        id: "missioncontrol",
        name: "Mission Control",
        description: "Live workflow canvas — runs, status, and controls",
        icon: <Workflow className="w-3.5 h-3.5" />,
        onClick: () => {},
        href: "/Tool/MissionControl",
        hidden: true,
      },
      {
        id: "workflows-templates",
        name: "Workflow templates",
        description: "Browse and clone workflow templates",
        icon: <Workflow className="w-3.5 h-3.5" />,
        onClick: () => {},
        href: "/Tool/Workflows/Templates",
        hidden: true,
      },
      {
        id: "projects",
        name: "Projects",
        description: "Wired crews of agents — workflow canvas for shipping work",
        icon: <FolderKanban className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Tool/Projects", "projects")();
        },
        href: "/Tool/Projects",
      },
      {
        id: "settings",
        name: "Settings",
        description: "Access your settings",
        icon: <Settings className="w-3.5 h-3.5" />,
        onClick: () => {
          createToolClickHandler("/Settings", "settings")();
        },
        href: "/Settings",
        hidden: true,
      },
    ],
    [createToolClickHandler, updateOSSettings]
  );

  // Memoize dock tools separately
  const memoizedDockTools = useMemo(
    () => [],
    [osSettings, atRoot, Router, updateOSSettings]
  );

  const publicTools = useMemo(() => [], []);

  // Patch missing keys after load
  useEffect(() => {
    // If any key is missing, patch it in
    if (
      osSettings &&
      (osSettings.wallpaper === undefined || osSettings.wallpaper === null)
    ) {
      setOsSettings((prev) => ({
        ...defaultOSSettings,
        ...prev,
      }));
    }
    // Add similar checks for other future keys if needed
  }, [osSettings, setOsSettings]);

  // Add this helper function at the top of the file
  const getDefaultPosition = useCallback(() => {
    if (typeof window === "undefined") {
      return { x: 200, y: 100 }; // SSR fallback
    }
    return {
      x: (window.innerWidth - 400) / 2 + 50,
      y: (window.innerHeight - 172) / 2 + 50,
    };
  }, []);

  // Then use it in your component
  const currentAppSettings = useMemo(() => {
    if (!activeTool?.id)
      return {
        sidebar: true,
        currentActiveTab: "",
        detail: true,
        meta: {},
        position: getDefaultPosition(),
        size: { width: 400, height: 150 },
      };

    return (
      appSettings[activeTool.id] || {
        sidebar: true,
        detail: true,
        currentActiveTab: "",
        meta: {},
        position: getDefaultPosition(),
        size: { width: 400, height: 150 },
      }
    );
  }, [activeTool?.id, appSettings]);

  const getAppSettings = useCallback(
    (toolId: string) => {
      return (
        appSettings[toolId] || {
          sidebar: true,
          detail: true,
          currentActiveTab: "",
          meta: {},
          position: getDefaultPosition(),
          size: { width: 400, height: 150 },
        }
      );
    },
    [appSettings]
  );

  const updateAppSettings = (
    toolId: string,
    settings: Partial<AppSettings>
  ) => {
    if (!toolId) return;
    setAppSettings((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        ...settings,
      },
    }));
  };

  // Update app settings when activeTool changes
  useEffect(() => {
    if (!activeTool?.id) return;

    setAppSettings((prev) => ({
      ...prev,
      [activeTool.id]: {
        ...prev[activeTool.id], // Preserve existing settings (position, size, etc.)
        sidebar: prev[activeTool.id]?.sidebar ?? true,
        detail: prev[activeTool.id]?.detail ?? true,
        currentActiveTab: prev[activeTool.id]?.currentActiveTab ?? "",
        meta: prev[activeTool.id]?.meta ?? {},
      },
    }));
  }, [activeTool?.id]);

  // Set activeTool based on current route - optimize to reduce lookups
  useEffect(() => {
    const pathname = Router.pathname;
    let foundTool = null;

    // Fast path for common routes
    if (pathname.startsWith("/Settings")) {
      foundTool = memoizedTools.find((tool) => tool.id === "settings");
    } else {
      foundTool = memoizedTools.find((tool) => tool.href === pathname);
    }

    setActiveTool(foundTool || null);
  }, [Router.pathname, memoizedTools]);

  useEffect(() => {
    if (osSettings.theme === "dark") {
      setTheme("dark");
    }
    if (osSettings.theme === "light") {
      setTheme("light");
    }
    if (osSettings.theme === "system") {
      setTheme("system");
    }
  }, [osSettings.theme]);

  // Memoize the context value to prevent unnecessary re-renders
  const value: OSContextType = useMemo(
    () => ({
      toolAbstracts: ToolAbstracts,
      tools: memoizedTools,
      dockTools: memoizedDockTools,
      osSettings: memoizedOsSettings,
      activeTool,
      setActiveTool,
      appSettings,
      getAppSettings,
      setAppSettings,
      currentAppSettings,
      updateAppSettings,
      updateOSSettings,
      publicTools,
      isMounted,
    }),
    [
      ToolAbstracts,
      memoizedTools,
      memoizedDockTools,
      memoizedOsSettings,
      activeTool,
      setActiveTool,
      appSettings,
      getAppSettings,
      setAppSettings,
      currentAppSettings,
      updateAppSettings,
      updateOSSettings,
      publicTools,
      isMounted,
    ]
  );

  // Memoize individual widget context values to prevent cross-widget re-renders
  const musicPlayerValue: MusicPlayerContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.musicPlayer,
      isMounted,
    }),
    [memoizedOsSettings.musicPlayer, isMounted]
  );

  const menuValue: MenuContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.menu,
    }),
    [memoizedOsSettings.menu]
  );

  const statisticsValue: StatisticsContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.statistics,
      isMounted,
    }),
    [memoizedOsSettings.statistics, isMounted]
  );

  const docsFloatingValue: DocsFloatingContextType = useMemo(
    () => ({
      instances: floatingDocs,
      openDoc: openFloatingDoc,
      closeDoc: closeFloatingDoc,
      isMounted,
    }),
    [floatingDocs, openFloatingDoc, closeFloatingDoc, isMounted]
  );

  const floatingChatValue: FloatingChatContextType = useMemo(
    () => ({
      instances: floatingChats,
      openChat: openFloatingChat,
      closeChat: closeFloatingChat,
      updateChatInstance: updateFloatingChatInstance,
      isMounted,
    }),
    [floatingChats, openFloatingChat, closeFloatingChat, updateFloatingChatInstance, isMounted]
  );


  return (
    <OSContext.Provider value={value}>
      <MusicPlayerContext.Provider value={musicPlayerValue}>
        <DocsFloatingContext.Provider value={docsFloatingValue}>
          <FloatingChatContext.Provider value={floatingChatValue}>
            <MenuContext.Provider value={menuValue}>
              <StatisticsContext.Provider value={statisticsValue}>
                <NotificationProvider>{children}</NotificationProvider>
              </StatisticsContext.Provider>
            </MenuContext.Provider>
          </FloatingChatContext.Provider>
        </DocsFloatingContext.Provider>
      </MusicPlayerContext.Provider>
    </OSContext.Provider>
  );
};

// Create a custom hook that only subscribes to what we need
export const useOSSelector = () => {
  const context = useContext(OSContext);
  if (!context) {
    throw new Error("useMusicOSSelector must be used within an OSProvider");
  }

  // Memoize the values we care about
  const settings = useMemo(
    () => ({
      currentActiveTab: context.currentAppSettings.currentActiveTab as string,
      meta: context.currentAppSettings.meta as Record<string, any>,
      updateAppSettings: context.updateAppSettings,
    }),
    [
      context.currentAppSettings.currentActiveTab,
      context.currentAppSettings.meta,
      context.updateAppSettings,
    ]
  );

  return settings;
};

// Individual hooks for each widget to prevent cross-widget re-renders
export const useMusicPlayerOS = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error("useMusicPlayerOS must be used within an OSProvider");
  }
  return context;
};

export const useDocsFloatingOS = () => {
  const context = useContext(DocsFloatingContext);
  if (!context) {
    throw new Error("useDocsFloatingOS must be used within an OSProvider");
  }
  return context;
};

export const useFloatingChatOS = () => {
  const context = useContext(FloatingChatContext);
  if (!context) {
    throw new Error("useFloatingChatOS must be used within an OSProvider");
  }
  return context;
};


export const useMenuOS = () => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("useMenuOS must be used within an OSProvider");
  }
  return context;
};

export const useStatisticsOS = () => {
  const context = useContext(StatisticsContext);
  if (!context) {
    throw new Error("useStatisticsOS must be used within an OSProvider");
  }
  return context;
};

export const OSMenu: React.FC = () => {
  const { tools, activeTool } = useOS();

  return (
    <div className="w-full p-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,100px)] justify-start items-start">
        {tools.map((icon, index) => (
          <div
            className="flex flex-col items-center justify-center"
            key={index}
          >
            <Button
              onClick={icon.onClick}
              variant="background"
              className="w-fit h-fit flex flex-col items-center gap-2 px-3 py-1 rounded-lg transition-colors hover:scale-105 active:scale-95 group"
            >
              <div
                className={cn(
                  "flex items-center justify-center w-16 h-16 bg-background rounded-lg backdrop-blur-sm transition-colors group-hover:bg-background/20 text-primary-foreground glassmorphism",
                  icon.id === activeTool?.id &&
                  "bg-primary/80 text-primary-foreground backdrop-blur-sm"
                )}
              >
                {React.cloneElement(icon.icon as React.ReactElement, {
                  className: cn(
                    "w-8 h-8",
                    icon.id === activeTool?.id && "fill-white"
                  ),
                })}
              </div>
              <span className="text-sm text-primary-foreground text-center font-medium break-words whitespace-normal">
                {icon.name}
              </span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OSProvider;
