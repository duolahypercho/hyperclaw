import type { ParsedUrlQuery } from "querystring";

const PROJECT_QUERY_KEYS = ["projectId", "id"] as const;

export function buildMissionControlProjectHref(projectId: string): string {
  return `/Tool/MissionControl?projectId=${encodeURIComponent(projectId)}`;
}

export function getMissionControlProjectId(query: ParsedUrlQuery): string | null {
  for (const key of PROJECT_QUERY_KEYS) {
    const raw = query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}
