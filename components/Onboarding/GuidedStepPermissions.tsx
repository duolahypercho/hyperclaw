import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, Mic, Keyboard, Monitor, Check } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface PermissionStatus {
  accessibility: "unknown" | "granted" | "denied";
  microphone: "unknown" | "granted" | "denied";
  screen: "unknown" | "granted" | "denied";
}

interface GuidedStepPermissionsProps {
  onComplete: () => void;
}

export default function GuidedStepPermissions({ onComplete }: GuidedStepPermissionsProps) {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const [status, setStatus] = useState<PermissionStatus>({
    accessibility: "unknown",
    microphone: "unknown",
    screen: "unknown",
  });
  const [requesting, setRequesting] = useState<string | null>(null);


  const checkPermissions = useCallback(async () => {
    if (!window.electronAPI?.permissions) {
      console.log("[permissions] electronAPI.permissions not available");
      return;
    }
    try {
      const [acc, mic, scr] = await Promise.all([
        window.electronAPI.permissions.checkAccessibility(),
        window.electronAPI.permissions.checkMicrophone(),
        window.electronAPI.permissions.checkScreen?.() ?? Promise.resolve(false),
      ]);
      console.log("[permissions] check result:", { acc, mic, scr });
      setStatus({
        accessibility: acc ? "granted" : "denied",
        microphone: mic ? "granted" : "denied",
        screen: scr ? "granted" : "denied",
      });
    } catch (err) {
      console.error("[permissions] check failed:", err);
    }
  }, []);

  useEffect(() => {
    if (isElectron) checkPermissions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 2s while any permission is not granted yet
  // Catches when the user toggles the switch in System Settings and comes back
  useEffect(() => {
    if (!isElectron) return;
    const allGranted = status.accessibility === "granted" && status.microphone === "granted" && status.screen === "granted";
    if (!allGranted) {
      // Always poll — covers both "unknown" (initial) and "denied" states
      const interval = setInterval(checkPermissions, 2000);
      return () => clearInterval(interval);
    }
  }, [isElectron, status, checkPermissions]);

  const requestAccessibility = async () => {
    if (!window.electronAPI?.permissions) return;
    setRequesting("accessibility");
    try {
      await window.electronAPI.permissions.requestAccessibility();
    } catch { /* ignore */ }
    setRequesting(null);
    // Polling will pick up the change when user toggles in System Settings
  };

  const requestMicrophone = async () => {
    if (!window.electronAPI?.permissions) return;
    setRequesting("microphone");
    try {
      const granted = await window.electronAPI.permissions.requestMicrophone();
      setStatus((s) => ({ ...s, microphone: granted ? "granted" : "denied" }));
    } catch { /* ignore */ }
    setRequesting(null);
  };

  const requestScreen = async () => {
    if (!window.electronAPI?.permissions) return;
    setRequesting("screen");
    try {
      await window.electronAPI.permissions.requestScreen();
    } catch { /* ignore */ }
    setRequesting(null);
    // Polling will pick up the change when user toggles in System Settings
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") onComplete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onComplete]);

  const allGranted = isElectron
    ? status.accessibility === "granted" && status.microphone === "granted" && status.screen === "granted"
    : false;

  const items = [
    {
      key: "accessibility",
      icon: Keyboard,
      title: "Paste text anywhere",
      subtitle: "Let HyperClaw type into other apps for you",
      status: status.accessibility,
      onRequest: requestAccessibility,
    },
    {
      key: "microphone",
      icon: Mic,
      title: "Use microphone",
      subtitle: "Talk to your agents with voice commands",
      status: status.microphone,
      onRequest: requestMicrophone,
    },
    {
      key: "screen",
      icon: Monitor,
      title: "Read screen",
      subtitle: "Let HyperClaw see what's on your screen",
      status: status.screen,
      onRequest: requestScreen,
    },
  ];

  return (
    <motion.div
      className="text-center space-y-8"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Enable superpowers
        </h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          HyperClaw works best with these permissions.
        </p>
      </motion.div>

      <motion.div className="space-y-2.5 max-w-sm mx-auto" variants={fadeUp}>
        {items.map((item, i) => (
          <motion.div
            key={item.key}
            className={`flex items-center gap-4 rounded-xl border p-4 transition-all duration-300 ${
              item.status === "granted"
                ? "bg-white/[0.04] border-white/15"
                : "bg-white/[0.03] border-white/8 hover:border-white/12"
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.45, ease: EASE }}
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <item.icon className="w-4.5 h-4.5 text-white/50" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-[14px] font-medium text-white/90">{item.title}</div>
              <div className="text-[12px] text-white/30 mt-0.5">{item.subtitle}</div>
            </div>
            {!isElectron ? (
              <span className="text-[11px] text-white/20 shrink-0">Desktop only</span>
            ) : item.status === "granted" ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
              >
                <Check className="w-4.5 h-4.5 text-white/60" />
              </motion.div>
            ) : (
              <button
                onClick={item.onRequest}
                disabled={requesting === item.key}
                className="shrink-0 text-[13px] text-white/50 hover:text-white/80 border border-white/12 hover:border-white/25 rounded-lg px-3.5 py-1.5 transition-all disabled:opacity-40"
              >
                {requesting === item.key ? "..." : "Allow"}
              </button>
            )}
          </motion.div>
        ))}
      </motion.div>

      {isElectron && (status.accessibility === "denied" || status.screen === "denied") && requesting === null && (
        <motion.p
          className="text-[12px] text-white/20 max-w-xs mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Some permissions open System Settings. Toggle HyperClaw on, then come back.
        </motion.p>
      )}

      <motion.div variants={fadeUp}>
        <motion.button
          onClick={onComplete}
          className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/[0.15] border border-white/10 hover:border-white/20 transition-all"
          whileHover={{ y: -1 }}
          whileTap={{ y: 0 }}
        >
          {!isElectron || allGranted ? "Continue" : "Skip for now"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
