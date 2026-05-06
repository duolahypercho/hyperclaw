import React, { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { Check, Loader2, Plus, RefreshCw, Save } from "lucide-react";
import { getLayout } from "../../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import AgentProfile, {
  type AgentProfileHeaderSaveState,
  type AgentProfileRunsHeaderState,
} from "$/components/ensemble/views/AgentProfile";
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
import { createEnsembleDmSessionKey } from "$/components/Home/widgets/gateway-chat/sessionKeys";
import { SITE_URL } from "../../../lib/site-url";
import type { AppSchema } from "@OS/Layout/types";
import type { RightContentLayoutType } from "@OS/Layout/RightContentLayout";

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
  const [headerSaveState, setHeaderSaveState] = React.useState<AgentProfileHeaderSaveState>({
    visible: false,
    saving: false,
    saved: false,
    onSave: async () => {},
  });
  const [runsHeaderState, setRunsHeaderState] = React.useState<AgentProfileRunsHeaderState>({
    visible: false,
    refreshing: false,
  });
  const [runsDetail, setRunsDetail] = React.useState<RightContentLayoutType | undefined>();
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

  const openAgentChat = useCallback((targetSessionKey?: string) => {
    if (!agentId) return;

    setPendingOpenAgent(agentId, agentRuntime);

    const sessionKey = targetSessionKey || createEnsembleDmSessionKey(agentId);
    const dispatchOpen = () =>
      dispatchOpenAgentChat(agentId, sessionKey, { runtime: agentRuntime });

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
      rightUI: headerSaveState.visible
        ? {
            type: "buttons",
            buttons: [
              {
                id: "agent-header-save",
                label: headerSaveState.saved ? "Saved" : headerSaveState.saving ? "Saving…" : "Save",
                icon: headerSaveState.saving
                  ? <Loader2 className="animate-spin" />
                  : headerSaveState.saved
                    ? <Check />
                    : <Save />,
                size: "sm",
                variant: headerSaveState.saved ? "success" : "default",
                disabled: headerSaveState.saving || headerSaveState.saved,
                tooltip: "Save agent changes",
                className: "border-emerald-500/70 bg-emerald-600 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.22)] hover:bg-emerald-500 hover:text-white",
                onClick: () => {
                  void headerSaveState.onSave();
                },
              },
            ],
          }
        : runsHeaderState.visible
          ? {
              type: "buttons",
              buttons: [
                {
                  id: "agent-runs-refresh",
                  label: "Refresh",
                  icon: <RefreshCw className={runsHeaderState.refreshing ? "animate-spin" : undefined} />,
                  size: "sm",
                  variant: "outline",
                  disabled: runsHeaderState.refreshing,
                  tooltip: "Refresh scheduled runs",
                  onClick: runsHeaderState.onRefresh,
                },
                {
                  id: "agent-runs-add",
                  label: "Add run",
                  icon: <Plus />,
                  size: "sm",
                  variant: "default",
                  tooltip: "Schedule a new run",
                  onClick: runsHeaderState.onAddRun,
                },
              ],
            }
          : undefined,
    },
    sidebar: undefined,
    detail: runsDetail,
  }), [agentName, company, headerSaveState, router, runsDetail, runsHeaderState]);

  React.useEffect(() => {
    setRunsDetail(undefined);
  }, [agentId]);

  return (
    <SEOProv schema={agentSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <AgentProfile
          agentId={agentId}
          onOpenChat={openAgentChat}
          onHeaderSaveStateChange={setHeaderSaveState}
          onRunsDetailChange={setRunsDetail}
          onRunsHeaderStateChange={setRunsHeaderState}
        />
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
