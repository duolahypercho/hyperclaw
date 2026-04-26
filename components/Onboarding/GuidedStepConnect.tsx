"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Check, Copy, Terminal, RefreshCw, Monitor, Globe, Server, Code2,
} from "lucide-react";
import { hubFetch } from "$/lib/hub-direct";
import { useUser } from "$/Providers/UserProv";
import {
  OpenClawIcon,
  HermesIcon,
  ClaudeCodeIcon,
  CodexIcon,
} from "./RuntimeIcons";

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
export type RuntimeChoice = "openclaw" | "hermes" | "claude-code" | "codex";

interface PairingInfo {
  token: string;
  deviceId: string;
  expiresIn: number;
  createdAt: number;
}

interface GuidedStepConnectProps {
  onComplete: (selection: {
    deviceChoice: Exclude<DeviceChoice, null>;
    runtimeChoices: RuntimeChoice[];
  }) => void;
  initialDeviceChoice?: "local" | "remote";
  initialRuntimeChoices?: RuntimeChoice[];
}

const runtimeOptions: Array<{
  value: RuntimeChoice;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
}> = [
  {
    value: "openclaw",
    icon: OpenClawIcon,
    label: "OpenClaw",
    desc: "Open-source multi-channel AI messaging gateway",
  },
  {
    value: "hermes",
    icon: HermesIcon,
    label: "Hermes",
    desc: "Nous Research autonomous agent runtime",
  },
  {
    value: "claude-code",
    icon: ClaudeCodeIcon,
    label: "Claude Code",
    desc: "Anthropic CLI runtime for coding and long-form work",
  },
  {
    value: "codex",
    icon: CodexIcon,
    label: "Codex",
    desc: "OpenAI coding runtime routed through the connector",
  },
];

export default function GuidedStepConnect({ onComplete, initialDeviceChoice, initialRuntimeChoices }: GuidedStepConnectProps) {
  const { logout } = useUser();
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const canInstallOnThisMachine = isElectron && !!window.electronAPI?.runtimes?.installLocalConnector;
  const [choice, setChoice] = useState<DeviceChoice>(initialDeviceChoice ?? null);
  const [stage, setStage] = useState<"location" | "runtime" | "remote">(initialDeviceChoice ? "runtime" : "location");
  const [runtimeChoices, setRuntimeChoices] = useState<RuntimeChoice[]>(initialRuntimeChoices ?? ["openclaw"]);
  const [runtimeStatus, setRuntimeStatus] = useState<Record<RuntimeChoice, { installed: boolean; version: string | null } | null> | null>(null);
  const [loadingRuntimeStatus, setLoadingRuntimeStatus] = useState(false);

  const [remotePhase, setRemotePhase] = useState<"pairing" | "waiting" | "connected">("pairing");
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  const [checkingExisting, setCheckingExisting] = useState(false);
  const [existingDevice, setExistingDevice] = useState<{ id: string; name: string } | null>(null);
  const [wantsNewDevice, setWantsNewDevice] = useState(false);
  const selectedRuntimeSet = new Set(runtimeChoices);

  useEffect(() => {
    if (stage !== "runtime" || choice !== "local" || !canInstallOnThisMachine || !window.electronAPI?.runtimes?.detectLocal) {
      setRuntimeStatus(null);
      setLoadingRuntimeStatus(false);
      return;
    }

    let cancelled = false;
    setLoadingRuntimeStatus(true);

    window.electronAPI.runtimes.detectLocal()
      .then((results) => {
        if (cancelled) return;
        setRuntimeStatus({
          openclaw: results?.openclaw ? { installed: !!results.openclaw.installed, version: results.openclaw.version } : null,
          hermes: results?.hermes ? { installed: !!results.hermes.installed, version: results.hermes.version } : null,
          "claude-code": results?.claude ? { installed: !!results.claude.installed, version: results.claude.version } : null,
          codex: results?.codex ? { installed: !!results.codex.installed, version: results.codex.version } : null,
        });
      })
      .catch(() => {
        if (!cancelled) setRuntimeStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRuntimeStatus(false);
      });

    return () => { cancelled = true; };
  }, [canInstallOnThisMachine, choice, stage]);

  const regenerateToken = useCallback(async (deviceId: string) => {
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
  }, []);

  const createDevice = useCallback(async () => {
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
      await regenerateToken(deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
    }
  }, [regenerateToken]);

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
  }, [createDevice, regenerateToken]);

  useEffect(() => {
    if (choice !== "remote" || stage !== "remote") return;
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
  }, [choice, stage, initDevice]);

  useEffect(() => {
    if (wantsNewDevice && !pairing && !creating) {
      initDevice();
    }
  }, [wantsNewDevice, pairing, creating, initDevice]);

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

  function handleRefreshToken() {
    const id = deviceIdRef.current || pairing?.deviceId;
    if (id) regenerateToken(id);
    else initDevice();
  }

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
          (d: any) => (d.id || d._id) === pairing.deviceId && d.status === "online"
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

  if (stage === "location") {
    return (
      <motion.div
        className="text-center space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-3" variants={fadeUp}>
          <h1 className="text-[28px] font-medium text-foreground tracking-tight">
            Where will you run it?
          </h1>
          <p className="text-foreground/40 text-[15px] max-w-sm mx-auto">
            Choose where your AI runtimes will be deployed.
          </p>
        </motion.div>

        <motion.div className="space-y-3 max-w-sm mx-auto" variants={fadeUp}>
          <motion.button
            onClick={() => {
              if (!canInstallOnThisMachine) return;
              setChoice("local");
              setStage("runtime");
            }}
            disabled={!canInstallOnThisMachine}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
              canInstallOnThisMachine
                ? "border-foreground/8 bg-foreground/[0.03] hover:border-foreground/15 hover:bg-foreground/[0.06] cursor-pointer"
                : "border-foreground/5 bg-foreground/[0.02] opacity-40 cursor-not-allowed"
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: canInstallOnThisMachine ? 1 : 0.4, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: EASE }}
            whileHover={canInstallOnThisMachine ? { y: -1 } : {}}
            whileTap={canInstallOnThisMachine ? { y: 0 } : {}}
          >
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 text-foreground/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-foreground/90 flex items-center gap-2">
                This machine
                {!canInstallOnThisMachine && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/8 text-foreground/25">desktop app only</span>
                )}
              </div>
              <div className="text-[12px] text-foreground/30 mt-0.5">
                {canInstallOnThisMachine
                  ? "Install the connector here, then run all setup through that connector"
                  : "Available only in the desktop app after local connector bootstrap"}
              </div>
            </div>
          </motion.button>

          <motion.button
            onClick={() => {
              setChoice("remote");
              setStage("runtime");
            }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-foreground/8 bg-foreground/[0.03] hover:border-foreground/15 hover:bg-foreground/[0.06] text-left transition-all duration-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-foreground/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-foreground/90">A different machine</div>
              <div className="text-[12px] text-foreground/30 mt-0.5">
                Connect an existing server, browser-paired device, or another machine via the connector
              </div>
            </div>
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (stage === "runtime" && choice) {
    return (
      <motion.div
        className="h-full flex flex-col text-center"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 customScrollbar2">
          <div className="space-y-6">
            <motion.div className="space-y-3" variants={fadeUp}>
              <h1 className="text-[28px] font-medium text-foreground tracking-tight">
                Which runtime do you want?
              </h1>
              <p className="text-foreground/40 text-[15px] max-w-sm mx-auto">
                Pick one or more runtimes for Hyperclaw to use on this {choice === "local" ? "machine" : "device"}.
                {choice === "local" ? " Hyperclaw will bootstrap the connector first, then hand runtime setup off to that connector." : ""}
              </p>
            </motion.div>

            <motion.div className="space-y-2.5 max-w-sm mx-auto" variants={fadeUp}>
              {runtimeOptions.map((option, index) => {
                const isSelected = selectedRuntimeSet.has(option.value);
                const RuntimeIcon = option.icon;
                const status = runtimeStatus?.[option.value] ?? null;
                return (
                  <motion.button
                    key={option.value}
                    onClick={() => {
                      setRuntimeChoices((prev) => (
                        prev.includes(option.value)
                          ? prev.filter((value) => value !== option.value)
                          : [...prev, option.value]
                      ));
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-300 ${
                      isSelected
                        ? "bg-foreground/[0.06] border-foreground/20"
                        : "bg-foreground/[0.03] border-foreground/8 hover:border-foreground/12 hover:bg-foreground/[0.05]"
                    }`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14 + index * 0.05, duration: 0.4, ease: EASE }}
                    whileTap={{ scale: 0.995 }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
                      <RuntimeIcon className={option.value === "hermes" ? "w-10 h-10 object-contain" : "w-6 h-6 object-contain"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-foreground/90 flex items-center gap-2">
                        {option.label}
                        {choice === "local" && status?.installed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600/20 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300/80">
                            Installed
                          </span>
                        )}
                        {choice === "local" && status && !status.installed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-600/20 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300/80">
                            Not installed
                          </span>
                        )}
                        {choice === "local" && loadingRuntimeStatus && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/20 text-foreground/60 dark:bg-foreground/8 dark:text-foreground/35">
                            Checking...
                          </span>
                        )}
                   
                      </div>
                      <div className="text-[12px] text-foreground/30 mt-0.5">{option.desc}</div>
                      {choice === "local" && status?.version && (
                        <div className="text-[10px] text-foreground/20 mt-1">{status.version}</div>
                      )}
                      {choice === "remote" && (
                        <div className="text-[10px] text-foreground/20 mt-1">
                          Install status will be checked after this device connects.
                        </div>
                      )}
                    </div>
                    <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-300 ${
                      isSelected ? "border-foreground/60" : "border-foreground/15"
                    }`}>
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            className="w-2 h-2 rounded-full bg-foreground/80"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ duration: 0.2, ease: EASE }}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        </div>

        <motion.div
          className="mt-4 pt-4 border-t border-foreground/8 flex items-center justify-center gap-3"
          variants={fadeUp}
        >
          <motion.button
            onClick={() => {
              setStage("location");
              setChoice(null);
            }}
            className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-foreground/80 bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/8 hover:border-foreground/15 transition-all"
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            Back
          </motion.button>
          <motion.button
            onClick={() => {
              if (choice === "local") {
                onComplete({ deviceChoice: "local", runtimeChoices });
                return;
              }
              setStage("remote");
            }}
            disabled={runtimeChoices.length === 0}
            className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/80 disabled:bg-foreground/[0.03] disabled:text-foreground/30 disabled:border-foreground/6 disabled:cursor-not-allowed border border-foreground/10 hover:border-foreground/20 transition-all"
            whileHover={runtimeChoices.length > 0 ? { y: -1 } : {}}
            whileTap={runtimeChoices.length > 0 ? { y: 0 } : {}}
          >
            Continue
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (checkingExisting) {
    return (
      <motion.div
        className="text-center space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-3" variants={fadeUp}>
          <h1 className="text-[28px] font-medium text-foreground tracking-tight">
            Checking devices...
          </h1>
        </motion.div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-foreground/30" />
        </div>
      </motion.div>
    );
  }

  if (existingDevice && !wantsNewDevice) {
    return (
      <motion.div
        className="text-center space-y-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-3" variants={fadeUp}>
          <h1 className="text-[28px] font-medium text-foreground tracking-tight">
            Device already connected
          </h1>
          <p className="text-foreground/40 text-[15px] max-w-sm mx-auto">
            <span className="text-foreground/60">{existingDevice.name}</span> is online. Use this device or connect a new one?
          </p>
        </motion.div>

        <motion.div className="space-y-3 max-w-sm mx-auto" variants={fadeUp}>
          <motion.button
            onClick={() => onComplete({ deviceChoice: "remote", runtimeChoices })}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-foreground/15 bg-foreground/[0.06] hover:bg-foreground/[0.08] text-left transition-all duration-200"
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
              <div className="text-[14px] font-medium text-foreground/90">Use {existingDevice.name}</div>
              <div className="text-[12px] text-foreground/30 mt-0.5">
                Continue with the device that&apos;s already connected
              </div>
            </div>
          </motion.button>

          <motion.button
            onClick={() => setWantsNewDevice(true)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-foreground/8 bg-foreground/[0.03] hover:border-foreground/15 hover:bg-foreground/[0.06] text-left transition-all duration-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-foreground/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-foreground/90">Connect a new device</div>
              <div className="text-[12px] text-foreground/30 mt-0.5">
                Pair a different remote machine
              </div>
            </div>
          </motion.button>
        </motion.div>

        <motion.div variants={fadeUp}>
          <button
            onClick={() => {
              setStage("runtime");
              setExistingDevice(null);
              setWantsNewDevice(false);
            }}
            className="text-[12px] text-foreground/25 hover:text-foreground/40 transition-colors"
          >
            &larr; Change runtime
          </button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="text-center space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-foreground tracking-tight">
          Connect your device
        </h1>
        <p className="text-foreground/40 text-[15px] max-w-sm mx-auto">
          Run this command on the remote machine to install the connector.
        </p>
      </motion.div>

      <motion.div className="max-w-sm mx-auto" variants={fadeUp}>
        {remotePhase === "connected" ? (
          <motion.div
            className="bg-foreground/[0.04] rounded-xl border border-foreground/15 p-5 text-center space-y-3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center justify-center gap-2">
              <Check className="w-4 h-4 text-green-400/80" />
              <span className="text-[14px] text-foreground/80 font-medium">Device connected</span>
            </div>
            <p className="text-[12px] text-foreground/30">
              Your remote device is online. Continue to set up your runtime.
            </p>
            <motion.button
              onClick={() => onComplete({ deviceChoice: "remote", runtimeChoices })}
              className="mt-2 min-h-[40px] px-6 py-2 rounded-lg text-sm font-medium text-foreground bg-foreground/10 hover:bg-foreground/[0.15] border border-foreground/10 hover:border-foreground/20 transition-all"
              whileHover={{ y: -1 }}
              whileTap={{ y: 0 }}
            >
              Continue
            </motion.button>
          </motion.div>
        ) : remotePhase === "waiting" ? (
          <div className="bg-foreground/[0.04] rounded-xl border border-foreground/8 p-5 text-center space-y-3">
            <Loader2 className="w-5 h-5 animate-spin text-foreground/30 mx-auto" />
            <div>
              <p className="text-[13px] text-foreground/60">Waiting for connection...</p>
              <p className="text-[11px] text-foreground/20 mt-1">Checked {pollCount} time{pollCount !== 1 ? "s" : ""}</p>
            </div>
            <button
              onClick={() => setRemotePhase("pairing")}
              className="text-[12px] text-foreground/30 hover:text-foreground/50 transition-colors"
            >
              Show install command
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="text-[12px] text-red-400/80 bg-red-500/10 rounded-xl px-3 py-2 space-y-1">
                <p>{error}</p>
                <div className="flex items-center gap-3 justify-center">
                  <button onClick={initDevice} className="underline text-foreground/40 hover:text-foreground/60">Retry</button>
                  <button onClick={logout} className="underline text-foreground/40 hover:text-foreground/60">Log out</button>
                </div>
              </div>
            )}

            {creating && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-foreground/30" />
              </div>
            )}

            {pairing && !creating && (
              <div className="space-y-2.5 text-left">
                <div className="flex items-center gap-2 text-[11px] text-foreground/35">
                  <Terminal className="w-3 h-3" />
                  Run on the remote machine
                </div>
                <div className={`relative ${expired ? "opacity-30" : ""}`}>
                  <pre className="bg-foreground/[0.04] border border-foreground/8 rounded-xl p-3 pr-10 text-[11px] font-mono text-foreground/60 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {installCommand}
                  </pre>
                  {!expired && (
                    <button
                      onClick={copyCommand}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-green-400/80" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-foreground/35" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {expired ? (
                    <p className="text-[10px] text-red-400/70 font-medium">Token expired</p>
                  ) : (
                    <p className="text-[10px] text-foreground/25">
                      Expires in {minutes}:{seconds.toString().padStart(2, "0")}
                    </p>
                  )}
                  <button
                    onClick={handleRefreshToken}
                    className="flex items-center gap-1 text-[10px] text-foreground/25 hover:text-foreground/40 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {expired ? "Generate new token" : "Refresh"}
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <motion.button
                    onClick={() => setRemotePhase("waiting")}
                    className="min-h-[40px] px-5 py-2 rounded-lg text-sm font-medium text-foreground bg-foreground/10 hover:bg-foreground/[0.15] border border-foreground/10 hover:border-foreground/20 transition-all"
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0 }}
                  >
                    I&apos;ve run it
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <motion.div variants={fadeUp}>
        <button
          onClick={() => {
            setStage("runtime");
            setExistingDevice(null);
            setWantsNewDevice(false);
            setRemotePhase("pairing");
          }}
          className="text-[12px] text-foreground/25 hover:text-foreground/40 transition-colors"
        >
          &larr; Change runtime
        </button>
      </motion.div>
    </motion.div>
  );
}
