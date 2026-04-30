import React, { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import AgentProfile from "$/components/ensemble/views/AgentProfile";
import { getCompanyName } from "$/components/ensemble/shared/toolSchema";
import {
  useEnsembleAgents,
  findEnsembleAgent,
  getAgent,
  useEnsembleData,
  useLiveAgents,
} from "$/components/ensemble";
import { useAgentIdentity } from "$/hooks/useAgentIdentity";
import { resolveAgentProfileDisplay } from "$/components/ensemble/views/agent-profile-display";
import { dispatchOpenAgentChat, setPendingOpenAgent } from "$/components/Home/widgets/StatusWidget";
import { SITE_URL } from "../../../lib/site-url";
import type { AppSchema } from "@OS/Layout/types";

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
  const agentId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] ?? "" : "";

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
  const liveRow = useMemo(
    () => liveAgents.find((row) => row.agent.id === agentId),
    [liveAgents, agentId],
  );
  const agentRuntime = liveRow?.agent.kind ?? agent?.kind;

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
    },
    sidebar: undefined,
  }), [agentName, company, router]);

  return (
    <SEOProv schema={agentSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <AgentProfile agentId={agentId} onOpenChat={openAgentChat} />
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
