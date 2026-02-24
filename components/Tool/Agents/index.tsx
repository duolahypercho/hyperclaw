"use client";

import React from "react";
import { motion } from "framer-motion";
import { FileText, Loader2 } from "lucide-react";
import { InteractApp } from "@OS/InteractApp";
import { useAgents } from "./provider/agentsProvider";

function AgentsEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground"
    >
      <FileText className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-sm font-medium">Select an agent file</p>
      <p className="text-xs mt-1">Choose an agent in the sidebar, then pick a file to view and edit.</p>
    </motion.div>
  );
}

function AgentFileEditor() {
  const {
    selectedFile,
    content,
    contentLoading,
    saveError,
    setContent,
  } = useAgents();

  if (!selectedFile) {
    return <AgentsEmptyState />;
  }

  if (contentLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground"
      >
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Loading file…</p>
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
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden bg-background">
          <textarea
            value={content ?? ""}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Edit file content (markdown)..."
            className="w-full min-h-full p-4 bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none resize-none border-0 block"
            spellCheck={false}
          />
        </div>
      </div>
    </motion.div>
  );
}

export function Agents() {
  const { appSchema, error } = useAgents();

  if (error) {
    return (
      <InteractApp appSchema={appSchema} className="p-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full min-h-[200px] text-destructive"
        >
          <p className="text-sm font-medium">{error}</p>
        </motion.div>
      </InteractApp>
    );
  }

  return (
    <InteractApp appSchema={appSchema} className="p-0">
      <AgentFileEditor />
    </InteractApp>
  );
}

export default Agents;
