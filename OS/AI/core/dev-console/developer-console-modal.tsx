"use client";

import { useCopanionContext } from "@OS/AI/core/context/copanion-context";
import { useCopanionMessagesContext } from "@OS/AI/core/context/";
import { useEffect, useState } from "react";
import { CheckIcon, ExclamationMarkTriangleIcon } from "./icons";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import { HYPERCHO_VERSION } from "@OS/AI/shared";
import { Agent } from "@OS/AI/runtime";
import { Message as RuntimeMessage, TextMessage } from "@OS/AI/runtime-client";
import { MessageRole } from "@OS/AI/runtime";
import JSONViewer from "$/components/JSONViewer";
import { Tree } from "../hook";

// Type definitions for the developer console
interface ActionParameter {
  name: string;
  required?: boolean;
  type?: string;
}

interface Action {
  name: string;
  description?: string;
  parameters?: ActionParameter[];
  status?: string;
}

interface Readable {
  id?: string;
  value?: any;
  children?: Readable[];
  categories?: string[];
}

interface AgentState {
  status?: string;
  state?: any;
  running?: boolean;
  lastUpdate?: number;
}

// Use the actual Message type from runtime-client
type Message = RuntimeMessage;

interface Document {
  name?: string;
  content?: string;
  metadata?: Record<string, any>;
}

interface DisplayContext {
  actions: Record<string, Action>;
  availableAgents: Agent[];
  getAllContext: () => Tree;
  coagentStates: Record<string, AgentState>;
  getDocumentsContext: (args?: any[]) => Document[];
}

interface MessagesContext {
  messages: Message[];
}

interface DeveloperConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasApiKey: boolean;
}

export function DeveloperConsoleModal({
  isOpen,
  onClose,
  hasApiKey,
}: DeveloperConsoleModalProps) {
  const context = useCopanionContext();
  const messagesContext = useCopanionMessagesContext();
  const [activeTab, setActiveTab] = useState("actions");

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Create mock data for preview when no API key
  const displayContext: DisplayContext = hasApiKey
    ? (context as DisplayContext)
    : {
        actions: {
          search_web: {
            name: "search_web",
            description: "Search the web for information",
          },
          send_email: {
            name: "send_email",
            description: "Send an email to a contact",
          },
          create_document: {
            name: "create_document",
            description: "Create a new document",
          },
          analyze_code: {
            name: "analyze_code",
            description: "Analyze code for issues and improvements",
          },
          generate_tests: {
            name: "generate_tests",
            description: "Generate unit tests for functions",
          },
        },
        availableAgents: [
          {
            id: "code-assistant",
            name: "Code Assistant",
            description: "AI-powered code analysis and generation assistant",
          },
          {
            id: "document-writer",
            name: "Document Writer",
            description: "Intelligent document creation and editing assistant",
          },
          {
            id: "research-agent",
            name: "Research Agent",
            description:
              "Comprehensive research and information gathering agent",
          },
        ],
        getAllContext: () => [
          {
            value:
              "UserPreferences: { value: dark mode enabled, TypeScript preferred}",
            categories: new Set(["settings"]),
            id: "user-preferences",
            children: [],
          },
          {
            value:
              "CurrentProject: { value: Building a React application with CopilotKit }",
            categories: new Set(["project"]),
            id: "current-project",
            children: [],
          },
          {
            value:
              "RecentActivity: { value: Implemented authentication system }",
            categories: new Set(["activity"]),
            id: "recent-activity",
            children: [],
          },
          {
            value:
              "DevelopmentEnvironment: { value: VS Code, Node.js 18, React 18 }",
            categories: new Set(["environment"]),
            id: "development-environment",
            children: [],
          },
        ],
        coagentStates: {
          "main-agent": { status: "active", lastUpdate: Date.now() },
          "code-assistant": {
            status: "active",
            lastUpdate: Date.now() - 15000,
          },
          "search-agent": { status: "idle", lastUpdate: Date.now() - 60000 },
        },
        getDocumentsContext: () => [
          {
            content: "README.md: Project setup and installation instructions",
            metadata: { type: "documentation" },
          },
          {
            content: "API Documentation: CopilotKit integration guide",
            metadata: { type: "documentation" },
          },
          {
            content: "package.json: Project dependencies and scripts",
            metadata: { type: "configuration" },
          },
        ],
      };

  const displayMessagesContext: MessagesContext = hasApiKey
    ? (messagesContext as MessagesContext)
    : {
        messages: [
          new TextMessage({
            id: "1",
            role: MessageRole.user,
            content:
              "Help me implement a todo list with drag and drop functionality",
          }),
          new TextMessage({
            id: "2",
            role: MessageRole.assistant,
            content:
              "I'll help you create a todo list with drag and drop. Let me start by setting up the basic components and then add the drag and drop functionality using React DnD.",
          }),
          new TextMessage({
            id: "3",
            role: MessageRole.user,
            content: "Can you also add priority levels and due dates?",
          }),
          new TextMessage({
            id: "4",
            role: MessageRole.assistant,
            content:
              "Absolutely! I'll enhance the todo items with priority levels (high, medium, low) and due date functionality. This will make your todo list much more powerful for task management.",
          }),
          new TextMessage({
            id: "5",
            role: MessageRole.user,
            content: "Perfect! How about adding categories or tags?",
          }),
        ],
      };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "1152px",
          maxWidth: "95vw",
          height: "80vh",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "24px",
            borderBottom: "1px solid #e5e7eb",
            minHeight: "73px",
            flexShrink: 0,
            filter: !hasApiKey ? "blur(0.3px)" : "none",
            opacity: !hasApiKey ? 0.95 : 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <HyperchoIcon className="w-6 h-6" />
            <h1
              style={{
                fontWeight: "bold",
                fontSize: "20px",
                color: "#1f2937",
                margin: 0,
              }}
            >
              Inspector
            </h1>
            <span
              style={{
                fontSize: "14px",
                color: "#6b7280",
                backgroundColor: "#f3f4f6",
                padding: "4px 8px",
                borderRadius: "4px",
              }}
            >
              v{HYPERCHO_VERSION}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              color: "#9ca3af",
              fontSize: "24px",
              fontWeight: "300",
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#4b5563")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            minHeight: "50px",
            flexShrink: 0,
            filter: !hasApiKey ? "blur(0.3px)" : "none",
            opacity: !hasApiKey ? 0.9 : 1,
          }}
        >
          {[
            {
              id: "actions",
              label: "Actions",
              count: Object.keys(displayContext.actions).length,
            },
            {
              id: "readables",
              label: "Readables",
              count: displayContext.getAllContext().length,
            },
            {
              id: "agent",
              label: "Agent",
              count: (displayContext.availableAgents || []).length,
            },
            {
              id: "agent-status",
              label: "Agent Status",
              count: Object.keys(displayContext.coagentStates).length,
            },
            {
              id: "messages",
              label: "Messages",
              count: displayMessagesContext.messages.length,
            },
            {
              id: "context",
              label: "Context",
              count: displayContext.getDocumentsContext([]).length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: "500",
                border: "none",
                cursor: "pointer",
                backgroundColor: activeTab === tab.id ? "white" : "transparent",
                color: activeTab === tab.id ? "#2563eb" : "#6b7280",
                borderBottom:
                  activeTab === tab.id ? "2px solid #2563eb" : "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = "#1f2937";
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = "#6b7280";
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    backgroundColor: "#e5e7eb",
                    color: "#374151",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontSize: "12px",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          className="customScrollbar2 overflow-y-auto"
          style={{
            height: "calc(100% - 142px)",
            padding: "24px",
            backgroundColor: "#f9fafb",
            filter: !hasApiKey ? "blur(0.3px)" : "none",
            opacity: !hasApiKey ? 0.85 : 1,
          }}
        >
          {activeTab === "actions" && <ActionsTab context={displayContext} />}
          {activeTab === "readables" && (
            <ReadablesTab
              context={displayContext}
              messagesContext={displayMessagesContext}
            />
          )}
          {activeTab === "agent" && <AgentTab context={displayContext} />}
          {activeTab === "agent-status" && (
            <AgentStatusTab context={displayContext} />
          )}
          {activeTab === "messages" && (
            <MessagesTab messagesContext={displayMessagesContext} />
          )}
          {activeTab === "context" && <ContextTab context={displayContext} />}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            backgroundColor: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: "57px",
            flexShrink: 0,
            filter: !hasApiKey ? "blur(0.3px)" : "none",
            opacity: !hasApiKey ? 0.9 : 1,
          }}
        >
          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            <a
              href="https://github.com/CopilotKit/CopilotKit/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563eb", textDecoration: "none" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.textDecoration = "underline")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.textDecoration = "none")
              }
            >
              Report an issue
            </a>
          </div>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            <a
              href="https://mcp.copilotkit.ai/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563eb", textDecoration: "none" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.textDecoration = "underline")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.textDecoration = "none")
              }
            >
              Add MCP Server →
            </a>
          </div>
        </div>

        {/* Enhanced CTA Overlay */}
        {!hasApiKey && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
              zIndex: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() =>
                window.open("https://cloud.copilotkit.ai/sign-in", "_blank")
              }
              style={{
                // Following button system specifications
                height: "48px",
                padding: "12px 24px",
                backgroundColor: "#030507", // textPrimary token
                color: "#FFFFFF",
                borderRadius: "12px", // Medium radius token
                border: "none",
                cursor: "pointer",
                fontSize: "14px", // Medium Semi Bold typography
                fontWeight: "600",
                fontFamily:
                  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                lineHeight: "22px",
                boxShadow:
                  "0 4px 16px rgba(3, 5, 7, 0.2), 0 1px 3px rgba(3, 5, 7, 0.1)",
                transition: "all 200ms ease", // 200ms ease as per specs
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#575758"; // textSecondary token for hover
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 20px rgba(3, 5, 7, 0.25), 0 2px 4px rgba(3, 5, 7, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#030507";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 16px rgba(3, 5, 7, 0.2), 0 1px 3px rgba(3, 5, 7, 0.1)";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.backgroundColor = "#858589"; // textDisabled token for pressed
                e.currentTarget.style.transform = "translateY(0)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.backgroundColor = "#575758";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #BEC9FF";
                e.currentTarget.style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            >
              Get License Key
              <span style={{ fontSize: "16px", marginLeft: "-4px" }}>→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Tab Components
function ActionsTab({ context }: { context: DisplayContext }) {
  const actions = Object.values(context.actions);

  if (actions.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
        <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>
          No actions available
        </p>
        <p style={{ fontSize: "14px", margin: 0 }}>
          Actions will appear here when registered
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {actions.map((action: Action, index: number) => (
        <div
          key={index}
          style={{
            backgroundColor: "white",
            padding: "16px",
            borderRadius: "8px",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1 }}>
              <h3
                style={{
                  fontWeight: "600",
                  color: "#1f2937",
                  margin: "0 0 4px 0",
                }}
              >
                {action.name}
              </h3>
              {action.description && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#4b5563",
                    margin: "0 0 12px 0",
                  }}
                >
                  {action.description}
                </p>
              )}
              {action.parameters && action.parameters.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: "500",
                      color: "#6b7280",
                      textTransform: "uppercase",
                      margin: "0 0 4px 0",
                    }}
                  >
                    Parameters:
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {action.parameters.map(
                      (param: ActionParameter, pIndex: number) => (
                        <div key={pIndex} style={{ fontSize: "14px" }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              color: "#374151",
                            }}
                          >
                            {param.name}
                          </span>
                          {param.required && (
                            <span
                              style={{
                                marginLeft: "4px",
                                fontSize: "12px",
                                color: "#ef4444",
                              }}
                            >
                              *required
                            </span>
                          )}
                          {param.type && (
                            <span
                              style={{
                                marginLeft: "8px",
                                fontSize: "12px",
                                color: "#6b7280",
                              }}
                            >
                              ({param.type})
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginLeft: "16px" }}>
              {action.status === "available" ? (
                <CheckIcon />
              ) : (
                <ExclamationMarkTriangleIcon />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadablesTab({
  context,
  messagesContext,
}: {
  context: DisplayContext;
  messagesContext: MessagesContext;
}) {
  const readables = context.getAllContext();

  // Combine only readables data into a JSON structure for the enhanced viewer
  const combinedData: Record<string, any> = {};

  // Helper function to generate dynamic child names from any data structure
  const getDynamicChildName = (
    childValue: string,
    childIndex: number,
    fallbackId: string
  ) => {
    try {
      // Try to parse as JSON array first
      const arrayMatch = childValue.match(/:\s*\[(.*)\]/s);
      if (arrayMatch) {
        const dataArray = JSON.parse(`[${arrayMatch[1]}]`);
        if (Array.isArray(dataArray) && dataArray.length > childIndex) {
          const item = dataArray[childIndex];

          // Look for naming fields in order of preference
          const nameFields = ["title", "name", "label", "key", "id", "_id"];
          for (const field of nameFields) {
            if (item && item[field]) {
              // Clean up the value for use as a key
              return String(item[field])
                .replace(/[^\w\s-]/g, "") // Remove special characters
                .replace(/\s+/g, "_") // Replace spaces with underscores
                .substring(0, 50); // Limit length
            }
          }
        }
      }

      // Try to parse as single object
      const objectMatch = childValue.match(/:\s*(\{.*\})/s);
      if (objectMatch) {
        const dataObject = JSON.parse(objectMatch[1]);
        if (dataObject && typeof dataObject === "object") {
          const nameFields = ["title", "name", "label", "key", "id", "_id"];
          for (const field of nameFields) {
            if (dataObject[field]) {
              return String(dataObject[field])
                .replace(/[^\w\s-]/g, "")
                .replace(/\s+/g, "_")
                .substring(0, 50);
            }
          }
        }
      }
    } catch (error) {
      // Fall back to original ID if parsing fails
      console.debug("Failed to parse data for dynamic naming:", error);
    }
    return fallbackId;
  };

  // Helper function to parse readable values and extract meaningful data
  const parseReadableValue = (value: string, title?: string) => {
    try {
      const jsonMatch = value.match(/:\s*(.+)$/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  };

  // Helper function to find the best key field for grouping items
  const findKeyField = (obj: any): string | null => {
    const keyFields = ["_id", "id", "key", "name", "title", "slug", "uuid"];
    for (const field of keyFields) {
      if (obj.hasOwnProperty(field)) {
        return field;
      }
    }
    return null;
  };

  try {
    // Generic approach: organize data by content type and create meaningful structure
    const dataGroups: Record<string, any> = {};
    const itemCollections: Record<string, any> = {};

    readables.forEach((readable, index) => {
      if (readable.value) {
        // Parse the main readable value to get the title
        const titleMatch = readable.value.match(/^([^:]+):/);
        const title = titleMatch
          ? titleMatch[1].trim()
          : `Readable ${index + 1}`;

        // Parse the actual data
        const parsedData = parseReadableValue(readable.value, title);

        // Store the main data under its title
        dataGroups[title] = parsedData;

        // Process children if they exist - make them dynamic based on content
        if (readable.children && readable.children.length > 0) {
          readable.children.forEach((child: any, childIndex: number) => {
            const childTitleMatch = child.value.match(/^([^:]+):/);
            const childTitle = childTitleMatch
              ? childTitleMatch[1].trim()
              : `Child ${childIndex + 1}`;

            const childData = parseReadableValue(child.value, childTitle);

            // Create a dynamic structure based on the child data
            if (Array.isArray(childData) && childData.length > 0) {
              // If child contains an array of items, organize them by a key field
              const firstItem = childData[0];
              const keyField = findKeyField(firstItem);

              if (keyField && firstItem[keyField]) {
                // Group items by the key field
                const groupedItems: Record<string, any> = {};

                childData.forEach((item: any, itemIndex: number) => {
                  const itemKey = item[keyField];
                  const dynamicName = getDynamicChildName(
                    child.value,
                    itemIndex,
                    item[keyField] || `item_${itemIndex}`
                  );

                  groupedItems[itemKey] = {
                    ...item,
                    dynamicName,
                    originalContent: child.value,
                  };
                });

                itemCollections[childTitle] = {
                  groupedBy: keyField,
                  items: groupedItems,
                };
              } else {
                // Just store as array with dynamic names
                const itemsWithNames: Record<string, any> = {};
                childData.forEach((item: any, itemIndex: number) => {
                  const dynamicName = getDynamicChildName(
                    child.value,
                    itemIndex,
                    `item_${itemIndex}`
                  );

                  itemsWithNames[dynamicName] = {
                    ...item,
                    originalContent: child.value,
                  };
                });

                itemCollections[childTitle] = itemsWithNames;
              }
            } else if (typeof childData === "object" && childData !== null) {
              // Single object - just store it with dynamic naming
              const dynamicName = getDynamicChildName(
                child.value,
                0,
                child.id || `object_${childIndex}`
              );

              itemCollections[dynamicName] = {
                ...childData,
                originalContent: child.value,
              };
            }
          });
        }
      }
    });

    // Build the final clean structure
    Object.assign(combinedData, dataGroups, itemCollections);
  } catch (error) {
    console.error("Error parsing readable context", error);
    // Fallback: create a simple structure
    readables.forEach((readable, index) => {
      combinedData[`Readable ${index + 1}`] = readable.value || "No data";
    });
  }

  if (readables.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
        <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>
          No readable context available
        </p>
        <p style={{ fontSize: "14px", margin: 0 }}>
          Readable context will appear here when provided
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <JSONViewer
        data={combinedData}
        title="Readable Context"
        defaultExpanded={false}
        showControls={true}
      />
    </div>
  );
}

function AgentTab({ context }: { context: DisplayContext }) {
  const availableAgents = context.availableAgents || [];

  if (availableAgents.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
        <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>
          No available agents
        </p>
        <p style={{ fontSize: "14px", margin: 0 }}>
          Available agents will appear here when loaded
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {availableAgents.map((agent: Agent) => (
        <div
          key={agent.id}
          style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <div style={{ flex: 1 }}>
              <h3
                style={{
                  fontWeight: "600",
                  fontSize: "18px",
                  color: "#1f2937",
                  margin: "0 0 4px 0",
                }}
              >
                {agent.name}
              </h3>
              {agent.description && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#4b5563",
                    margin: "0 0 12px 0",
                  }}
                >
                  {agent.description}
                </p>
              )}
            </div>
            <div style={{ marginLeft: "16px" }}>
              <CheckIcon />
            </div>
          </div>

          <div style={{ marginTop: "12px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "500",
                color: "#6b7280",
                backgroundColor: "#f3f4f6",
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              ID: {agent.id}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentStatusTab({ context }: { context: DisplayContext }) {
  const agentStates = context.coagentStates || {};
  const agentStateEntries = Object.entries(agentStates);

  if (agentStateEntries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
        <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>
          No agent states available
        </p>
        <p style={{ fontSize: "14px", margin: 0 }}>
          Agent states will appear here when agents are active
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {agentStateEntries.map(([agentName, state]: [string, AgentState]) => (
        <div
          key={agentName}
          style={{
            backgroundColor: "white",
            padding: "24px",
            borderRadius: "8px",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                fontWeight: "600",
                fontSize: "18px",
                color: "#1f2937",
                margin: 0,
              }}
            >
              {agentName}
            </h3>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: "500",
                backgroundColor:
                  state.status === "running"
                    ? "#dcfce7"
                    : state.status === "complete"
                    ? "#dbeafe"
                    : "#f3f4f6",
                color:
                  state.status === "running"
                    ? "#166534"
                    : state.status === "complete"
                    ? "#1e40af"
                    : "#1f2937",
              }}
            >
              {state.status || "idle"}
            </span>
          </div>

          {state.state && (
            <div style={{ marginBottom: "12px" }}>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#6b7280",
                  textTransform: "uppercase",
                  margin: "0 0 4px 0",
                }}
              >
                Current State:
              </p>
              <pre
                style={{
                  padding: "12px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "4px",
                  fontSize: "12px",
                  overflowX: "auto",
                  margin: 0,
                }}
              >
                {JSON.stringify(state.state, null, 2)}
              </pre>
            </div>
          )}

          {state.running && (
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                alignItems: "center",
                fontSize: "14px",
                color: "#4b5563",
              }}
            >
              <div style={{ marginRight: "8px" }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    fill="none"
                    stroke="#4b5563"
                    strokeWidth="2"
                    strokeDasharray="9 3"
                  />
                </svg>
              </div>
              <span>Agent is currently running...</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MessagesTab({
  messagesContext,
}: {
  messagesContext: MessagesContext;
}) {
  const messages = messagesContext.messages || [];

  if (messages.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
        <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>No messages yet</p>
        <p style={{ fontSize: "14px", margin: 0 }}>
          Messages will appear here as the conversation progresses
        </p>
      </div>
    );
  }

  const getMessageRole = (message: any): string => {
    // Handle the actual message structure from the context
    if (message.textMessage) {
      return message.textMessage.role || "system";
    }
    if (message.actionExecutionMessage) {
      return "tool";
    }
    if (message.resultMessage) {
      return "tool";
    }
    if (message.agentStateMessage) {
      return message.agentStateMessage.role || "system";
    }
    if (message.imageMessage) {
      return message.imageMessage.role || "user";
    }
    // Fallback for legacy structure
    if (message.role) {
      return message.role;
    }
    return "system";
  };

  const getMessageContent = (message: any): string => {
    // Handle the actual message structure from the context
    if (message.textMessage) {
      return message.textMessage.content || "";
    }
    if (message.actionExecutionMessage) {
      return `Action: ${message.actionExecutionMessage.name}\nArguments: ${message.actionExecutionMessage.arguments}`;
    }
    if (message.resultMessage) {
      return `Result for ${message.resultMessage.actionName}:\n${message.resultMessage.result}`;
    }
    if (message.agentStateMessage) {
      return `Agent: ${message.agentStateMessage.agentName}\nState: ${message.agentStateMessage.state}\nRunning: ${message.agentStateMessage.running}`;
    }
    if (message.imageMessage) {
      return `Image (${message.imageMessage.format}): ${message.imageMessage.bytes.length} bytes`;
    }
    // Fallback for legacy structure
    if (message.content) {
      return message.content;
    }
    return "Unknown message type";
  };

  const getMessageType = (message: any): string => {
    // Handle the actual message structure from the context
    if (message.textMessage) return "Text";
    if (message.actionExecutionMessage) return "Action";
    if (message.resultMessage) return "Result";
    if (message.agentStateMessage) return "Agent State";
    if (message.imageMessage) return "Image";
    return "Unknown";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {messages.map((message: any, index: number) => {
        const role = getMessageRole(message);
        const content = getMessageContent(message);
        const messageType = getMessageType(message);

        return (
          <div
            key={message._id || message.id || index}
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor:
                role === "user"
                  ? "#eff6ff"
                  : role === "assistant"
                  ? "#f9fafb"
                  : role === "tool"
                  ? "#f0f9ff"
                  : "#fefce8",
              border: `1px solid ${
                role === "user"
                  ? "#c7d2fe"
                  : role === "assistant"
                  ? "#e5e7eb"
                  : role === "tool"
                  ? "#bae6fd"
                  : "#fde047"
              }`,
              marginLeft: role === "user" ? "48px" : "0",
              marginRight: role === "assistant" ? "48px" : "0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    fontWeight: "500",
                    fontSize: "14px",
                    color: "#374151",
                    textTransform: "capitalize",
                  }}
                >
                  {role}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    backgroundColor: "#f3f4f6",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {messageType}
                </span>
              </div>
              {message.createdAt && (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#1f2937",
                whiteSpace: "pre-wrap",
                fontFamily:
                  message.actionExecutionMessage ||
                  message.resultMessage ||
                  message.agentStateMessage
                    ? "monospace"
                    : "inherit",
              }}
            >
              {content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContextTab({ context }: { context: DisplayContext }) {
  const documents = context.getDocumentsContext([]);

  if (documents.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
        <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>
          No document context available
        </p>
        <p style={{ fontSize: "14px", margin: 0 }}>
          Document context will appear here when provided
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {documents.map((doc: Document, index: number) => (
        <div
          key={index}
          style={{
            backgroundColor: "white",
            padding: "16px",
            borderRadius: "8px",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <h3
            style={{ fontWeight: "600", color: "#1f2937", margin: "0 0 8px 0" }}
          >
            {doc.name || `Document ${index + 1}`}
          </h3>
          {doc.content && (
            <pre
              style={{
                padding: "12px",
                backgroundColor: "#f9fafb",
                borderRadius: "4px",
                fontSize: "12px",
                overflowX: "auto",
                margin: 0,
              }}
            >
              {doc.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
