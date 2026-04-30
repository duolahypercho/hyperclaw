/** Describes one editable file within a runtime's file set. */
export type AgentProfileFileTabSpec = {
  key: string;
  label: string;
  description: string;
  fileKey?: string;
  runtimeDocFileName?: string;
  placeholder?: string;
  hermesAction?: string;
  hermesUpdateAction?: string;
  hermesPlaceholder?: string;
};

// identity.md and OpenClaw bootstrap.md are configured through structured
// runtime settings, not the raw file editor.
export const RUNTIME_FILE_TABS: Record<string, AgentProfileFileTabSpec[]> = {
  openclaw: [
    { key: "soul",      label: "soul.md",       description: "Personality, tone and behavior",                                                            fileKey: "SOUL"      },
    { key: "user",      label: "user.md",       description: "Context about the humans this agent works with",                                            fileKey: "USER"      },
    { key: "agents",    label: "agents.md",     description: "Team awareness - what this agent knows about its teammates",                                fileKey: "AGENTS"    },
    { key: "heartbeat", label: "heartbeat.md",  description: "Periodic tasks and health checks",                                                          fileKey: "HEARTBEAT" },
    { key: "tools",     label: "tools.md",      description: "Agent tool context and built-in Hyperclaw actions",                                         fileKey: "TOOLS"     },
  ],
  "claude-code": [
    { key: "soul",     label: "SOUL.md",     description: "Canonical persona and operating style. Saving this refreshes Claude's compiled startup context.", fileKey: "SOUL" },
    { key: "claude",   label: "CLAUDE.md",   description: "Compiled startup instructions Claude reads at the start of every coding session",                 fileKey: "CLAUDE", runtimeDocFileName: "CLAUDE.md" },
    { key: "user",     label: "user.md",     description: "Context about the humans this agent works with",                                                 fileKey: "USER" },
  ],
  codex: [
    { key: "agents",   label: "AGENTS.md",   description: "Agent instructions Codex reads from AGENTS.md",                                                  fileKey: "AGENTS" },
    { key: "soul",     label: "soul.md",     description: "Personality, tone and behavior",                                                                 fileKey: "SOUL" },
    { key: "user",     label: "user.md",     description: "Context about the humans this agent works with",                                                 fileKey: "USER" },
  ],
  hermes: [
    { key: "soul",     label: "soul.md",     description: "System prompt - Hermes reads this on every conversation",                                        hermesAction: "hermes-get-soul", hermesUpdateAction: "hermes-update-soul" },
    { key: "user",     label: "user.md",     description: "Context about the humans this agent works with",                                                 fileKey: "USER", runtimeDocFileName: "USER.md" },
  ],
};

export const DEFAULT_FILE_TABS = RUNTIME_FILE_TABS.openclaw;

export function getAgentProfileFileTabs(runtime: string | undefined): AgentProfileFileTabSpec[] {
  return runtime ? (RUNTIME_FILE_TABS[runtime] ?? DEFAULT_FILE_TABS) : DEFAULT_FILE_TABS;
}
