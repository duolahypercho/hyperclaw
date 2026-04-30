"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  User,
  Copy,
  Check,
  Sparkles,
  MessageSquare,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { usePromptLibrary } from "../provider/PromptProv";
import { getMediaUrl } from "$/utils";
import {
  ChatInterface,
  ChatInterfaceRef,
} from "@OS/AI/components/ChatInterface";
import { StreamingAPI } from "@OS/AI/components/ChatInterface";
import { useUser } from "$/Providers/UserProv";
import { ChatMessage } from "@OS/AI/utils/messageConverter";

interface PromptPlayGroundProps {
  className?: string;
}

const PromptPlayground: React.FC<PromptPlayGroundProps> = ({
  className = "",
}) => {
  const [hasPromptChanged, setHasPromptChanged] = useState(false);
  const chatRef = useRef<ChatInterfaceRef>(null);
  const { toast } = useToast();
  const { userPrompt: prompt, handleTabChange } = usePromptLibrary();
  const { userInfo } = useUser();

  // Track previous prompt values to detect changes
  const [prevOriginalPrompt, setPrevOriginalPrompt] = useState(
    prompt?.originalPrompt
  );
  const [prevOptimizedPrompt, setPrevOptimizedPrompt] = useState(
    prompt?.optimizedPrompt
  );
  const [prevRelatedHistory, setPrevRelatedHistory] = useState(
    prompt?.relatedHistory || []
  );

  // Check if prompt has changed
  useEffect(() => {
    if (!prompt) return;

    const originalChanged = prevOriginalPrompt !== prompt.originalPrompt;
    const optimizedChanged = prevOptimizedPrompt !== prompt.optimizedPrompt;
    const historyChanged =
      prevRelatedHistory.map((msg) => msg.content + msg.role).join(",") !==
      (prompt.relatedHistory || [])
        .map((msg) => msg.content + msg.role)
        .join(",");

    if (originalChanged || optimizedChanged || historyChanged) {
      setHasPromptChanged(true);
      setPrevOriginalPrompt(prompt.originalPrompt);
      setPrevOptimizedPrompt(prompt.optimizedPrompt);
      setPrevRelatedHistory(prompt.relatedHistory || []);
    } else {
      setHasPromptChanged(false);
    }
  }, [prompt, prevOriginalPrompt, prevOptimizedPrompt, prevRelatedHistory]);

  // Convert FormattedMessage to ChatMessage format
  const convertedMessages = useMemo(() => {
    if (!prompt?.relatedHistory) return [];
    return prompt.relatedHistory.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date(),
      display: msg.display,
    }));
  }, [prompt?.relatedHistory]);

  // Create streaming API for the chat
  const streamingAPI: StreamingAPI = async (history: ChatMessage[]) => {
    try {
      const { BasicChatService } = await import("@OS/AI/api/core");

      return await BasicChatService(history, "gpt-4o-mini");
    } catch (error) {
      console.error("Chat error:", error);
      throw error;
    }
  };

  if (!prompt) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[400px] ${className}`}
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
            Select a prompt from the library to start testing it in the chat.
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              handleTabChange("explore");
            }}
          >
            Explore Prompts
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-1 flex flex-col min-h-0 relative">
        <ChatInterface
          ref={chatRef}
          streamingAPI={streamingAPI}
          title="Test Your Prompt"
          description="Start a conversation to test your prompt"
          showHeader={false}
          showInput={true}
          userAvatar={{
            src: getMediaUrl(userInfo.profilePic),
            fallback: userInfo.username.charAt(0).toUpperCase(),
            icon: <User className="w-4 h-4" />,
            alt: userInfo.username,
          }}
          assistantAvatar={{
            src: getMediaUrl(prompt.promptImage),
            fallback: "AI",
            icon: <Bot className="w-4 h-4" />,
            alt: prompt.promptName,
          }}
          useInternalState={true}
          initialMessages={convertedMessages}
          className="h-full"
          onMessageAction={(action, message) => {
            if (action === "copy") {
              navigator.clipboard.writeText(
                typeof message.content === "string"
                  ? message.content
                  : JSON.stringify(message.content)
              );
              toast({
                title: "Copied!",
                description: "Message copied to clipboard",
              });
            }
          }}
        />
      </div>
    </div>
  );
};

export default PromptPlayground;
