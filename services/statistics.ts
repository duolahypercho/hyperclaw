import { hyperchoApi } from "$/services/http.config";
import { AxiosResponse } from "axios";

// Type definitions
export interface ContributionData {
  date: string;
  count: number;
}

export interface PomodoroHeatmapResponse {
  success?: boolean;
  data: ContributionData[];
}

// Get Pomodoro heatmap data for a specific year
export const getPomodoroHeatmap = async (
  year: number
): Promise<AxiosResponse<PomodoroHeatmapResponse>> => {
  return hyperchoApi.get(`/Statistics/pomodoro/heatmap/${year}`);
};

// Type definitions for Focus Timer
export interface HourlyFocusData {
  hour: number;
  minutes: number; // Focus minutes in this hour
}

export interface DailyFocusData {
  date: string;
  totalMinutes: number;
  hourlyData: HourlyFocusData[];
}

export interface FocusTimerResponse {
  success?: boolean;
  data: DailyFocusData[];
}

// Get Pomodoro focus timer data
export const getFocusTimer = async (): Promise<
  AxiosResponse<FocusTimerResponse>
> => {
  return hyperchoApi.get(`/Statistics/pomodoro/focus-timer`);
};
