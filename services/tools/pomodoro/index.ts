import { hyperchoApi } from "$/services/http.config";

// Type definitions
export interface CreateSessionRequest {
  cycleId?: string;
  pomoNumber: number;
  type: "work" | "break";
  plannedDuration: number; // in minutes or seconds
  metadata?: Record<string, any>;
}

export interface PauseResumeSessionRequest {
  sessionId: string;
  action: "pause" | "resume";
}

export interface EndSessionRequest {
  sessionId: string;
}

export interface CancelSessionRequest {
  sessionId: string;
}

export interface UpdateSessionRequest {
  sessionId: string;
  status?: "active" | "paused" | "completed" | "cancelled";
  endTime?: string | Date;
  breakTaken?: boolean;
  breakSessionId?: string;
  metadata?: Record<string, any>;
}

export interface GetSessionsQueryParams {
  cycleId?: string;
  type?: "work" | "break";
  status?: "active" | "paused" | "completed" | "cancelled";
  limit?: number;
  skip?: number;
}

// Create a new Pomodoro session
export const createSession = async (data: CreateSessionRequest) =>
  hyperchoApi.post(`/Tools/miniTool/pomodoro/create`, data);

// Pause or resume an active Pomodoro session
export const pauseResumeSession = async (data: PauseResumeSessionRequest) =>
  hyperchoApi.post(`/Tools/miniTool/pomodoro/pauseResume`, data);

// End a Pomodoro session
export const endSession = async (data: EndSessionRequest) =>
  hyperchoApi.post(`/Tools/miniTool/pomodoro/end`, data);

// Cancel a Pomodoro session
export const cancelSession = async (data: CancelSessionRequest) =>
  hyperchoApi.post(`/Tools/miniTool/pomodoro/cancel`, data);

// Update a Pomodoro session
export const updateSession = async (data: UpdateSessionRequest) =>
  hyperchoApi.patch(`/Tools/miniTool/pomodoro/update`, data);

// Get the active Pomodoro session
export const getActiveSession = async () =>
  hyperchoApi.get(`/Tools/miniTool/pomodoro/active`);

// Get all Pomodoro sessions with optional filters
export const getSessions = async (queryParams?: GetSessionsQueryParams) => {
  const params = new URLSearchParams();

  if (queryParams?.cycleId) params.append("cycleId", queryParams.cycleId);
  if (queryParams?.type) params.append("type", queryParams.type);
  if (queryParams?.status) params.append("status", queryParams.status);
  if (queryParams?.limit) params.append("limit", queryParams.limit.toString());
  if (queryParams?.skip) params.append("skip", queryParams.skip.toString());

  const queryString = params.toString();
  const url = `/Tools/miniTool/pomodoro/sessions${
    queryString ? `?${queryString}` : ""
  }`;

  return hyperchoApi.get(url);
};

// Get a specific Pomodoro session by ID
export const getSession = async (sessionId: string) =>
  hyperchoApi.get(`/Tools/miniTool/pomodoro/session/${sessionId}`);

// Get a specific Pomodoro cycle by ID
export const getCycle = async (cycleId: string) =>
  hyperchoApi.get(`/Tools/miniTool/pomodoro/cycle/${cycleId}`);
