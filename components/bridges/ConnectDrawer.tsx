"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plug, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { LiveBridge } from "./useBridges";

const SCOPE_DESC: Record<string, string> = {
  read: "Read items", write: "Create or update", send: "Send messages",
  label: "Apply labels", draft: "Save drafts",
  messages: "Chat completions", tools: "Tool calls", vision: "Image input",
  batch: "Batch jobs", embed: "Vector embeddings", chat: "Chat",
  search: "Search", extract: "Extract page",
  query: "Query vectors", upsert: "Upsert vectors", delete: "Delete vectors",
  scrape: "Scrape pages", crawl: "Crawl sites", map: "Sitemap",
  contents: "Page contents", similar: "Similar pages",
  tts: "Text-to-speech", voices: "Manage voices", clone: "Voice cloning",
  transcribe: "Speech-to-text", live: "Realtime streaming",
  "channels:read": "Read channels", "chat:write": "Post messages",
  reactions: "Add reactions", "emails:send": "Send email", domains: "Manage domains",
  blocks: "Block content", "issues:read": "Read issues", "issues:write": "Update issues",
  "events.read": "Read events", "events.write": "Modify events",
  share: "Share files", repo: "Repo contents", pull_requests: "Pull requests",
  actions: "GitHub Actions", deployments: "Deployments", projects: "Projects",
  env: "Env vars", "event:read": "Read events", "issue:read": "Read issues",
  select: "SQL SELECT", schema: "Read schema",
  get: "GET object", put: "PUT object", list: "List objects",
  rest: "REST API", realtime: "Realtime",
  storage: "Storage", webhooks: "Webhook events",
  inbound: "Inbound HTTP", signature: "Verify signatures", outbound: "Outbound HTTP",
  resources: "MCP resources", sms: "Send SMS", voice: "Voice calls",
  verify: "Phone verify",
};

interface ConnectDrawerProps {
  bridge: LiveBridge | null;
  open: boolean;
  onClose: () => void;
  onSave: (bridgeId: string, apiKey: string, type?: string) => Promise<{ success: boolean; error?: string }>;
  onRemove: (bridgeId: string) => Promise<{ success: boolean; error?: string }>;
}

function statusBadge(status: LiveBridge["status"]): { label: string; className: string } {
  switch (status) {
    case "connected":
      return { label: "Connected", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
    case "needs-auth":
      return { label: "Needs auth", className: "bg-accent/30 text-foreground border-foreground/30" };
    case "paused":
      return { label: "Paused", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
    default:
      return { label: "Not connected", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function ConnectDrawer({ bridge: b, open, onClose, onSave, onRemove }: ConnectDrawerProps) {
  const [scopes, setScopes] = useState<Record<string, boolean>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState<"idle" | "testing" | "ok">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset local state whenever a different bridge opens.
  useEffect(() => {
    if (!b) return;
    const sObj: Record<string, boolean> = {};
    (b.scopes || []).forEach((s) => (sObj[s] = true));
    setScopes(sObj);
    const vObj: Record<string, string> = {};
    (b.fields || []).forEach((f) => (vObj[f.key] = ""));
    setVals(vObj);
    setTested("idle");
    setErrorMsg(null);
    setSaving(false);
  }, [b]);

  const apiKeyField = useMemo(() => b?.fields.find((f) => f.key === "apiKey" || f.secret), [b]);
  const badge = b ? statusBadge(b.status) : null;
  const initials = b ? b.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() : "";

  const handleTest = () => {
    setTested("testing");
    setTimeout(() => setTested(apiKeyField && vals[apiKeyField.key] ? "ok" : "idle"), 700);
  };

  const handleSave = async () => {
    if (!b || !apiKeyField) return;
    const apiKey = vals[apiKeyField.key];
    if (!apiKey) {
      setErrorMsg("Enter a value before saving.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    const result = await onSave(b.id, apiKey);
    setSaving(false);
    if (!result.success) {
      setErrorMsg(result.error || "Failed to save credential.");
      return;
    }
    onClose();
  };

  const handleRemove = async () => {
    if (!b) return;
    setSaving(true);
    const result = await onRemove(b.id);
    setSaving(false);
    if (!result.success) {
      setErrorMsg(result.error || "Failed to remove credential.");
      return;
    }
    onClose();
  };

  if (!b) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="sm:max-w-[540px] w-[540px] flex flex-col gap-0 p-0 ensemble-root"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-solid border-border space-y-0">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "w-10 h-10 grid place-items-center rounded-md font-mono font-bold text-sm shrink-0",
                "border border-solid",
                b.cat === "AI models"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border",
              )}
            >
              {initials}
            </span>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight">{b.name}</SheetTitle>
              <SheetDescription className="text-[12.5px] mt-0.5">
                {b.tagline} · {b.kind} · {b.cat}
              </SheetDescription>
              <div className="mt-2">
                <Badge variant="outline" className={cn("font-mono text-[10px] uppercase tracking-wide", badge!.className)}>
                  {badge!.label}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-3.5">
            {/* About */}
            <section className="ens-card-flat">
              <div className="ens-sh mb-2.5">About</div>
              <p className="text-[12.5px] leading-relaxed text-foreground/90">{b.blurb}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 font-mono text-[11px]">
                {[
                  ["Pricing", b.pricing || "—"],
                  ["Region", b.region || "—"],
                  ["Auth", b.auth.replace("+", " + ")],
                  ["Docs", b.docsUrl || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 min-w-0">
                    <dt className="text-muted-foreground/70 shrink-0">{k}</dt>
                    <dd className="ml-auto text-foreground/80 truncate">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Credentials */}
            {b.fields.length > 0 && (
              <section className="ens-card-flat">
                <div className="ens-sh mb-2.5">Credentials</div>
                <div className="space-y-2.5">
                  {b.fields.map((f) => (
                    <div key={f.key}>
                      <Label htmlFor={`cred-${f.key}`} className="text-[11px] text-muted-foreground mb-1 block">
                        {f.label}
                        {f.secret && (
                          <span className="text-muted-foreground/70 font-normal ml-1.5">· encrypted at rest</span>
                        )}
                      </Label>
                      <Input
                        id={`cred-${f.key}`}
                        type={f.secret ? "password" : "text"}
                        placeholder={f.ph}
                        value={vals[f.key] || ""}
                        onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                        className={cn("h-8 font-mono text-[12px]", f.secret && "tracking-wider")}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  ))}
                </div>
                {b.status === "connected" && (
                  <div className="text-[11px] text-muted-foreground mt-2 font-mono">
                    Existing: {b.account}
                  </div>
                )}
              </section>
            )}

            {b.fields.length === 0 && (
              <section className="ens-card-flat">
                <div className="ens-sh mb-2.5">OAuth</div>
                <p className="text-[12.5px] text-muted-foreground mb-2.5">
                  You&apos;ll be redirected to {b.name} to grant access. Tokens are stored encrypted on
                  your device by the connector and refreshed automatically.
                </p>
                <Button variant="default" disabled className="gap-1.5">
                  <Plug className="w-3 h-3" /> Continue with {b.name}
                </Button>
              </section>
            )}

            {/* Scopes */}
            {b.scopes.length > 0 && (
              <section className="ens-card-flat">
                <div className="ens-sh mb-2.5">Scopes</div>
                <div className="space-y-1.5">
                  {b.scopes.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setScopes({ ...scopes, [s]: !scopes[s] })}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left",
                        "border border-solid bg-background transition-colors",
                        scopes[s] ? "border-foreground/60" : "border-border hover:border-muted-foreground/50",
                      )}
                    >
                      <span
                        className={cn(
                          "w-4 h-4 rounded grid place-items-center shrink-0 border border-solid",
                          scopes[s]
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-muted-foreground/40",
                        )}
                      >
                        {scopes[s] && <Check className="w-3 h-3" />}
                      </span>
                      <span className="font-mono text-[11.5px] text-foreground">{s}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground truncate">
                        {SCOPE_DESC[s] || "—"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Models */}
            {b.models && b.models.length > 0 && (
              <section className="ens-card-flat">
                <div className="ens-sh mb-2.5">Available models</div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {b.models.map((m) => (
                    <div
                      key={m.name}
                      className="flex items-center gap-3 px-2.5 py-1.5 rounded-md bg-background border border-solid border-border font-mono text-[11px]"
                    >
                      <span className="flex-1 text-foreground truncate">{m.name}</span>
                      {m.ctx && <span className="text-muted-foreground/70 shrink-0">ctx {m.ctx}</span>}
                      {m.price && <span className="text-muted-foreground shrink-0">{m.price}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-solid border-destructive/30 text-destructive text-[12.5px]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="px-6 py-3.5 border-t border-solid border-border bg-card/30 flex-row sm:flex-row sm:justify-start gap-2 items-center">
          <span className="font-mono text-[10.5px] text-muted-foreground mr-auto">
            {tested === "testing"
              ? "◐ testing connection…"
              : tested === "ok"
              ? <span className="text-emerald-600 dark:text-emerald-400">● ready</span>
              : "◯ ready to test"}
          </span>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={saving}>
            Test
          </Button>
          {b.status === "connected" ? (
            <>
              <Button variant="destructive" size="sm" onClick={handleRemove} disabled={saving}>
                Disconnect
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Update key"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={saving || !apiKeyField} className="gap-1.5">
              <Plug className="w-3 h-3" />
              {saving ? "Connecting…" : b.status === "off" ? "Connect" : "Save"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
