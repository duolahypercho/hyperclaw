import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import ToolChat from "$/components/Tool/Chat";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import {
  CLEAR_AGENT_CHAT_EVENT,
  RELOAD_AGENT_CHAT_EVENT,
  AGENT_CHAT_ACTIVE_EVENT,
} from "$/components/Home/widgets/AgentChatPanel";
import {
  CRON_CHAT_ACTIVE_EVENT,
  LOAD_CRON_SESSION_EVENT,
  NEW_CRON_CHAT_EVENT,
  REFRESH_CRON_CHAT_SESSIONS_EVENT,
} from "$/components/Home/widgets/AgentChatWidget";
import SessionHistoryDropdown, { type SessionItem } from "$/components/SessionHistoryDropdown";
import { SITE_URL } from "../../lib/site-url";
import { Plus, UserPlus, RefreshCw } from "lucide-react";
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
  const [hasChatActive, setHasChatActive] = React.useState(false);
  const [cronHeaderState, setCronHeaderState] = React.useState<{
    cronJobId: string | null;
    sessions: SessionItem[];
    loading: boolean;
  }>({ cronJobId: null, sessions: [], loading: false });

  React.useEffect(() => {
    const handleActiveChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ hasActive: boolean }>).detail;
      setHasChatActive(detail.hasActive);
    };
    window.addEventListener(AGENT_CHAT_ACTIVE_EVENT, handleActiveChanged);
    return () => window.removeEventListener(AGENT_CHAT_ACTIVE_EVENT, handleActiveChanged);
  }, []);

  React.useEffect(() => {
    const handleCronActive = (e: Event) => {
      const detail = (e as CustomEvent<{ cronJobId: string | null; sessions: SessionItem[]; loading: boolean }>).detail;
      if (detail) setCronHeaderState(detail);
    };
    window.addEventListener(CRON_CHAT_ACTIVE_EVENT, handleCronActive);
    return () => window.removeEventListener(CRON_CHAT_ACTIVE_EVENT, handleCronActive);
  }, []);

  const base = useEnsembleToolSchema("Chat");
  const appSchema = React.useMemo<AppSchema>(() => {
    const iconButtons = [
      ...(hasChatActive ? [{
        id: "chat-reload-current",
        icon: <RefreshCw />,
        tooltip: "Reload chat",
        ariaLabel: "Reload chat",
        size: "iconSm" as const,
        variant: "ghost" as const,
        onClick: () => window.dispatchEvent(new CustomEvent(RELOAD_AGENT_CHAT_EVENT)),
      }] : []),
      {
        id: "chat-new-agent",
        icon: <UserPlus />,
        tooltip: "Hire agent",
        ariaLabel: "Hire agent",
        size: "iconSm" as const,
        variant: "ghost" as const,
        onClick: () => window.dispatchEvent(new CustomEvent("ensemble:new-agent")),
      },
      {
        id: "chat-clear-current",
        icon: <Plus />,
        tooltip: "New chat",
        ariaLabel: "New chat",
        size: "iconSm" as const,
        variant: "ghost" as const,
        onClick: () => window.dispatchEvent(new CustomEvent(CLEAR_AGENT_CHAT_EVENT)),
      },
    ];

    if (cronHeaderState.cronJobId) {
      return {
        ...base,
        header: {
          ...base.header,
          rightUI: {
            type: "group" as const,
            items: [
              {
                type: "custom" as const,
                render: () => (
                  <SessionHistoryDropdown
                    sessions={cronHeaderState.sessions}
                    isLoading={cronHeaderState.loading}
                    onLoadSession={(key) =>
                      window.dispatchEvent(new CustomEvent(LOAD_CRON_SESSION_EVENT, { detail: { sessionKey: key } }))
                    }
                    onNewChat={() => window.dispatchEvent(new CustomEvent(NEW_CRON_CHAT_EVENT))}
                    onFetchSessions={() => window.dispatchEvent(new CustomEvent(REFRESH_CRON_CHAT_SESSIONS_EVENT))}
                  />
                ),
              },
              {
                type: "buttons" as const,
                buttons: iconButtons,
              },
            ],
          },
        },
      };
    }

    return {
      ...base,
      header: {
        ...base.header,
        rightUI: {
          type: "buttons" as const,
          buttons: iconButtons,
        },
      },
    };
  }, [base, hasChatActive, cronHeaderState]);

  return (
    <SEOProv schema={chatSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <ToolChat />
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
