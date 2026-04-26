import React, { useMemo } from "react";
import { useRouter } from "next/router";
import { Pencil } from "lucide-react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import MissionControl from "$/components/ensemble/views/MissionControl";
import {
  MissionControlHeaderProvider,
  useMissionControlHeader,
} from "$/components/ensemble/shared/missionControlHeader";
import { getCompanyName } from "$/components/ensemble/shared/toolSchema";
import type { AppSchema, BreadcrumbItem } from "@OS/Layout/types";
import { SITE_URL } from "../../lib/site-url";

const seoSchema: SEOSchema = {
  title: "Workflows - Hyperclaw OS",
  description: "Live canvas of running AI agent workflows.",
  url: `${SITE_URL}/Tool/MissionControl`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

/**
 * Build the InteractApp schema from the active workflow published by the
 * Workflows control panel. The breadcrumb reads
 * `Hypercho / Workflows / <workflow>` and the right rail hosts the Edit action.
 */
function MissionControlPageInner() {
  const router = useRouter();
  const { activeProject } = useMissionControlHeader();

  const appSchema: AppSchema = useMemo(() => {
    const company = getCompanyName();
    const crumbs: BreadcrumbItem[] = [
      { label: company, onClick: () => router.push("/dashboard") },
      {
        label: "Workflows",
        onClick: () => router.push("/Tool/MissionControl"),
      },
    ];
    if (activeProject) {
      const label = activeProject.emoji
        ? `${activeProject.emoji} ${activeProject.name}`
        : activeProject.name;
      crumbs.push({ label });
    }

    const schema: AppSchema = {
      header: {
        title: "Workflows",
        centerUI: {
          type: "breadcrumbs",
          breadcrumbs: crumbs,
          className: "text-[13px] text-foreground",
        },
      },
      sidebar: undefined,
    };

    if (activeProject) {
      schema.header!.rightUI = {
        type: "buttons",
        buttons: [
          {
            id: "mission-control-edit",
            label: "Edit",
            icon: <Pencil />,
            variant: "outline",
            onClick: () =>
              router.push(`/Tool/ProjectEditor?id=${activeProject.id}`),
          },
        ],
      };
    }

    return schema;
  }, [activeProject, router]);

  return (
    <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
      <MissionControl />
    </InteractApp>
  );
}

const Index = () => {
  return (
    <CopanionProvider seoSchema={seoSchema}>
      <MissionControlHeaderProvider>
        <MissionControlPageInner />
      </MissionControlHeaderProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
