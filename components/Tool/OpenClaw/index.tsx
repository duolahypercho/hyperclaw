"use client";

import React from "react";
import { motion } from "framer-motion";
import { Activity, Clock, Bot, Terminal, WifiOff, RefreshCw, Loader2, Zap, ListTodo, Bell, CheckCircle2, Circle, Home, ScrollText, Send, MessageCircle, ExternalLink } from "lucide-react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InteractApp } from "@OS/InteractApp";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import { OpenClawProvider, useOpenClawTool } from "./provider/openClawProvider";
import {
  OutputBlock,
  AgentCard,
  CommandRunner,
} from "$/components/OpenClawDashboard";
import { useHyperClawBridge } from "$/hooks/useHyperClawBridge";
import type { HyperClawTask } from "$/types/electron";
import { Bug } from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function StatusPanel() {
  const router = useRouter();
  const { status, errors, installed, loading, refreshAll, gatewayHealthy, gatewayHealthError } = useOpenClawTool();

  if (installed === false) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <motion.div {...fadeUp} className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <WifiOff className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">OpenClaw Not Found</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            OpenClaw CLI is not installed or not in your PATH. Install it first, then relaunch the app.
          </p>
          <pre className="text-xs font-mono bg-background/60 border border-border/50 rounded-lg p-3 text-left text-muted-foreground">
            curl -fsSL https://openclaw.ai/install.sh | bash
          </pre>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshAll()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push("/")} className="gap-1.5">
              <Home className="w-3.5 h-3.5" />
              Back to home
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <motion.div {...fadeUp} className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Connecting to OpenClaw...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-4">
        {gatewayHealthy !== null && (
          <Card className={gatewayHealthy ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}>
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                {gatewayHealthy ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">Gateway: Healthy</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-5 w-5 text-destructive shrink-0" />
                    <span className="text-sm font-medium text-destructive">Gateway: Unreachable</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {gatewayHealthy
                  ? "Gateway at ws://127.0.0.1:18789 (or your configured port) is reachable via OpenClaw CLI."
                  : "Start the gateway (e.g. openclaw gateway run) or check port/token in ~/.openclaw/openclaw.json."}
              </p>
              {!gatewayHealthy && gatewayHealthError && (
                <p className="text-xs text-destructive/90 mt-2 font-mono break-words">
                  {gatewayHealthError}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              openclaw status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OutputBlock content={status} error={errors.status} />
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function CronPanel() {
  const { cronJobs, errors, installed } = useOpenClawTool();
  if (installed === false) return null;
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              openclaw cron list
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OutputBlock content={cronJobs} error={errors.cron} />
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function AgentsPanel() {
  const { agents, errors, installed } = useOpenClawTool();
  if (installed === false) return null;
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-3">
        {agents.length === 0 && !errors.agents ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Bot className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No agents found in{" "}
                <code className="text-xs bg-muted rounded px-1 py-0.5">~/.openclaw/workspace</code>
              </p>
            </CardContent>
          </Card>
        ) : errors.agents ? (
          <OutputBlock content={null} error={errors.agents} />
        ) : (
          agents.map((agent) => <AgentCard key={agent.name} agent={agent} />)
        )}
      </div>
    </ScrollArea>
  );
}

function WebChatPanel() {
  const { installed } = useOpenClawTool();
  const [connect, setConnect] = React.useState<{
    gatewayUrl: string;
    token: string | null;
    error: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const api = typeof window !== "undefined" ? (window as unknown as { electronAPI?: { openClaw?: { getGatewayConnectUrl?: () => Promise<{ gatewayUrl: string; token: string | null; error: string | null }> } } }).electronAPI?.openClaw : undefined;
    if (api?.getGatewayConnectUrl) {
      api.getGatewayConnectUrl().then((r) => {
        setConnect({ gatewayUrl: r.gatewayUrl, token: r.token, error: r.error });
        setLoading(false);
      }).catch(() => {
        setConnect({ gatewayUrl: "http://127.0.0.1:18789", token: null, error: "Failed to read config" });
        setLoading(false);
      });
    } else {
      setConnect({ gatewayUrl: "http://127.0.0.1:18789", token: null, error: null });
      setLoading(false);
    }
  }, []);

  if (installed === false) return null;
  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading gateway URL…</span>
      </div>
    );
  }

  const iframeSrc = connect?.token
    ? `${connect.gatewayUrl}/?token=${encodeURIComponent(connect.token)}`
    : connect?.gatewayUrl ?? "http://127.0.0.1:18789";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <p className="text-xs text-muted-foreground">
          OpenClaw Control UI — chat and send messages like in the browser. Connects to the gateway with your config token.
        </p>
        <a
          href={connect?.gatewayUrl ?? "http://127.0.0.1:18789"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in browser
        </a>
      </div>
      {connect?.error && (
        <div className="mx-4 mt-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {connect.error}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        <iframe
          title="OpenClaw Control UI"
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-0 rounded-b-lg"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}

function UsagePanel() {
  const { installed } = useOpenClawTool();
  const [connect, setConnect] = React.useState<{
    gatewayUrl: string;
    token: string | null;
    error: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const api = typeof window !== "undefined" ? (window as unknown as { electronAPI?: { openClaw?: { getGatewayConnectUrl?: () => Promise<{ gatewayUrl: string; token: string | null; error: string | null }> } } }).electronAPI?.openClaw : undefined;
    if (api?.getGatewayConnectUrl) {
      api.getGatewayConnectUrl().then((r) => {
        setConnect({ gatewayUrl: r.gatewayUrl, token: r.token, error: r.error });
        setLoading(false);
      }).catch(() => {
        setConnect({ gatewayUrl: "http://127.0.0.1:18789", token: null, error: "Failed to read config" });
        setLoading(false);
      });
    } else {
      setConnect({ gatewayUrl: "http://127.0.0.1:18789", token: null, error: null });
      setLoading(false);
    }
  }, []);

  if (installed === false) return null;
  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading gateway URL…</span>
      </div>
    );
  }

  const usageUrl = connect?.gatewayUrl ?? "http://127.0.0.1:18789";
  const iframeSrc = connect?.token
    ? `${usageUrl}/usage?token=${encodeURIComponent(connect.token)}`
    : `${usageUrl}/usage`;

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 shrink-0">
        <p className="text-xs text-muted-foreground">
          Model usage and cost — provider usage snapshot, session costs, and usage logs from the gateway.
        </p>
        <a
          href={`${usageUrl}/usage`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in browser
        </a>
      </div>
      {connect?.error && (
        <div className="mx-4 mt-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 shrink-0">
          {connect.error}
        </div>
      )}
      <div className="flex-1 min-h-[280px] relative">
        <iframe
          title="OpenClaw Usage"
          src={iframeSrc}
          className="absolute inset-0 w-full h-full min-h-[280px] border-0 rounded-b-lg"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}

function SendMessagePanel() {
  const { sendMessage, installed, loading } = useOpenClawTool();
  const [channel, setChannel] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [media, setMedia] = React.useState("");
  const [result, setResult] = React.useState<{ success: boolean; data?: string; error?: string } | null>(null);
  const [sending, setSending] = React.useState(false);
  // #region agent log
  React.useEffect(() => {
    if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "OpenClaw/index.tsx:SendMessagePanel mount", message: "SendMessagePanel mounted", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
  }, []);
  // #endregion

  if (installed === false) {
    return (
      <ScrollArea className="h-full w-full">
        <div className="p-4">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-6 text-center">
              <Send className="w-10 h-10 text-amber-500/80 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Install OpenClaw CLI to send messages. Run:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">curl -fsSL https://openclaw.ai/install.sh | bash</code>
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  // Only show full-page loading during initial check (installed === null).
  // Once we know installed state, keep the form visible so background refresh (e.g. 30s interval) doesn't wipe the UI.
  if (installed === null && loading) {
    return (
      <div className="w-full h-full flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  const handleSend = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    const t = target.trim();
    const m = message.trim();
    const med = media.trim();
    if (!t) {
      setResult({ success: false, error: "Target is required (e.g. +15555550123, @user, channel:123)." });
      return;
    }
    if (!m && !med) {
      setResult({ success: false, error: "Message or media is required." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await sendMessage({
        channel: channel.trim() || undefined,
        target: t,
        message: m || undefined,
        media: med || undefined,
      });
      setResult(res);
      if (res.success) setMessage("");
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed to send message",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Refreshing status…</span>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Send message via gateway
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Uses <code className="rounded bg-muted px-1">openclaw message send</code>. Target format depends on channel (e.g. WhatsApp: E.164; Telegram: @user or chat id; Discord: channel:123).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-xs">Channel (optional if only one configured)</Label>
              <Input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="e.g. whatsapp, telegram, discord"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Target (required)</Label>
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="+15555550123 or @user or channel:123"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Text to send"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Media path or URL (optional)</Label>
              <Input
                value={media}
                onChange={(e) => setMedia(e.target.value)}
                placeholder="/path/to/file.png or https://..."
                className="font-mono text-sm"
              />
            </div>
            <Button type="button" onClick={handleSend} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </Button>
            {result && (
              <div className={result.success ? "text-sm text-green-600 dark:text-green-400" : "text-sm text-destructive"}>
                {result.success ? result.data ?? "Sent." : result.error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function TerminalPanel() {
  const { runCommand, installed } = useOpenClawTool();
  if (installed === false) return null;
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Run OpenClaw Command
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CommandRunner runCommand={runCommand} />
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function LogsPanel() {
  const { logs, errors, installed, fetchLogs } = useOpenClawTool();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (installed && logs === null && !errors.logs) fetchLogs();
  }, [installed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setLoading(true);
    await fetchLogs();
    setLoading(false);
  };

  if (installed === false) return null;
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-primary" />
                Gateway logs
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="h-7 text-xs">
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tail of <code className="rounded bg-muted px-1">openclaw logs</code> (last 500 lines, plain)
            </p>
          </CardHeader>
          <CardContent>
            <OutputBlock content={logs} error={errors.logs} />
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function BridgeTaskRow({ task, onUpdate }: { task: HyperClawTask; onUpdate: (id: string, patch: Partial<HyperClawTask>) => Promise<unknown> }) {
  const isDone = task.status === "completed" || task.status === "cancelled";
  return (
    <motion.div
      {...fadeUp}
      className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/50 p-3 transition-colors hover:bg-card/80"
    >
      <button
        type="button"
        onClick={() => onUpdate(task.id, { status: isDone ? "pending" : "completed" })}
        className="mt-0.5 shrink-0 rounded-full text-muted-foreground hover:text-primary"
        aria-label={isDone ? "Reopen" : "Complete"}
      >
        {isDone ? <Circle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[10px] font-normal">
            {task.priority}
          </Badge>
          {task.agent && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {task.agent}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(task.updatedAt).toLocaleString()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function BridgePanelContent() {
  const { tasks, events, loading, fetchTasks, updateTask, addTask, debug } = useHyperClawBridge(8000);
  const [addSampleLoading, setAddSampleLoading] = React.useState(false);
  const [addSampleError, setAddSampleError] = React.useState<string | null>(null);

  const handleAddSampleTask = async () => {
    setAddSampleError(null);
    setAddSampleLoading(true);
    try {
      await addTask({
        title: "Sample task (from HyperClaw UI)",
        priority: "medium",
        status: "pending",
      });
    } catch (e) {
      setAddSampleError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddSampleLoading(false);
    }
  };

  const d = debug ?? {
    bridgeType: "api" as const,
    lastError: null,
    lastFetchAt: null,
    taskCount: 0,
    rawTasksCheck: "empty",
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">OpenClaw Bridge</h2>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading bridge data...</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-6">
        {/* Visible header so you always know you're on Bridge */}
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">OpenClaw Bridge</h2>
        </div>

        {/* Debug card */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bug className="h-4 w-4 text-amber-500" />
              Bridge debug
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Environment and last fetch — use this to see why tasks might be empty.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Bridge:</span>
              <span className={d.bridgeType === "electron" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
                {d.bridgeType}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Task count:</span>
              <span>{d.taskCount}</span>
              <span className="text-muted-foreground">({d.rawTasksCheck})</span>
            </div>
            {d.lastFetchAt && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Last fetch:</span>
                <span>{new Date(d.lastFetchAt).toLocaleTimeString()}</span>
              </div>
            )}
            {d.lastError && (
              <div className="rounded bg-destructive/10 text-destructive px-2 py-1 mt-1">
                Error: {d.lastError}
              </div>
            )}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchTasks()} className="h-7 text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Fetch tasks
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddSampleTask}
                disabled={addSampleLoading}
                className="h-7 text-xs"
              >
                {addSampleLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ListTodo className="h-3.5 w-3.5 mr-1" />}
                Create sample task
              </Button>
            </div>
            {addSampleError && (
              <p className="text-destructive text-xs mt-1">Create failed: {addSampleError}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                Agent tasks
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => fetchTasks()} className="h-7 text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tasks created by OpenClaw agents via <code className="rounded bg-muted px-1">hyperclaw_add_task</code>
            </p>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tasks yet. Use &quot;Create sample task&quot; above to test the bridge, or have an agent call <code className="rounded bg-muted px-1">hyperclaw_add_task</code>.
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <BridgeTaskRow key={task.id} task={task} onUpdate={updateTask} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Recent events
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Notifications from agents via <code className="rounded bg-muted px-1">hyperclaw_notify</code>
            </p>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...events].reverse().slice(0, 20).map((evt, i) => (
                  <motion.div
                    key={`${evt.timestamp}-${i}`}
                    {...fadeUp}
                    className="rounded border border-border/50 bg-muted/30 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-primary">{evt.type}</span>
                    {evt.payload?.title && <span className="ml-2">{String(evt.payload.title)}</span>}
                    {evt.payload?.message && (
                      <p className="mt-1 text-muted-foreground">{String(evt.payload.message)}</p>
                    )}
                    <span className="mt-1 block text-[10px] text-muted-foreground/80">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

class BridgePanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
          <Zap className="h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">OpenClaw Bridge</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Bridge panel failed to load. This usually means the bridge hook or API is unavailable.
          </p>
          <pre className="text-xs bg-destructive/10 text-destructive rounded p-3 max-w-full overflow-auto">
            {this.state.error}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function BridgePanel() {
  return (
    <BridgePanelErrorBoundary>
      <BridgePanelContent />
    </BridgePanelErrorBoundary>
  );
}

function OpenClawApp() {
  const { appSchema } = useOpenClawTool();

  return (
    <InteractApp appSchema={appSchema} className="p-3">
      <InteractContent value="openclaw-status">
        <StatusPanel />
      </InteractContent>
      <InteractContent value="openclaw-send">
        <SendMessagePanel />
      </InteractContent>
      <InteractContent value="openclaw-webchat">
        <WebChatPanel />
      </InteractContent>
      <InteractContent value="openclaw-usage">
        <UsagePanel />
      </InteractContent>
        <InteractContent value="openclaw-cron">
          <CronPanel />
        </InteractContent>
        <InteractContent value="openclaw-agents">
          <AgentsPanel />
        </InteractContent>
        <InteractContent value="openclaw-terminal">
          <TerminalPanel />
        </InteractContent>
        <InteractContent value="openclaw-bridge">
          <BridgePanel />
        </InteractContent>
        <InteractContent value="openclaw-logs">
          <LogsPanel />
        </InteractContent>
    </InteractApp>
  );
}

class OpenClawErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string | null }
> {
  state = { hasError: false, error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[400px] w-full flex-col items-center justify-center gap-4 p-8 bg-background">
          <div className="rounded-2xl bg-destructive/10 p-4">
            <Bug className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">OpenClaw failed to load</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Something went wrong. This can happen if the Electron bridge is unavailable or a dependency failed to load.
          </p>
          {this.state.error && (
            <pre className="text-xs font-mono bg-muted/50 border border-border rounded-lg p-3 max-w-full overflow-auto text-muted-foreground">
              {this.state.error}
            </pre>
          )}
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function OpenClaw() {
  return (
    <OpenClawErrorBoundary>
      <OpenClawProvider>
        <OpenClawApp />
      </OpenClawProvider>
    </OpenClawErrorBoundary>
  );
}
