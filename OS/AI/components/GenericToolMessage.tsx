/**
 * Generic Tool Message Component
 *
 * This component handles rendering ANY tool type using the registry system.
 * It eliminates the need for if-else chains and separate components for each tool.
 */

import React, { memo } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMediaUrl } from "$/utils";
import { Bot } from "lucide-react";
import { UnifiedToolState, toolRegistry } from "./ToolRegistry";
import { Message } from "@OS/AI/shared";

interface GenericToolMessageProps {
  toolState: UnifiedToolState;
  message: Message;
  onToggleExpand: () => void;
  assistantAvatar?: any;
  botPic?: string;
  showAvatar?: boolean;
}

/**
 * Generic component that renders any tool type using the registry.
 * Memoized to prevent re-renders when sibling tools change.
 */
export const GenericToolMessage: React.FC<GenericToolMessageProps> = memo(({
  toolState,
  message,
  onToggleExpand,
  assistantAvatar,
  botPic,
  showAvatar = true,
}) => {
  // Get the appropriate renderer from the registry
  const Renderer = toolRegistry.getRenderer(toolState.toolName);

  if (!Renderer) {
    console.warn(`No renderer found for tool: ${toolState.toolName}`);
    return null;
  }

  // Render with avatar wrapper — no initial animation to prevent replay on re-render
  return (
    <div className="flex gap-3 justify-start min-w-0 max-w-full">
      {/* Avatar */}
      {showAvatar !== false && (
        <div className="w-8 h-8 flex-shrink-0">
          <Avatar className="w-8 h-8">
            {botPic ? (
              <AvatarImage src={getMediaUrl(botPic)} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary">
              <Bot className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      {/* Tool Content */}
      <div className="relative flex flex-col justify-start items-start min-w-0 max-w-full overflow-hidden">
        <Renderer
          toolState={toolState}
          message={message}
          onToggleExpand={onToggleExpand}
          assistantAvatar={assistantAvatar}
          botPic={botPic}
          showAvatar={false}
        />
      </div>
    </div>
  );
}, (prev, next) => {
  // Only re-render when the tool's actual state changes
  return (
    prev.toolState.toolName === next.toolState.toolName &&
    prev.toolState.status === next.toolState.status &&
    prev.toolState.resultContent === next.toolState.resultContent &&
    prev.toolState.isExpanded === next.toolState.isExpanded &&
    prev.toolState.arguments === next.toolState.arguments &&
    prev.toolState.rejectionMessage === next.toolState.rejectionMessage &&
    prev.showAvatar === next.showAvatar &&
    prev.botPic === next.botPic
  );
});
