import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface GuidedStep2Props {
  onComplete: (agentName: string) => void;
}

export default function GuidedStep2({ onComplete }: GuidedStep2Props) {
  const [agentName, setAgentName] = useState("CEO");

  const handleSubmit = () => {
    if (!agentName.trim()) return;
    onComplete(agentName.trim());
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && agentName.trim()) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [agentName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="text-center space-y-8"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Name your first agent
        </h1>
        <p className="text-white/40 text-[15px]">
          This is the AI agent that will run on your behalf.
        </p>
      </motion.div>

      <motion.div className="space-y-1.5 max-w-sm mx-auto text-left" variants={fadeUp}>
        <label className="text-[13px] text-white/50">
          Agent name
        </label>
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="e.g. CEO"
          className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3.5 py-3 text-[15px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors min-h-[48px]"
          autoFocus
        />
        <p className="text-[13px] text-white/20 pt-1">
          You can add more agents later from the Org Chart.
        </p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <motion.button
          onClick={handleSubmit}
          disabled={!agentName.trim()}
          className="min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/[0.15] disabled:opacity-20 disabled:hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
          whileHover={agentName.trim() ? { y: -1 } : {}}
          whileTap={agentName.trim() ? { y: 0 } : {}}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
