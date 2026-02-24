/**
 * Tool Registry System
 *
 * This provides a scalable way to handle different tool types in the chat.
 * To add a new tool type, simply:
 * 1. Create a renderer component
 * 2. Register it with registerToolRenderer()
 *
 * No need to modify core chat logic!
 */

import React from "react";
import { Message } from "@OS/AI/shared";

export type ToolStatus =
  | "pending"
  | "expanded"
  | "executing"
  | "completed"
  | "rejected"
  | "expired";

/**
 * Unified tool state that works for any tool type
 */
export interface UnifiedToolState {
  id: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  status: ToolStatus;
  arguments: string;
  resultContent?: string;
  resultData?: unknown;
  rejectionMessage?: string;
  isExpanded?: boolean;
  metadata?: Record<string, any>; // Tool-specific metadata
}

/**
 * Props passed to tool renderer components
 */
export interface ToolRendererProps {
  toolState: UnifiedToolState;
  message: Message;
  onToggleExpand: () => void;
  assistantAvatar?: any;
  botPic?: string;
  showAvatar?: boolean;
}

/**
 * Configuration for how a tool should behave
 */
export interface ToolConfig {
  // Name of the tool (must match tool call name)
  name: string;

  // React component to render this tool
  renderer: React.ComponentType<ToolRendererProps>;

  // Should this tool auto-expand when in permission stage?
  autoExpandOnPermission?: boolean;

  // Should this tool show generativeUI if available?
  allowGenerativeUI?: boolean;

  // Custom status color mapping
  statusColors?: {
    pending?: string;
    executing?: string;
    completed?: string;
    rejected?: string;
    expired?: string;
  };

  // Custom parser for tool arguments
  parseArguments?: (args: string) => any;

  // Custom parser for tool result
  parseResult?: (result: string) => any;
}

/**
 * Global registry for tool renderers
 */
class ToolRegistry {
  private registry = new Map<string, ToolConfig>();
  private defaultRenderer: React.ComponentType<ToolRendererProps> | null = null;

  /**
   * Register a tool renderer
   */
  register(config: ToolConfig) {
    this.registry.set(config.name, config);
  }

  /**
   * Register multiple tool renderers at once
   */
  registerAll(configs: ToolConfig[]) {
    configs.forEach((config) => this.register(config));
  }

  /**
   * Set a default renderer for unregistered tools
   */
  setDefaultRenderer(renderer: React.ComponentType<ToolRendererProps>) {
    this.defaultRenderer = renderer;
  }

  /**
   * Get configuration for a tool
   */
  getConfig(toolName: string): ToolConfig | null {
    return this.registry.get(toolName) || null;
  }

  /**
   * Get renderer for a tool (returns default if not found)
   */
  getRenderer(toolName: string): React.ComponentType<ToolRendererProps> | null {
    const config = this.registry.get(toolName);
    if (config) return config.renderer;
    return this.defaultRenderer;
  }

  /**
   * Check if a tool is registered
   */
  isRegistered(toolName: string): boolean {
    return this.registry.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Clear all registrations
   */
  clear() {
    this.registry.clear();
    this.defaultRenderer = null;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();

// Helper function to normalize tool arguments
export const normalizeToolArguments = (args: unknown): string => {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(parsed);
    } catch {
      return args;
    }
  }

  try {
    return JSON.stringify(args ?? {});
  } catch (error) {
    console.warn("Failed to serialize tool arguments", error);
    return "{}";
  }
};

// Helper to safely parse JSON
export const safeParseJson = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

// Helper to check if tool result indicates rejection
export const isToolRejected = (content?: string): boolean => {
  const parsed = safeParseJson(content);
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as any).action === "reject"
  );
};

// Helper to extract rejection message
export const extractRejectionMessage = (
  content?: string
): string | undefined => {
  const parsed = safeParseJson(content);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as any).action === "reject"
  ) {
    return typeof (parsed as any).message === "string"
      ? (parsed as any).message
      : "Action was rejected";
  }
  return undefined;
};

// Helper to format display value
export const formatDisplayValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
