import axios from "axios";
import { getAuthToken } from "$/lib/auth-token-cache";

// In Community Edition no remote backend is configured by default. Cloud builds
// set these env vars at build time so the dashboard can reach the hosted API.
// Calls made without a configured baseURL will resolve against the current
// origin and most will fail fast — features that need the cloud backend should
// gracefully degrade or hide their UI.

export const mediaApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_MEDIASERVICE_API || "",
  timeout: 12000,
});

export const creatorApi = axios.create({
  baseURL: "",
  timeout: 12000,
});

export const hyperchoApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_HYPERCHO_API || "",
  timeout: 12000,
});

/** Base URL for Copanion runtime (chat, agents, conversations). Use this so the local app does not call the remote backend. */
const COPANION_LOCAL_DEFAULT = "http://localhost:9979/Copanion";

export function getCopanionRuntimeUrl(): string {
  if (process.env.NEXT_PUBLIC_COPANION_RUNTIME_URL) {
    return process.env.NEXT_PUBLIC_COPANION_RUNTIME_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return COPANION_LOCAL_DEFAULT;
  }
  const base = (hyperchoApi.defaults.baseURL || "").replace(/\/$/, "");
  return base ? `${base}/Copanion` : COPANION_LOCAL_DEFAULT;
}

// Create a function to add auth interceptor to any axios instance
const addAuthInterceptor = (api: any) => {
  api.interceptors.request.use(async (config: any) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
};

export const entrepriseApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_HYPERCHO_API || "",
  timeout: 12000,
});

// Add auth interceptor to all APIs
addAuthInterceptor(mediaApi);
addAuthInterceptor(creatorApi);
addAuthInterceptor(hyperchoApi);
addAuthInterceptor(entrepriseApi);
