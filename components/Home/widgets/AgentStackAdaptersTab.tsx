"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Power,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addAgenticStackAdapter,
  ensureAgenticStackAdapter,
  getAgenticStackStatus,
  normalizeAgenticStackRuntime,
  removeAgenticStackAdapter,
  runAgenticStackDoctor,
  type AgenticStackAdapterStatus,
  type AgenticStackLogEntry,
  type AgenticStackParams,
  type AgenticStackStatus,
} from "$/lib/agentic-stack-client";

const RUNTIME_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  hermes: "Hermes",
  openclaw: "OpenClaw",
};

function runtimeLabel(name: string) {
  return RUNTIME_LABELS[name] ?? name;
}

function formatTime(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

type ConnectionState = "loading" | "not_installed" | "needs_restore" | "healthy" | "error";

export function AgentStackAdaptersTab({
  agentId,
  runtime,
  projectPath,
  autoError,
  onAutoErrorClear,
}: {
  agentId: string;
  runtime?: string;
  projectPath?: string;
  autoError?: string | null;
  onAutoErrorClear?: () => void;
}) {
  const adapter = useMemo(() => normalizeAgenticStackRuntime(runtime), [runtime]);
  const params = useMemo<AgenticStackParams>(
    () => ({ agentId, runtime: adapter ?? undefined, projectPath }),
    [agentId, adapter, projectPath],
  );

  const [status, setStatus] = useState<AgenticStackStatus | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [logs, setLogs] = useState<AgenticStackLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "connect" | "restore" | "refresh" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!adapter) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [statusRes, doctorRes] = await Promise.all([
        getAgenticStackStatus(params),
        runAgenticStackDoctor(params),
      ]);
      if (reqId !== reqIdRef.current) return;
      if (statusRes.success === false || statusRes.error) {
        setError(statusRes.error ?? "Could not load adapter status");
        setStatus(statusRes);
        setWarnings([]);
        setLogs(statusRes.logs ?? []);
        return;
      }
      setStatus(statusRes);
      const filtered = (doctorRes.warnings ?? []).filter((w) => w.startsWith(`${adapter}:`));
      setWarnings(filtered);
      const merged = [...(statusRes.logs ?? []), ...(doctorRes.logs ?? [])];
      // De-dup adjacent identical messages and cap to last 20
      const dedup: AgenticStackLogEntry[] = [];
      for (const entry of merged) {
        const prev = dedup[dedup.length - 1];
        if (!prev || prev.message !== entry.message) dedup.push(entry);
      }
      setLogs(dedup.slice(-20));
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [adapter, params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const adapterStatus: AgenticStackAdapterStatus | undefined = useMemo(() => {
    if (!adapter || !status?.adapters) return undefined;
    return status.adapters.find((item) => item.name === adapter);
  }, [adapter, status]);

  const installedFiles = adapterStatus?.files ?? [];
  const allFilesPresent = installedFiles.length > 0 && installedFiles.every((f) => f.installed);
  const hasWarnings = warnings.length > 0;

  const connection: ConnectionState = useMemo(() => {
    if (!adapter) return "error";
    if (loading && !status) return "loading";
    if (error) return "error";
    if (!adapterStatus) return "loading";
    if (!adapterStatus.installed) return "not_installed";
    if (!allFilesPresent || hasWarnings) return "needs_restore";
    return "healthy";
  }, [adapter, loading, status, error, adapterStatus, allFilesPresent, hasWarnings]);

  const performAction = useCallback(
    async (kind: "connect" | "restore" | "refresh" | "disconnect") => {
      if (!adapter) return;
      setBusy(kind);
      setError(null);
      try {
        if (kind === "connect") {
          const result = await addAgenticStackAdapter(params, adapter);
          if (result.success === false && result.error) setError(result.error);
        } else if (kind === "restore") {
          const result = await ensureAgenticStackAdapter(params, { force: true });
          if (result.success === false && result.error) setError(result.error);
        } else if (kind === "disconnect") {
          const result = await removeAgenticStackAdapter(params, adapter);
          if (result.success === false && result.error) setError(result.error);
        }
        if (kind !== "refresh") onAutoErrorClear?.();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [adapter, params, refresh, onAutoErrorClear],
  );

  if (!adapter) {
    return (
      <div className="ens-doc-card">
        <div className="dh">Built-in actions</div>
        <div className="db">
          <p className="text-sm text-muted-foreground">
            We don&apos;t have built-in action setup for the &quot;{runtime}&quot; runtime yet.
          </p>
        </div>
      </div>
    );
  }

  const label = runtimeLabel(adapter);
  const banner = autoError ?? error;

  return (
    <div className="ens-doc-card">
      <div className="dh flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-medium">{label} built-in actions</span>
              <ConnectionPill state={connection} />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              We add a small managed block to {label}&apos;s instructions so this agent can use Hyperclaw&apos;s agent, knowledge, project, and workflow actions. Your edits stay yours.
            </p>
          </div>
          <Button
            size="xs"
            variant="ghost"
            disabled={loading || busy !== null}
            onClick={() => void refresh()}
            title="Re-check this workspace"
            className="gap-1 shrink-0"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Check
          </Button>
        </div>
      </div>

      <div className="db flex flex-col gap-3">
        {banner && (
          <div className="flex items-start gap-2 rounded-lg border border-solid border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-xs leading-5 text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>{banner}</span>
          </div>
        )}

        <PrimaryAction
          state={connection}
          label={label}
          busy={busy}
          installedAt={adapterStatus?.installedAt}
          onConnect={() => void performAction("connect")}
          onRestore={() => void performAction("restore")}
        />

        {connection !== "not_installed" && connection !== "loading" && (
          <Button
            size="xs"
            variant="ghost"
            className="self-start gap-1 text-muted-foreground hover:text-destructive"
            disabled={busy !== null}
            onClick={() => void performAction("disconnect")}
          >
            {busy === "disconnect" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Power className="h-3 w-3" />
            )}
            Disconnect built-in actions
          </Button>
        )}

        <button
          type="button"
          className="flex items-center gap-1 self-start text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0 cursor-pointer"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? "Hide technical details" : "Show technical details"}
        </button>

        {showDetails && (
          <div className="flex flex-col gap-3 rounded-xl border border-solid border-border/60 bg-muted/20 px-3 py-3">
            {installedFiles.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Files
                </p>
                <ul className="flex flex-col gap-1">
                  {installedFiles.map((file) => (
                    <li
                      key={file.dst}
                      className="flex items-center justify-between gap-2 text-[11.5px]"
                    >
                      <code className="font-mono text-foreground">{file.dst}</code>
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          file.installed ? "text-emerald-500" : "text-amber-500",
                        )}
                      >
                        {file.installed ? "present" : "missing"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-500">
                  Health checks
                </p>
                <ul className="flex flex-col gap-1">
                  {warnings.map((warning, idx) => (
                    <li
                      key={`${idx}-${warning}`}
                      className="text-[11.5px] text-muted-foreground"
                    >
                      {stripPrefix(warning, `${adapter}:`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {logs.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recent activity
                </p>
                <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                  {logs.map((entry, idx) => (
                    <li
                      key={`${entry.time}-${idx}`}
                      className={cn(
                        "flex items-start gap-2 text-[11px] leading-4",
                        entry.level === "warning" && "text-amber-500",
                        entry.level === "error" && "text-destructive",
                        entry.level !== "warning" && entry.level !== "error" && "text-muted-foreground",
                      )}
                    >
                      <span className="font-mono text-[9.5px] opacity-70 shrink-0">
                        {formatTime(entry.time)}
                      </span>
                      <span className="min-w-0 break-words">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {installedFiles.length === 0 && warnings.length === 0 && logs.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nothing to show yet. Connect built-in actions to see the managed files and recent activity.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function stripPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length).trim() : value;
}

function ConnectionPill({ state }: { state: ConnectionState }) {
  const config: Record<
    ConnectionState,
    { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    loading: {
      label: "Checking",
      className: "border-border/60 bg-muted/40 text-muted-foreground",
      Icon: Loader2,
    },
    not_installed: {
      label: "Not connected",
      className: "border-border/60 bg-muted/40 text-muted-foreground",
      Icon: Plug,
    },
    needs_restore: {
      label: "Needs restore",
      className: "border-amber-500/30 bg-amber-500/[0.08] text-amber-600 dark:text-amber-300",
      Icon: AlertTriangle,
    },
    healthy: {
      label: "Connected",
      className: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-300",
      Icon: CheckCircle2,
    },
    error: {
      label: "Issue",
      className: "border-destructive/30 bg-destructive/[0.08] text-destructive",
      Icon: AlertTriangle,
    },
  };
  const { label, className, Icon } = config[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-solid px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", state === "loading" && "animate-spin")} />
      {label}
    </span>
  );
}

function PrimaryAction({
  state,
  label,
  busy,
  installedAt,
  onConnect,
  onRestore,
}: {
  state: ConnectionState;
  label: string;
  busy: null | "connect" | "restore" | "refresh" | "disconnect";
  installedAt?: string;
  onConnect: () => void;
  onRestore: () => void;
}) {
  if (state === "loading") {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking workspace…
      </p>
    );
  }
  if (state === "not_installed") {
    return (
      <Button
        size="sm"
        variant="default"
        className="gap-1.5 self-start"
        disabled={busy !== null}
        onClick={onConnect}
      >
        {busy === "connect" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <PlugZap className="h-3.5 w-3.5" />
        )}
        Set up built-in actions
      </Button>
    );
  }
  if (state === "needs_restore") {
    return (
      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          variant="default"
          className="gap-1.5 self-start"
          disabled={busy !== null}
          onClick={onRestore}
        >
          {busy === "restore" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restore in one click
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Some managed instructions were edited or removed. Restoring re-adds the built-in actions block without touching anything else.
        </p>
      </div>
    );
  }
  if (state === "healthy") {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {label} can use Hyperclaw built-in actions.
          {installedAt ? <span className="text-muted-foreground">Last set up {formatTime(installedAt)}.</span> : null}
        </p>
        <Button
          size="xs"
          variant="outline"
          className="gap-1 self-start"
          disabled={busy !== null}
          onClick={onRestore}
        >
          {busy === "restore" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Refresh action setup
        </Button>
      </div>
    );
  }
  return null;
}

export default AgentStackAdaptersTab;
