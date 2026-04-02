import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { dashboardState } from "$/lib/dashboard-state";

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface GuidedStep1Props {
  onComplete: (data: { companyName: string; mission?: string }) => void;
}

export default function GuidedStep1({ onComplete }: GuidedStep1Props) {
  const [companyName, setCompanyName] = useState(() => {
    const saved = dashboardState.get("hyperclaw-company");
    if (saved) {
      try { return JSON.parse(saved).name || ""; } catch { /* ignore */ }
    }
    return "";
  });
  const [mission, setMission] = useState(() => {
    const saved = dashboardState.get("hyperclaw-company");
    if (saved) {
      try { return JSON.parse(saved).mission || ""; } catch { /* ignore */ }
    }
    return "";
  });

  const handleSubmit = () => {
    if (!companyName.trim()) return;
    dashboardState.set("hyperclaw-company", JSON.stringify({
      name: companyName.trim(),
      mission: mission.trim() || null,
      createdAt: new Date().toISOString(),
    }), { flush: true });
    onComplete({ companyName: companyName.trim(), mission: mission.trim() || undefined });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && companyName.trim()) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [companyName, mission]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="text-center space-y-8"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Create your company
        </h1>
        <p className="text-white/40 text-[15px]">
          Give your mission control an identity.
        </p>
      </motion.div>

      <motion.div className="space-y-5 max-w-sm mx-auto text-left" variants={fadeUp}>
        <div className="space-y-1.5">
          <label className="text-[13px] text-white/50">
            Company name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3.5 py-3 text-[15px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors min-h-[48px]"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] text-white/50">
            Mission / goal <span className="text-white/20">(optional)</span>
          </label>
          <textarea
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            placeholder="What are your agents working toward?"
            rows={3}
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3.5 py-3 text-[15px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors resize-none"
          />
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <motion.button
          onClick={handleSubmit}
          disabled={!companyName.trim()}
          className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/[0.15] disabled:opacity-20 disabled:hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
          whileHover={companyName.trim() ? { y: -1 } : {}}
          whileTap={companyName.trim() ? { y: 0 } : {}}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
