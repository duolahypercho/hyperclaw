export type RecurrenceUnit =
  | "custom"
  | "one_time"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

export type IntervalUnit = "hour" | "day" | "week" | "month" | "year";

export type RecurrenceInterval = {
  unit: IntervalUnit;
  value: number;
};

export type SchedulePostData = {
  aiPrompt: string;
  tone: string;
  language: string;
  targetAudience: string[];
  contentGoals: string[];
  hashtags: string[];
  aiOptimizedTargetAudience: boolean;
  aiOptimizedContentGoals: boolean;
  aiOptimizedHashtags: boolean;
  aiOptimizedTiming: boolean;
  scheduling?: {
    date?: string;
    time?: string;
    timezone?: string;
    recurrence?: {
      type: RecurrenceUnit;
      interval?: RecurrenceInterval;
    };
  };
};
