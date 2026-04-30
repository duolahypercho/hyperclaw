export interface Room {
  id: string;
  name: string;
  kind: "room" | "dm";
  members: string[]; // agent ids
  description?: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  author: string;        // agent id or "me"
  text: string;
  ts: number;
  mentions?: string[];
}

