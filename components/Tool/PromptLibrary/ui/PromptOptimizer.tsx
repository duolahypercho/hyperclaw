"use client";

import { useMemo, memo, useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
// Simple ID generator to avoid mongoose dependency
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 26);
};
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Bot,
  Settings,
  RotateCcw,
  User,
  Plus,
  MessageSquare,
} from "lucide-react";
import { usePromptLibrary } from "../provider/PromptProv";
import { useOptimize } from "../provider/OptimizeProv";
import { StreamingAPI } from "@OS/AI/components/ChatInterface";
import {
  ChatInterface,
  ChatInterfaceRef,
} from "@OS/AI/components/ChatInterface";
import { InputContainer } from "@OS/AI/components/InputContainer";
import { useOS } from "@OS/Provider/OSProv";
import { useUser } from "$/Providers/UserProv";
import CopanionIcon from "@OS/assets/copanion";
import { getMediaUrl } from "$/utils";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import {
  convertChatMessageToMessage,
  ChatMessage,
} from "@OS/AI/utils/messageConverter";
import { motion } from "framer-motion";
import Loading from "$/components/Loading";

const ComparisonMode = () => {
  const { prompt, addMessageToHistory } = useOptimize();
  const { loading } = usePromptLibrary();
  const { currentAppSettings, updateAppSettings } = useOS();
  const { userInfo } = useUser();

  // Refs for both chat interfaces
  const originalChatRef = useRef<ChatInterfaceRef>(null);
  const optimizedChatRef = useRef<ChatInterfaceRef>(null);

  // State to track if prompt has changed
  const [hasPromptChanged, setHasPromptChanged] = useState(false);

  // Safe fallbacks for initial state to avoid conditional hook calls
  const initialOriginalPrompt = prompt?.originalPrompt ?? "";
  const initialOptimizedPrompt = prompt?.optimizedPrompt ?? "";
  const initialRelatedHistory = prompt?.relatedHistory ?? [];

  const [prevOriginalPrompt, setPrevOriginalPrompt] = useState(
    initialOriginalPrompt
  );
  const [prevOptimizedPrompt, setPrevOptimizedPrompt] = useState(
    initialOptimizedPrompt
  );
  const [prevRelatedHistory, setPrevRelatedHistory] = useState(
    initialRelatedHistory
  );

  // Convert FormattedMessage to ChatMessage format
  const convertedMessages = useMemo(() => {
    return (prompt?.relatedHistory || []).map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date(), // FormattedMessage doesn't have timestamp, so use current date
    }));
  }, [prompt?.relatedHistory]);

  // Check if prompt has changed
  useEffect(() => {
    const currentOriginal = prompt?.originalPrompt ?? "";
    const currentOptimized = prompt?.optimizedPrompt ?? "";
    const currentHistory = prompt?.relatedHistory ?? [];

    const originalChanged = prevOriginalPrompt !== currentOriginal;
    const optimizedChanged = prevOptimizedPrompt !== currentOptimized;
    const prevHistoryKey = prevRelatedHistory
      .map((msg) => msg.content + msg.role)
      .join(",");
    const currentHistoryKey = currentHistory
      .map((msg) => msg.content + msg.role)
      .join(",");

    if (
      originalChanged ||
      optimizedChanged ||
      prevHistoryKey !== currentHistoryKey
    ) {
      setHasPromptChanged(!!prompt);

      // Update stored previous values
      setPrevOriginalPrompt(currentOriginal);
      setPrevOptimizedPrompt(currentOptimized);
      setPrevRelatedHistory(currentHistory);
    } else {
      setHasPromptChanged(false);
    }
  }, [prompt, prevOriginalPrompt, prevOptimizedPrompt, prevRelatedHistory]);

  // Early return UI after hooks are declared
  if (!prompt) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No prompt selected</p>
      </div>
    );
  }

  // Create streaming APIs for both original and optimized prompts
  const originalStreamingAPI: StreamingAPI = async (history: ChatMessage[]) => {
    try {
      // Import the CopanionChatAPI
      const { BasicChatService } = await import("@OS/AI/api/core");

      // Get the stream
      return await BasicChatService(history, "gpt-4o-mini");
    } catch (error) {
      console.error("Error in original streaming API:", error);
      throw error;
    }
  };

  const optimizedStreamingAPI: StreamingAPI = async (
    history: ChatMessage[]
  ) => {
    try {
      // Import the CopanionChatAPI
      const { BasicChatService } = await import("@OS/AI/api/core");

      // Get the stream
      return await BasicChatService(history, "gpt-4o-mini");
    } catch (error) {
      console.error("Error in optimized streaming API:", error);
      throw error;
    }
  };

  const handleEditPrompt = (type: "original" | "optimized") => {
    updateAppSettings("prompt-library", {
      detail: !currentAppSettings.detail,
    });
  };

  // Handle reset functionality
  const handleReset = () => {
    // Reset both chat interfaces
    originalChatRef.current?.clearMessages();
    optimizedChatRef.current?.clearMessages();

    originalChatRef.current?.addMessage({
      id: generateId(),
      role: "system",
      content: prompt.originalPrompt,
      timestamp: new Date(),
    });
    optimizedChatRef.current?.addMessage({
      id: generateId(),
      role: "system",
      content: prompt.optimizedPrompt,
      timestamp: new Date(),
    });

    prompt.relatedHistory.forEach((msg) => {
      originalChatRef.current?.addMessage({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(),
      });
      optimizedChatRef.current?.addMessage({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(),
      });
    });

    // Reset the prompt changed state
    setHasPromptChanged(false);
  };

  // Handle shared message functionality
  const handleSharedMessage = async (message: string) => {
    if (!message.trim()) return;

    try {
      // Send message to both chats simultaneously
      await Promise.all([
        originalChatRef.current?.sendMessage(message),
        optimizedChatRef.current?.sendMessage(message),
      ]);
    } catch (error) {
      console.error("Error sending shared message:", error);
    }
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Chat Interfaces Row - Full Screen */}
      <div className="flex flex-row flex-1 min-h-0 border border-primary/10 border-solid overflow-clip rounded-md">
        {/* Original Chat Interface */}
        <div className="flex-1 flex flex-col">
          <Card className="h-full flex flex-col border-0 rounded-none">
            <CardHeader className="py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  <CardTitle className="text-sm font-semibold">
                    Original
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Original prompt responses
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditPrompt("original")}
                  className="h-8 w-8 p-0 hover:bg-muted/50"
                  title="Edit system prompt in config"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              <ChatInterface
                ref={originalChatRef}
                streamingAPI={originalStreamingAPI}
                title="Original Prompt"
                description="Responses from the original prompt"
                showHeader={false}
                userAvatar={{
                  src: getMediaUrl(userInfo.profilePic),
                  fallback: userInfo.username.charAt(0).toUpperCase(),
                  icon: <User className="w-4 h-4" />,
                  alt: userInfo.username,
                }}
                assistantAvatar={{
                  src: getMediaUrl(prompt.promptImage),
                  fallback: "Co",
                  icon: <CopanionIcon className="w-4 h-4" />,
                  alt: prompt.promptName,
                }}
                showInput={false} // We'll use shared input
                useInternalState={true}
                initialMessages={convertedMessages}
                className="h-full rounded-none"
                additionalContent={
                  <>
                    {hasPromptChanged && (
                      <Button
                        onClick={handleReset}
                        variant="outline"
                        size="xs"
                        className="w-fit bg-accent/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-primary/20 hover:bg-primary/5 mb-3 pointer-events-auto"
                      >
                        <RotateCcw className="w-3 h-3 mr-2" />
                        Reset Chat
                      </Button>
                    )}
                  </>
                }
                onMessageAction={(action, message) => {
                  if (action === "copy") {
                    navigator.clipboard.writeText(
                      typeof message.content === "string"
                        ? message.content
                        : JSON.stringify(message.content)
                    );
                  }
                }}
                additionalActions={(message) => (
                  <HyperchoTooltip value="Add to original history">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() =>
                        addMessageToHistory(
                          convertChatMessageToMessage(message)
                        )
                      }
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </HyperchoTooltip>
                )}
              />
            </CardContent>
          </Card>
        </div>

        {/* Divider */}
        <div className="w-px bg-border" />

        {/* Optimized Chat Interface */}
        <div className="flex-1 flex flex-col">
          <Card className="h-full flex flex-col border-0 rounded-none">
            <CardHeader className="py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <CardTitle className="text-sm font-semibold">
                    Optimized
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Enhanced prompt responses
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditPrompt("optimized")}
                  className="h-8 w-8 p-0 hover:bg-muted/50"
                  title="Edit system prompt in config"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              <ChatInterface
                ref={optimizedChatRef}
                streamingAPI={optimizedStreamingAPI}
                title="Optimized Prompt"
                description="Responses from the optimized prompt"
                showHeader={false}
                userAvatar={{
                  src: getMediaUrl(userInfo.profilePic),
                  fallback: userInfo.username.charAt(0).toUpperCase(),
                  icon: <User className="w-4 h-4" />,
                  alt: userInfo.username,
                }}
                assistantAvatar={{
                  src: getMediaUrl(prompt.promptImage),
                  fallback: "Co",
                  icon: <CopanionIcon className="w-4 h-4" />,
                  alt: prompt.promptName,
                }}
                showInput={false} // We'll use shared input
                useInternalState={true}
                initialMessages={convertedMessages}
                className="h-full rounded-none"
                onMessageAction={(action, message) => {
                  if (action === "copy") {
                    navigator.clipboard.writeText(
                      typeof message.content === "string"
                        ? message.content
                        : JSON.stringify(message.content)
                    );
                  }
                }}
                additionalContent={
                  <>
                    {hasPromptChanged && (
                      <Button
                        onClick={handleReset}
                        variant="outline"
                        size="xs"
                        className="w-fit bg-accent/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-primary/20 hover:bg-primary/5 mb-3 pointer-events-auto"
                      >
                        <RotateCcw className="w-3 h-3 mr-2" />
                        Reset Chat
                      </Button>
                    )}
                  </>
                }
                additionalActions={(message) => (
                  <HyperchoTooltip value="Add to optimized history">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() =>
                        addMessageToHistory(
                          convertChatMessageToMessage(message)
                        )
                      }
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </HyperchoTooltip>
                )}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Shared Input Container - Fixed at Bottom */}
      <div className="absolute inset-x-0 bottom-3 w-full max-w-lg mx-auto flex flex-col items-center justify-center">
        {hasPromptChanged && (
          <Button
            onClick={handleReset}
            variant="outline"
            size="xs"
            className="w-fit bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-primary/20 hover:bg-primary/5 mb-3"
          >
            <RotateCcw className="w-3 h-3 mr-2" />
            Reset Chat
          </Button>
        )}
        <InputContainer
          onSendMessage={handleSharedMessage}
          placeholder="Type your message to test both prompts..."
          maxLength={500}
          rows={2}
          disabled={loading.isLoading("testing")}
          isLoading={loading.isLoading("testing")}
          isSending={loading.isLoading("testing")}
          loadingText="Testing prompts..."
          className="w-full"
          showAttachments={false}
          showVoiceInput={false}
          showEmojiPicker={false}
          showActions={false}
          autoResize={true}
          allowEmptySend={false}
        />
      </div>
    </div>
  );
};

const ExperimentMode = () => {
  const { prompt, addMessageToHistory } = useOptimize();
  const { userInfo } = useUser();
  const [hasPromptChanged, setHasPromptChanged] = useState(false);

  // Derive safe values to avoid conditional hook calls
  const originalPrompt = useMemo(
    () => prompt?.originalPrompt ?? "",
    [prompt?.originalPrompt]
  );
  const optimizedPrompt = useMemo(
    () => prompt?.optimizedPrompt ?? "",
    [prompt?.optimizedPrompt]
  );
  const relatedHistory = useMemo(
    () => prompt?.relatedHistory ?? [],
    [prompt?.relatedHistory]
  );

  // Ref for chat interface
  const chatRef = useRef<ChatInterfaceRef>(null);

  // Refs to track previous values
  const [prevOriginalPrompt, setPrevOriginalPrompt] = useState(originalPrompt);
  const [prevOptimizedPrompt, setPrevOptimizedPrompt] =
    useState(optimizedPrompt);
  const [prevRelatedHistory, setPrevRelatedHistory] = useState(relatedHistory);

  // Check if prompt has changed
  useEffect(() => {
    const originalChanged = prevOriginalPrompt !== originalPrompt;
    const optimizedChanged = prevOptimizedPrompt !== optimizedPrompt;
    const historyChanged =
      prevRelatedHistory
        .map((msg) => msg.content + msg.role + msg.display)
        .join(",") !==
      relatedHistory
        .map((msg) => msg.content + msg.role + msg.display)
        .join(",");

    if (originalChanged || optimizedChanged || historyChanged) {
      setHasPromptChanged(true);

      // Update refs with current values
      setPrevOriginalPrompt(originalPrompt);
      setPrevOptimizedPrompt(optimizedPrompt);
      setPrevRelatedHistory(relatedHistory);
    } else {
      setHasPromptChanged(false);
    }
  }, [
    originalPrompt,
    optimizedPrompt,
    relatedHistory,
    prevOriginalPrompt,
    prevOptimizedPrompt,
    prevRelatedHistory,
  ]);

  // Convert FormattedMessage to ChatMessage format
  const convertedMessages = useMemo(() => {
    return (relatedHistory || []).map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date(),
    }));
  }, [relatedHistory]);

  // Create streaming API for experiment mode
  const experimentStreamingAPI: StreamingAPI = async (
    history: ChatMessage[]
  ) => {
    try {
      // Import the CopanionChatAPI
      const { BasicChatService } = await import("@OS/AI/api/core");

      // Use optimized prompt if available, otherwise fall back to original
      const systemPrompt =
        optimizedPrompt || originalPrompt || "You are a helpful AI assistant.";

      return await BasicChatService(history, "gpt-4o-mini");
    } catch (error) {
      console.error("Error in experiment streaming API:", error);
      throw error;
    }
  };

  const handleReset = () => {
    // Reset the chat interface
    chatRef.current?.clearMessages();
    chatRef.current?.addMessage({
      id: generateId(),
      role: "system",
      content: originalPrompt,
      timestamp: new Date(),
    });

    relatedHistory.forEach((msg) => {
      chatRef.current?.addMessage({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(),
      });
    });

    setHasPromptChanged(false);
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Reset Button - Shows when prompt has changed */}
      {!prompt && (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground">No prompt selected</p>
        </div>
      )}
      <ChatInterface
        ref={chatRef}
        streamingAPI={experimentStreamingAPI}
        title="Original Prompt"
        description="Responses from the original prompt"
        showHeader={false}
        showInput={true}
        userAvatar={{
          src: getMediaUrl(userInfo.profilePic),
          fallback: userInfo.username.charAt(0).toUpperCase(),
          icon: <User className="w-4 h-4" />,
          alt: userInfo.username,
        }}
        assistantAvatar={{
          src: getMediaUrl(prompt?.promptImage ?? ""),
          fallback: "Co",
          icon: <CopanionIcon className="w-4 h-4" />,
          alt: prompt?.promptName ?? "Prompt",
        }}
        useInternalState={true}
        initialMessages={convertedMessages}
        additionalContent={
          <>
            {hasPromptChanged && (
              <Button
                onClick={handleReset}
                variant="outline"
                size="xs"
                className="w-fit bg-accent/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-primary/20 hover:bg-primary/5 mb-3 pointer-events-auto"
              >
                <RotateCcw className="w-3 h-3 mr-2" />
                Reset Chat
              </Button>
            )}
          </>
        }
        additionalActions={(message) => (
          <HyperchoTooltip value="Add to current history">
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => {
                addMessageToHistory(convertChatMessageToMessage(message));
              }}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </HyperchoTooltip>
        )}
      />
    </div>
  );
};

const PromptOptimizerContainer = () => {
  const { playgroundTab } = usePromptLibrary();

  // Render different components based on playgroundTab
  switch (playgroundTab) {
    case "experiment":
      return <ExperimentMode />;
    case "compare-prompts":
      return <ComparisonMode />;
    default:
      return <ExperimentMode />;
  }
};

export default function PromptOptimizer() {
  const { prompt } = useOptimize();
  const { loading, handleTabChange } = usePromptLibrary();

  if (loading.isLoading("loading")) {
    return <Loading text="Loading Prompt Optimizer..." />;
  }

  if (!prompt) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[400px]`}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No Prompt Selected
          </h3>
          <p className="text-muted-foreground max-w-md mb-4">
            Create a prompt to start testing it in the playground.
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              handleTabChange("explore");
            }}
          >
            Create a Prompt
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        <PromptOptimizerContainer />
      </div>
    </div>
  );
}
