import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Task } from "./types";
import { cn } from "../../../utils";

interface TaskButtonProps {
  task: Task;
  onStatusChange: (
    id: string,
    status: "pending" | "completed" | "in_progress" | "blocked"
  ) => void;
  setIsJustCompleted?: (value: boolean) => void;
  size?: "small" | "medium" | "large";
}

const TaskButton = ({
  task,
  onStatusChange,
  setIsJustCompleted,
  size = "medium",
}: TaskButtonProps) => {
  const { status, _id } = task;
  const [isHovered, setIsHovered] = useState(false);

  // Cycle through states: pending → in_progress → completed → pending
  const getNextStatus = (currentStatus: typeof status): typeof status => {
    if (currentStatus === "pending") return "in_progress";
    if (currentStatus === "in_progress") return "completed";
    if (currentStatus === "completed") return "pending";
    return "pending"; // blocked or any other state resets to pending
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const nextStatus = getNextStatus(status);

    // Trigger animation if provided
    if (setIsJustCompleted && nextStatus === "completed") {
      setIsJustCompleted(true);
    } else {
      onStatusChange(_id, nextStatus);
    }
  };

  const checkVariants = {
    checked: {
      pathLength: 1,
      opacity: 1,
    },
    unchecked: {
      pathLength: 0,
      opacity: 0,
    },
    hover: {
      pathLength: 1,
      opacity: 0.8,
    },
  };

  const boxVariants = {
    hover: { scale: 1.05, strokeWidth: 2 },
    tap: { scale: 0.95 },
    small: { r: 9 },
    medium: { r: 11 },
    large: { r: 13 },
  };

  const fillColor = useMemo(() => {
    if (status === "completed") return "hsl(216, 100%, 89%)";
    return "rgba(0, 0, 0, 0)";
  }, [status]);

  const strokeColor = useMemo(() => {
    if (status === "completed") return "hsla(216, 40%, 70%, 0.168)";
    if (status === "in_progress") return "hsl(216, 100%, 70%)";
    return "#D1D5DB";
  }, [status]);

  const showCheck = status === "completed";
  const showSpinner = status === "in_progress";

  return (
    <motion.div
      className={cn(
        "relative aspect-square cursor-pointer hover:fill-accent/30 pointer-events-auto mt-0.5",
        size === "small" && "w-[1.25rem]",
        size === "medium" && "w-[1.5rem]",
        size === "large" && "w-[1.75rem]"
      )}
      onClick={handleClick}
      onMouseDown={(e: React.MouseEvent) => {
        e.stopPropagation();
      }}
      onPointerDown={(e: React.PointerEvent) => {
        e.stopPropagation();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover="hover"
      whileTap="tap"
      style={{ touchAction: "manipulation" }}
    >
      <motion.svg
        width={size === "small" ? "20" : size === "medium" ? "24" : "28"}
        height={size === "small" ? "20" : size === "medium" ? "24" : "28"}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        strokeWidth={2}
        variants={boxVariants}
        style={{ pointerEvents: "none" }}
      >
        {/* Circle */}
        <motion.circle
          cx="12"
          cy="12"
          initial={size}
          variants={boxVariants}
          animate={{
            fill: fillColor,
            stroke: strokeColor,
            r: boxVariants[size].r,
          }}
          transition={{ duration: 0.2 }}
        />

        {/* Two horizontal lines for in_progress state */}
        {showSpinner && !isHovered && (
          <line
            x1="8"
            y1="12"
            x2="16"
            y2="12"
            stroke="hsl(216, 100%, 70%)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}

        {/* Checkmark for completed state */}
        {showCheck && (
          <motion.path
            d="M7 12.5L10 15.5L17 8.5"
            className="stroke-black"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial="unchecked"
            animate="checked"
            variants={checkVariants}
            transition={{ duration: 0.3 }}
          />
        )}

        {/* Hover preview for pending state - shows play icon */}
        {status === "pending" && isHovered && (
          <motion.path
            d="M9 7L9 17L17 12L9 7Z"
            className="stroke-accent fill-accent/20"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}

        {/* Hover preview for in_progress state - shows checkmark */}
        {status === "in_progress" && isHovered && (
          <motion.path
            d="M7 12.5L10 15.5L17 8.5"
            className="stroke-accent"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.8 }}
            exit={{ pathLength: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </motion.svg>
    </motion.div>
  );
};

export default TaskButton;
