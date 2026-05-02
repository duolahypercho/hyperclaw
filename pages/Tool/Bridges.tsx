import React from "react";
import { Plus } from "lucide-react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, type SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { SITE_URL } from "../../lib/site-url";
import type { AppSchema } from "@OS/Layout/types";
import BridgesView from "$/components/bridges/BridgesView";

const bridgesSEOSchema: SEOSchema = {
  title: "Bridges - Hyperclaw OS",
  description:
    "Connect models, APIs and tools to your AI agents. Keys are stored encrypted on the connector daemon.",
  url: `${SITE_URL}/Tool/Bridges`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  const base = useEnsembleToolSchema("Bridges");
  const appSchema = React.useMemo<AppSchema>(
    () => ({
      ...base,
      header: {
        ...base.header,
        rightUI: {
          type: "buttons" as const,
          buttons: [
            {
              id: "bridges-connect",
              label: "Connect bridge",
              icon: <Plus />,
              variant: "secondary" as const,
              onClick: () =>
                window.dispatchEvent(new CustomEvent("bridges:open-catalog")),
            },
          ],
        },
      },
    }),
    [base],
  );

  return (
    <SEOProv schema={bridgesSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <BridgesView />
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
