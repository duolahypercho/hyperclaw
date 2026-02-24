/**
 * Generic Tool Message Component
 *
 * This component handles rendering ANY tool type using the registry system.
 * It eliminates the need for if-else chains and separate components for each tool.
 */

import React from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMediaUrl } from "$/utils";
import CopanionIcon from "@OS/assets/copanion";
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
 * Generic component that renders any tool type using the registry
 */
export const GenericToolMessage: React.FC<GenericToolMessageProps> = ({
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

  // Render with avatar wrapper
  return (
    <motion.div
      className="flex gap-3 justify-start"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Avatar */}
      <div className="w-8 h-8 flex-shrink-0">
        {showAvatar ? (
          <Avatar className="w-8 h-8">
            {botPic ? (
              <AvatarImage src={getMediaUrl(botPic)} />
            ) : assistantAvatar?.src ? (
              <AvatarImage src={assistantAvatar.src} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary">
              {assistantAvatar?.icon || <CopanionIcon className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-8 h-8 flex-shrink-0" />
        )}
      </div>

      {/* Tool Content */}
      <div className="relative flex flex-col max-w-[85%] min-w-0 justify-start items-start">
        <Renderer
          toolState={toolState}
          message={message}
          onToggleExpand={onToggleExpand}
          assistantAvatar={assistantAvatar}
          botPic={botPic}
          showAvatar={false} // Avatar already rendered above
        />
      </div>
    </motion.div>
  );
};
