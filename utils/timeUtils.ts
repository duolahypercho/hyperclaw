import { AIPostType } from "$/components/Tool/X/types";

export type TimeDisplayType = {
  text: string;
  color: string;
  status?: string;
  icon?: string;
};

export type StatusColorMap = {
  [key: string]: {
    color: string;
    bgColor: string;
    icon?: string;
  };
};

export const STATUS_COLORS: StatusColorMap = {
  draft: {
    color: "text-orange-500 dark:text-yellow-500",
    bgColor: "bg-orange-500 dark:bg-yellow-500",
    icon: "pencil",
  },
  scheduled: {
    color: "text-blue-400",
    bgColor: "bg-blue-400",
    icon: "calendar",
  },
  posted: {
    color: "text-primary-foreground/50",
    bgColor: "bg-primary-foreground/50",
    icon: "check",
  },
  failed: {
    color: "text-red-500",
    bgColor: "bg-red-500",
    icon: "x",
  },
  active: {
    color: "text-green-500",
    bgColor: "bg-green-500",
    icon: "activity",
  },
  deleted: {
    color: "text-gray-500",
    bgColor: "bg-gray-500",
    icon: "trash",
  },
};
