import React, { useState, useEffect, useCallback } from "react";
import { MdSettings } from "react-icons/md";
import { HiMusicalNote } from "react-icons/hi2";
import { LuListTodo } from "react-icons/lu";
import { FaXTwitter } from "react-icons/fa6";
import {
  Activity,
  Building,
  Library,
  CheckCircle,
  Loader2,
  FolderOpen,
  LayoutGrid,
  FileText,
  Database,
  Monitor,
  MessageSquare,
  Users,
  FolderGit2,
  BookOpen,
  User as UserIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface VirtualToolProps {
  toolName: string;
  description: string;
  icon: React.ReactNode;
}

interface LoadingState {
  text: string;
  icon?: React.ReactNode;
}

interface DynamicLoaderProps {
  toolName: string;
  loadingStates: LoadingState[];
  duration?: number;
  onComplete?: () => void;
  simulateRedirect?: boolean;
}

/**
 * Custom hook for managing loading progress with realistic redirect simulation
 *
 * Usage Examples:
 *
 * 1. Basic usage with simulated redirect:
 *    const loader = useLoadingProgress(loadingStates, 1200);
 *
 * 2. With real navigation integration:
 *    const router = useRouter();
 *    const loader = useLoadingProgress(loadingStates, 1200);
 *
 *    const handleComplete = () => {
 *      router.push('/Tool/Music');
 *    };
 *
 *    useEffect(() => {
 *      if (loader.isComplete) {
 *        loader.startRedirectProgress(handleComplete, false); // Don't simulate
 *      }
 *    }, [loader.isComplete]);
 *
 * 3. With custom redirect progress tracking:
 *    const [realProgress, setRealProgress] = useState(0);
 *    const loader = useLoadingProgress(loadingStates, 1200);
 *
 *    // Update realProgress based on actual loading events
 *    useEffect(() => {
 *      if (loader.isComplete) {
 *        // Use real progress instead of simulation
 *        loader.setRedirectProgress(realProgress);
 *      }
 *    }, [realProgress, loader.isComplete]);
 */
const useLoadingProgress = (
  loadingStates: LoadingState[],
  duration: number
) => {
  const [currentState, setCurrentState] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [redirectProgress, setRedirectProgress] = useState(0);

  const startRedirectProgress = useCallback(
    (onComplete?: () => void, simulateRedirect = true) => {
      if (!simulateRedirect) {
        if (onComplete) {
          setTimeout(onComplete, 500);
        }
        return;
      }

      const redirectInterval = setInterval(() => {
        setRedirectProgress((prev) => {
          if (prev >= 100) {
            clearInterval(redirectInterval);
            if (onComplete) {
              setTimeout(onComplete, 800);
            }
            return 100;
          }
          const increment = Math.random() > 0.1 ? Math.random() * 12 + 3 : 0;
          return Math.min(prev + increment, 100);
        });
      }, 150);

      return () => clearInterval(redirectInterval);
    },
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentState((prev) => {
        const next = prev + 1;
        if (next >= loadingStates.length) {
          setIsComplete(true);
          clearInterval(interval);
          return prev;
        }
        return next;
      });
    }, duration);

    return () => clearInterval(interval);
  }, [loadingStates.length, duration]);

  return {
    currentState,
    isComplete,
    redirectProgress,
    setRedirectProgress,
    startRedirectProgress,
  };
};

const DynamicLoader: React.FC<DynamicLoaderProps> = ({
  toolName,
  loadingStates,
  duration = 1500,
  onComplete,
  simulateRedirect = true,
}) => {
  const { currentState, isComplete, redirectProgress, startRedirectProgress } =
    useLoadingProgress(loadingStates, duration);

  useEffect(() => {
    if (isComplete) {
      startRedirectProgress(onComplete, simulateRedirect);
    }
  }, [isComplete, startRedirectProgress, onComplete, simulateRedirect]);

  return (
    <div className="space-y-6">
      <div className="space-y-4 max-w-sm mx-auto">
        <AnimatePresence>
          {loadingStates.map((state, index) => {
            const isActive = index === currentState;
            const isCompleted = index < currentState;

            return (
              <motion.div
                key={index}
                className="flex items-center space-x-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: isActive ? 1 : isCompleted ? 0.7 : 0.3,
                  x: 0,
                  scale: isActive ? 1.05 : 1,
                }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center"
                  animate={{
                    scale: isActive ? 1.2 : 1,
                    rotate: isActive ? 360 : 0,
                  }}
                  transition={{
                    scale: { duration: 0.2 },
                    rotate: { duration: 1, repeat: isActive ? Infinity : 0 },
                  }}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <div className="w-5 h-5 border-2 border-muted-foreground/30 rounded-full" />
                  )}
                </motion.div>

                <motion.span
                  className={`text-sm transition-colors duration-300 ${
                    isActive
                      ? "text-primary font-medium"
                      : isCompleted
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                  animate={{
                    x: isActive ? 5 : 0,
                    textShadow: isActive
                      ? "0 0 8px rgba(59, 130, 246, 0.3)"
                      : "none",
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {state.text}
                  {isActive && (
                    <motion.span
                      className="inline-block ml-2"
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      ...
                    </motion.span>
                  )}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-xs mx-auto">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>{isComplete ? "Redirecting" : "Loading"}</span>
          <span>
            {isComplete
              ? `${Math.round(redirectProgress)}%`
              : `${Math.round(
                  ((currentState + 1) / loadingStates.length) * 100
                )}%`}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              isComplete
                ? "bg-gradient-to-r from-green-500 to-green-400"
                : "bg-gradient-to-r from-primary to-primary/70"
            }`}
            initial={{ width: "0%" }}
            animate={{
              width: isComplete
                ? `${redirectProgress}%`
                : `${((currentState + 1) / loadingStates.length) * 100}%`,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        {isComplete ? (
          <div className="text-center mt-2">
            <span className="text-xs text-muted-foreground">
              {`Redirecting to ${toolName.toLowerCase()}...`}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {`Initializing ${toolName.toLowerCase()}...`}
          </span>
        )}
      </div>
    </div>
  );
};

const VirtualToolBase: React.FC<VirtualToolProps> = ({
  toolName,
  description,
  icon,
}) => {
  // Tool-specific loading states
  const getLoadingStates = (tool: string): LoadingState[] => {
    const baseStates = [
      { text: "Initializing core systems" },
      { text: "Loading user preferences" },
      { text: "Connecting to services" },
      { text: "Preparing interface" },
      { text: "Finalizing setup" },
    ];

    const toolSpecificStates: Record<string, LoadingState[]> = {
      "Music Player": [
        { text: "Scanning music library" },
        { text: "Loading audio engine" },
        { text: "Connecting to streaming services" },
        { text: "Preparing playlists" },
        { text: "Ready to play music" },
      ],
      "Todo List": [
        { text: "Loading task categories" },
        { text: "Syncing with calendar" },
        { text: "Preparing productivity tools" },
        { text: "Loading reminders" },
        { text: "Ready to organize tasks" },
      ],
      "Prompt Library": [
        { text: "Loading AI models" },
        { text: "Scanning prompt database" },
        { text: "Preparing templates" },
        { text: "Optimizing suggestions" },
        { text: "Ready to create prompts" },
      ],
      "X (Twitter)": [
        { text: "Connecting to X API" },
        { text: "Loading timeline" },
        { text: "Syncing notifications" },
        { text: "Preparing compose tools" },
        { text: "Ready to connect" },
      ],
      Aurum: [
        { text: "Loading financial data" },
        { text: "Connecting to markets" },
        { text: "Analyzing portfolios" },
        { text: "Preparing insights" },
        { text: "Ready for financial tools" },
      ],
      Settings: [
        { text: "Loading configuration" },
        { text: "Scanning preferences" },
        { text: "Preparing options" },
        { text: "Validating settings" },
        { text: "Ready to configure" },
      ],
    };

    return toolSpecificStates[tool] || baseStates;
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-primary/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.8, 0.2],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="text-center space-y-8 max-w-lg">
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <motion.div
              className="p-6 bg-primary/10 rounded-3xl"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(59, 130, 246, 0.4)",
                  "0 0 0 10px rgba(59, 130, 246, 0)",
                  "0 0 0 0 rgba(59, 130, 246, 0)",
                ],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              {React.cloneElement(icon as React.ReactElement, {
                className: "w-20 h-20 text-primary",
              })}
            </motion.div>
          </motion.div>

          <motion.div
            className="space-y-3"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {toolName}
            </h1>
            <p className="text-muted-foreground text-lg">{description}</p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <DynamicLoader
              toolName={toolName}
              loadingStates={getLoadingStates(toolName)}
              duration={1200}
              simulateRedirect={true}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// Virtual components for each tool
export const VirtualMusicPlayer: React.FC = () => (
  <VirtualToolBase
    toolName="Music Player"
    description="Your music streaming companion"
    icon={<HiMusicalNote />}
  />
);

export const VirtualTodoList: React.FC = () => (
  <VirtualToolBase
    toolName="Todo List"
    description="Organize your tasks and boost productivity"
    icon={<LuListTodo />}
  />
);

export const VirtualPromptLibrary: React.FC = () => (
  <VirtualToolBase
    toolName="Prompt Library"
    description="Discover and create AI prompts"
    icon={<Library />}
  />
);

export const VirtualX: React.FC = () => (
  <VirtualToolBase
    toolName="X (Twitter)"
    description="Connect with your social network"
    icon={<FaXTwitter />}
  />
);

export const VirtualAurum: React.FC = () => (
  <VirtualToolBase
    toolName="Aurum"
    description="Financial tools and insights"
    icon={<Building />}
  />
);

export const VirtualSettings: React.FC = () => (
  <VirtualToolBase
    toolName="Settings"
    description="Configure your workspace"
    icon={<MdSettings />}
  />
);


export const VirtualPixelOffice: React.FC = () => (
  <VirtualToolBase
    toolName="AI Agent Office"
    description="A retro pixel-art office view of your AI team"
    icon={<LayoutGrid />}
  />
);

export const VirtualDocs: React.FC = () => (
  <VirtualToolBase
    toolName="Docs"
    description="Browse markdown docs from your OpenClaw workspace"
    icon={<FileText />}
  />
);


export const VirtualIntelligence: React.FC = () => (
  <VirtualToolBase
    toolName="Intelligence"
    description="Browse agent-created data tables, CRM pipelines, and live agent status"
    icon={<Database />}
  />
);

export const VirtualOpenClaw: React.FC = () => (
  <VirtualToolBase
    toolName="OpenClaw"
    description="Browse and edit your OpenClaw workspace"
    icon={<FolderOpen />}
  />
);

export const VirtualDevices: React.FC = () => (
  <VirtualToolBase
    toolName="Devices"
    description="Manage your connected gateway devices"
    icon={<Monitor />}
  />
);


export const VirtualChat: React.FC = () => (
  <VirtualToolBase
    toolName="Chat"
    description="Rooms and DMs with every agent on your team"
    icon={<MessageSquare />}
  />
);

export const VirtualTeam: React.FC = () => (
  <VirtualToolBase
    toolName="Team"
    description="Your ensemble of AI employees"
    icon={<Users />}
  />
);

export const VirtualProjects: React.FC = () => (
  <VirtualToolBase
    toolName="Workflows"
    description="Crews, triggers, and guardrails"
    icon={<FolderGit2 />}
  />
);

export const VirtualProjectEditor: React.FC = () => (
  <VirtualToolBase
    toolName="Workflow Editor"
    description="Configure identity, trigger, crew, and guardrails"
    icon={<FolderGit2 />}
  />
);

export const VirtualKnowledge: React.FC = () => (
  <VirtualToolBase
    toolName="Knowledge"
    description="Company folders every agent reads from"
    icon={<BookOpen />}
  />
);

export const VirtualData: React.FC = () => (
  <VirtualToolBase
    toolName="Data"
    description="Shared tables, schemas, and permissions"
    icon={<Database />}
  />
);

export const VirtualMissionControl: React.FC = () => (
  <VirtualToolBase
    toolName="Workflows"
    description="Live canvas of running agent workflows"
    icon={<Activity />}
  />
);

export const VirtualAgent: React.FC = () => (
  <VirtualToolBase
    toolName="Agent"
    description="Identity, soul, memory, and cost"
    icon={<UserIcon />}
  />
);
