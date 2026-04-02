import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Server, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeviceSetup from "./DeviceSetup";

export type RuntimeChoice = "openclaw" | "hermes";

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface GuidedStep3Props {
  onComplete: (runtime: RuntimeChoice) => void;
}

export default function GuidedStep3({ onComplete }: GuidedStep3Props) {
  const [selected, setSelected] = useState<RuntimeChoice>("openclaw");
  const [showRemote, setShowRemote] = useState(false);
  const [showConnector, setShowConnector] = useState(false);

  const options = [
    {
      value: "openclaw" as RuntimeChoice,
      icon: Monitor,
      label: "OpenClaw",
      desc: "Local AI gateway with streaming, sessions, and agent lifecycle",
      disabled: false,
    },
    {
      value: "hermes" as RuntimeChoice,
      icon: Server,
      label: "Hermes Agent",
      desc: "Autonomous agent framework by Nous Research",
      disabled: true,
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
          Setup your runtime
        </h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          Which agent runtime do you want to run on this machine?
        </p>
      </motion.div>

      <motion.div className="space-y-2.5 max-w-sm mx-auto" variants={fadeUp}>
        {options.map((opt, i) => {
          const isSelected = selected === opt.value;
          return (
            <motion.button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-300 ${
                isSelected
                  ? "bg-white/[0.06] border-white/20"
                  : "bg-white/[0.03] border-white/8 hover:border-white/12 hover:bg-white/[0.05]"
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.45, ease: EASE }}
              whileTap={{ scale: 0.995 }}
            >
              <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                <opt.icon className="w-4.5 h-4.5 text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-white/90 flex items-center gap-2">
                  {opt.label}
                  {opt.disabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/25">coming soon</span>
                  )}
                </div>
                <div className="text-[12px] text-white/30 mt-0.5">{opt.desc}</div>
              </div>
              <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-300 ${
                isSelected ? "border-white/60" : "border-white/15"
              }`}>
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      className="w-2 h-2 rounded-full bg-white/80"
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

      {/* Remote device section */}
      <motion.div className="max-w-sm mx-auto" variants={fadeUp}>
        <button
          onClick={() => setShowRemote(!showRemote)}
          className="flex items-center gap-1.5 text-[12px] text-white/25 hover:text-white/40 transition-colors mx-auto"
        >
          <motion.div
            animate={{ rotate: showRemote ? 180 : 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
          Install on another machine or already installed?
        </button>

        <AnimatePresence>
          {showRemote && (
            <motion.div
              className="mt-4 space-y-3 overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {!showConnector ? (
                <div className="bg-white/[0.03] rounded-xl border border-white/8 p-4 space-y-3">
                  <p className="text-[12px] text-white/35 text-left">
                    If you want to connect a remote machine (VPS, work PC), install the connector there.
                    If you already installed, click below to pair.
                  </p>
                  <Button
                    onClick={() => setShowConnector(true)}
                    variant="outline"
                    size="sm"
                    className="w-full border-white/12 text-white hover:bg-white/8"
                  >
                    Show connector install command
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowConnector(false)}
                    className="text-white/30 hover:text-white/50 text-[12px] transition-colors"
                  >
                    &larr; Hide
                  </button>
                  <DeviceSetup onComplete={() => onComplete(selected)} embedded />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={fadeUp}>
        <motion.button
          onClick={() => onComplete(selected)}
          disabled={selected === "hermes"}
          className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/[0.15] disabled:opacity-20 disabled:hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
          whileHover={selected !== "hermes" ? { y: -1 } : {}}
          whileTap={selected !== "hermes" ? { y: 0 } : {}}
        >
          {selected === "hermes" ? "Coming soon" : "Continue"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
