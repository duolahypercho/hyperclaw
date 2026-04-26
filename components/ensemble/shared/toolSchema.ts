import { useMemo } from "react";
import { useRouter } from "next/router";
import type { AppSchema, BreadcrumbItem } from "@OS/Layout/types";
import { dashboardState } from "$/lib/dashboard-state";

/** Read the company name the user set during onboarding. */
export function getCompanyName(): string {
  try {
    const raw = dashboardState.get("hyperclaw-company");
    if (!raw) return "Ensemble";
    const parsed = JSON.parse(raw) as { name?: string };
    const name = parsed?.name?.trim();
    return name && name.length > 0 ? name : "Ensemble";
  } catch {
    return "Ensemble";
  }
}

/**
 * Build an InteractApp schema for an Ensemble-style tool page.
 *
 * Crumbs: company → /dashboard, section → sectionHref (or /Tool/<section> when
 * the visible label happens to match the route segment), title last.
 *
 * `sectionHref` lets the visible breadcrumb label diverge from the route path
 * — useful when the UI section label and the route segment differ (e.g. a
 * "Projects" breadcrumb that links to a custom path like "/Tool/Workflows").
 */
export function useEnsembleToolSchema(
  title: string,
  section?: string,
  sectionHref?: string,
): AppSchema {
  const router = useRouter();
  return useMemo(() => {
    const company = getCompanyName();
    const crumbs: BreadcrumbItem[] = [
      { label: company, onClick: () => router.push("/dashboard") },
    ];
    if (section) {
      const href = sectionHref ?? `/Tool/${section}`;
      crumbs.push({ label: section, onClick: () => router.push(href) });
    }
    crumbs.push({ label: title });
    return {
      header: {
        title,
        centerUI: {
          type: "breadcrumbs",
          breadcrumbs: crumbs,
          className: "text-[13px] text-foreground",
        },
      },
      sidebar: undefined,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, section, sectionHref]);
}
