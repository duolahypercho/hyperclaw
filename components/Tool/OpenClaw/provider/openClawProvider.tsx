"use client";

import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { AppSchema, HeaderButtonsConfig } from "@OS/Layout/types";
import { Activity, Clock, Bot, Terminal, Cpu, RefreshCw, Zap, ScrollText, Send, MessageCircle, BarChart3 } from "lucide-react";
import { useOpenClaw } from "$/hooks/useOpenClaw";
import type { OpenClawAgent } from "$/types/electron";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  scheduleType: "cron" | "every";
  nextRun: string;
  lastRun: string | null;
  status: "ok" | "error" | "idle";
  target: string;
  agent: string;
}

function parseCronJobs(cronJobsText: string | null): CronJob[] {
  if (!cronJobsText) return [];
  
  const lines = cronJobsText.trim().split("\n");
  if (lines.length < 2) return [];
  
  const headerLine = lines[0];
  const dataLines = lines.slice(1);
  
  const idMatch = headerLine.match(/ID/);
  const nameMatch = headerLine.match(/Name/);
  const scheduleMatch = headerLine.match(/Schedule/);
  const nextMatch = headerLine.match(/Next/);
  const lastMatch = headerLine.match(/Last/);
  const statusMatch = headerLine.match(/Status/);
  const targetMatch = headerLine.match(/Target/);
  const agentMatch = headerLine.match(/Agent/);
  
  if (!idMatch || !nameMatch || !scheduleMatch) return [];
  
  const getIndex = (match: RegExpMatchArray | null, fallback = 200): number => match?.index ?? fallback;
  
  const results: CronJob[] = [];
  
  for (const line of dataLines) {
    if (!line.trim()) continue;
    
    try {
      const id = line.substring(getIndex(idMatch), getIndex(nameMatch, nameMatch?.index ?? 200)).trim();
      const name = line.substring(getIndex(nameMatch), getIndex(scheduleMatch, scheduleMatch?.index ?? 200)).trim();
      const scheduleRaw = line.substring(getIndex(scheduleMatch), getIndex(nextMatch, nextMatch?.index ?? 300)).trim();
      const nextRun = line.substring(getIndex(nextMatch), getIndex(lastMatch, lastMatch?.index ?? 400)).trim();
      const lastRunRaw = line.substring(getIndex(lastMatch), getIndex(statusMatch, statusMatch?.index ?? 450)).trim();
      const statusRaw = line.substring(getIndex(statusMatch), getIndex(targetMatch, targetMatch?.index ?? 500)).trim();
      const target = line.substring(getIndex(targetMatch), getIndex(agentMatch, agentMatch?.index ?? 550)).trim();
      const agent = line.substring(getIndex(agentMatch)).trim();
      
      const isCron = scheduleRaw.startsWith("cron");
      const schedule = isCron ? scheduleRaw.replace("cron ", "").trim() : scheduleRaw.replace("every ", "").trim();
      
      results.push({
        id,
        name,
        schedule,
        scheduleType: isCron ? "cron" : "every",
        nextRun,
        lastRun: lastRunRaw || null,
        status: statusRaw.toLowerCase() as "ok" | "error" | "idle",
        target,
        agent,
      });
    } catch (e) {
      continue;
    }
  }
  
  return results;
}

interface OpenClawContextType {
  appSchema: AppSchema;
  installed: boolean | null;
  version: string | null;
  status: string | null;
  gatewayHealthy: boolean | null;
  gatewayHealthError: string | null;
  cronJobs: string | null;
  parsedCronJobs: CronJob[];
  agents: OpenClawAgent[];
  logs: string | null;
  loading: boolean;
  errors: Record<string, string | null>;
  refreshAll: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  runCommand: (args: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  sendMessage: (params: {
    channel?: string;
    account?: string;
    target: string;
    message?: string;
    media?: string;
    replyTo?: string;
    silent?: boolean;
  }) => Promise<{ success: boolean; data?: string; error?: string }>;
}

const OpenClawContext = createContext<OpenClawContextType | null>(null);

export function useOpenClawTool() {
  const ctx = useContext(OpenClawContext);
  if (!ctx) throw new Error("useOpenClawTool must be used within OpenClawProvider");
  return ctx;
}

export function OpenClawProvider({ children }: { children: React.ReactNode }) {
  const openClaw = useOpenClaw(30000);
  const { refreshAll } = openClaw;

  const appSchema: AppSchema = useMemo(
    () => ({
      header: {
        title: "OpenClaw",
        icon: Cpu,
        rightUI: {
          type: "buttons",
          buttons: [
            {
              id: "openclaw-refresh",
              label: "Refresh",
              icon: <RefreshCw className="w-4 h-4" />,
              variant: "outline",
              className: "text-xs font-semibold",
              onClick: () => refreshAll(),
            },
          ],
        } as HeaderButtonsConfig,
      },
      sidebar: {
        sections: [
          {
            id: "openclaw-main",
            type: "default",
            items: [
              {
                id: "openclaw-bridge",
                title: "Bridge (Agent Tasks)",
                icon: Zap,
              },
              {
                id: "openclaw-send",
                title: "Send message",
                icon: Send,
              },
              {
                id: "openclaw-webchat",
                title: "Web Chat",
                icon: MessageCircle,
              },
              {
                id: "openclaw-usage",
                title: "Usage",
                icon: BarChart3,
              },
              {
                id: "openclaw-status",
                title: "Status",
                icon: Activity,
              },
              {
                id: "openclaw-cron",
                title: "Cron Jobs",
                icon: Clock,
              },
              {
                id: "openclaw-agents",
                title: "Agents",
                icon: Bot,
              },
              {
                id: "openclaw-terminal",
                title: "Run Command",
                icon: Terminal,
              },
              {
                id: "openclaw-logs",
                title: "Logs",
                icon: ScrollText,
              },
            ],
          },
        ],
      },
    }),
    [refreshAll]
  );

  const value = useMemo(
    () => ({
      appSchema,
      installed: openClaw.installed,
      version: openClaw.version,
      status: openClaw.status,
      gatewayHealthy: openClaw.gatewayHealthy,
      gatewayHealthError: openClaw.gatewayHealthError,
      cronJobs: openClaw.cronJobs,
      parsedCronJobs: parseCronJobs(openClaw.cronJobs),
      agents: openClaw.agents,
      logs: openClaw.logs,
      loading: openClaw.loading,
      errors: openClaw.errors,
      refreshAll: openClaw.refreshAll,
      fetchLogs: openClaw.fetchLogs,
      runCommand: openClaw.runCommand,
      sendMessage: openClaw.sendMessage,
    }),
    [appSchema, openClaw]
  );

  return (
    <OpenClawContext.Provider value={value}>{children}</OpenClawContext.Provider>
  );
}
