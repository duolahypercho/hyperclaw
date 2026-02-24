import axios from "axios";
import { getAuthToken } from "$/lib/auth-token-cache";

export const mediaApi = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_MEDIASERVICE_API ||
    "https://mediaservice-jbb3-lbh.koyeb.app/",
  timeout: 12000,
});

export const creatorApi = axios.create({
  baseURL: "https://some-domain.com/api/",
  timeout: 12000,
});

export const hyperchoApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_HYPERCHO_API || "https://api.hypercho.com/",
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
  baseURL: process.env.NEXT_PUBLIC_HYPERCHO_API || "https://api.hypercho.com/",
  timeout: 12000,
});

// Add auth interceptor to all APIs
addAuthInterceptor(mediaApi);
addAuthInterceptor(creatorApi);
addAuthInterceptor(hyperchoApi);
addAuthInterceptor(entrepriseApi);
