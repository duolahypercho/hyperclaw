"use client";

import React, { useState, useEffect, useCallback } from "react";
import { hubFetch } from "$/lib/hub-direct";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Loader2,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreVertical,
  Trash2,
  Copy,
  Laptop,
  Server,
  Cloud,
  Terminal,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertDelete } from "$/components/UI/AlertDelete";

interface Device {
  id: string;
  name: string;
  type: "aws" | "vps" | "desktop" | "laptop" | "connector";
  status: "provisioning" | "connecting" | "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  platform: string;
  arch: string;
  hostname: string;
  connectorVersion: string;
  tags: string[];
  env: string;
}

const STATUS_CONFIG = {
  provisioning: { color: "bg-yellow-500", icon: Loader2, text: "Provisioning", spin: true },
  connecting: { color: "bg-blue-500", icon: RefreshCw, text: "Connecting", spin: true },
  online: { color: "bg-emerald-500", icon: CheckCircle, text: "Online", spin: false },
  offline: { color: "bg-zinc-500", icon: XCircle, text: "Offline", spin: false },
  revoked: { color: "bg-red-500", icon: AlertCircle, text: "Revoked", spin: false },
};

const TYPE_ICONS = {
  aws: Cloud,
  vps: Server,
  desktop: Monitor,
  laptop: Laptop,
  connector: Terminal,
};

function DeviceStatusBadge({ status }: { status: Device["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color} text-white`}>
      <Icon className={`w-3 h-3 ${cfg.spin ? "animate-spin" : ""}`} />
      {cfg.text}
    </span>
  );
}

function DeviceCard({ device, onRevoke, onRemove }: { device: Device; onRevoke: (id: string) => void; onRemove: (id: string) => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const Icon = TYPE_ICONS[device.type] || Monitor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm truncate">{device.name}</h3>
            <p className="text-xs text-muted-foreground truncate">{device.hostname || device.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DeviceStatusBadge status={device.status} />
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-accent rounded"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute right-0 top-8 w-36 bg-popover border border-border rounded-lg shadow-lg py-1 z-20"
                >
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(device.id);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied!" : "Copy ID"}
                  </button>
                  {device.status !== "revoked" && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowRevokeDialog(true);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 text-destructive"
                    >
                      <Trash2 className="w-3 h-3" /> Revoke
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowRemoveDialog(true);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 text-destructive"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{device.platform || "unknown"}</span>
        {device.arch && (
          <>
            <span className="text-border">|</span>
            <span>{device.arch}</span>
          </>
        )}
        <span className="text-border">|</span>
        <span>{device.env || "prod"}</span>
        {device.connectorVersion && (
          <>
            <span className="text-border">|</span>
            <span>v{device.connectorVersion}</span>
          </>
        )}
        <span className="text-border">|</span>
        <span>
          {device.lastSeenAt && device.lastSeenAt !== "0001-01-01T00:00:00Z"
            ? `Seen ${new Date(device.lastSeenAt).toLocaleDateString()}`
            : "Never connected"}
        </span>
      </div>

      {device.tags?.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {device.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-secondary text-[10px] rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      <AlertDelete
        dialogTitle={`Revoke "${device.name}"?`}
        dialogDescription="This will disconnect the device and invalidate its credentials. You can remove it afterwards."
        deleteButtonTitle="Revoke"
        showDialog={showRevokeDialog}
        setShowDialog={setShowRevokeDialog}
        onDelete={() => onRevoke(device.id)}
      ><span /></AlertDelete>

      <AlertDelete
        dialogTitle={`Remove "${device.name}"?`}
        dialogDescription="This will permanently remove the device. This action cannot be undone."
        deleteButtonTitle="Remove"
        showDialog={showRemoveDialog}
        setShowDialog={setShowRemoveDialog}
        onDelete={() => onRemove(device.id)}
      ><span /></AlertDelete>
    </motion.div>
  );
}

// ── Add Device Dialog ────────────────────────────────────────────────

type AddStep = "name" | "setup" | "waiting";

interface PairingInfo {
  token: string;
  deviceId: string;
  expiresIn: number;
}

function AddDeviceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<AddStep>("name");
  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("connector");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("name");
        setDeviceName("");
        setDeviceType("connector");
        setCreating(false);
        setError(null);
        setPairing(null);
        setCopied(false);
        setPollCount(0);
      }, 300);
    }
  }, [open]);

  useEffect(() => {
    if (step !== "waiting" || !pairing) return;
    const interval = setInterval(async () => {
      try {
        const res = await hubFetch("/api/devices");
        if (!res.ok) return;
        const devices: Device[] = await res.json();
        const device = devices.find((d) => d.id === pairing.deviceId);
        if (device?.status === "online") {
          clearInterval(interval);
          onCreated();
          onOpenChange(false);
        }
        setPollCount((c) => c + 1);
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, pairing, onCreated, onOpenChange]);

  const handleCreate = async () => {
    if (!deviceName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const createRes = await hubFetch("/api/devices", {
        method: "POST",
        body: JSON.stringify({ name: deviceName.trim(), type: deviceType }),
      });
      const device = await createRes.json();
      if (!createRes.ok) {
        setError(device.error || "Failed to create device");
        return;
      }
      const deviceId = device.id || device._id;

      const pairRes = await hubFetch(`/api/devices/${deviceId}/pairing-token`, {
        method: "POST",
      });
      const pairData = await pairRes.json();
      if (!pairRes.ok) {
        setError(pairData.error || "Failed to generate pairing token");
        return;
      }
      setPairing({ token: pairData.token, deviceId: pairData.deviceId, expiresIn: pairData.expiresIn });
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create device");
    } finally {
      setCreating(false);
    }
  };

  const installBaseUrl = (
    process.env.NEXT_PUBLIC_CONNECTOR_INSTALL_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://your-domain.example.com"
  ).replace(/\/$/, "");
  const setupCommand = pairing
    ? `curl -fsSL ${installBaseUrl}/downloads/install.sh | bash -s -- --token ${pairing.token} --device-id ${pairing.deviceId}`
    : "";

  const copyCommand = () => {
    navigator.clipboard.writeText(setupCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] gap-0 sm:rounded-xl p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            {["Name", "Setup", "Connect"].map((label, i) => {
              const currentIdx = step === "name" ? 0 : step === "setup" ? 1 : 2;
              const isActive = i === currentIdx;
              const isDone = i < currentIdx;
              return (
                <React.Fragment key={label}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-border" />}
                  <span className={`flex items-center gap-1 ${isActive ? "text-primary font-medium" : isDone ? "text-emerald-500" : ""}`}>
                    {isDone && <Check className="w-3 h-3" />}
                    {label}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === "name" && (
            <motion.div key="name" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-6 pb-4">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-base">Add a Device</DialogTitle>
                <DialogDescription className="text-xs">
                  Register a new device to connect its OpenClaw gateway through the hub.
                </DialogDescription>
              </DialogHeader>
              {error && <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-3">{error}</p>}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="device-name" className="text-xs font-medium">Device Name</Label>
                  <Input id="device-name" placeholder="e.g. My MacBook Pro" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} className="h-9 text-sm" autoFocus disabled={creating} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="device-type" className="text-xs font-medium">Device Type</Label>
                  <Select value={deviceType} onValueChange={setDeviceType}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="connector">Connector (Mac/Linux)</SelectItem>
                      <SelectItem value="vps">VPS / Cloud Server</SelectItem>
                      <SelectItem value="desktop">Desktop</SelectItem>
                      <SelectItem value="laptop">Laptop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>Cancel</Button>
                <Button size="sm" onClick={handleCreate} disabled={!deviceName.trim() || creating}>
                  {creating ? (<><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Creating...</>) : "Create Device"}
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {step === "setup" && pairing && (
            <motion.div key="setup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-6 pb-4">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" /> Run on Your Device
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Run this command on the machine where OpenClaw is installed. The pairing token expires in {Math.floor(pairing.expiresIn / 60)} minutes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">1. Download the connector (if you haven't already)</p>
                  {process.env.NEXT_PUBLIC_CONNECTOR_RELEASES_URL ? (
                    <Button variant="outline" size="sm" className="text-xs h-8" asChild>
                      <a href={process.env.NEXT_PUBLIC_CONNECTOR_RELEASES_URL} target="_blank" rel="noopener noreferrer">
                        <Download className="w-3 h-3 mr-1.5" /> Download Connector <ExternalLink className="w-3 h-3 ml-1.5 text-muted-foreground" />
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Build the bundled connector from <code>./connector</code> in this repo
                      (<code>cd connector && go build -o hyperclaw-connector ./cmd</code>).
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">2. Run this command in your terminal</p>
                  <div className="relative group">
                    <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-3 pr-10 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{setupCommand}</pre>
                    <button onClick={copyCommand} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Copy command">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">This token is single-use and expires in {Math.floor(pairing.expiresIn / 60)} minutes.</p>
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
                <Button size="sm" onClick={() => setStep("waiting")}>I've run the command <ChevronRight className="w-3 h-3 ml-1" /></Button>
              </DialogFooter>
            </motion.div>
          )}

          {step === "waiting" && (
            <motion.div key="waiting" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-6 pb-4">
              <DialogHeader className="pb-4">
                <DialogTitle className="text-base">Waiting for Connection</DialogTitle>
                <DialogDescription className="text-xs">Waiting for the connector to come online...</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center py-8 gap-4">
                <motion.div
                  className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
                  animate={{ boxShadow: ["0 0 0 0 rgba(59,130,246,0.3)", "0 0 0 16px rgba(59,130,246,0)"] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </motion.div>
                <p className="text-sm text-muted-foreground">Listening for device connection...</p>
                <p className="text-[10px] text-muted-foreground">Checked {pollCount} time{pollCount !== 1 ? "s" : ""}</p>
              </div>
              <DialogFooter className="pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("setup")}>Back</Button>
                <Button variant="ghost" size="sm" onClick={() => { onCreated(); onOpenChange(false); }}>Skip & Close</Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ── Settings Page Content ─────────────────────────────────────────────

const DevicesSettings = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await hubFetch("/api/devices");
      if (!response.ok) throw new Error("Failed to fetch devices");
      const data = await response.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRevoke = async (deviceId: string) => {
    try {
      const response = await hubFetch(`/api/devices/${deviceId}/revoke`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to revoke device");
      await fetchDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke device");
    }
  };

  const handleRemove = async (deviceId: string) => {
    try {
      const response = await hubFetch(`/api/devices/${deviceId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove device");
      await fetchDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove device");
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const onlineCount = devices.filter((d) => d.status === "online").length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Devices</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {devices.length > 0
              ? `${onlineCount} online · ${devices.length} total`
              : "Manage your connected gateway devices"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchDevices} disabled={loading} className="h-8 text-xs">
            <RefreshCw className={`w-3 h-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-8 text-xs">
            <Plus className="w-3 h-3 mr-1.5" />
            Add Device
          </Button>
        </div>
      </div>

      {loading && devices.length === 0 && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {!loading && !error && devices.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 border border-dashed border-border rounded-lg"
        >
          <Monitor className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="text-sm font-medium mb-1">No devices yet</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-[280px] mx-auto">
            Add a device to connect its OpenClaw gateway through the hub for remote access.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-8 text-xs">
            <Plus className="w-3 h-3 mr-1.5" />
            Add Your First Device
          </Button>
        </motion.div>
      )}

      {!loading && !error && devices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} onRevoke={handleRevoke} onRemove={handleRemove} />
          ))}
        </div>
      )}

      <AddDeviceDialog open={addOpen} onOpenChange={setAddOpen} onCreated={fetchDevices} />
    </div>
  );
};

export default DevicesSettings;
