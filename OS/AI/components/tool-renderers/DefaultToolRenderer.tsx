/**
 * Default Tool Renderer
 *
 * This is the fallback renderer for tools that don't have a custom renderer.
 * It provides a standard UI for tool execution with arguments and results.
 */

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, AlertCircle, RefreshCw, ChevronRight } from "lucide-react";
import { ToolStatus } from "@OS/AI/components/ToolRegistry";
import {
  ToolRendererProps,
  safeParseJson,
  formatDisplayValue,
} from "../ToolRegistry";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";

export const DefaultToolRenderer: React.FC<ToolRendererProps> = ({
  toolState,
  message,
  onToggleExpand,
}) => {
  const hasGenerativeUI =
    typeof (message as any)?.generativeUI === "function" &&
    (message as any)?.generativeUI !== null;

  // Only show permission stage if:
  // 1. Has generativeUI
  // 2. Status is pending
  // 3. No result content yet (hasn't been executed)
  const isPermissionStage = hasGenerativeUI && toolState.status === "pending";

  const parsedArguments = useMemo(
    () => safeParseJson(toolState.arguments),
    [toolState.arguments]
  );

  const formattedArguments = useMemo(
    () => formatDisplayValue(parsedArguments ?? toolState.arguments ?? "{}"),
    [parsedArguments, toolState.arguments]
  );

  const hasArguments = useMemo(() => {
    if (!parsedArguments) return false;
    if (typeof parsedArguments === "object") {
      return Object.keys(parsedArguments).length > 0;
    }
    return Boolean(parsedArguments);
  }, [parsedArguments]);

  const resultHasError = useMemo(() => {
    if (!toolState.resultContent) return false;
    const content = toolState.resultContent.toLowerCase();
    return (
      content.includes("error") ||
      content.includes("failed") ||
      content.includes("exception") ||
      content.includes("rejected")
    );
  }, [toolState.resultContent]);

  const effectiveStatus: ToolStatus =
    toolState.status === "completed" && resultHasError ? "rejected" : toolState.status;

  const isExpanded =
    toolState.isExpanded === false
      ? false
      : toolState.isExpanded ||
        isPermissionStage ||
        (resultHasError && !!toolState.resultContent);

  const getStatusColor = (status: ToolStatus) => {
    switch (status) {
      case "pending":
      case "executing":
        return "bg-muted/40 border border-border/50 text-foreground";
      case "completed":
        return "bg-muted/40 border border-border/50 text-foreground";
      case "rejected":
        return "bg-destructive/10 border border-destructive/40 text-destructive-foreground";
      default:
        return "bg-muted/40 border border-border/50 text-foreground";
    }
  };

  const getStatusIcon = (status: ToolStatus) => {
    switch (status) {
      case "pending":
        return (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-2 h-2 bg-accent rounded-full"
          />
        );
      case "executing":
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-3 h-3"
          >
            <RefreshCw className="w-3 h-3 text-primary" />
          </motion.div>
        );
      case "completed":
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="w-3 h-3"
          >
            <Check className="w-3 h-3 text-green-600" />
          </motion.div>
        );
      case "rejected":
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 35 }}
            className="w-3 h-3"
          >
            <AlertCircle className="w-3 h-3 text-destructive" />
          </motion.div>
        );
      case "expired":
        return (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-3 h-3"
          >
            <AlertCircle className="w-3 h-3 text-orange-600 dark:text-orange-400" />
          </motion.div>
        );
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (effectiveStatus) {
      case "pending":
        return isPermissionStage
          ? "Asking for permission..."
          : `${toolState.toolName} pending...`;
      case "executing":
        return `${toolState.toolName} executing...`;
      case "completed":
        return `${toolState.toolName} completed`;
      case "rejected":
        return toolState.rejectionMessage
          ? toolState.rejectionMessage
          : `${toolState.toolName} failed`;
      case "expired":
        return `${toolState.toolName} expired - execution timed out`;
      default:
        return toolState.toolName;
    }
  };

  return (
    <motion.div
      className={cn(
        "py-1.5 px-3 relative w-full max-w-full transition-all duration-300 select-text break-all overflow-wrap-anywhere rounded-lg border hover:border-primary",
        getStatusColor(effectiveStatus)
      )}
      animate={{
        scale: effectiveStatus === "completed" ? [1, 1.01, 1] : 1,
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
        className={cn(
          "flex items-center gap-2 group cursor-pointer",
          isPermissionStage && "cursor-default"
        )}
        onClick={() => {
          if (!isPermissionStage) {
            onToggleExpand();
          }
        }}
      >
        {getStatusIcon(effectiveStatus)}
        <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors duration-200 select-none">
          {getStatusText()}
        </span>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-4 w-4 p-0 hover:bg-transparent cursor-default"
        >
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
          </motion.div>
        </Button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Show generative UI or arguments */}
            {isPermissionStage && hasGenerativeUI ? (
              <div className="mt-2">
                {(message as any).generativeUI?.({
                  messageId: (message as any).messageId || (message as any).id,
                  status: "executing",
                })}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {/* Show arguments if available */}
                {hasArguments && (
                  <div className="p-2 bg-primary/5 rounded text-xs font-mono border border-border/30 break-all overflow-wrap-anywhere">
                    <div className="text-muted-foreground mb-1">Arguments:</div>
                    <pre className="whitespace-pre-wrap text-foreground break-all overflow-wrap-anywhere">
                      {formattedArguments}
                    </pre>
                  </div>
                )}

                {/* Show result content if available */}
                {toolState.resultContent && (
                    <div className={cn(
                      "p-2 rounded text-xs border",
                      effectiveStatus === "rejected"
                        ? "bg-destructive/10 border-destructive/40 text-foreground"
                        : "bg-muted/50 border-border/50 text-foreground"
                    )}>
                      <div className="text-muted-foreground mb-1">Result:</div>
                      <div className="prose prose-sm dark:prose-invert max-w-none break-all overflow-wrap-anywhere [&_table]:w-full [&_table]:max-w-full [&_table]:table-fixed [&_td]:break-all [&_th]:break-all [&_td]:overflow-wrap-anywhere [&_th]:overflow-wrap-anywhere">
                        <ReactMarkdown
                          remarkPlugins={[
                            remarkGfm,
                            remarkBreaks,
                            [remarkMath, { singleDollarTextMath: false }],
                          ]}
                          rehypePlugins={[rehypeRaw]}
                        >
                          {toolState.resultContent}
                        </ReactMarkdown>
                      </div>
                    </div>
                )}

                {!hasArguments && !toolState.resultContent && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground italic">
                      No arguments required
                    </span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
