"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  formatUSD,
  formatTokens,
  EnsShell,
  Kpi,
  useEnsembleData,
  useEnsembleAgents,
  useLiveAgents,
  AgentCard,
  type LiveAgentRow,
} from "$/components/ensemble";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";

function groupByDepartment(rows: LiveAgentRow[]): Record<string, LiveAgentRow[]> {
  const out: Record<string, LiveAgentRow[]> = {};
  for (const row of rows) {
    const d = row.agent.department;
    if (!out[d]) out[d] = [];
    out[d].push(row);
  }
  return out;
}

export default function TeamRoster() {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const { activity } = useEnsembleData();
  const agents = useEnsembleAgents();
  const liveAgents = useLiveAgents(agents, activity);

  const running = liveAgents.filter((a) => a.state === "running").length;
  const idle = liveAgents.filter((a) => a.state === "idle").length;
  const errors = liveAgents.filter((a) => a.state === "error").length;
  const totalCost = useMemo(() => liveAgents.reduce((s, a) => s + a.costMonth, 0), [liveAgents]);
  const totalTokens = useMemo(() => liveAgents.reduce((s, a) => s + a.tokensMonth, 0), [liveAgents]);
  const totalSessions = useMemo(() => liveAgents.reduce((s, a) => s + a.sessions, 0), [liveAgents]);
  const byDept = useMemo(() => groupByDepartment(liveAgents), [liveAgents]);
  const deptCount = Object.keys(byDept).length;
  const existingForDialog = useMemo(
    () => agents.map((a) => ({ id: a.id, name: a.name, runtime: a.kind })),
    [agents]
  );

  const openAgent = (id: string) => router.push(`/Tool/Agent/${id}`);

  // Listen for header / navbar "new agent" events
  useEffect(() => {
    const onNewAgent = () => setAddOpen(true);
    window.addEventListener("ensemble:new-agent", onNewAgent);
    return () => window.removeEventListener("ensemble:new-agent", onNewAgent);
  }, []);

  return (
    <EnsShell>
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="ens-hero" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>
            The team
          </h1>
          <p className="ens-sub mt-1">
            {liveAgents.length} {liveAgents.length === 1 ? "agent" : "agents"} ·{" "}
            {deptCount} {deptCount === 1 ? "department" : "departments"} · 1 operator.
            Each one has a runtime, a role, and a spend limit.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="ens-grid-kpi mb-6">
        <Kpi
          label="Headcount"
          value={<>{liveAgents.length} <small style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-3)", marginLeft: 4 }}>agents</small></>}
          detail={`${running} running · ${idle} idle`}
        />
        <Kpi
          label="Spend · this month"
          value={formatUSD(totalCost)}
          detail={`across ${deptCount} dept${deptCount !== 1 ? "s" : ""}`}
        />
        <Kpi
          label="Tokens · this month"
          value={formatTokens(totalTokens)}
          detail={`${totalSessions} session${totalSessions !== 1 ? "s" : ""}`}
        />
        <Kpi
          label="Active now"
          value={<>{running} <small style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-3)", marginLeft: 4 }}>online</small></>}
          detail={errors > 0 ? `${idle} idle · ${errors} error${errors !== 1 ? "s" : ""}` : `${idle} idle`}
        />
      </div>

      {/* Departments */}
      {Object.entries(byDept).map(([dept, rows]) => (
        <div key={dept}>
          <div className="ens-dept-label">{dept}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
              marginBottom: 22,
            }}
          >
            {rows.map((row) => (
              <AgentCard key={row.agent.id} row={row} onClick={() => openAgent(row.agent.id)} />
            ))}
          </div>
        </div>
      ))}

      <AddAgentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingAgents={existingForDialog}
        onSuccess={(agentId) => router.push(`/Tool/Agent/${agentId}`)}
      />
    </EnsShell>
  );
}
