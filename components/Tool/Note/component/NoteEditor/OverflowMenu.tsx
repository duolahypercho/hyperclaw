"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  SmileIcon as Peace,
  Brush,
  BookOpenText,
  Pen,
  Code,
  Ruler,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LengthController } from "./LengthController";
import { ReadingController } from "./ReadingController";

export type FunctionType =
  | "length"
  | "other"
  | "Final Polish"
  | "add markdown"
  | "readingLevel"
  | "add emoji";

interface ToolTipButtonProps {
  isHovered: boolean;
  showMenu: FunctionType;
  generating: boolean;
  setShowMenu: (showMenu: FunctionType) => void;
}

const ToolTipButton = ({
  isHovered,
  showMenu,
  generating,
  setShowMenu,
}: ToolTipButtonProps) => {
  if (generating) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            className="text-accent-foreground/60 hover:text-accent-foreground transition-colors h-12 w-12 flex items-center justify-center absolute bottom-0 right-0 rounded-full"
            aria-label="Generating..."
            animate={{
              rotate: [0, 360],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <LoaderCircle className="w-5 h-5 animate-spin" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={-6}>
          Generating...
        </TooltipContent>
      </Tooltip>
    );
  }
  if (showMenu === "other") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            className="text-accent-foreground/60 hover:text-accent-foreground transition-colors h-12 w-12 flex items-center justify-center absolute bottom-0 right-0 rounded-full"
            aria-label="Suggest edits"
            animate={{
              rotate: isHovered ? 45 : 0,
            }}
            transition={{ duration: 1 }}
          >
            <Pen className="w-5 h-5" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={-6}>
          Suggest edits
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          className="text-accent-foreground/60 hover:text-accent-foreground transition-colors h-12 w-12 flex items-center justify-center absolute bottom-0 right-0 rounded-full hover:scale-120"
          aria-label="Back"
          transition={{ duration: 1 }}
          onClick={() => setShowMenu("other")}
        >
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={-6}>
        Back
      </TooltipContent>
    </Tooltip>
  );
};

interface OverflowMenuProps {
  handleFunctionSubmit: (type: FunctionType, text: string) => void;
  generating: boolean;
}
export default function OverflowMenu({
  handleFunctionSubmit,
  generating,
}: OverflowMenuProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState<FunctionType>("other");

  const handleLengthSubmit = async (length: string) => {
    // Handle length change here
    setShowMenu("other");
    setIsHovered(false);
    handleFunctionSubmit("length", length);
  };

  const handleReadingSubmit = async (readingLevel: string) => {
    // Handle length change here
    setShowMenu("other");
    setIsHovered(false);
    handleFunctionSubmit("readingLevel", readingLevel);
  };

  const handleFinalPolishSubmit = async () => {
    setShowMenu("other");
    setIsHovered(false);
    handleFunctionSubmit("Final Polish", "");
  };

  const handleAddEmojiSubmit = async () => {
    setShowMenu("other");
    setIsHovered(false);
    handleFunctionSubmit("add emoji", "");
  };

  const handleAddMarkdownSubmit = async () => {
    setShowMenu("other");
    setIsHovered(false);
    handleFunctionSubmit("add markdown", "");
  };

  const menuItems = [
    {
      icon: Peace,
      label: "Add Emoji",
      onClick: handleAddEmojiSubmit,
    },
    {
      icon: Code,
      label: "Add Markdown",
      onClick: handleAddMarkdownSubmit,
    },
    {
      icon: BookOpenText,
      label: "Reading Level",
      onClick: () => setShowMenu("readingLevel"),
    },
    {
      icon: Brush,
      label: "Final Polish",
      onClick: handleFinalPolishSubmit,
    },
    {
      icon: Ruler,
      label: "Adjust Length",
      onClick: () => setShowMenu("length"),
    },
  ];

  return (
    <motion.div
      className="fixed bottom-6 right-6"
      onMouseEnter={() => {
        if (generating) return;
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <motion.div
        className="bg-accent/80 rounded-full flex flex-col items-center overflow-hidden"
        animate={{
          height: isHovered ? "auto" : "48px",
          width: "48px",
          borderRadius: isHovered ? "16px" : "24px",
        }}
        transition={{
          height: { duration: 0.3, ease: "easeOut" },
          borderRadius: { duration: 0.2 },
        }}
      >
        <AnimatePresence mode="wait">
          {isHovered && showMenu === "other" && (
            <motion.div
              className="flex flex-col items-center gap-10 pt-3 pb-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {menuItems.map((item, index) => (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <motion.button
                      className="text-accent-foreground/60 hover:text-accent-foreground transition-all"
                      aria-label={item.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={item.onClick}
                    >
                      <item.icon className="w-5 h-5 hover:scale-125 transition-all active:scale-100" />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={17}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </motion.div>
          )}
          {isHovered && showMenu === "length" && (
            <motion.div
              className="flex flex-col items-center gap-6 pt-3 pb-16 w-full"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <LengthController handleThumbClick={handleLengthSubmit} />
            </motion.div>
          )}
          {isHovered && showMenu === "readingLevel" && (
            <motion.div
              className="flex flex-col items-center gap-6 pt-3 pb-16 w-full"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <ReadingController handleThumbClick={handleReadingSubmit} />
            </motion.div>
          )}
        </AnimatePresence>
        <ToolTipButton
          isHovered={isHovered}
          showMenu={showMenu}
          generating={generating}
          setShowMenu={setShowMenu}
        />
      </motion.div>
    </motion.div>
  );
}
