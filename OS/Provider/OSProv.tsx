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
import { LuListTodo } from "react-icons/lu";
import {
  Citrus,
  ListTodo,
  Coffee,
  Settings,
  FolderOpen,
  Clock,
  LayoutGrid,
  FileText,
  BarChart3,
  Shield,
  Network,
} from "lucide-react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "$/hooks/useLocalStorage";
import { useTheme } from "next-themes";
import CopanionIcon from "../assets/copanion";
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
  pomodoro: boolean;
  todoList: boolean;
  crons: boolean;
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

interface CopanionChatContextType extends BaseWidgetContextType {
  updateOSSettings: (settings: Partial<OSSettings>) => void;
}

// Use type aliases for consistency
type MusicPlayerContextType = BaseWidgetContextType;
type TodoListContextType = BaseWidgetContextType;
type CronsContextType = BaseWidgetContextType;
type PomodoroContextType = BaseWidgetContextType;
type StatisticsContextType = BaseWidgetContextType;

interface DocsFloatingContextType {
  showState: boolean;
  path: string | null;
  openDoc: (path: string) => void;
  closeDoc: () => void;
  isMounted: boolean;
}

interface FloatingChatTaskContext {
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

interface FloatingChatContextType {
  showState: boolean;
  agentId: string | null;
  sessionKey: string | null;
  taskContext: FloatingChatTaskContext | null;
  openChat: (agentId: string, sessionKey?: string, task?: FloatingChatTaskContext | null) => void;
  closeChat: () => void;
  isMounted: boolean;
}


const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(
  undefined
);
const TodoListContext = createContext<TodoListContextType | undefined>(
  undefined
);
const PomodoroContext = createContext<PomodoroContextType | undefined>(
  undefined
);
const CronsContext = createContext<CronsContextType | undefined>(undefined);
const MenuContext = createContext<MenuContextType | undefined>(undefined);
const CopanionChatContext = createContext<CopanionChatContextType | undefined>(
  undefined
);
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
  "/Tool/TodoList",
  "/Tool/Crons",
  "/Tool/Memory",
  "/Tool/PixelOffice",
  "/Tool/Docs",
  "/Tool/Approvals",
  "/Tool/OrgChart",
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
    theme: "light",
    wallpaper: "/OS_wallpaper.jpg",
    musicPlayer: false,
    todoList: false,
    crons: false,
    copanion: true,
    menu: false,
    pomodoro: false,
    statistics: false,
  };

  const [osSettings, setOsSettings] = useLocalStorage<OSSettings>(
    "os-settings",
    defaultOSSettings
  );

  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [appSettings, setAppSettings] = useLocalStorage<
    Record<string, AppSettings>
  >("app-settings", {});

  // Floating doc window: path when open, null when closed (not persisted)
  const [floatingDocPath, setFloatingDocPath] = useState<string | null>(null);
  const openFloatingDoc = useCallback((path: string) => {
    setFloatingDocPath(path);
  }, []);
  const closeFloatingDoc = useCallback(() => {
    setFloatingDocPath(null);
  }, []);

  // Floating chat window: agentId when open, null when closed
  const [floatingChatAgentId, setFloatingChatAgentId] = useState<string | null>(null);
  const [floatingChatSessionKey, setFloatingChatSessionKey] = useState<string | null>(null);
  const [floatingChatTask, setFloatingChatTask] = useState<FloatingChatTaskContext | null>(null);
  const openFloatingChat = useCallback((agentId: string, sessionKey?: string, task?: FloatingChatTaskContext | null) => {
    setFloatingChatAgentId(agentId);
    setFloatingChatSessionKey(sessionKey ?? null);
    setFloatingChatTask(task ?? null);
  }, []);
  const closeFloatingChat = useCallback(() => {
    setFloatingChatAgentId(null);
    setFloatingChatSessionKey(null);
    setFloatingChatTask(null);
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
        id: "copanion",
        name: "Copanion",
        description: "Access your companion",
        icon: <CopanionIcon className="w-3.5 h-3.5" />,
      },
      {
        id: "todo-list",
        name: "My Tasks",
        description: "Manage your tasks and stay productive",
        icon: <LuListTodo className="w-3.5 h-3.5" />,
      },
      {
        id: "pomodoro",
        name: "Pomodoro",
        description: "Manage your pomodoro timer",
        icon: <Citrus className="w-3.5 h-3.5" />,
      },
      {
        id: "docs",
        name: "Docs",
        description: "Browse markdown docs from your OpenClaw workspace",
        icon: <FileText className="w-3.5 h-3.5" />,
      },
      {
        id: "usage",
        name: "Token Usage",
        description: "View token usage from OpenClaw agents and sessions",
        icon: <BarChart3 className="w-3.5 h-3.5" />,
      },
    ];
  }, []);

  // Memoize tools with stable click handlers
  const memoizedTools = useMemo(
    () => [
 /*      {
        id: "todo-list",
        name: "My Tasks",
        description: "Manage your tasks and stay productive",
        icon: <LuListTodo className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "todo-list") return;
          createToolClickHandler("/Tool/TodoList", "todo-list")();
        },
        href: "/Tool/TodoList",
      }, */
      {
        id: "crons",
        name: "Crons",
        description: "View and manage cron job schedules",
        icon: <Clock className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "crons") return;
          createToolClickHandler("/Tool/Crons", "crons")();
        },
        href: "/Tool/Crons",
      },
      {
        id: "memory",
        name: "Memory",
        description: "Browse and read memory files from your OpenClaw workspace",
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "memory") return;
          createToolClickHandler("/Tool/Memory", "memory")();
        },
        href: "/Tool/Memory",
      },
      {
        id: "org-chart",
        name: "Org Chart",
        description: "Visualize your AI agent team hierarchy and delegation",
        icon: <Network className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "org-chart") return;
          createToolClickHandler("/Tool/OrgChart", "org-chart")();
        },
        href: "/Tool/OrgChart",
      },
      {
        id: "pixel-office",
        name: "AI Agent Office",
        description: "Retro pixel-art office view of your AI team",
        icon: <LayoutGrid className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "pixel-office") return;
          createToolClickHandler("/Tool/PixelOffice", "pixel-office")();
        },
        href: "/Tool/PixelOffice",
      },
      {
        id: "docs",
        name: "Docs",
        description: "Browse markdown docs from your OpenClaw workspace",
        icon: <FileText className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "docs") return;
          createToolClickHandler("/Tool/Docs", "docs")();
        },
        href: "/Tool/Docs",
      },
      {
        id: "usage",
        name: "Token Usage",
        description: "View token usage from OpenClaw agents and sessions",
        icon: <BarChart3 className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "usage") return;
          createToolClickHandler("/Tool/Usage", "usage")();
        },
        href: "/Tool/Usage",
      },
      {
        id: "approvals",
        name: "Approvals",
        description: "Review and approve dangerous operations",
        icon: <Shield className="w-3.5 h-3.5" />,
        onClick: () => {
          if (activeTool?.id === "approvals") return;
          createToolClickHandler("/Tool/Approvals", "approvals")();
        },
        href: "/Tool/Approvals",
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
    () => [
      {
        id: "pomodoro",
        name: "Pomodoro",
        description: "Manage your pomodoro timer",
        icon: (
          <Citrus
            className={cn("w-8 h-8", osSettings.pomodoro && "fill-white")}
          />
        ),
        onClick: () => {
          updateOSSettings({ pomodoro: !osSettings.pomodoro });
        },
        active: osSettings.pomodoro,
      },
    ],
    [osSettings, atRoot, Router, updateOSSettings]
  );

  const publicTools = useMemo(() => ["/Tool/PromptLibrary"], []);

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

  const todoListValue: TodoListContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.todoList,
      isMounted,
    }),
    [memoizedOsSettings.todoList, isMounted]
  );

  const pomodoroValue: PomodoroContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.pomodoro,
      isMounted,
    }),
    [memoizedOsSettings.pomodoro, isMounted]
  );

  const menuValue: MenuContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.menu,
    }),
    [memoizedOsSettings.menu]
  );

  const cronsValue: CronsContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.crons,
      isMounted,
    }),
    [memoizedOsSettings.crons, isMounted]
  );

  const CopanionChatValue: CopanionChatContextType = useMemo(
    () => ({
      showState: memoizedOsSettings.copanion,
      isMounted,
      updateOSSettings,
    }),
    [memoizedOsSettings.copanion, isMounted, updateOSSettings]
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
      showState: floatingDocPath !== null,
      path: floatingDocPath,
      openDoc: openFloatingDoc,
      closeDoc: closeFloatingDoc,
      isMounted,
    }),
    [floatingDocPath, openFloatingDoc, closeFloatingDoc, isMounted]
  );

  const floatingChatValue: FloatingChatContextType = useMemo(
    () => ({
      showState: floatingChatAgentId !== null,
      agentId: floatingChatAgentId,
      sessionKey: floatingChatSessionKey,
      taskContext: floatingChatTask,
      openChat: openFloatingChat,
      closeChat: closeFloatingChat,
      isMounted,
    }),
    [floatingChatAgentId, floatingChatSessionKey, floatingChatTask, openFloatingChat, closeFloatingChat, isMounted]
  );


  return (
    <OSContext.Provider value={value}>
      <MusicPlayerContext.Provider value={musicPlayerValue}>
        <TodoListContext.Provider value={todoListValue}>
          <PomodoroContext.Provider value={pomodoroValue}>
            <DocsFloatingContext.Provider value={docsFloatingValue}>
              <FloatingChatContext.Provider value={floatingChatValue}>
                <MenuContext.Provider value={menuValue}>
                    <CronsContext.Provider value={cronsValue}>
                    <CopanionChatContext.Provider value={CopanionChatValue}>
                      <StatisticsContext.Provider value={statisticsValue}>
                        <NotificationProvider>{children}</NotificationProvider>
                      </StatisticsContext.Provider>
                    </CopanionChatContext.Provider>
                    </CronsContext.Provider>
                </MenuContext.Provider>
              </FloatingChatContext.Provider>
            </DocsFloatingContext.Provider>
          </PomodoroContext.Provider>
        </TodoListContext.Provider>
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

export const useTodoListOS = () => {
  const context = useContext(TodoListContext);
  if (!context) {
    throw new Error("useTodoListOS must be used within an OSProvider");
  }
  return context;
};

export const useCronsOS = () => {
  const context = useContext(CronsContext);
  if (!context) {
    throw new Error("useCronsOS must be used within an OSProvider");
  }
  return context;
};

export const usePomodoroOS = () => {
  const context = useContext(PomodoroContext);
  if (!context) {
    throw new Error("usePomodoroOS must be used within an OSProvider");
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

export const useCopanionChatOS = () => {
  const context = useContext(CopanionChatContext);
  if (!context) {
    throw new Error("useCopanionChatOS must be used within an OSProvider");
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
