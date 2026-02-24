"use client";
import { cn } from "$/utils";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCcw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { AiOutlineLoading } from "react-icons/ai";

const CheckIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={cn("w-6 h-6 ", className)}
    >
      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
};

const CheckFilled = ({ className }: { className?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("w-6 h-6 ", className)}
    >
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

type LoadingState = {
  text: string;
};

const LoaderCore = ({
  loadingStates,
  value = 0,
}: {
  loadingStates: LoadingState[];
  value?: number;
}) => {
  return (
    <div className="flex relative justify-start max-w-xl mx-auto flex-col mt-40">
      {loadingStates.map((loadingState, index) => {
        const distance = Math.abs(index - value);
        const opacity = Math.max(1 - distance * 0.2, 0);
        const scale = index === value ? 1.05 : 1;
        const xOffset = index === value ? 10 : 0;
        const isFuture = index > value;
        const isCurrent = index === value;

        return (
          <motion.div
            key={index}
            className={cn("text-left flex gap-2 mb-4")}
            initial={{ opacity: 0, y: -20, x: -20 }}
            animate={{
              opacity: opacity,
              y: -(value * 40),
              scale: scale,
              x: xOffset,
            }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 10,
              duration: 0.5,
            }}
          >
            <motion.div
              className="flex items-center justify-center w-6 h-6"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {isCurrent && (
                <motion.div
                  className="relative w-full h-full"
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 1.5,
                    ease: "easeInOut",
                  }}
                >
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <AiOutlineLoading className="absolute inset-0 w-full h-full text-primary animate-pulse" />
                </motion.div>
              )}
              {!isFuture && !isCurrent && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <CheckFilled className="text-primary" />
                </motion.div>
              )}
            </motion.div>
            <motion.span
              className={cn(
                "text-muted-foreground text-base",
                isCurrent && "text-foreground opacity-100"
              )}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              {loadingState.text}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
};

export const useLoaderComplete = () => {
  const [isComplete, setIsComplete] = useState(false);

  const completeLoader = useCallback((duration: number = 1000) => {
    setIsComplete(true);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, duration);
    });
  }, []);

  return { isComplete, completeLoader };
};

export const MultiStepLoader = ({
  loadingStates,
  loading,
  duration = 2000,
  loop = true,
  success = false,
  onComplete,
}: {
  loadingStates: LoadingState[];
  loading?: boolean;
  duration?: number;
  loop?: boolean;
  success?: boolean;
  onComplete?: () => void;
}) => {
  const [currentState, setCurrentState] = useState(0);

  const handleComplete = useCallback(() => {
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 1000); // Match the exit animation duration
  }, [onComplete]);

  useEffect(() => {
    if (!loading) {
      setCurrentState(0);
      return;
    }

    if (currentState !== 0 || success) {
      const timeout = setTimeout(() => {
        const nextState = currentState + 1;
        if (nextState >= loadingStates.length) {
          handleComplete();
          return;
        }

        setCurrentState((prevState) =>
          loop
            ? prevState === loadingStates.length - 1
              ? 0
              : prevState + 1
            : Math.min(prevState + 1, loadingStates.length - 1)
        );
      }, duration);

      return () => clearTimeout(timeout);
    }
  }, [
    currentState,
    loading,
    loop,
    loadingStates.length,
    duration,
    success,
    handleComplete,
  ]);

  return (
    <AnimatePresence mode="wait">
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: 1, ease: "easeInOut" },
          }}
          className="w-full h-full fixed inset-0 z-[1001] flex items-center justify-center backdrop-blur-2xl"
        >
          <div className="h-96 relative">
            <LoaderCore value={currentState} loadingStates={loadingStates} />
          </div>
          <div className="bg-gradient-to-t inset-x-0 z-20 bottom-0 bg-black h-full absolute [mask-image:radial-gradient(900px_at_center,transparent_30%,transparent)]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
