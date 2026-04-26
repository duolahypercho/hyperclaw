import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import EnsembleChat from "$/components/ensemble/views/EnsembleChat";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { SITE_URL } from "../../lib/site-url";
import { Plus, UserPlus } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";

const chatSEOSchema: SEOSchema = {
  title: "Chat - Hyperclaw OS",
  description:
    "Ensemble chat — rooms and DMs with every agent on your team. @mention for handoffs.",
  url: `${SITE_URL}/Tool/Chat`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  const base = useEnsembleToolSchema("Chat");
  const appSchema = React.useMemo<AppSchema>(() => ({
    ...base,
    header: {
      ...base.header,
      rightUI: {
        type: "buttons" as const,
        buttons: [
          {
            id: "chat-new-agent",
            label: "Hire agent",
            icon: <UserPlus />,
            variant: "secondary" as const,
            onClick: () =>
              window.dispatchEvent(new CustomEvent("ensemble:new-agent")),
          },
          {
            id: "chat-new-room",
            label: "New room",
            icon: <Plus />,
            variant: "secondary" as const,
            onClick: () =>
              window.dispatchEvent(new CustomEvent("ensemble:new-room")),
          },
        ],
      },
    },
  }), [base]);
  return (
    <CopanionProvider seoSchema={chatSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <EnsembleChat />
      </InteractApp>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
