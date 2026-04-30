export interface SlashCommand {
  name: string; // e.g. "/clear"
  description: string; // e.g. "Clear chat history"
  icon: string; // lucide icon name as string, e.g. "Trash2"
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/new", description: "Clear current session history (alias)", icon: "Plus" },
  { name: "/clear", description: "Clear current session history", icon: "Trash2" },
  { name: "/stop", description: "Stop AI generation", icon: "Square" },
  { name: "/export", description: "Export chat as markdown", icon: "Download" },
  { name: "/reload", description: "Reload chat history", icon: "RefreshCw" },
];
