import React, { useMemo } from "react";
import { useRouter } from "next/router";
import {
  PanelRight,
  PanelRightClose,
  Pencil,
  Search,
} from "lucide-react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import MissionControl from "$/components/ensemble/views/MissionControl";
import {
  MissionControlHeaderProvider,
  useMissionControlHeader,
} from "$/components/ensemble/shared/missionControlHeader";
import { getCompanyName } from "$/components/ensemble/shared/toolSchema";
import type {
  AppSchema,
  BreadcrumbItem,
  HeaderButton,
} from "@OS/Layout/types";
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
  const { activeProject, actions } = useMissionControlHeader();

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
        className: "mission-control-site-header",
        centerUI: {
          type: "group",
          className: "min-w-0 gap-2",
          items: [
            {
              type: "breadcrumbs",
              breadcrumbs: crumbs,
              className: "text-[13px]",
            },
            {
              type: "custom",
              render: () => (
                <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
                  {actions.runStatus && (
                    <span className="mission-control-header-pill">
                      <span className="mission-control-header-dot" />
                      {actions.runStatus}
                    </span>
                  )}
                  {actions.runCost && (
                    <span className="mission-control-header-pill">
                      {actions.runCost} / run
                    </span>
                  )}
                  {actions.monthlyCost && (
                    <span className="mission-control-header-pill">
                      {actions.monthlyCost} mo
                    </span>
                  )}
                </div>
              ),
            },
          ],
        },
      },
      sidebar: undefined,
    };

    if (activeProject) {
      const buttons: HeaderButton[] = [];

      if (actions.onConfigure) {
        buttons.push({
          id: "mission-control-edit",
          label: "Edit",
          ariaLabel: "Edit workflow",
          tooltip: "Open this workflow in the editor",
          icon: <Pencil />,
          variant: "ghost",
          onClick: () => actions.onConfigure?.(),
        });
      }

      buttons.push({
        id: "mission-control-find",
        label: "Find",
        ariaLabel: "Find on canvas",
        tooltip: "Search or find inside Mission Control",
        icon: <Search />,
        variant: "ghost",
        onClick: () => actions.onFind?.(),
      });

      if (actions.onToggleInspector) {
        const open = actions.inspectorOpen ?? true;
        buttons.push({
          id: "mission-control-toggle-inspector",
          ariaLabel: open ? "Hide workflow inspector" : "Show workflow inspector",
          tooltip: open
            ? "Hide the workflow inspector"
            : "Show the workflow inspector",
          icon: open ? <PanelRightClose /> : <PanelRight />,
          // Mirror the Edit canvas / Done pressed-state pattern: solid when
          // the panel is visible, outlined when collapsed.
          variant: open ? "secondary" : "ghost",
          onClick: () => actions.onToggleInspector?.(),
        });
      }

      schema.header!.rightUI = {
        type: "buttons",
        buttons,
      };
    }

    return schema;
  }, [activeProject, actions, router]);

  return (
    <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
      <MissionControl />
    </InteractApp>
  );
}

const Index = () => {
  return (
    <SEOProv schema={seoSchema}>
      <MissionControlHeaderProvider>
        <MissionControlPageInner />
      </MissionControlHeaderProvider>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
