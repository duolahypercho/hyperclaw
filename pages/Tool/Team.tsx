import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import TeamRoster from "$/components/ensemble/views/TeamRoster";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { SITE_URL } from "../../lib/site-url";
import { UserPlus } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";

const teamSEOSchema: SEOSchema = {
  title: "Team - Hyperclaw OS",
  description: "Your ensemble of AI employees. One runtime, one role, one spend limit each.",
  url: `${SITE_URL}/Tool/Team`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  const base = useEnsembleToolSchema("Team");
  const appSchema = React.useMemo<AppSchema>(() => ({
    ...base,
    header: {
      ...base.header,
      rightUI: {
        type: "buttons" as const,
        buttons: [
          {
            id: "team-new-agent",
            label: "Hire agent",
            icon: <UserPlus />,
            variant: "secondary" as const,
            onClick: () =>
              window.dispatchEvent(new CustomEvent("ensemble:new-agent")),
          },
        ],
      },
    },
  }), [base]);

  return (
    <SEOProv schema={teamSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <TeamRoster />
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
