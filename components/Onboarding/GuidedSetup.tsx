import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GuidedStepConnect from "./GuidedStepConnect";
import GuidedStepRuntimes, { type ProviderConfig } from "./GuidedStepRuntimes";
import GuidedStepPermissions from "./GuidedStepPermissions";
import GuidedStep1 from "./GuidedStep1";
import GuidedStep2 from "./GuidedStep2";
import GuidedStep4 from "./GuidedStep4";
import TechGridBackground from "./TechGridBackground";
import StepAnimations from "./StepAnimations";
import { dashboardState } from "$/lib/dashboard-state";

const TOTAL_STEPS = 6;
const GUIDED_STATE_KEY = "guided-setup-state";
const EASE = [0.16, 1, 0.3, 1] as const;

interface GuidedState {
  completedSteps: number[];
  skippedAt?: string;
  deviceChoice?: "local" | "remote" | null;
  selectedRuntimes?: string[];
  providerConfigs?: ProviderConfig[];
  companyName?: string;
  agentName?: string;
}

function loadGuidedState(): GuidedState {
  const raw = dashboardState.get(GUIDED_STATE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* corrupted */ }
  }
  return { completedSteps: [] };
}

function saveGuidedState(state: GuidedState) {
  dashboardState.set(GUIDED_STATE_KEY, JSON.stringify(state));
}

interface GuidedSetupProps {
  onComplete: () => void;
}

export default function GuidedSetup({ onComplete }: GuidedSetupProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [guidedState, setGuidedState] = useState<GuidedState>(loadGuidedState);
  const [direction, setDirection] = useState(1);

  const [companyName, setCompanyName] = useState(guidedState.companyName || "");
  const [agentName, setAgentName] = useState(guidedState.agentName || "");

  useEffect(() => {
    const { completedSteps } = guidedState;
    if (completedSteps.length >= TOTAL_STEPS || guidedState.skippedAt) {
      onComplete();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const completeStep = useCallback((step: number, data?: Partial<GuidedState>) => {
    console.log("[guided-setup] completeStep:", step, "of", TOTAL_STEPS);
    setGuidedState((prev) => {
      const next: GuidedState = {
        ...prev,
        ...data,
        completedSteps: [...new Set([...prev.completedSteps, step])],
      };
      saveGuidedState(next);
      return next;
    });
    if (step >= TOTAL_STEPS) {
      // Final step — launch dashboard
      console.log("[guided-setup] all steps complete, launching dashboard");
      onComplete();
    } else {
      setDirection(1);
      setCurrentStep(step + 1);
    }
  }, [onComplete]);

  const goBack = useCallback(() => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -80 : 80,
      opacity: 0,
    }),
  };

  const stepLabels = ["Device", "Brain", "Permissions", "Company", "Agent", "Launch"];
  const animationLabels = [
    "choosing your setup",
    "picking your brain",
    "securing access",
    "setting up mission control",
    "initializing agent",
    "ready for launch",
  ];

  return (
    <div
      className="fixed inset-0 bg-[#09090b] flex overflow-hidden"
      role="main"
      aria-label="Setup wizard"
    >
      {/* Left side — form area */}
      <div className="relative flex-1 flex flex-col items-center justify-center">
        <TechGridBackground />

        {/* Subtle center gradient */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_60%)]" />

        {/* Progress — minimal dots + thin line */}
        <motion.div
          className="absolute top-10 flex items-center gap-0 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => {
            const isActive = step === currentStep;
            const isCompleted = guidedState.completedSteps.includes(step);
            return (
              <React.Fragment key={step}>
                <div className="flex items-center gap-1.5">
                  <motion.div
                    className="rounded-full"
                    initial={false}
                    animate={{
                      width: isActive ? 8 : 6,
                      height: isActive ? 8 : 6,
                      backgroundColor: isActive || isCompleted
                        ? "rgb(255, 255, 255)"
                        : "rgba(255, 255, 255, 0.15)",
                    }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                  <span className={`text-[11px] hidden sm:inline transition-all duration-300 ${
                    isActive ? "text-white/80" : "text-white/20"
                  }`}>
                    {stepLabels[step - 1]}
                  </span>
                </div>
                {step < TOTAL_STEPS && (
                  <div className="relative w-6 sm:w-12 h-px mx-1">
                    <div className="absolute inset-0 bg-white/8" />
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-white/40"
                      initial={false}
                      animate={{ width: isCompleted ? "100%" : "0%" }}
                      transition={{ duration: 0.5, ease: EASE }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </motion.div>

        {/* Content */}
        <motion.div
          className="w-full max-w-lg px-6 z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
        >
          {/* Logo with heartbeat */}
          <motion.div
            className="flex justify-center mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05, duration: 0.5, ease: EASE }}
          >
            <div className="relative">
              <motion.img
                src="/logo-256.png"
                alt="HyperClaw"
                className="w-14 h-14 rounded-xl relative z-10"
                animate={{
                  scale: [1, 1.06, 1, 1.03, 1],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                className="absolute -inset-2 rounded-2xl bg-white/[0.04] z-0"
                animate={{
                  scale: [1, 1.15, 1, 1.08, 1],
                  opacity: [0.3, 0.6, 0.3, 0.45, 0.3],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                className="absolute -inset-4 rounded-3xl bg-white/[0.02] z-0"
                animate={{
                  scale: [1, 1.2, 1, 1.1, 1],
                  opacity: [0.15, 0.35, 0.15, 0.25, 0.15],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: "easeInOut",
                }}
              />
            </div>
          </motion.div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: EASE }}
            >
              {currentStep === 1 && (
                <GuidedStepConnect onComplete={(choice) => completeStep(1, { deviceChoice: choice })} />
              )}
              {currentStep === 2 && (
                <GuidedStepRuntimes onComplete={(providers) => completeStep(2, {
                  selectedRuntimes: providers.map((p) => p.providerId),
                  providerConfigs: providers,
                })} />
              )}
              {currentStep === 3 && (
                <GuidedStepPermissions onComplete={() => completeStep(3)} />
              )}
              {currentStep === 4 && (
                <GuidedStep1
                  onComplete={(data) => {
                    setCompanyName(data.companyName);
                    completeStep(4, { companyName: data.companyName });
                  }}
                />
              )}
              {currentStep === 5 && (
                <GuidedStep2
                  onComplete={(name) => {
                    setAgentName(name);
                    completeStep(5, { agentName: name });
                  }}
                />
              )}
              {currentStep === 6 && (
                <GuidedStep4
                  companyName={companyName}
                  agentName={agentName}
                  runtime="openclaw"
                  onComplete={() => completeStep(6)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Back + step counter — bottom */}
        <motion.div
          className="absolute bottom-10 flex items-center gap-6 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          {currentStep > 1 && (
            <button
              onClick={goBack}
              className="text-[13px] text-white/60 hover:text-white/90 transition-colors"
            >
              &larr; Back
            </button>
          )}
          <span className="text-[11px] text-white/15 tracking-widest">
            {currentStep}/{TOTAL_STEPS}
          </span>
        </motion.div>
      </div>

      {/* Right side — step animation (desktop only) */}
      <div className="hidden md:block relative w-[42%] overflow-hidden bg-[#0a0a0c] border-l border-white/[0.06]">
        <StepAnimations step={currentStep} />
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            className="absolute bottom-8 left-0 right-0 text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <span className="text-[11px] text-white/15 tracking-[0.2em] uppercase">
              {animationLabels[currentStep - 1]}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
