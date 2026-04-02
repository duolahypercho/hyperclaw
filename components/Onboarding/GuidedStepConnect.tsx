import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Check, Copy, Terminal, RefreshCw, Monitor, Globe,
} from "lucide-react";
import { hubFetch } from "$/lib/hub-direct";
import { useUser } from "$/Providers/UserProv";

/*
  Step 1: Where will you run HyperClaw?
  - Local machine → proceed to runtime selection
  - Remote machine → connector pairing flow, then proceed
*/

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

type DeviceChoice = "local" | "remote" | null;

interface PairingInfo {
  token: string;
  deviceId: string;
  expiresIn: number;
  createdAt: number;
}

interface GuidedStepConnectProps {
  onComplete: (choice: DeviceChoice) => void;
}

export default function GuidedStepConnect({ onComplete }: GuidedStepConnectProps) {
  const { logout } = useUser();
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const [choice, setChoice] = useState<DeviceChoice>(null);

  // Remote device pairing
  const [remotePhase, setRemotePhase] = useState<"pairing" | "waiting" | "connected">("pairing");
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  // Check for existing connected device
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [existingDevice, setExistingDevice] = useState<{ id: string; name: string } | null>(null);
  const [wantsNewDevice, setWantsNewDevice] = useState(false);

  // When remote is selected, check for existing online devices first
  useEffect(() => {
    if (choice !== "remote") return;
    let cancelled = false;

    async function checkExisting() {
      setCheckingExisting(true);
      try {
        const res = await hubFetch("/api/devices");
        if (res.ok && !cancelled) {
          const devices = await res.json();
          const online = Array.isArray(devices)
            ? devices.find((d: any) => d.status === "online")
            : null;
          if (online) {
            setExistingDevice({ id: online.id || online._id, name: online.name || "Remote Device" });
          } else {
            // No existing device — go straight to pairing
            initDevice();
          }
        } else if (!cancelled) {
          initDevice();
        }
      } catch {
        if (!cancelled) initDevice();
      } finally {
        if (!cancelled) setCheckingExisting(false);
      }
    }

    checkExisting();
    return () => { cancelled = true; };
  }, [choice]);

  // Start pairing when user wants a new device
  useEffect(() => {
    if (wantsNewDevice && !pairing && !creating) {
      initDevice();
    }
  }, [wantsNewDevice]);

  // Countdown timer
  useEffect(() => {
    if (!pairing) return;
    const update = () => {
      const elapsed = Math.floor((Date.now() - pairing.createdAt) / 1000);
      setSecondsLeft(Math.max(0, (pairing.expiresIn ?? 600) - elapsed));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [pairing]);

  const initDevice = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await hubFetch("/api/devices");
      if (res.ok) {
        const devices = await res.json();
        const reusable = Array.isArray(devices)
          ? devices.find((d: any) => d.status === "provisioning" || d.status === "connecting")
          : null;
        if (reusable) {
          deviceIdRef.current = reusable.id || reusable._id;
          await regenerateToken(deviceIdRef.current!);
          return;
        }
      }
      await createDevice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize");
      setCreating(false);
    }
  }, []);

  async function regenerateToken(deviceId: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await hubFetch(`/api/devices/${deviceId}/pairing-token`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPairing({
          token: data.token,
          deviceId: data.deviceId || deviceId,
          expiresIn: data.expiresIn ?? 600,
          createdAt: Date.now(),
        });
        setCopied(false);
      } else {
        const text = await res.text();
        setError(`Failed to generate token: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  async function createDevice() {
    setCreating(true);
    setError(null);
    try {
      const createRes = await hubFetch("/api/devices", {
        method: "POST",
        body: JSON.stringify({ name: "Remote Device", type: "connector" }),
      });
      if (!createRes.ok) {
        const text = await createRes.text();
        setError(`Failed to create device (${createRes.status}): ${text.slice(0, 200)}`);
        return;
      }
      const device = await createRes.json();
      const deviceId = device.id || device._id;
      deviceIdRef.current = deviceId;

      const pairRes = await hubFetch(`/api/devices/${deviceId}/pairing-token`, { method: "POST" });
      if (!pairRes.ok) {
        const text = await pairRes.text();
        setError(`Failed to generate token: ${text.slice(0, 200)}`);
        return;
      }
      const pairData = await pairRes.json();
      setPairing({
        token: pairData.token,
        deviceId: pairData.deviceId || deviceId,
        expiresIn: pairData.expiresIn ?? 600,
        createdAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  function handleRefreshToken() {
    const id = deviceIdRef.current || pairing?.deviceId;
    if (id) regenerateToken(id);
    else initDevice();
  }

  // Listen for device connection
  useEffect(() => {
    if (remotePhase !== "waiting" || !pairing) return;
    let done = false;

    let unsubWs: (() => void) | null = null;
    (async () => {
      try {
        const { gatewayConnection, connectGatewayWs } = await import("$/lib/openclaw-gateway-ws");
        const { getUserToken } = await import("$/lib/hub-direct");
        if (!gatewayConnection.wsUrl) {
          const token = await getUserToken();
          if (token) {
            const hubUrl = process.env.NEXT_PUBLIC_HUB_API_URL || "https://hub.hypercho.com";
            connectGatewayWs(hubUrl, { token, hubMode: true });
          }
        }
        unsubWs = gatewayConnection.on("device_connected", (msg) => {
          if (msg.deviceId === pairing.deviceId && !done) {
            done = true;
            setRemotePhase("connected");
          }
        });
      } catch { /* ignore */ }
    })();

    const interval = setInterval(async () => {
      if (done) return;
      try {
        const res = await hubFetch("/api/devices");
        if (!res.ok) return;
        const devices = await res.json();
        const device = devices.find(
          (d: any) => d.id === pairing.deviceId && d.status === "online"
        );
        if (device) {
          done = true;
          clearInterval(interval);
          setRemotePhase("connected");
        }
        setPollCount((c) => c + 1);
      } catch { /* ignore */ }
    }, 5000);

    return () => {
      clearInterval(interval);
      unsubWs?.();
    };
  }, [remotePhase, pairing]);

  const installCommand = pairing
    ? `curl -fsSL https://hub.hypercho.com/downloads/install.sh | bash -s -- --token ${pairing.token} --device-id ${pairing.deviceId}`
    : "";

  const copyCommand = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expired = secondsLeft <= 0 && pairing !== null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  // ── Choice not made yet ──
  if (!choice) {
    return (
      <motion.div
        className="text-center space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-3" variants={fadeUp}>
          <h1 className="text-[28px] font-medium text-white tracking-tight">
            Where will you run it?
          </h1>
          <p className="text-white/40 text-[15px] max-w-sm mx-auto">
            Choose where your AI runtimes will be deployed.
          </p>
        </motion.div>

        <motion.div className="space-y-3 max-w-sm mx-auto" variants={fadeUp}>
          {/* Local — only available in Electron */}
          <motion.button
            onClick={() => isElectron && (() => { setChoice("local"); onComplete("local"); })()}
            disabled={!isElectron}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
              isElectron
                ? "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06] cursor-pointer"
                : "border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed"
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: isElectron ? 1 : 0.4, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: EASE }}
            whileHover={isElectron ? { y: -1 } : {}}
            whileTap={isElectron ? { y: 0 } : {}}
          >
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-white/90 flex items-center gap-2">
                This machine
                {!isElectron && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/25">desktop app only</span>
                )}
              </div>
              <div className="text-[12px] text-white/30 mt-0.5">
                Run runtimes directly on this computer
              </div>
            </div>
          </motion.button>

          {/* Remote */}
          <motion.button
            onClick={() => setChoice("remote")}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all duration-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-white/90">A different machine</div>
              <div className="text-[12px] text-white/30 mt-0.5">
                Connect a remote server or device via the connector
              </div>
            </div>
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Remote: check for existing device or pair new one ──

  // Still checking for existing devices
  if (checkingExisting) {
    return (
      <motion.div
        className="text-center space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-3" variants={fadeUp}>
          <h1 className="text-[28px] font-medium text-white tracking-tight">
            Checking devices...
          </h1>
        </motion.div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-white/30" />
        </div>
      </motion.div>
    );
  }

  // Found an existing connected device — ask if they want to use it or add new
  if (existingDevice && !wantsNewDevice) {
    return (
      <motion.div
        className="text-center space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-3" variants={fadeUp}>
          <h1 className="text-[28px] font-medium text-white tracking-tight">
            Device already connected
          </h1>
          <p className="text-white/40 text-[15px] max-w-sm mx-auto">
            <span className="text-white/60">{existingDevice.name}</span> is online. Use this device or connect a new one?
          </p>
        </motion.div>

        <motion.div className="space-y-3 max-w-sm mx-auto" variants={fadeUp}>
          <motion.button
            onClick={() => onComplete("remote")}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.08] text-left transition-all duration-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: EASE }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 text-green-400/70" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-white/90">Use {existingDevice.name}</div>
              <div className="text-[12px] text-white/30 mt-0.5">
                Continue with the device that's already connected
              </div>
            </div>
          </motion.button>

          <motion.button
            onClick={() => setWantsNewDevice(true)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all duration-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-white/90">Connect a new device</div>
              <div className="text-[12px] text-white/30 mt-0.5">
                Pair a different remote machine
              </div>
            </div>
          </motion.button>
        </motion.div>

        {/* Back to choice */}
        <motion.div variants={fadeUp}>
          <button
            onClick={() => { setChoice(null); setExistingDevice(null); }}
            className="text-[12px] text-white/25 hover:text-white/40 transition-colors"
          >
            &larr; Change selection
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Connector pairing flow ──
  return (
    <motion.div
      className="text-center space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Connect your device
        </h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          Run this command on the remote machine to install the connector.
        </p>
      </motion.div>

      <motion.div className="max-w-sm mx-auto" variants={fadeUp}>
        {remotePhase === "connected" ? (
          <motion.div
            className="bg-white/[0.04] rounded-xl border border-white/15 p-5 text-center space-y-3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center justify-center gap-2">
              <Check className="w-4 h-4 text-green-400/80" />
              <span className="text-[14px] text-white/80 font-medium">Device connected</span>
            </div>
            <p className="text-[12px] text-white/30">
              Your remote device is online. Continue to set up runtimes.
            </p>
            <motion.button
              onClick={() => onComplete("remote")}
              className="mt-2 min-h-[40px] px-6 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/[0.15] border border-white/10 hover:border-white/20 transition-all"
              whileHover={{ y: -1 }}
              whileTap={{ y: 0 }}
            >
              Continue
            </motion.button>
          </motion.div>
        ) : remotePhase === "waiting" ? (
          <div className="bg-white/[0.04] rounded-xl border border-white/8 p-5 text-center space-y-3">
            <Loader2 className="w-5 h-5 animate-spin text-white/30 mx-auto" />
            <div>
              <p className="text-[13px] text-white/60">Waiting for connection...</p>
              <p className="text-[11px] text-white/20 mt-1">Checked {pollCount} time{pollCount !== 1 ? "s" : ""}</p>
            </div>
            <button
              onClick={() => setRemotePhase("pairing")}
              className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
            >
              Show install command
            </button>
          </div>
        ) : (
          /* pairing phase — show install command */
          <div className="space-y-3">
            {error && (
              <div className="text-[12px] text-red-400/80 bg-red-500/10 rounded-xl px-3 py-2 space-y-1">
                <p>{error}</p>
                <button onClick={initDevice} className="underline text-white/40 hover:text-white/60">Retry</button>
              </div>
            )}

            {creating && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-white/30" />
              </div>
            )}

            {pairing && !creating && (
              <div className="space-y-2.5 text-left">
                <div className="flex items-center gap-2 text-[11px] text-white/35">
                  <Terminal className="w-3 h-3" />
                  Run on the remote machine
                </div>
                <div className={`relative ${expired ? "opacity-30" : ""}`}>
                  <pre className="bg-white/[0.04] border border-white/8 rounded-xl p-3 pr-10 text-[11px] font-mono text-white/60 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {installCommand}
                  </pre>
                  {!expired && (
                    <button
                      onClick={copyCommand}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-white/60" /> : <Copy className="w-3 h-3 text-white/40" />}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  {expired ? (
                    <p className="text-[10px] text-red-400/60">Token expired</p>
                  ) : (
                    <p className="text-[10px] text-white/20">
                      Expires in {minutes}:{seconds.toString().padStart(2, "0")}
                    </p>
                  )}
                  <button
                    onClick={handleRefreshToken}
                    className="flex items-center gap-1 text-[10px] text-white/20 hover:text-white/40 transition-colors"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    {expired ? "New token" : "Refresh"}
                  </button>
                </div>
                <button
                  onClick={() => setRemotePhase("waiting")}
                  className="w-full text-[12px] text-white/40 hover:text-white/60 border border-white/10 hover:border-white/15 rounded-lg px-3 py-2 transition-all"
                >
                  I've run it — wait for connection
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Back to choice */}
      <motion.div variants={fadeUp}>
        <button
          onClick={() => { setChoice(null); setRemotePhase("pairing"); }}
          className="text-[12px] text-white/25 hover:text-white/40 transition-colors"
        >
          &larr; Change selection
        </button>
      </motion.div>
    </motion.div>
  );
}
