/**
 * Tool Renderers Setup
 *
 * This file registers all available tool renderers.
 * Import and call setupToolRenderers() once at app initialization.
 */

import { toolRegistry } from "../ToolRegistry";
import { DefaultToolRenderer } from "./DefaultToolRenderer";
import { ThinkingToolRenderer } from "./ThinkingToolRenderer";

/**
 * Register all tool renderers
 * Call this once during app initialization
 */
export const setupToolRenderers = () => {
  // Set default renderer for unregistered tools
  toolRegistry.setDefaultRenderer(DefaultToolRenderer);

  // Register specific tool renderers
  toolRegistry.register({
    name: "thinking",
    renderer: ThinkingToolRenderer,
    autoExpandOnPermission: false,
    allowGenerativeUI: false,
  });

  // Add more tool registrations here as needed
  // toolRegistry.register({
  //   name: "code_execution",
  //   renderer: CodeExecutionRenderer,
  //   autoExpandOnPermission: true,
  //   allowGenerativeUI: true,
  // });
};
