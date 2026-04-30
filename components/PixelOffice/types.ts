export type AgentStatus = "working" | "idle";

/** Optional labels for rooms and whiteboard; all dynamic. */
export interface RoomLabels {
  conference?: string;
  boss?: string;
  kitchen?: string;
  lounge?: string;
  whiteboard?: string;
  meetingRoom?: string;
  gym?: string;
  bathroom?: string;
}

export interface EmployeeStatus {
  id: string;
  name: string;
  status: AgentStatus;
  /** Current task label from bridge (e.g. cron job name, role, or "Idle"). */
  currentTask?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  shirtColor: string;
  hairColor: string;
  isBoss: boolean;
  deskIndex: number;
  deskItem: string;
}

const SHIRT_COLORS = [
  "#ec4899", "#3b82f6", "#a855f7", "#f97316", "#22c55e",
  "#06b6d4", "#8b5cf6", "#ef4444", "#eab308", "#f43f5e",
  "#14b8a6", "#a16207",
];

/** Build AgentConfig[] from bridge get-team response. First agent = boss. */
export function buildAgentsFromTeam(team: { id: string; name: string; status?: string }[]): AgentConfig[] {
  if (!team.length) return getDefaultAgents();
  return team.map((a, i) => {
    const isBoss = i === 0;
    const deskIndex = isBoss ? -1 : i - 1;
    const colorIndex = i % SHIRT_COLORS.length;
    return {
      id: a.id,
      name: (a.name || a.id).length > 12 ? (a.name || a.id).slice(0, 10) + "\u2026" : (a.name || a.id),
      shirtColor: SHIRT_COLORS[colorIndex],
      hairColor: "#1f2937",
      isBoss,
      deskIndex,
      deskItem: isBoss ? "none" : "globe",
    };
  });
}

function getDefaultAgents(): AgentConfig[] {
  return [
    { id: "main", name: "", shirtColor: "#ec4899", hairColor: "#1f2937", isBoss: true, deskIndex: -1, deskItem: "none" },
    { id: "agent-1", name: "", shirtColor: "#3b82f6", hairColor: "#1f2937", isBoss: false, deskIndex: 0, deskItem: "globe" },
    { id: "agent-2", name: "", shirtColor: "#a855f7", hairColor: "#1f2937", isBoss: false, deskIndex: 1, deskItem: "books" },
  ];
}
