import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Rocket, Building2, Bot, Monitor, Check } from "lucide-react";
const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface GuidedStep4Props {
  companyName: string;
  agentName: string;
  provider?: string;
  onComplete: () => void;
}

export default function GuidedStep4({ companyName, agentName, provider, onComplete }: GuidedStep4Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") onComplete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onComplete]);

  const summaryItems = [
    { icon: Building2, label: "Company", value: companyName },
    { icon: Bot, label: "Agent", value: agentName },
    { icon: Monitor, label: "Provider", value: provider || "Not configured" },
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
          Ready to launch
        </h1>
        <p className="text-white/40 text-[15px]">
          Here&apos;s what we set up for you.
        </p>
      </motion.div>

      {/* Summary cards */}
      <div className="space-y-2 max-w-sm mx-auto">
        {summaryItems.map((item, i) => (
          <motion.div
            key={item.label}
            className="flex items-center gap-3.5 bg-white/[0.04] rounded-xl border border-white/8 p-3.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.45, ease: EASE }}
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <item.icon className="w-4 h-4 text-white/40" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[11px] uppercase tracking-wider text-white/25">{item.label}</div>
              <div className="text-[14px] font-medium text-white/90 mt-0.5">{item.value}</div>
            </div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.12, type: "spring", stiffness: 400, damping: 22 }}
            >
              <Check className="w-4 h-4 text-white/40 shrink-0" />
            </motion.div>
          </motion.div>
        ))}
      </div>

      <motion.div variants={fadeUp}>
        <motion.button
          onClick={onComplete}
          className="min-h-[48px] px-8 py-3 rounded-lg text-sm font-medium text-black bg-white hover:bg-white/90 transition-colors flex items-center gap-2 mx-auto"
          whileHover={{ y: -1 }}
          whileTap={{ y: 0 }}
          autoFocus
        >
          <Rocket className="w-4 h-4" />
          Launch dashboard
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
