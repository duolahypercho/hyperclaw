"use client";

import React, { useCallback, useMemo } from "react";
import { Play } from "lucide-react";
import { ProjectsProvider, useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { useUser } from "$/Providers/UserProv";
import {
  formatUSD,
  formatTokens,
  EnsShell,
  Section,
  Kpi,
  Chip,
  EnsButton,
  useEnsembleData,
  useLiveAgents,
  useEnsembleAgents,
  AgentCard,
  ActivityRow,
  UpNextRow,
  NeedsYouRow,
} from "$/components/ensemble";
import { OPEN_AGENT_CHAT_EVENT } from "$/components/Home/widgets/StatusWidget";

function greet(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function EnsembleHomeInner() {
  const { session } = useUser() as unknown as { session?: { user?: { name?: string; email?: string } } };
  const { projects } = useProjects();
  const {
    inboxItems,
    crons,
    logs,
    activity,
    totalSpendToday,
    status,
    refresh,
    resolveInboxItem,
  } = useEnsembleData();

  const firstName =
    session?.user?.name?.split(" ")[0] ||
    session?.user?.email?.split("@")[0] ||
    "there";

  // Real agents from the hub — falls back to seed if none are configured yet.
  const ensembleAgents = useEnsembleAgents();
  const liveAgents = useLiveAgents(ensembleAgents, activity);
  const running = liveAgents.filter((a) => a.state === "running");
  const totalMonthSpend = useMemo(
    () => liveAgents.reduce((s, a) => s + a.costMonth, 0),
    [liveAgents]
  );
  const totalTokens = useMemo(
    () => liveAgents.reduce((s, a) => s + a.tokensMonth, 0),
    [liveAgents]
  );

  const needsYou = inboxItems.slice(0, 4);
  const activityFeed = logs.slice(0, 6);
  const upNext = crons.slice(0, 4);
  const activeProjects = projects.filter((p) => p.status === "active").slice(0, 4);

  // Clicking an agent card opens that agent's chat by dispatching the same event
  // StatusWidget uses. GatewayChatWidget / Ensemble chat both listen for it.
  const openAgentChat = useCallback((agentId: string) => {
    window.dispatchEvent(
      new CustomEvent(OPEN_AGENT_CHAT_EVENT, { detail: { agentId } })
    );
  }, []);

  return (
    <EnsShell>
      {/* Hero */}
      <div className="mb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-xl font-medium tracking-tight">{greet()}, {firstName}.</h1>
          <p className="ens-sub mt-2">
            {running.length} {running.length === 1 ? "agent" : "agents"} running ·{" "}
            {needsYou.length} {needsYou.length === 1 ? "item" : "items"} need you ·{" "}
            today {formatUSD(totalSpendToday || 0)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EnsButton variant="ghost" onClick={refresh} disabled={status === "loading"}>
            {status === "loading" ? "Syncing…" : "Refresh"}
          </EnsButton>
          <EnsButton variant="accent">
            <Play size={12} /> Run a workflow
          </EnsButton>
        </div>
      </div>

      {/* Row 1 — Needs you · Live now · This month */}
      <div className="ens-grid-3 mb-5">
        <Section title="Needs you" action={<Chip>{needsYou.length}</Chip>}>
          {needsYou.length === 0 ? (
            <div className="ens-sub">Inbox is clear. 🎉</div>
          ) : (
            needsYou.map((item) => (
              <NeedsYouRow key={item.id} item={item} onResolve={resolveInboxItem} />
            ))
          )}
        </Section>

        <Section title="Live now">
          {running.length === 0 ? (
            <div className="ens-sub">No agents running.</div>
          ) : (
            running.map((row) => (
              <AgentCard
                key={row.agent.id}
                row={row}
                variant="compact"
                onClick={() => openAgentChat(row.agent.id)}
              />
            ))
          )}
          <hr className="ens-divider" />
          <div className="flex items-center justify-between">
            <div className="ens-sh">Idle</div>
            <div className="ens-sub">{Math.max(0, liveAgents.length - running.length)}</div>
          </div>
        </Section>

        <Section title="This month">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Spend" value={formatUSD(totalMonthSpend)} detail={`today ${formatUSD(totalSpendToday || 0)}`} />
            <Kpi label="Tokens" value={formatTokens(totalTokens)} detail={`${liveAgents.length} ${liveAgents.length === 1 ? "agent" : "agents"}`} />
            <Kpi label="Workflows" value={projects.length} detail={`${activeProjects.length} active`} />
            <Kpi label="Queue" value={crons.length} detail={`${needsYou.length} pending`} />
          </div>
        </Section>
      </div>

      {/* Row 2 — Activity + Up next */}
      <div className="ens-grid-2 mb-5">
        <Section title="Activity" action={<span className="ens-sub">last {activityFeed.length} events</span>}>
          {activityFeed.length === 0 ? (
            <div className="ens-sub">No recent activity from agents.</div>
          ) : (
            activityFeed.map((log, i) => (
              <ActivityRow
                key={i}
                ts={log.ts}
                agentId={log.agent_id}
                message={log.message}
                meta={log.level}
              />
            ))
          )}
        </Section>

        <Section title="Up next" action={<span className="ens-sub">scheduled</span>}>
          {upNext.length === 0 ? (
            <div className="ens-sub">Nothing scheduled.</div>
          ) : (
            upNext.map((c) => <UpNextRow key={c.id || c.name} cron={c} />)
          )}
        </Section>
      </div>

      {/* Row 3 — Team + Pinned workflows */}
      <div className="ens-grid-2">
        <Section title="Team" action={<span className="ens-sub">{liveAgents.length} {liveAgents.length === 1 ? "agent" : "agents"}</span>}>
          {liveAgents.length === 0 ? (
            <div className="ens-sub">No agents configured. Finish onboarding to add your team.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {liveAgents.map((row) => (
                <AgentCard
                  key={row.agent.id}
                  row={row}
                  onClick={() => openAgentChat(row.agent.id)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Pinned workflows">
          {activeProjects.length === 0 ? (
            <div className="ens-sub">No active workflows yet.</div>
          ) : (
            activeProjects.map((p) => (
              <div key={p.id} className="ens-row" style={{ gridTemplateColumns: "32px 1fr auto" }}>
                <div className="text-xl">{p.emoji || "📦"}</div>
                <div>
                  <div className="who" style={{ fontWeight: 500 }}>{p.name}</div>
                  <div className="meta">{p.description || "—"}</div>
                </div>
                <Chip active>{p.status}</Chip>
              </div>
            ))
          )}
        </Section>
      </div>
    </EnsShell>
  );
}

export default function EnsembleHome() {
  return (
    <ProjectsProvider>
      <EnsembleHomeInner />
    </ProjectsProvider>
  );
}
