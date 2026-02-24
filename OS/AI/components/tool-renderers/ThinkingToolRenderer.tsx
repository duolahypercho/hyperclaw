/**
 * Thinking Tool Renderer
 *
 * Custom renderer for the "thinking" tool that shows AI's thought process.
 * This demonstrates how easy it is to create specialized renderers.
 */

import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { MessageStatusCode } from "@OS/AI/runtime";
import { ToolRendererProps, safeParseJson } from "../ToolRegistry";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import createThoughtsMarkdownComponents from "@OS/AI/components/createMarkdownComponents";

// Animated thinking dots component
const ThinkingDots = () => {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return <span className="text-xs text-muted-foreground">thinking{dots}</span>;
};

export const ThinkingToolRenderer: React.FC<ToolRendererProps> = ({
  toolState,
  onToggleExpand,
}) => {
  const isExpanded = toolState.isExpanded || false;

  // Parse thoughts from arguments or metadata
  const thoughts = useMemo(() => {
    // Try to get thoughts from metadata first
    if (toolState.metadata?.thoughts) {
      return toolState.metadata.thoughts;
    }

    // Try to parse from arguments
    try {
      const parsed = safeParseJson(toolState.arguments);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as any).thoughts
      ) {
        return (parsed as any).thoughts;
      }
    } catch (e) {
      // Fall back to raw arguments
    }

    return toolState.arguments || "Thinking...";
  }, [toolState.arguments, toolState.metadata]);

  const getStatusColor = () => {
    switch (toolState.status) {
      case "pending":
      case "executing":
        return "bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 border border-primary/30 text-foreground";
      case "completed":
        return "bg-muted/40 border border-border/50 text-muted-foreground hover:text-foreground/80 active:text-foreground";
      default:
        return "bg-muted/40 border border-border/50 text-muted-foreground hover:text-foreground/80 active:text-foreground";
    }
  };

  return (
    <motion.div
      className={cn(
        "py-1.5 px-3 relative w-fit transition-all duration-300 select-text break-words overflow-wrap-anywhere rounded-lg border hover:border-primary/50",
        getStatusColor()
      )}
      animate={{
        scale: toolState.status === "completed" ? [1, 1.01, 1] : 1,
      }}
      transition={{ duration: 0.5 }}
      style={{
        borderTopRightRadius: "10px",
        borderBottomRightRadius: "10px",
        borderTopLeftRadius: "0px",
        borderBottomLeftRadius: "10px",
      }}
    >
      {/* Status Header */}
      <div
        className="flex items-center gap-2 group cursor-pointer group"
        onClick={onToggleExpand}
      >
        {toolState.status === MessageStatusCode.Pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center text-muted-foreground font-medium gap-2 group-hover:text-foreground"
          >
            <ThinkingDots />
          </motion.div>
        )}
        {(toolState.status === "completed" ||
          toolState.status === "rejected" ||
          toolState.status === "expired") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center text-muted-foreground font-medium gap-2 text-xs group-hover:text-foreground"
          >
            Thoughts
            <Button
              variant="ghost"
              size="iconSm"
              className="h-4 w-4 p-0 hover:bg-transparent"
            >
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-3 h-3 group-hover:text-foreground transition-colors duration-200" />
              </motion.div>
            </Button>
          </motion.div>
        )}
      </div>

      {/* Expanded Thoughts */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="text-sm text-foreground leading-relaxed">
                {thoughts ? (
                  <ReactMarkdown
                    components={createThoughtsMarkdownComponents()}
                    remarkPlugins={[
                      remarkGfm,
                      remarkBreaks,
                      [remarkMath, { singleDollarTextMath: false }],
                    ]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {thoughts}
                  </ReactMarkdown>
                ) : (
                  "No thoughts available"
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
