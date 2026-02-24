"use client";

import React, { useState, useCallback, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, Bug, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { Live2DWrapper } from "@OS/AI/components/models/Live2DWrapper";
import { Live2DDebugger } from "@OS/AI/components/models/live2d/Live2DDebugger";
import { useCopanionInterface } from "./CopanionInterfaceProvider";

interface CopanionCharacterProps {
  className?: string;
  defaultExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  // Action system props
  onActionTrigger?: (actionId: string) => void;
  // Chat integration props
  messages?: any[];
  isLoading?: boolean;
  isUserTyping?: boolean;
  hasError?: boolean;
}

const isDev = process.env.NODE_ENV === "development";

/**
 * Professional companion character component with Live2D integration.
 * Handles character display, animations, and state management.
 *
 * Features:
 * - ActionController integration for consistent action management
 * - Live2D model integration with automatic action execution
 * - Persistent state across debugger open/close
 * - Character state synchronization with actions
 * - Expandable/collapsible interface
 * - Development debugger with full action testing
 */
const CopanionCharacterComponent: React.FC<CopanionCharacterProps> = ({
  className = "",
  defaultExpanded = true,
  onExpandChange,
  onActionTrigger,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isDebuggerOpen, setIsDebuggerOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Use CopanionInterface context for ActionController
  const { setLive2DModel, live2DModelRef } = useCopanionInterface();

  // Heights for different states
  const EXPANDED_HEIGHT = 300;
  const COLLAPSED_HEIGHT = 60;
  const characterHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  // Handle expand/collapse with callback
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const newValue = !prev;
      onExpandChange?.(newValue);
      return newValue;
    });
  }, [onExpandChange]);

  // Save preference to localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem(
      "companion-character-expanded"
    );
    if (savedPreference !== null) {
      setIsExpanded(savedPreference === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("companion-character-expanded", String(isExpanded));
  }, [isExpanded]);

  return (
    <motion.div
      className={`border-b border-border relative overflow-hidden group ${className}`}
      animate={{ height: characterHeight }}
      transition={{
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1], // Custom easing for smooth feel
      }}
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          // Full character display
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="h-full flex items-center justify-center relative"
          >
            {/* Character Model */}
            <Live2DWrapper
              modelSrc={
                isDev
                  ? "/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json"
                  : "characters/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json"
              }
              fillParent={true}
              className="w-full h-full"
              onLoadComplete={() => setIsModelLoaded(true)}
              onError={(error) => {
                console.error("Failed to load character:", error);
                setIsModelLoaded(false);
              }}
              onModelReady={(model) => {
                setLive2DModel(model);

                // Simple talking configuration
                model.setTalkingIntensity(1.3); // How much the mouth opens (0.1 - 2.0)
                model.setTalkingSpeed(80); // Speed of mouth movements (20 - 200ms)
              }}
              onActionTrigger={(actionId, motionGroup, motionIndex) => {
                onActionTrigger?.(actionId);
              }}
            />
          </motion.div>
        ) : (
          // Collapsed - compact view
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full flex items-center gap-3 px-4"
          >
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                Your Character
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control buttons */}
      <div className="absolute top-2 right-2 flex gap-1 z-10 group-hover:opacity-100 opacity-0 transition-opacity duration-300">
        {/* Help Dialog */}
        {isExpanded && (
          <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
            <DialogTrigger asChild>
              <HyperchoTooltip value="Character controls help">
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-7 w-7 backdrop-blur-sm bg-background/30 hover:bg-background/50"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </Button>
              </HyperchoTooltip>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5" />
                  Character Controls
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-mono">
                      🖱️
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Click Character</h4>
                      <p className="text-xs text-muted-foreground">
                        Trigger motions and animations
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-mono">
                      🔍
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Ctrl + Scroll</h4>
                      <p className="text-xs text-muted-foreground">
                        Zoom in/out (10% - 300%)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-mono">
                      🖱️
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Shift + Drag</h4>
                      <p className="text-xs text-muted-foreground">
                        Move character around
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h4 className="font-medium text-sm mb-2">
                    Keyboard Shortcuts
                  </h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Ctrl + R</span>
                      <span>Reset everything</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl + Z</span>
                      <span>Reset zoom</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl + P</span>
                      <span>Reset position</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl + H</span>
                      <span>Show help</span>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    💡 <strong>Tip:</strong> Your zoom and position settings are
                    automatically saved and restored when you reload the page.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Debug Panel - Development Only */}
        {isDev && isExpanded && isModelLoaded && live2DModelRef.current && (
          <Popover open={isDebuggerOpen} onOpenChange={setIsDebuggerOpen}>
            <PopoverTrigger asChild>
              <HyperchoTooltip value="Debug Live2D model">
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-7 w-7 backdrop-blur-sm bg-background/30 hover:bg-background/50"
                >
                  <Bug className="w-3.5 h-3.5" />
                </Button>
              </HyperchoTooltip>
            </PopoverTrigger>
            <PopoverContent
              className="w-96 max-h-[600px] overflow-y-auto customScrollbar2 p-0"
              align="end"
              side="bottom"
            >
              <Live2DDebugger
                model={live2DModelRef.current}
                className="border-0 shadow-none"
                onClose={() => setIsDebuggerOpen(false)}
              />
            </PopoverContent>
          </Popover>
        )}

        <HyperchoTooltip
          value={isExpanded ? "Minimize character" : "Expand character"}
        >
          <Button
            variant="ghost"
            size="iconSm"
            className="h-7 w-7 backdrop-blur-sm bg-background/30 hover:bg-background/50"
            onClick={handleToggleExpand}
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </Button>
        </HyperchoTooltip>
      </div>
    </motion.div>
  );
};

// Export memoized component to prevent unnecessary re-renders
export const CopanionCharacter = memo(CopanionCharacterComponent);
