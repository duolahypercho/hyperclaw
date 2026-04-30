"use client";

import React from "react";
import { motion } from "framer-motion";
import { FileText, Loader2, AlertCircle } from "lucide-react";
import { useDocs } from "./provider/docsProvider";

export function DocViewer() {
  const {
    selectedPath,
    content,
    loading,
    listLoading,
    error,
    saveError,
    setContent,
  } = useDocs();

  if (listLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground"
      >
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Loading workspace docs...</p>
      </motion.div>
    );
  }

  if (!selectedPath) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground"
      >
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm font-medium">Select a document</p>
        <p className="text-xs mt-1">Choose a .md file from ~/.openclaw in the sidebar</p>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground"
      >
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Loading...</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full min-h-[200px] text-destructive"
      >
        <AlertCircle className="h-12 w-12 mb-4 opacity-80" />
        <p className="text-sm font-medium">Could not load document</p>
        <p className="text-xs mt-1 text-muted-foreground">{error}</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col min-h-0 bg-background"
    >
      {saveError && (
        <p className="text-xs text-destructive px-4 py-1.5 bg-destructive/10 border-b border-border/50 shrink-0">
          {saveError}
        </p>
      )}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Edit pane */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden docs-editor-scroll bg-background border-r border-border/50">
          <textarea
            value={content ?? ""}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Markdown content..."
            className="w-full customScrollbar2 min-h-full p-4 bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none resize-none border-0 block"
            spellCheck={false}
          />
        </div>
      </div>
    </motion.div>
  );
}
