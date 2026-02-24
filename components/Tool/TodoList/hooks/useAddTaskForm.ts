import { useState, useRef, useEffect, useMemo } from "react";
import { format, addDays, addWeeks, endOfWeek, endOfYear, addYears, endOfMonth, addMonths, nextDay, startOfWeek, startOfMonth, startOfYear, type Day } from "date-fns";
import { HTMLCopanionTextAreaElement } from "$/components/Tool/AITextArea/types";

// Realistic personal task placeholder suggestions
export const PLACEHOLDER_SUGGESTIONS = [
  "Buy groceries At 5:00 PM",
  "Call the dentist to schedule an appointment At 10:00 AM",
  "Finish reading current book",
  "Pay electricity bill",
  "Reply to important emails",
  "Clean the kitchen",
  "Go for a 30-minute walk At 6:00 PM",
  "Plan weekend trip itinerary",
  "Organize workspace",
  "Meal prep for tomorrow",
];

export const TASK_PLACEHOLDERS = [
  "Call mom at 3 pm",
  "Buy groceries for dinner",
  "Review project proposal",
  "Schedule dentist appointment",
  "Send birthday wishes to Alex",
  "Finish reading chapter 5",
  "Reply to client emails",
  "Book flight tickets for vacation",
  "Prepare slides for Monday's meeting",
  "Water the plants",
  "Pick up dry cleaning",
  "Update resume",
  "Research new laptop options",
  "Cancel unused subscriptions",
  "Plan weekend hiking trip",
];

interface UseAddTaskFormOptions {
  activeListId?: string;
  initialPlaceholder?: string;
  onReset?: () => void;
}

export const useAddTaskForm = (options: UseAddTaskFormOptions = {}) => {
  const { activeListId, initialPlaceholder, onReset } = options;

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | undefined>(
    undefined
  );
  const [newTaskStarred, setNewTaskStarred] = useState(false);
  const [newTaskMyDay, setNewTaskMyDay] = useState(false);
  const [newTaskListId, setNewTaskListId] = useState<string>(
    activeListId || "inbox"
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detectedTimeText, setDetectedTimeText] = useState<string>("");
  const [isManuallySetDate, setIsManuallySetDate] = useState(false);
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);

  // Stable placeholder state to prevent re-renders
  const [currentPlaceholder, setCurrentPlaceholder] = useState(
    initialPlaceholder || PLACEHOLDER_SUGGESTIONS[0]
  );

  // Smart time/date detection function
  const detectTimeFromText = (
    text: string
  ): {
    date: Date | null;
    detectedText: string;
  } => {
    if (!text.trim()) return { date: null, detectedText: "" };

    const now = new Date();
    let targetDate: Date | null = null;
    let detectedText = "";

    // Time patterns: "At 5:00 PM", "at 10:00 AM", "5pm", "10am", "5:30 PM", etc.
    const timePatterns = [
      /(?:^|\s)(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i,
      /(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i,
      /(?:^|\s)(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)/i,
    ];

    // Day of week mapping (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayOfWeekMap: { [key: string]: number } = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };

    // Date patterns
    const dateKeywords: { [key: string]: () => Date } = {
      today: () => {
        const date = new Date(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      tomorrow: () => {
        const date = addDays(now, 1);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "next week": () => {
        const date = addWeeks(now, 1);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "this week": () => {
        const date = endOfWeek(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "this year": () => {
        const date = endOfYear(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "next year": () => {
        const date = addYears(now, 1);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "this month": () => {
        const date = endOfMonth(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "next month": () => {
        const date = addMonths(now, 1);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      // Vague terms
      "end of the year": () => {
        const date = endOfYear(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of year": () => {
        const date = endOfYear(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of this year": () => {
        const date = endOfYear(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of next year": () => {
        const date = endOfYear(addYears(now, 1));
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of the month": () => {
        const date = endOfMonth(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of month": () => {
        const date = endOfMonth(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of this month": () => {
        const date = endOfMonth(now);
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "end of next month": () => {
        const date = endOfMonth(addMonths(now, 1));
        date.setHours(23, 59, 59, 999);
        return date;
      },
      "beginning of next month": () => {
        const date = startOfMonth(addMonths(now, 1));
        date.setHours(0, 0, 0, 0);
        return date;
      },
      "start of next month": () => {
        const date = startOfMonth(addMonths(now, 1));
        date.setHours(0, 0, 0, 0);
        return date;
      },
      "beginning of next year": () => {
        const date = startOfYear(addYears(now, 1));
        date.setHours(0, 0, 0, 0);
        return date;
      },
      "start of next year": () => {
        const date = startOfYear(addYears(now, 1));
        date.setHours(0, 0, 0, 0);
        return date;
      },
    };

    // Day of week patterns: "next Wednesday", "this Friday", "Monday", etc.
    const dayOfWeekPatterns = [
      /(?:^|\s)(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)(?:\s|$)/i,
      /(?:^|\s)(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)(?:\s|$)/i,
    ];

      // Combined patterns: "tomorrow at 5pm", "today at 10am", "next Wednesday at 5pm", etc.
      // Also handle reverse: "at 10am tomorrow", "at 5pm today", "at 5pm next Wednesday", etc.
      const combinedPatterns = [
        /(today|tomorrow|next week|this week)\s+(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i,
        /(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\s+(today|tomorrow|next week|this week)/i,
        /(today|tomorrow|next week|this week|this year|next year|this month|next month|end of the year|end of year|end of this year|end of next year|end of the month|end of month|end of this month|end of next month|beginning of next month|start of next month|beginning of next year|start of next year)\s+(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i,
        /(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\s+(today|tomorrow|next week|this week|this year|next year|this month|next month|end of the year|end of year|end of this year|end of next year|end of the month|end of month|end of this month|end of next month|beginning of next month|start of next month|beginning of next year|start of next year)/i,
      // Day of week with time patterns
      /(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s+(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i,
      /(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\s+(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s+(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i,
      /(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i,
    ];

    // Try combined patterns first
    for (let patternIndex = 0; patternIndex < combinedPatterns.length; patternIndex++) {
      const pattern = combinedPatterns[patternIndex];
      const match = text.match(pattern);
      if (match) {
        let dateKeyword: string | null = null;
        let dayOfWeek: string | null = null;
        let isNextDay = false;
        let isThisDay = false;
        let hour: number;
        let minutes: number;
        let ampm: string;

        // Patterns 0-3: Standard date keywords with time
        if (patternIndex < 4) {
          // Pattern 0, 2: date before time (e.g., "tomorrow at 10am")
          if (patternIndex === 0 || patternIndex === 2) {
            dateKeyword = match[1].toLowerCase();
            hour = parseInt(match[2]);
            minutes = match[3] ? parseInt(match[3]) : 0;
            ampm = match[4].toUpperCase();
          }
          // Pattern 1, 3: time before date (e.g., "at 10am tomorrow")
          else {
            hour = parseInt(match[1]);
            minutes = match[2] ? parseInt(match[2]) : 0;
            ampm = match[3].toUpperCase();
            dateKeyword = match[4].toLowerCase();
          }

          if (dateKeywords[dateKeyword]) {
            targetDate = dateKeywords[dateKeyword]();
            let hour24 = hour;
            if (ampm === "PM" && hour !== 12) hour24 = hour + 12;
            if (ampm === "AM" && hour === 12) hour24 = 0;
            targetDate.setHours(hour24, minutes, 0, 0);
            detectedText = match[0].trim();
            break;
          }
        }
        // Patterns 4-7: Day of week with time
        else {
          // Pattern 4, 6: day before time (e.g., "next Wednesday at 5pm", "Monday at 5pm")
          if (patternIndex === 4 || patternIndex === 6) {
            const dayMatch = match[1].toLowerCase();
            if (patternIndex === 4) {
              // "next Wednesday" or "this Wednesday"
              isNextDay = text.toLowerCase().includes(`next ${dayMatch}`);
              isThisDay = text.toLowerCase().includes(`this ${dayMatch}`);
              dayOfWeek = dayMatch;
            } else {
              // Just "Wednesday"
              dayOfWeek = dayMatch;
            }
            hour = parseInt(match[2]);
            minutes = match[3] ? parseInt(match[3]) : 0;
            ampm = match[4].toUpperCase();
          }
          // Pattern 5, 7: time before day (e.g., "at 5pm next Wednesday", "at 5pm Monday")
          else {
            hour = parseInt(match[1]);
            minutes = match[2] ? parseInt(match[2]) : 0;
            ampm = match[3].toUpperCase();
            const dayMatch = match[4].toLowerCase();
            if (patternIndex === 5) {
              // "next Wednesday" or "this Wednesday"
              isNextDay = text.toLowerCase().includes(`next ${dayMatch}`);
              isThisDay = text.toLowerCase().includes(`this ${dayMatch}`);
              dayOfWeek = dayMatch;
            } else {
              // Just "Wednesday"
              dayOfWeek = dayMatch;
            }
          }

          if (dayOfWeek && dayOfWeekMap[dayOfWeek]) {
            const dayIndex = dayOfWeekMap[dayOfWeek] as Day;
            if (isNextDay) {
              // Next occurrence of that day
              targetDate = nextDay(now, dayIndex);
            } else if (isThisDay) {
              // This week's occurrence
              // If today IS the day, "this [day]" means today
              const todayDayOfWeek = now.getDay();
              if (todayDayOfWeek === dayIndex) {
                targetDate = new Date(now);
              } else {
                const thisWeekDay = nextDay(startOfWeek(now), dayIndex);
                // If the day has already passed this week, use next week's occurrence
                if (thisWeekDay < now) {
                  targetDate = addWeeks(thisWeekDay, 1);
                } else {
                  targetDate = thisWeekDay;
                }
              }
            } else {
              // Just the day name - next occurrence
              targetDate = nextDay(now, dayIndex);
            }
            
            let hour24 = hour;
            if (ampm === "PM" && hour !== 12) hour24 = hour + 12;
            if (ampm === "AM" && hour === 12) hour24 = 0;
            targetDate.setHours(hour24, minutes, 0, 0);
            detectedText = match[0].trim();
            break;
          }
        }
      }
    }

    // Try date keywords without time
    let foundDateKeyword: string | null = null;
    if (!targetDate) {
      // First try day of week patterns
      for (const pattern of dayOfWeekPatterns) {
        const match = text.match(pattern);
        if (match) {
          const dayMatch = match[1].toLowerCase();
          if (dayOfWeekMap[dayMatch]) {
            const dayIndex = dayOfWeekMap[dayMatch] as Day;
            const isNextDay = text.toLowerCase().includes(`next ${dayMatch}`);
            const isThisDay = text.toLowerCase().includes(`this ${dayMatch}`);
            
            if (isNextDay) {
              targetDate = nextDay(now, dayIndex);
              detectedText = `next ${dayMatch}`;
            } else if (isThisDay) {
              // If today IS the day, "this [day]" means today
              const todayDayOfWeek = now.getDay();
              if (todayDayOfWeek === dayIndex) {
                targetDate = new Date(now);
              } else {
                const thisWeekDay = nextDay(startOfWeek(now), dayIndex);
                // If the day has already passed this week, use next week's occurrence
                if (thisWeekDay < now) {
                  targetDate = addWeeks(thisWeekDay, 1);
                } else {
                  targetDate = thisWeekDay;
                }
              }
              detectedText = `this ${dayMatch}`;
            } else {
              targetDate = nextDay(now, dayIndex);
              detectedText = dayMatch;
            }
            targetDate.setHours(23, 59, 59, 999);
            break;
          }
        }
      }
      
      // Then try standard date keywords (check longer phrases first to avoid partial matches)
      if (!targetDate) {
        const sortedKeywords = Object.entries(dateKeywords).sort((a, b) => b[0].length - a[0].length);
        for (const [keyword, dateFn] of sortedKeywords) {
          const regex = new RegExp(`(?:^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i");
          if (regex.test(text)) {
            targetDate = dateFn();
            foundDateKeyword = keyword;
            detectedText = keyword;
            break;
          }
        }
      }
    }

    // Try time patterns (check if date keyword exists elsewhere in text)
    // We check time patterns if:
    // 1. No date was found yet, OR
    // 2. A date keyword was found but no time was combined with it
    let timeMatch: RegExpMatchArray | null = null;
    let timePatternIndex = -1;
    
    if (
      !targetDate ||
      (foundDateKeyword && !detectedText.includes("at") && !detectedText.includes("@"))
    ) {
      for (let i = 0; i < timePatterns.length; i++) {
        const pattern = timePatterns[i];
        const match = text.match(pattern);
        if (match) {
          timeMatch = match;
          timePatternIndex = i;
          break;
        }
      }
    }

    // If we found a time pattern, process it
    if (timeMatch) {
      let hour: number;
      let minutes: number;
      let ampm: string;

      // Pattern 1: /(?:^|\s)(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i
      if (timePatternIndex === 0) {
        hour = parseInt(timeMatch[1]);
        minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        ampm = timeMatch[3].toUpperCase();
      }
      // Pattern 2: /(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i
      else if (timePatternIndex === 1) {
        hour = parseInt(timeMatch[1]);
        minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        ampm = timeMatch[3].toUpperCase();
      }
      // Pattern 3: /(?:^|\s)(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)/i
      else {
        hour = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
        ampm = timeMatch[3].toUpperCase();
      }

      // Check if there's a date keyword elsewhere in the text (if not already found)
      let dateKeywordForTime: string | null = foundDateKeyword;
      if (!dateKeywordForTime) {
        // First check for day of week patterns
        for (const pattern of dayOfWeekPatterns) {
          const match = text.match(pattern);
          if (match) {
            const dayMatch = match[1].toLowerCase();
            if (dayOfWeekMap[dayMatch]) {
              const dayIndex = dayOfWeekMap[dayMatch] as Day;
              const isNextDay = text.toLowerCase().includes(`next ${dayMatch}`);
              const isThisDay = text.toLowerCase().includes(`this ${dayMatch}`);
              
              if (isNextDay) {
                targetDate = nextDay(now, dayIndex);
                dateKeywordForTime = `next ${dayMatch}`;
              } else if (isThisDay) {
                // If today IS the day, "this [day]" means today
                const todayDayOfWeek = now.getDay();
                if (todayDayOfWeek === dayIndex) {
                  targetDate = new Date(now);
                } else {
                  const thisWeekDay = nextDay(startOfWeek(now), dayIndex);
                  // If the day has already passed this week, use next week's occurrence
                  if (thisWeekDay < now) {
                    targetDate = addWeeks(thisWeekDay, 1);
                  } else {
                    targetDate = thisWeekDay;
                  }
                }
                dateKeywordForTime = `this ${dayMatch}`;
              } else {
                targetDate = nextDay(now, dayIndex);
                dateKeywordForTime = dayMatch;
              }
              break;
            }
          }
        }
        
        // Then check for standard date keywords (check longer phrases first to avoid partial matches)
        if (!dateKeywordForTime) {
          const sortedKeywords = Object.entries(dateKeywords).sort((a, b) => b[0].length - a[0].length);
          for (const [keyword, dateFn] of sortedKeywords) {
            const regex = new RegExp(`(?:^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i");
            if (regex.test(text)) {
              dateKeywordForTime = keyword;
              targetDate = dateFn();
              break;
            }
          }
        }
      }

      // If no date keyword found, default to today/tomorrow based on time
      if (!targetDate) {
        targetDate = new Date(now);
      }

      let hour24 = hour;
      if (ampm === "PM" && hour !== 12) hour24 = hour + 12;
      if (ampm === "AM" && hour === 12) hour24 = 0;

      // If the time is in the past today and no date keyword was found, set it for tomorrow
      if (!dateKeywordForTime) {
        const testDate = new Date(now);
        testDate.setHours(hour24, minutes, 0, 0);
        if (testDate < now) {
          targetDate = addDays(now, 1);
        }
      }

      targetDate.setHours(hour24, minutes, 0, 0);
      
      // Combine detected text if both time and date were found separately
      const timeText = timeMatch[0].trim();
      if (dateKeywordForTime && dateKeywordForTime !== timeText) {
        // Combine them in a natural order
        // If time comes before date keyword in text, use "time date", otherwise "date time"
        const timeIndex = text.toLowerCase().indexOf(timeText.toLowerCase());
        const dateIndex = text.toLowerCase().indexOf(dateKeywordForTime.toLowerCase());
        if (timeIndex < dateIndex) {
          detectedText = `${timeText} ${dateKeywordForTime}`;
        } else {
          detectedText = `${dateKeywordForTime} ${timeText}`;
        }
      } else {
        detectedText = timeText;
      }
    }

    return { date: targetDate, detectedText };
  };

  // Smart time detection when user types
  useEffect(() => {
    // Don't auto-detect if user manually set the date
    if (isManuallySetDate) return;

    if (!newTaskTitle.trim()) {
      if (detectedTimeText) {
        // Clear detected time if user clears the text
        setNewTaskDueDate(undefined);
        setDetectedTimeText("");
      }
      return;
    }

    const { date, detectedText } = detectTimeFromText(newTaskTitle);

    if (date && detectedText) {
      // Only update if the detected text is different to avoid loops
      if (detectedText !== detectedTimeText) {
        setNewTaskDueDate(date);
        setDetectedTimeText(detectedText);
      }
    } else if (detectedTimeText && !detectedText) {
      // Clear if time was removed from text
      setNewTaskDueDate(undefined);
      setDetectedTimeText("");
    }
  }, [newTaskTitle, detectedTimeText, isManuallySetDate]);

  // Format due date for display
  const formattedDueDate = useMemo(() => {
    if (!newTaskDueDate) {
      return {
        text: "Date",
        color: "text-muted-foreground",
        hoverColor: "hover:text-foreground",
        icon: "CalendarIcon" as const,
        tooltip: "Click to set due date",
      };
    }

    const now = new Date();
    const dueDate = new Date(newTaskDueDate);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 0) {
      return {
        text: "Overdue",
        color: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        tooltip: `Overdue by ${format(dueDate, "MMM d")}`,
        icon: "CalendarX" as const,
      };
    } else if (diffMins < 60) {
      return {
        text: `${diffMins}m`,
        color:
          diffMins < 30
            ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "bg-warning/10 text-warning hover:bg-warning/20",
        icon: "CalendarClock" as const,
        tooltip: `Due ${format(dueDate, "h:mm a")}`,
      };
    } else if (diffHours < 24) {
      return {
        text: `${diffHours}h`,
        color:
          diffHours < 3
            ? "bg-warning/10 text-warning hover:bg-warning/20"
            : "bg-yellow-400/20 text-yellow-700 hover:bg-yellow-400/20 dark:bg-yellow-300 dark:text-yellow-300 dark:hover:bg-yellow-400/20",
        icon: "CalendarClock" as const,
        tooltip: `Due ${format(dueDate, "h:mm a")}`,
      };
    } else if (diffDays < 7) {
      return {
        text: `${diffDays}d`,
        color:
          diffDays < 2
            ? "bg-yellow-400/20 text-yellow-700 hover:bg-yellow-400/20 dark:bg-yellow-300/10 dark:text-yellow-300 dark:hover:bg-yellow-400/20"
            : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800",
        icon: "Calendar" as const,
        tooltip: `Due ${format(dueDate, "MMM d")}`,
      };
    } else {
      return {
        text: format(dueDate, "MMM d"),
        color:
          "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800",
        icon: "CalendarDays" as const,
        tooltip: `Due ${format(dueDate, "MMM d, yyyy")}`,
      };
    }
  }, [newTaskDueDate]);

  // Memoize the due date items to prevent recreation on every render
  const dueDateItems = useMemo(
    () => [
      {
        name: "Remove Due Date",
        onClick: () => {
          setNewTaskDueDate(undefined);
          setIsDatePickerOpen(false);
          setIsManuallySetDate(false);
          setDetectedTimeText("");
        },
        icon: "CalendarX" as const,
      },
      {
        name: "Due Today",
        onClick: () => {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          setNewTaskDueDate(today);
          setIsDatePickerOpen(false);
          setIsManuallySetDate(true);
          setDetectedTimeText("");
        },
        icon: "Calendar" as const,
      },
      {
        name: "Due Tomorrow",
        onClick: () => {
          const today = new Date();
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(23, 59, 59, 999);
          setNewTaskDueDate(tomorrow);
          setIsDatePickerOpen(false);
          setIsManuallySetDate(true);
          setDetectedTimeText("");
        },
        icon: "CalendarArrowUp" as const,
      },
      {
        name: "Due This Week",
        onClick: () => {
          const today = new Date();
          const daysUntilSunday = 7 - today.getDay();
          const endOfWeek = new Date(today);
          endOfWeek.setDate(today.getDate() + daysUntilSunday);
          endOfWeek.setHours(23, 59, 59, 999);
          setNewTaskDueDate(endOfWeek);
          setIsDatePickerOpen(false);
          setIsManuallySetDate(true);
          setDetectedTimeText("");
        },
        icon: "CalendarArrowUp" as const,
      },
      {
        name: "Due This Work Week",
        onClick: () => {
          const today = new Date();
          const dayOfWeek = today.getDay();
          let daysUntilFriday = 5 - dayOfWeek;
          if (daysUntilFriday < 0) {
            daysUntilFriday += 7;
          }
          const endOfWorkWeek = new Date(today);
          endOfWorkWeek.setDate(today.getDate() + daysUntilFriday);
          endOfWorkWeek.setHours(23, 59, 59, 999);
          setNewTaskDueDate(endOfWorkWeek);
          setIsDatePickerOpen(false);
          setIsManuallySetDate(true);
          setDetectedTimeText("");
        },
        icon: "CalendarArrowUp" as const,
      },
      {
        name: "Due Next Week",
        onClick: () => {
          const today = new Date();
          const nextWeek = new Date(today);
          nextWeek.setDate(nextWeek.getDate() + 7);
          nextWeek.setHours(23, 59, 59, 999);
          setNewTaskDueDate(nextWeek);
          setIsDatePickerOpen(false);
          setIsManuallySetDate(true);
          setDetectedTimeText("");
        },
        icon: "CalendarDays" as const,
      },
    ],
    []
  );

  const resetForm = () => {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskDueDate(undefined);
    setCustomDate(undefined);
    setNewTaskStarred(false);
    setNewTaskMyDay(false);
    setNewTaskListId(activeListId || "inbox");
    setIsDatePickerOpen(false);
    setIsCustomDatePickerOpen(false);
    setDetectedTimeText("");
    setIsManuallySetDate(false);
    onReset?.();
  };

  const getTaskParams = () => {
    const dueDate = newTaskDueDate
      ? (() => {
          const date = new Date(newTaskDueDate);
          // Only set to end of day if no specific time was detected
          if (!detectedTimeText.match(/\d{1,2}(?::\d{2})?\s*(am|pm)/i)) {
            date.setHours(23, 59, 59, 999);
          }
          return date;
        })()
      : undefined;

    return {
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || undefined,
      date: dueDate,
      starred: newTaskStarred,
      myDay: newTaskMyDay,
      listId: newTaskListId === "inbox" ? undefined : newTaskListId,
    };
  };

  return {
    // State
    newTaskTitle,
    setNewTaskTitle,
    newTaskDescription,
    setNewTaskDescription,
    newTaskDueDate,
    setNewTaskDueDate,
    newTaskStarred,
    setNewTaskStarred,
    newTaskMyDay,
    setNewTaskMyDay,
    newTaskListId,
    setNewTaskListId,
    isDatePickerOpen,
    setIsDatePickerOpen,
    isCustomDatePickerOpen,
    setIsCustomDatePickerOpen,
    customDate,
    setCustomDate,
    generating,
    setGenerating,
    loading,
    setLoading,
    detectedTimeText,
    setDetectedTimeText,
    isManuallySetDate,
    setIsManuallySetDate,
    textareaRef,
    currentPlaceholder,
    setCurrentPlaceholder,
    formattedDueDate,
    dueDateItems,
    resetForm,
    getTaskParams,
  };
};
