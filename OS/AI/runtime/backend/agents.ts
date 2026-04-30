export interface Agent {
  id: string;
  name: string;
  description?: string;
}

export interface AgentsResponse {
  status: number;
  message: string;
  data: { agents: Agent[] };
}
