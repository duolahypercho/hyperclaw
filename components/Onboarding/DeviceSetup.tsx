"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  Copy,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hubFetch } from "$/lib/hub-direct";
import { useUser } from "$/Providers/UserProv";

interface PairingInfo {
  token: string;
  deviceId: string;
  expiresIn: number;
  createdAt: number; // timestamp when token was received
}

interface DeviceSetupProps {
  onComplete: () => void;
}

export default function DeviceSetup({ onComplete }: DeviceSetupProps) {
  const { logout } = useUser();
  const [step, setStep] = useState<"setup" | "waiting">("setup");
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const deviceIdRef = useRef<string | null>(null);

  // On mount: check for existing device, reuse it or create new
  useEffect(() => {
    initDevice();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!pairing) return;
    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - pairing.createdAt) / 1000);
      const remaining = Math.max(0, (pairing.expiresIn ?? 600) - elapsed);
      setSecondsLeft(remaining);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pairing]);

  async function initDevice() {
    setCreating(true);
    setError(null);
    try {
      const devRes = await hubFetch("/api/devices");
      if (devRes.ok) {
        const devices = await devRes.json();
        // Find a device that hasn't connected yet
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
      setError(err instanceof Error ? err.message : "Failed to initialize device");
      setCreating(false);
    }
  }

  async function regenerateToken(deviceId: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await hubFetch(`/api/devices/${deviceId}/pairing-token`, {
        method: "POST",
      });
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
      // Step 1: Create device
      const createRes = await hubFetch("/api/devices", {
        method: "POST",
        body: JSON.stringify({ name: "OpenClaw", type: "connector" }),
      });
      if (!createRes.ok) {
        const text = await createRes.text();
        setError(`Failed to create device (${createRes.status}): ${text.slice(0, 200)}`);
        return;
      }
      const device = await createRes.json();
      const deviceId = device.id || device._id;
      deviceIdRef.current = deviceId;

      // Step 2: Generate pairing token
      const pairRes = await hubFetch(`/api/devices/${deviceId}/pairing-token`, {
        method: "POST",
      });
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
    if (id) {
      regenerateToken(id);
    } else {
      initDevice();
    }
  }

  // Poll for device connection in "waiting" step
  useEffect(() => {
    if (step !== "waiting" || !pairing) return;
    const interval = setInterval(async () => {
      try {
        const res = await hubFetch("/api/devices");
        if (!res.ok) return;
        const devices = await res.json();
        const device = devices.find(
          (d: any) => d.id === pairing.deviceId && d.status === "online"
        );
        if (device) {
          clearInterval(interval);
          onComplete();
        }
        setPollCount((c) => c + 1);
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, pairing, onComplete]);

  const hubBase = process.env.NEXT_PUBLIC_HUB_URL?.replace(/^wss?/, "https") || "https://hub.hypercho.com";
  const installCommand = pairing
    ? `curl -fsSL ${hubBase}/downloads/install.sh | bash -s -- --token ${pairing.token} --device-id ${pairing.deviceId}`
    : "";

  const copyCommand = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expired = secondsLeft <= 0 && pairing !== null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {step === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Logo + title */}
              <div className="text-center space-y-4">
                <motion.div
                  className="w-16 h-16 mx-auto rounded-xl overflow-hidden"
                  animate={{
                    boxShadow: [
                      "0 0 0 0 rgba(59,130,246,0.3)",
                      "0 0 0 16px rgba(59,130,246,0)",
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <img src="/Logopic.png" alt="Hyperclaw" className="w-full h-full object-cover" />
                </motion.div>
                <div>
                  <h1 className="text-xl font-bold mb-1">Connect Your OpenClaw</h1>
                  <p className="text-sm text-muted-foreground">
                    Install the connector on your machine to get started.
                  </p>
                </div>
              </div>

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 space-y-2">
                  <p>{error}</p>
                  <div className="flex items-center gap-3">
                    <button onClick={initDevice} className="underline">
                      Retry
                    </button>
                    <button onClick={logout} className="underline">
                      Log out
                    </button>
                  </div>
                </div>
              )}

              {creating && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {pairing && !creating && (
                <div className="space-y-4">
                  {/* Install command */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Terminal className="w-3.5 h-3.5" />
                      Run in your terminal
                    </div>
                    <div className={`relative ${expired ? "opacity-40" : ""}`}>
                      <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-3 pr-10 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                        {installCommand}
                      </pre>
                      {!expired && (
                        <button
                          onClick={copyCommand}
                          className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Timer + refresh */}
                    <div className="flex items-center justify-between">
                      {expired ? (
                        <p className="text-[10px] text-destructive font-medium">
                          Token expired
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          Expires in {minutes}:{seconds.toString().padStart(2, "0")}
                        </p>
                      )}
                      <button
                        onClick={handleRefreshToken}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {expired ? "Generate new token" : "Refresh"}
                      </button>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex justify-end pt-2">
                    <Button size="sm" onClick={() => setStep("waiting")}>
                      I've run it
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Waiting */}
          {step === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-6"
            >
              <motion.div
                className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
                animate={{
                  boxShadow: [
                    "0 0 0 0 rgba(59,130,246,0.3)",
                    "0 0 0 20px rgba(59,130,246,0)",
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </motion.div>

              <div>
                <h2 className="text-lg font-semibold mb-1">Waiting for Connection</h2>
                <p className="text-sm text-muted-foreground">
                  Listening for your connector...
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Checked {pollCount} time{pollCount !== 1 ? "s" : ""}
                </p>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setStep("setup")}>
                Back
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
