import React, { useEffect, useState, useRef, useCallback } from "react";
import { ImagePlus, X, Loader2, RefreshCw, Plug, Eye, EyeOff, ExternalLink } from "lucide-react";
import Image from "next/image";
import { HyperchoInput, HyperchoTextarea } from "$/components/UI/InputBox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { loadCompanyProfile, saveCompanyProfile } from "$/lib/company-profile";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { getActiveDeviceId } from "$/lib/hub-direct";
import SettingsSkeleton from "$/components/Tool/Setting/pages/skelenton";
import {
  type ArrCacheEntry,
  connectStripe,
  disconnectStripe,
  dominantCurrency,
  formatARR,
  getStripeArrStatus,
  refreshStripeArr,
} from "$/lib/stripe-arr-client";

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const Company = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [original, setOriginal] = useState({ name: "", description: "", avatarDataUri: "" });

  // Stripe ARR
  const [arrConnected, setArrConnected] = useState(false);
  const [arrCache, setArrCache] = useState<ArrCacheEntry | null>(null);
  const [arrLoading, setArrLoading] = useState(true);
  const [arrRefreshing, setArrRefreshing] = useState(false);
  const [arrConnecting, setArrConnecting] = useState(false);
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [stripeKey, setStripeKey] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  useEffect(() => {
    const data = loadCompanyProfile();
    setName(data.name || "");
    setDescription(data.description || "");
    setAvatarDataUri(data.avatarDataUri || null);
    setOriginal({
      name: data.name || "",
      description: data.description || "",
      avatarDataUri: data.avatarDataUri || "",
    });
    setLoading(false);
  }, []);

  const refreshArrStatus = useCallback(async () => {
    setArrLoading(true);
    try {
      const status = await getStripeArrStatus();
      setArrConnected(status.connected);
      setArrCache(status.cache || null);
    } finally {
      setArrLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshArrStatus();
  }, [refreshArrStatus]);

  const handleConnectStripe = async () => {
    const deviceId = await getActiveDeviceId();
    if (!deviceId) {
      toast({
        title: "Device not ready",
        description: "Pair a device before connecting Stripe.",
        variant: "destructive",
      });
      return;
    }
    setArrConnecting(true);
    try {
      const res = await connectStripe(deviceId, stripeKey);
      if (!res.success) {
        toast({
          title: "Stripe connect failed",
          description: res.error || "Could not connect Stripe.",
          variant: "destructive",
        });
        return;
      }
      setArrCache(res.cache || null);
      setArrConnected(true);
      setStripeKey("");
      setShowConnect(false);
      toast({ title: "Stripe connected", description: "ARR is live on this widget." });
    } finally {
      setArrConnecting(false);
    }
  };

  const handleRefreshArr = async () => {
    setArrRefreshing(true);
    try {
      const res = await refreshStripeArr();
      if (res?.cache) {
        setArrCache(res.cache);
        toast({ title: "Refreshed", description: "ARR recalculated from Stripe." });
      } else {
        toast({
          title: "Refresh failed",
          description: "Stripe didn't return data. Check your key.",
          variant: "destructive",
        });
      }
    } finally {
      setArrRefreshing(false);
    }
  };

  const handleDisconnectStripe = async () => {
    const ok = await disconnectStripe();
    if (ok) {
      setArrConnected(false);
      setArrCache(null);
      toast({ title: "Stripe disconnected", description: "Restricted key removed." });
    } else {
      toast({
        title: "Couldn't disconnect",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    }
  };


  if (loading) {
    return (
      <SettingsSkeleton
        title="Company"
        description="Manage your company profile."
      />
    );
  }

  const hasChanges =
    name.trim() !== original.name ||
    description.trim() !== original.description ||
    (avatarDataUri || "") !== original.avatarDataUri;

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be under 5 MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") {
        setAvatarDataUri(result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Company name is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = {
        name: name.trim(),
        description: description.trim(),
        avatarDataUri: avatarDataUri || undefined,
        createdAt: loadCompanyProfile().createdAt || new Date().toISOString(),
      };

      await bridgeInvoke("onboarding-configure-workspace", {
        companyName: name.trim(),
        companyDescription: description.trim(),
        companyAvatarDataUri: avatarDataUri || "",
        runtimeChoices: [],
        providerConfigs: [],
        runtimeChannelConfigs: [],
      });

      saveCompanyProfile(updated);

      setOriginal({
        name: name.trim(),
        description: description.trim(),
        avatarDataUri: avatarDataUri || "",
      });
      toast({ title: "Saved", description: "Company profile updated." });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground">Company</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Your company profile is shared with all agents via the knowledge base.
      </p>
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Company Logo</Label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 shrink-0 rounded-xl bg-foreground/[0.06] border border-border hover:border-foreground/20 flex items-center justify-center overflow-hidden transition-colors group"
            >
              {avatarDataUri ? (
                <>
                  <Image
                    src={avatarDataUri}
                    alt="Company logo"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ImagePlus className="w-5 h-5 text-white/80" />
                  </div>
                </>
              ) : (
                <ImagePlus className="w-6 h-6 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />
            <div className="flex-1 space-y-1">
              <p className="text-sm text-muted-foreground">
                {avatarDataUri ? "Click to change" : "Click to upload"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                PNG, JPG, WebP, or GIF. Max 5 MB.
              </p>
              {avatarDataUri && (
                <button
                  type="button"
                  onClick={() => setAvatarDataUri(null)}
                  className="text-xs text-destructive/70 hover:text-destructive transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="company-name">Company Name</Label>
          <HyperchoInput
            id="company-name"
            placeholder="Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            variant="hypercho"
            maxLength={60}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company-description">Description</Label>
          <HyperchoTextarea
            id="company-description"
            placeholder="What does your company do? How should agents understand it?"
            className="min-h-[120px] bg-transparent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="flex justify-end mt-4">
          <Button
            variant="default"
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>

        <StripeArrBlock
          loading={arrLoading}
          connected={arrConnected}
          cache={arrCache}
          showConnect={showConnect}
          onShowConnect={() => setShowConnect(true)}
          onCancelConnect={() => {
            setShowConnect(false);
            setStripeKey("");
          }}
          stripeKey={stripeKey}
          onStripeKeyChange={setStripeKey}
          showStripeKey={showStripeKey}
          onToggleShowKey={() => setShowStripeKey((v) => !v)}
          connecting={arrConnecting}
          onConnect={handleConnectStripe}
          refreshing={arrRefreshing}
          onRefresh={handleRefreshArr}
          onDisconnect={handleDisconnectStripe}
        />
      </div>
    </section>
  );
};

interface StripeArrBlockProps {
  loading: boolean;
  connected: boolean;
  cache: ArrCacheEntry | null;
  showConnect: boolean;
  onShowConnect: () => void;
  onCancelConnect: () => void;
  stripeKey: string;
  onStripeKeyChange: (v: string) => void;
  showStripeKey: boolean;
  onToggleShowKey: () => void;
  connecting: boolean;
  onConnect: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}

function StripeArrBlock({
  loading,
  connected,
  cache,
  showConnect,
  onShowConnect,
  onCancelConnect,
  stripeKey,
  onStripeKeyChange,
  showStripeKey,
  onToggleShowKey,
  connecting,
  onConnect,
  refreshing,
  onRefresh,
  onDisconnect,
}: StripeArrBlockProps) {
  const top = cache ? dominantCurrency(cache.by_currency) : null;
  const otherCurrencies = cache && top
    ? Object.entries(cache.by_currency)
        .filter(([code]) => code !== top.currency)
        .filter(([, amount]) => amount > 0)
    : [];

  return (
    <div className="mt-8 pt-6 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Stripe ARR</Label>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Annual Recurring Revenue, computed locally from your Stripe data.
          </p>
        </div>
        {connected && !showConnect && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh from Stripe"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="text-destructive/70 hover:text-destructive"
            >
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl bg-foreground/[0.04] border border-border px-4 py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : !connected && !showConnect ? (
        <div className="rounded-xl bg-foreground/[0.04] border border-dashed border-border px-4 py-5 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Connect Stripe</p>
            <p className="text-xs text-muted-foreground/70">
              Show live ARR on this widget. Your key is encrypted end-to-end.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onShowConnect}>
            <Plug className="w-3.5 h-3.5 mr-1.5" />
            Connect
          </Button>
        </div>
      ) : showConnect ? (
        <div className="rounded-xl bg-foreground/[0.04] border border-border px-4 py-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="stripe-key" className="text-xs">
              Stripe restricted key
            </Label>
            <div className="relative">
              <HyperchoInput
                id="stripe-key"
                placeholder="rk_live_..."
                value={stripeKey}
                onChange={(e) => onStripeKeyChange(e.target.value)}
                variant="hypercho"
                type={showStripeKey ? "text" : "password"}
                className="pr-9 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onToggleShowKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showStripeKey ? "Hide key" : "Show key"}
              >
                {showStripeKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <details className="text-xs text-muted-foreground/80 [&_summary]:cursor-pointer">
            <summary className="hover:text-foreground transition-colors">
              How to get a restricted key
            </summary>
            <ol className="mt-2 space-y-2 list-decimal list-inside leading-relaxed pl-1">
              <li>
                Open{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys/create?name=Hyperclaw%20ARR&permissions[0]=rak_subscription_read&permissions[1]=rak_customer_read&permissions[2]=rak_product_read"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline inline-flex items-center gap-0.5"
                >
                  Stripe → Create restricted key
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
                . The name &quot;Hyperclaw ARR&quot; is prefilled.
              </li>
              <li>
                In the permissions list, set these three to <span className="font-medium">Read</span>:
                <div className="mt-1.5 space-y-1">
                  {[
                    { resource: "Subscriptions", scope: "rak_subscription_read" },
                    { resource: "Customers", scope: "rak_customer_read" },
                    { resource: "Products", scope: "rak_product_read" },
                  ].map((row) => (
                    <div
                      key={row.resource}
                      className="flex items-center justify-between rounded-md bg-foreground/[0.04] border border-border px-2.5 py-1.5"
                    >
                      <span className="font-medium text-foreground/85">{row.resource}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        Read
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  Leave every other resource as <span className="font-medium">None</span>.
                </p>
              </li>
              <li>Click create. Copy the <code>rk_live_</code> or <code>rk_test_</code> key and paste it above.</li>
            </ol>
          </details>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancelConnect} disabled={connecting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onConnect}
              disabled={connecting || !stripeKey.trim()}
            >
              {connecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-foreground/[0.04] border border-border px-4 py-4">
          {!cache || !top ? (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Connected</p>
                <p className="text-xs text-muted-foreground/70">No recurring revenue found yet.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {formatARR(top.amount, top.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {cache.subscriptions} active subscription{cache.subscriptions === 1 ? "" : "s"}
                    {cache.live_mode === false && (
                      <span className="ml-2 text-amber-500">test mode</span>
                    )}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  updated {formatRelativeTime(cache.computed_at)}
                </p>
              </div>
              {otherCurrencies.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 border-t border-border/60">
                  {otherCurrencies.map(([code, amount]) => (
                    <span key={code} className="text-[11px] text-muted-foreground/70 tabular-nums">
                      + {formatARR(amount, code)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Company;
