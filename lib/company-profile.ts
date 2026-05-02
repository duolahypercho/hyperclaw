import { dashboardState } from "$/lib/dashboard-state";

export const COMPANY_PROFILE_KEY = "hyperclaw-company";
export const COMPANY_PROFILE_CHANGED_EVENT = "hyperclaw-company-changed";

export type CompanyProfile = {
  name: string;
  description: string;
  avatarDataUri?: string;
  createdAt?: string;
};

export function isCompanyProfile(value: unknown): value is CompanyProfile {
  if (!value || typeof value !== "object") return false;

  const profile = value as Record<string, unknown>;
  return (
    typeof profile.name === "string" &&
    typeof profile.description === "string" &&
    (profile.avatarDataUri === undefined || typeof profile.avatarDataUri === "string") &&
    (profile.createdAt === undefined || typeof profile.createdAt === "string")
  );
}

export function loadCompanyProfile(): CompanyProfile {
  try {
    const raw = dashboardState.get(COMPANY_PROFILE_KEY);
    if (!raw) return { name: "", description: "" };
    const parsed = JSON.parse(raw);
    return isCompanyProfile(parsed) ? parsed : { name: "", description: "" };
  } catch {
    return { name: "", description: "" };
  }
}

export function saveCompanyProfile(profile: CompanyProfile) {
  dashboardState.set(COMPANY_PROFILE_KEY, JSON.stringify(profile), { flush: true });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<CompanyProfile>(COMPANY_PROFILE_CHANGED_EVENT, {
        detail: profile,
      })
    );
  }
}
