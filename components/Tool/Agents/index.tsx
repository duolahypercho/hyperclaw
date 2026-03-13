"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { FileText, Loader2 } from "lucide-react";
import { InteractApp } from "@OS/InteractApp";
import { useAgents } from "./provider/agentsProvider";

/** Human-readable descriptions for well-known OpenClaw agent files. */
const FILE_DESCRIPTIONS: Record<string, string> = {
  "SOUL.md": "Core personality, voice, and behavioral instructions for this agent.",
  "MEMORY.md": "Persistent memory — things the agent remembers across sessions.",
  "IDENTITY.md": "Name, role, and public-facing identity of the agent.",
  "AGENTS.md": "Knowledge about other agents this agent can collaborate with.",
  "TOOLS.md": "Available tools, MCP servers, and capabilities this agent can use.",
  "USER.md": "Information about the user this agent works for.",
  "HEARTBEAT.md": "Periodic self-check and status update instructions.",
};

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
    saveDoc,
  } = useAgents();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cmd/Ctrl+S to save
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveDoc();
      }
    },
    [saveDoc]
  );

  // Auto-focus textarea when file changes
  useEffect(() => {
    if (selectedFile && !contentLoading) {
      textareaRef.current?.focus();
    }
  }, [selectedFile, contentLoading]);

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

  const description = FILE_DESCRIPTIONS[selectedFile.name];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col min-h-0 bg-background"
    >
      {/* File header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0 bg-muted/20">
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{selectedFile.name}</span>
        {description && (
          <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
            — {description}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
          {content != null ? `${content.split("\n").length} lines` : ""}
        </span>
      </div>

      {saveError && (
        <p className="text-xs text-destructive px-4 py-1.5 bg-destructive/10 border-b border-border/50 shrink-0">
          {saveError}
        </p>
      )}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden bg-background">
          <textarea
            ref={textareaRef}
            value={content ?? ""}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Edit file content (markdown)..."
            className="w-full customScrollbar2 min-h-full p-4 bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none resize-none border-0 block"
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
