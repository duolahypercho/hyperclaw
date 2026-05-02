export interface SlashCommand {
  name: string; // e.g. "/clear"
  description: string; // e.g. "Clear visible chat"
  icon: string; // lucide icon name as string, e.g. "Trash2"
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/new", description: "Start a new chat session (history is preserved)", icon: "Plus" },
  { name: "/clear", description: "Clear the visible chat view (history is preserved)", icon: "Trash2" },
  { name: "/stop", description: "Stop AI generation", icon: "Square" },
  { name: "/export", description: "Export chat as markdown", icon: "Download" },
  { name: "/reload", description: "Reload chat history", icon: "RefreshCw" },
];
