import { hyperchoApi } from "./http.config";

export interface NotificationState {
  storageKey: string;
  stateValue: string | number | null;
  timestamp: number;
}

export interface NotificationStateResponse {
  status: number;
  message?: string;
  error?: string;
  data?: NotificationState;
}

/**
 * Get notification state from the database
 */
export const getNotificationStateAPI = async (
  storageKey: string
): Promise<NotificationStateResponse> => {
  try {
    const response = await hyperchoApi.get(
      `/Copanion/NotificationState/${encodeURIComponent(storageKey)}`
    );
    return response.data;
  } catch (error: any) {
    // Return null state if not found (404) or other errors
    if (error.response?.status === 404) {
      return {
        status: 404,
        data: undefined,
      };
    }
    throw error;
  }
};

/**
 * Set notification state in the database
 */
export const setNotificationStateAPI = async (
  storageKey: string,
  stateValue: string | number | null
): Promise<NotificationStateResponse> => {
  return hyperchoApi.post(`/Copanion/NotificationState/`, {
    storageKey,
    stateValue,
    timestamp: Date.now(),
  });
};

/**
 * Get all notification states for the user (optional, for syncing)
 */
export const getAllNotificationStatesAPI = async (): Promise<
  NotificationStateResponse & { data?: NotificationState[] }
> => {
  return hyperchoApi.get(`/Copanion/NotificationState/`);
};
