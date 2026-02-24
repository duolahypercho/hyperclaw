import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Clock,
  Bot,
  Terminal,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Brain,
  Wifi,
  WifiOff,
  Home,
} from "lucide-react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useOpenClaw } from "$/hooks/useOpenClaw";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export function StatusIndicator({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />;
  return ok ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
  ) : (
    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
  );
}

export function OutputBlock({ content, error }: { content: string | null; error?: string | null }) {
  if (error) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300 font-mono whitespace-pre-wrap">
        {error}
      </div>
    );
  }
  if (!content) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  return (
    <pre className="rounded-lg bg-background/60 border border-border/50 p-4 text-sm text-foreground/90 font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
      {content}
    </pre>
  );
}

export function AgentCard({ agent }: { agent: { name: string; hasSoul: boolean; hasMemory: boolean; soulContent: string | null } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div variants={fadeUp}>
      <Card
        className="cursor-pointer hover:border-primary/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <CardTitle className="text-sm">{agent.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1.5">
              {agent.hasSoul && <Badge variant="outline" className="text-[10px] px-1.5 py-0">SOUL</Badge>}
              {agent.hasMemory && <Badge variant="outline" className="text-[10px] px-1.5 py-0">MEMORY</Badge>}
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </div>
          </div>
        </CardHeader>
        <AnimatePresence>
          {expanded && agent.soulContent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0">
                <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap bg-background/40 rounded-md p-3 max-h-40 overflow-y-auto">
                  {agent.soulContent}
                </pre>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export function CommandRunner({ runCommand }: { runCommand: (args: string) => Promise<{ success: boolean; data?: string; error?: string }> }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd) return;
    setRunning(true);
    setOutput(null);
    setError(null);
    const res = await runCommand(cmd);
    if (res.success) {
      setOutput(res.data ?? "(no output)");
    } else {
      setError(res.error ?? "Command failed");
    }
    setRunning(false);
  }, [input, runCommand]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-lg bg-background/60 border border-border/50 px-3 py-2">
          <span className="text-xs text-muted-foreground font-mono select-none">openclaw</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !running && handleRun()}
            placeholder="status, cron list, help ..."
            className="flex-1 bg-transparent text-sm text-foreground font-mono outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <Button
          size="sm"
          onClick={handleRun}
          disabled={running || !input.trim()}
          className="gap-1.5"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Run
        </Button>
      </div>
      {(output || error) && (
        <motion.div {...fadeUp}>
          <OutputBlock content={output} error={error} />
        </motion.div>
      )}
    </div>
  );
}

export default function OpenClawDashboard() {
  const router = useRouter();
  const {
    installed,
    version,
    status,
    cronJobs,
    agents,
    loading,
    errors,
    refreshAll,
    runCommand,
  } = useOpenClaw(30000);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  if (loading && installed === null) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Connecting to OpenClaw...</span>
        </motion.div>
      </div>
    );
  }

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
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
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

  return (
    <ScrollArea className="w-full h-full">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div {...fadeUp} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">OpenClaw</h1>
              <p className="text-xs text-muted-foreground">
                {version ? `v${version}` : "Local agent cockpit"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Status",
              icon: Activity,
              value: status ? "Online" : "—",
              ok: status !== null && !errors.status,
              error: errors.status,
            },
            {
              label: "Cron Jobs",
              icon: Clock,
              value: cronJobs
                ? `${cronJobs.split("\n").filter((l: string) => l.trim()).length} entries`
                : "—",
              ok: cronJobs !== null && !errors.cron,
              error: errors.cron,
            },
            {
              label: "Agents",
              icon: Brain,
              value: agents.length > 0 ? `${agents.length} agents` : "—",
              ok: agents.length > 0 && !errors.agents,
              error: errors.agents,
            },
          ].map((stat) => (
            <motion.div key={stat.label} variants={fadeUp}>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                    <stat.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-sm font-medium text-foreground truncate">{stat.value}</p>
                  </div>
                  <StatusIndicator ok={stat.error ? false : stat.ok ? true : null} />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Tabs */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }}>
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="w-full justify-start gap-1">
              <TabsTrigger value="status" className="gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Status
              </TabsTrigger>
              <TabsTrigger value="cron" className="gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Cron Jobs
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-1.5">
                <Bot className="w-3.5 h-3.5" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="terminal" className="gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                Run Command
              </TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="mt-4">
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
            </TabsContent>

            <TabsContent value="cron" className="mt-4">
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
            </TabsContent>

            <TabsContent value="agents" className="mt-4">
              {agents.length === 0 && !errors.agents ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Bot className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No agents found in <code className="text-xs bg-muted rounded px-1 py-0.5">~/.openclaw/workspace</code>
                    </p>
                  </CardContent>
                </Card>
              ) : errors.agents ? (
                <OutputBlock content={null} error={errors.agents} />
              ) : (
                <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agents.map((agent) => (
                    <AgentCard key={agent.name} agent={agent} />
                  ))}
                </motion.div>
              )}
            </TabsContent>

            <TabsContent value="terminal" className="mt-4">
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
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </ScrollArea>
  );
}
