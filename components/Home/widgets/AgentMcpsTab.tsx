"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
  Server,
  Terminal,
  Globe,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/* ── Types ───────────────────────────────────────────────────── */

interface AgentMCP {
  id: string;
  agentId: string;
  name: string;
  transportType: "stdio" | "sse" | "streamable_http";
  command: string;
  args: string[];
  url: string;
  headers: Record<string, string>;
  env: Record<string, string>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

type TransportType = "stdio" | "sse" | "streamable_http";

const TRANSPORT_LABELS: Record<TransportType, string> = {
  stdio: "stdio",
  sse: "SSE",
  streamable_http: "HTTP",
};

/* ── Key-Value editor ────────────────────────────────────────── */

interface KVPair {
  key: string;
  value: string;
}

function KVEditor({
  label,
  pairs,
  onChange,
}: {
  label: string;
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
}) {
  const addRow = () => onChange([...pairs, { key: "", value: "" }]);
  const removeRow = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: "key" | "value", val: string) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)));

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            placeholder="KEY"
            value={p.key}
            onChange={(e) => updateRow(i, "key", e.target.value)}
            className="h-6 text-[10px] font-mono flex-1"
          />
          <Input
            placeholder="value"
            value={p.value}
            onChange={(e) => updateRow(i, "value", e.target.value)}
            className="h-6 text-[10px] font-mono flex-1"
          />
          <button
            onClick={() => removeRow(i)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
      <button
        onClick={addRow}
        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5"
      >
        <Plus className="w-2.5 h-2.5" /> Add entry
      </button>
    </div>
  );
}

function pairsToMap(pairs: KVPair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of pairs) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

function mapToPairs(map: Record<string, string>): KVPair[] {
  return Object.entries(map).map(([key, value]) => ({ key, value }));
}

/* ── MCP form ────────────────────────────────────────────────── */

interface MCPFormProps {
  initial?: Partial<AgentMCP>;
  saving?: boolean;
  onSave: (data: Omit<AgentMCP, "id" | "agentId" | "createdAt" | "updatedAt" | "enabled">) => void;
  onCancel: () => void;
}

function MCPForm({ initial, saving, onSave, onCancel }: MCPFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [transport, setTransport] = useState<TransportType>(initial?.transportType ?? "stdio");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [argsRaw, setArgsRaw] = useState((initial?.args ?? []).join(" "));
  const [url, setUrl] = useState(initial?.url ?? "");
  const [headers, setHeaders] = useState<KVPair[]>(mapToPairs(initial?.headers ?? {}));
  const [env, setEnv] = useState<KVPair[]>(mapToPairs(initial?.env ?? {}));
  const [showAdvanced, setShowAdvanced] = useState(
    Object.keys(initial?.headers ?? {}).length > 0 || Object.keys(initial?.env ?? {}).length > 0
  );

  const isStdio = transport === "stdio";
  const isRemote = transport === "sse" || transport === "streamable_http";
  const valid =
    name.trim().length > 0 &&
    (isStdio ? command.trim().length > 0 : url.trim().length > 0);

  const handleSave = () => {
    onSave({
      name: name.trim(),
      transportType: transport,
      command: command.trim(),
      args: argsRaw.trim() ? argsRaw.trim().split(/\s+/) : [],
      url: url.trim(),
      headers: pairsToMap(headers),
      env: pairsToMap(env),
    });
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
      {/* Name */}
      <Input
        autoFocus
        placeholder="Server name (e.g. filesystem, browser)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-xs"
      />

      {/* Transport type */}
      <div className="flex gap-1">
        {(["stdio", "sse", "streamable_http"] as TransportType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTransport(t)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-md border font-medium transition-colors",
              transport === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {TRANSPORT_LABELS[t]}
          </button>
        ))}
      </div>

      {/* stdio: command + args */}
      {isStdio && (
        <>
          <Input
            placeholder="Command (e.g. npx, uvx, /usr/bin/python3)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="h-7 text-xs font-mono"
          />
          <Input
            placeholder="Arguments (space-separated, e.g. -y @modelcontextprotocol/server-filesystem)"
            value={argsRaw}
            onChange={(e) => setArgsRaw(e.target.value)}
            className="h-7 text-xs font-mono"
          />
        </>
      )}

      {/* sse / http: URL */}
      {isRemote && (
        <Input
          placeholder={`Endpoint URL (e.g. http://localhost:3001/${transport === "sse" ? "sse" : "mcp"})`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-7 text-xs font-mono"
        />
      )}

      {/* Advanced: env + headers */}
      <button
        onClick={() => setShowAdvanced((p) => !p)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Advanced (env, headers)
      </button>
      {showAdvanced && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border/30">
          <KVEditor label="Environment variables" pairs={env} onChange={setEnv} />
          {isRemote && (
            <KVEditor label="HTTP headers" pairs={headers} onChange={setHeaders} />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-1.5 pt-1">
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={onCancel} disabled={saving}>
          <X className="w-3 h-3 mr-1" />
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-6 text-xs px-2"
          disabled={!valid || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

/* ── MCP row ─────────────────────────────────────────────────── */

function TransportBadge({ type }: { type: TransportType }) {
  return (
    <span
      className={cn(
        "text-[9px] px-1 py-0 rounded font-mono font-medium shrink-0",
        type === "stdio"
          ? "bg-violet-500/10 text-violet-400"
          : type === "sse"
          ? "bg-blue-500/10 text-blue-400"
          : "bg-emerald-500/10 text-emerald-400"
      )}
    >
      {TRANSPORT_LABELS[type]}
    </span>
  );
}

interface MCPRowProps {
  mcp: AgentMCP;
  isEditing: boolean;
  saving?: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (id: string) => void;
  onSaveEdit: (data: Omit<AgentMCP, "id" | "agentId" | "createdAt" | "updatedAt" | "enabled">) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
}

function MCPRow({
  mcp,
  isEditing,
  saving,
  onToggle,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: MCPRowProps) {
  if (isEditing) {
    return <MCPForm initial={mcp} saving={saving} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  }

  const summary =
    mcp.transportType === "stdio"
      ? [mcp.command, ...mcp.args].filter(Boolean).join(" ")
      : mcp.url;

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
        mcp.enabled
          ? "border-primary/30 bg-primary/5"
          : "border-border/40 bg-muted/10 opacity-60"
      )}
    >
      {mcp.transportType === "stdio" ? (
        <Terminal className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate">{mcp.name}</p>
          <TransportBadge type={mcp.transportType} />
        </div>
        {summary && (
          <p className="text-[10px] text-muted-foreground font-mono truncate">{summary}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(mcp.id)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => onDelete(mcp.id)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
            title="Delete"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
        <Switch
          checked={mcp.enabled}
          onCheckedChange={(checked) => onToggle(mcp.id, checked)}
          title={mcp.enabled ? "Disable" : "Enable"}
        />
      </div>
    </div>
  );
}

/* ── Main AgentMcpsTab ───────────────────────────────────────── */

interface AgentMcpsTabProps {
  agentId: string;
  runtime?: string;
}

export function AgentMcpsTab({ agentId }: AgentMcpsTabProps) {
  const [mcps, setMcps] = useState<AgentMCP[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMcps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("agent-mcp-list", { agentId })) as
        | { data?: AgentMCP[]; error?: string }
        | AgentMCP[];
      const list = Array.isArray(res) ? res : (res as { data?: AgentMCP[] })?.data ?? [];
      setMcps(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchMcps();
  }, [fetchMcps]);

  const handleAdd = useCallback(
    async (data: Omit<AgentMCP, "id" | "agentId" | "createdAt" | "updatedAt" | "enabled">) => {
      setSaving(true);
      try {
        const res = (await bridgeInvoke("agent-mcp-add", {
          agentId,
          ...data,
          args: data.args,
          headers: data.headers,
          env: data.env,
        })) as { data?: AgentMCP; error?: string } | AgentMCP;
        const added = (res as { data?: AgentMCP })?.data ?? (res as AgentMCP);
        if (added?.id) {
          setMcps((prev) => [...prev, added]);
          setAddingNew(false);
        }
      } catch {
        /* silent — user can retry */
      } finally {
        setSaving(false);
      }
    },
    [agentId]
  );

  const handleUpdate = useCallback(
    async (
      id: string,
      data: Omit<AgentMCP, "id" | "agentId" | "createdAt" | "updatedAt" | "enabled">
    ) => {
      setSaving(true);
      try {
        await bridgeInvoke("agent-mcp-update", { id, ...data });
        setMcps((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...data } : m))
        );
        setEditingId(null);
      } catch {
        /* silent */
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    setMcps((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled } : m))
    );
    try {
      await bridgeInvoke("agent-mcp-toggle", { id, enabled });
    } catch {
      // Revert on failure
      setMcps((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enabled: !enabled } : m))
      );
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setMcps((prev) => prev.filter((m) => m.id !== id));
    try {
      await bridgeInvoke("agent-mcp-delete", { id });
    } catch {
      // Restore on failure
      fetchMcps();
    }
  }, [fetchMcps]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">
            MCP servers available to this agent
          </p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => { setAddingNew(true); setEditingId(null); }}
          title="Add MCP server"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-3">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading MCP servers…
          </div>
        ) : error ? (
          <div className="flex flex-col gap-2 py-4 text-xs text-muted-foreground">
            <p className="text-amber-500">{error}</p>
            <p className="text-[10px] opacity-70">Update the connector to enable MCP server management.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {/* Add form */}
            {addingNew && (
              <MCPForm
                saving={saving}
                onSave={handleAdd}
                onCancel={() => setAddingNew(false)}
              />
            )}

            {/* MCP list */}
            {mcps.map((mcp) => (
              <MCPRow
                key={mcp.id}
                mcp={mcp}
                isEditing={editingId === mcp.id}
                saving={saving && editingId === mcp.id}
                onToggle={handleToggle}
                onEdit={(id) => { setEditingId(id); setAddingNew(false); }}
                onSaveEdit={(data) => handleUpdate(mcp.id, data)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={handleDelete}
              />
            ))}

            {/* Empty state */}
            {mcps.length === 0 && !addingNew && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground gap-2">
                <Server className="w-7 h-7 opacity-20" />
                <p className="text-xs">No MCP servers configured</p>
                <p className="text-[10px] opacity-70">
                  Add stdio, SSE, or HTTP MCP servers for this agent.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 mt-1"
                  onClick={() => setAddingNew(true)}
                >
                  <Plus className="w-3 h-3" />
                  Add MCP server
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
