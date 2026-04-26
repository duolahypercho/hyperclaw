import React, { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import AgentProfile, { OPEN_AGENT_FIRE_EVENT } from "$/components/ensemble/views/AgentProfile";
import { getCompanyName } from "$/components/ensemble/shared/toolSchema";
import {
  useEnsembleAgents,
  findEnsembleAgent,
  getAgent,
  useAgentStatus,
  useEnsembleData,
  useLiveAgents,
} from "$/components/ensemble";
import { useAgentIdentity } from "$/hooks/useAgentIdentity";
import { resolveAgentProfileDisplay } from "$/components/ensemble/views/agent-profile-display";
import { dispatchOpenAgentChat, setPendingOpenAgent } from "$/components/Home/widgets/StatusWidget";
import { SITE_URL } from "../../../lib/site-url";
import type { AppSchema } from "@OS/Layout/types";
import { Flame, MessageSquare } from "lucide-react";

const agentSEOSchema: SEOSchema = {
  title: "Agent - Hyperclaw OS",
  description: "Identity, soul, memory, and cost for a single AI employee.",
  url: `${SITE_URL}/Tool/Agent`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "noindex,nofollow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  const router = useRouter();
  const rawId = router.query.id;
  const agentId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const ensembleAgents = useEnsembleAgents();
  const { activity } = useEnsembleData();
  const liveAgents = useLiveAgents(ensembleAgents, activity);
  const identity = useAgentIdentity(agentId);
  const agent = useMemo(() => {
    if (!agentId) return undefined;
    return findEnsembleAgent(ensembleAgents, agentId) ?? getAgent(agentId);
  }, [ensembleAgents, agentId]);
  const agentName = useMemo(() => {
    if (!agentId) return "Agent";
    return resolveAgentProfileDisplay(agent, identity).name;
  }, [agent, agentId, identity]);
  const agentFirstName = agentName.split(" ")[0] || "Agent";
  const liveRow = useMemo(
    () => liveAgents.find((row) => row.agent.id === agentId),
    [liveAgents, agentId],
  );
  const agentRuntime = liveRow?.agent.kind ?? agent?.kind;
  const agentStatus = agent && "status" in agent ? agent.status : undefined;
  const agentState = agent && "seedState" in agent ? agent.seedState : undefined;
  const { state } = useAgentStatus(agentId, { status: agentStatus, state: liveRow?.state ?? agentState });
  const isHiring = state === "hiring";

  const openAgentChat = useCallback(() => {
    if (!agentId) return;

    setPendingOpenAgent(agentId, agentRuntime);

    const dispatchOpen = () =>
      dispatchOpenAgentChat(agentId, undefined, { runtime: agentRuntime });

    let dispatched = false;
    const onComplete = () => {
      router.events.off("routeChangeComplete", onComplete);
      if (!dispatched) {
        dispatched = true;
        setTimeout(dispatchOpen, 200);
      }
    };

    router.events.on("routeChangeComplete", onComplete);
    setTimeout(() => {
      router.events.off("routeChangeComplete", onComplete);
      if (!dispatched) {
        dispatched = true;
        dispatchOpen();
      }
    }, 800);

    router.push("/Tool/Chat");
  }, [agentId, agentRuntime, router]);

  const openFireDialog = useCallback(() => {
    if (!agentId) return;
    window.dispatchEvent(
      new CustomEvent(OPEN_AGENT_FIRE_EVENT, { detail: { agentId } }),
    );
  }, [agentId]);

  const company = getCompanyName();

  const appSchema = useMemo<AppSchema>(() => ({
    header: {
      centerUI: {
        type: "breadcrumbs",
        breadcrumbs: [
          { label: company, onClick: () => router.push("/dashboard") },
          { label: "Team", onClick: () => router.push("/Tool/Team") },
          { label: agentName },
        ],
        className: "text-[13px] text-foreground",
      },
      rightUI: {
        type: "buttons",
        buttons: [
          {
            id: "agent-chat",
            label: isHiring ? "Hiring…" : `Chat With ${agentFirstName}`,
            icon: isHiring ? undefined : <MessageSquare fill="currentColor" />,
            variant: "default",
            size: "xs",
            className: "gap-1 [&_svg]:mr-1",
            disabled: !agentId || isHiring,
            onClick: openAgentChat,
          },
          {
            id: "agent-fire",
            label: "Fire",
            icon: <Flame fill="currentColor" />,
            variant: "destructive",
            size: "xs",
            className: "gap-1 [&_svg]:mr-1",
            disabled: !agent,
            onClick: openFireDialog,
          },
        ],
      },
    },
    sidebar: undefined,
  }), [agent, agentFirstName, agentId, agentName, company, isHiring, openAgentChat, openFireDialog, router]);

  return (
    <CopanionProvider seoSchema={agentSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <AgentProfile agentId={agentId} />
      </InteractApp>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
