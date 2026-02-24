"use client";

import { useState, useEffect, useRef } from "react";
import {
  Calendar as CalendarIcon,
  Settings,
  CalendarCog,
  CircleSlash,
  Sun,
  CalendarDays,
  CalendarRange,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type RecurrenceType =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom"
  | "one_time";

export interface RecurrenceRule {
  frequency: RecurrenceType;
  interval: number;
  months: number[]; // For yearly: months (0-11, where 0=Jan, 11=Dec)
  days: number[]; // For weekly: days of week (0-6), for monthly: days of month (1-31), for yearly: days of month (1-31)
  customFrequency?: "daily" | "weekly" | "monthly" | "yearly"; // Stores the frequency type when frequency is "custom"
  time?: string;
  startDate: Date;
  endDate?: Date;
}

export const DefaultRecurrentRule = {
  frequency: "one_time",
  interval: 1,
  days: [],
  months: [],
  startDate: new Date(),
} as RecurrenceRule;

/** Normalize partial recurrence from API so frequency/interval are never undefined */
function normalizeRecurrenceRule(
  r: RecurrenceRule | undefined
): RecurrenceRule {
  if (!r) return DefaultRecurrentRule;
  return {
    ...DefaultRecurrentRule,
    ...r,
    frequency: r.frequency ?? "one_time",
    interval: r.interval ?? 1,
    days: r.days ?? [],
    months: r.months ?? [],
    startDate: r.startDate ? new Date(r.startDate) : new Date(),
    endDate: r.endDate ? new Date(r.endDate) : undefined,
  };
}

interface RecurrenceFilterProps {
  value?: RecurrenceRule;
  onChange?: (rule: RecurrenceRule) => void;
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
  subMenu?: boolean;
  title?: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const MONTHS = [
  { value: 0, label: "January", short: "Jan" },
  { value: 1, label: "February", short: "Feb" },
  { value: 2, label: "March", short: "Mar" },
  { value: 3, label: "April", short: "Apr" },
  { value: 4, label: "May", short: "May" },
  { value: 5, label: "June", short: "Jun" },
  { value: 6, label: "July", short: "Jul" },
  { value: 7, label: "August", short: "Aug" },
  { value: 8, label: "September", short: "Sep" },
  { value: 9, label: "October", short: "Oct" },
  { value: 10, label: "November", short: "Nov" },
  { value: 11, label: "December", short: "Dec" },
];

// Generate days of month (1-31)
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

// Get maximum days in a month (0-11, where 0=Jan, 11=Dec)
const getMaxDaysInMonth = (month: number): number => {
  // February
  if (month === 1) return 29; // Account for leap years (max possible)
  // April, June, September, November
  if ([3, 5, 8, 10].includes(month)) return 30;
  // All other months
  return 31;
};

// Check if a day is valid for given months
const isDayValidForMonths = (day: number, months: number[]): boolean => {
  if (months.length === 0) return true; // If no months selected, allow all days
  return months.some((month) => day <= getMaxDaysInMonth(month));
};

// Get months that don't have a specific day
const getMonthsWithoutDay = (day: number): number[] => {
  return MONTHS.filter((month) => day > getMaxDaysInMonth(month.value)).map(
    (month) => month.value
  );
};

export function RecurrenceFilter({
  value,
  onChange,
  className,
  buttonClassName,
  iconClassName,
  subMenu = false,
  title = "Recurrence",
}: RecurrenceFilterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customRule, setCustomRule] = useState<RecurrenceRule>({
    frequency: "daily",
    interval: 1,
    startDate: new Date(),
    days: [],
    months: [],
  });
  const [rule, setRule] = useState<RecurrenceRule>(() =>
    normalizeRecurrenceRule(value)
  );

  // Use ref to track previous value (prop) for skip and deep comparison
  const prevValueRef = useRef<RecurrenceRule | undefined>(value);

  useEffect(() => {
    // Skip if value reference hasn't changed (same object)
    if (value === prevValueRef.current) {
      return;
    }

    // Only update if value actually changed (deep comparison)
    if (value) {
      const normalized = normalizeRecurrenceRule(value);
      const prevNormalized = normalizeRecurrenceRule(prevValueRef.current);
      const hasChanged =
        !prevValueRef.current ||
        prevNormalized.frequency !== normalized.frequency ||
        prevNormalized.interval !== normalized.interval ||
        JSON.stringify(prevNormalized.days || []) !==
          JSON.stringify(normalized.days || []) ||
        JSON.stringify(prevNormalized.months || []) !==
          JSON.stringify(normalized.months || []) ||
        prevNormalized.time !== normalized.time ||
        prevNormalized.customFrequency !== normalized.customFrequency ||
        prevNormalized.startDate !== normalized.startDate ||
        prevNormalized.endDate !== normalized.endDate;

      if (hasChanged) {
        setRule(normalized);
      }
      prevValueRef.current = value;
    } else if (!value && prevValueRef.current) {
      // Reset to default if value is cleared
      const defaultRule: RecurrenceRule = {
        frequency: "one_time",
        interval: 1,
        days: [],
        months: [],
        startDate: new Date(),
      };
      setRule(defaultRule);
      prevValueRef.current = undefined;
    }
  }, [value]);

  const handleQuickSelect = (frequency: RecurrenceType) => {
    // Close dropdown when selecting any option
    setDropdownOpen(false);

    if (frequency === "custom") {
      // Initialize custom rule with current rule if it exists, otherwise defaults
      if (rule.frequency !== "one_time" && rule.frequency !== "custom") {
        const ruleToUse: RecurrenceRule = {
          ...rule,
          frequency: rule.frequency,
          customFrequency: rule.frequency,
          months: rule.frequency === "yearly" ? rule.months : [],
          startDate: rule.startDate,
          endDate: rule.endDate,
        };
        setCustomRule(ruleToUse);
      } else if (rule.frequency === "custom" && rule.customFrequency) {
        // If already custom, restore the customRecurrence
        setCustomRule({
          ...rule,
          frequency: rule.customFrequency,
          startDate: rule.startDate,
          endDate: rule.endDate,
        });
      } else {
        // Reset to defaults when opening custom dialog, but preserve dates if they exist
        setCustomRule({
          frequency: "daily",
          interval: 1,
          days: [],
          months: [],
          startDate: rule.startDate,
          endDate: rule.endDate,
        });
      }
      setCustomDialogOpen(true);
      return;
    }

    const newRule: RecurrenceRule = {
      frequency: frequency,
      interval: 1,
      days: [],
      months: [],
      startDate: rule.startDate,
    };
    setRule(newRule);
    onChange?.(newRule);
  };

  const handleCustomSave = () => {
    // Extract the frequency type for customRecurrence
    const recurrenceType = customRule.frequency;
    let customRecurrenceValue:
      | "daily"
      | "weekly"
      | "monthly"
      | "yearly"
      | undefined = undefined;

    if (
      recurrenceType === "daily" ||
      recurrenceType === "weekly" ||
      recurrenceType === "monthly" ||
      recurrenceType === "yearly"
    ) {
      customRecurrenceValue = recurrenceType;
    } else {
      customRecurrenceValue = customRule.customFrequency;
    }

    const newRule: RecurrenceRule = {
      ...customRule,
      frequency: "custom",
      customFrequency: customRecurrenceValue, // Store the actual frequency type
    };
    setRule(newRule);
    onChange?.(newRule);
    setCustomDialogOpen(false);
    setDropdownOpen(false);
  };

  // Close dropdown when dialog closes
  useEffect(() => {
    if (!customDialogOpen) {
      setDropdownOpen(false);
    }
  }, [customDialogOpen]);

  const formatRecurrenceDisplay = () => {
    if (!rule) return "Frequency";

    const freq = rule.frequency ?? "one_time";
    const interval = rule.interval ?? 1;

    if (freq === "one_time") {
      return "Frequency";
    }

    if (freq === "custom") {
      const hasCustomSettings =
        interval > 1 ||
        (rule.days?.length ?? 0) > 0 ||
        (rule.months && rule.months.length > 0) ||
        rule.time ||
        rule.startDate ||
        rule.endDate;
      return hasCustomSettings ? "Custom" : "Frequency";
    }

    const base =
      interval === 1 ? freq : `Every ${interval} ${freq}`;

    if (freq === "weekly" && (rule.days?.length ?? 0) > 0) {
      const dayNames = rule.days
        .map((day) => DAYS_OF_WEEK[day].label.slice(0, 3))
        .join(", ");
      return `${base} (${dayNames})`;
    }

    if (freq === "monthly" && (rule.days?.length ?? 0) > 0) {
      const dayNumbers = (rule.days ?? [])
        .sort((a, b) => a - b)
        .map((day) => {
          // Handle ordinal suffixes
          if (day === 1 || day === 21 || day === 31) return `${day}st`;
          if (day === 2 || day === 22) return `${day}nd`;
          if (day === 3 || day === 23) return `${day}rd`;
          return `${day}th`;
        })
        .join(", ");
      return `${base} (${dayNumbers})`;
    }

    if (freq === "yearly") {
      if (rule.months && rule.months.length > 0 && (rule.days?.length ?? 0) > 0) {
        const monthNames = rule.months
          .sort((a, b) => a - b)
          .map((month) => MONTHS[month].short)
          .join(", ");
        const dayNumbers = rule.days
          .sort((a, b) => a - b)
          .map((day) => {
            if (day === 1 || day === 21 || day === 31) return `${day}st`;
            if (day === 2 || day === 22) return `${day}nd`;
            if (day === 3 || day === 23) return `${day}rd`;
            return `${day}th`;
          })
          .join(", ");
        return `${base} (${monthNames} ${dayNumbers})`;
      }
    }

    return base;
  };

  const DropdownMenuChildren = () => {
    if (subMenu) {
      return (
        <DropdownMenuSub open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuSubTrigger
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "w-full justify-start overflow-hidden active:scale-95 transition-colors group relative text-xs font-medium border border-solid border-primary/10 rounded-md capitalize",
              !value && "text-muted-foreground",
              buttonClassName
            )}
          >
            <div className="flex items-center">
              <CalendarCog
                className={cn(
                  "mr-2 h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                  iconClassName
                )}
              />
              <span>{formatRecurrenceDisplay()}</span>
            </div>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <DropdownMenuLabel>Recurrence</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleQuickSelect("one_time")}
                className={cn(
                  rule.frequency === "one_time" && "bg-primary/10 text-primary"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                No Repeat
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleQuickSelect("daily")}
                className={cn(
                  rule.frequency === "daily" && "bg-primary/10 text-primary"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                Daily
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleQuickSelect("weekly")}
                className={cn(
                  rule.frequency === "weekly" && "bg-primary/10 text-primary"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                Weekly
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleQuickSelect("monthly")}
                className={cn(
                  rule.frequency === "monthly" && "bg-primary/10 text-primary"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                Monthly
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleQuickSelect("yearly")}
                className={cn(
                  rule.frequency === "yearly" && "bg-primary/10 text-primary"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                Yearly
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleQuickSelect("custom")}
                className={cn(
                  rule.frequency === "custom" && "bg-primary/10 text-primary"
                )}
              >
                <Settings className="mr-2 h-3.5 w-3.5" />
                Custom...
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      );
    }

    return (
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    type="button"
                    className={cn(
                      "w-full justify-start overflow-hidden active:scale-95 transition-colors group relative text-xs font-medium border border-solid border-primary/10 rounded-md capitalize",
                      !value && "text-muted-foreground",
                      buttonClassName
                    )}
                  >
                    <div className="flex items-center">
                      <CalendarCog
                        className={cn(
                          "mr-2 h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                          iconClassName
                        )}
                      />
                      <span>{formatRecurrenceDisplay()}</span>
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {value && value.frequency !== "one_time"
                      ? `Recurrence: ${formatRecurrenceDisplay()}`
                      : "Set recurrence frequency"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {title && (
            <>
              <DropdownMenuLabel className="text-xs font-medium">
                {title}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={() => handleQuickSelect("one_time")}
            className={cn(
              rule.frequency === "one_time" && "bg-primary/10 text-primary"
            )}
          >
            <CircleSlash className="mr-2 h-3.5 w-3.5" />
            No Repeat
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleQuickSelect("daily")}
            className={cn(
              rule.frequency === "daily" && "bg-primary/10 text-primary"
            )}
          >
            <Sun className="mr-2 h-3.5 w-3.5" />
            Daily
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleQuickSelect("weekly")}
            className={cn(
              rule.frequency === "weekly" && "bg-primary/10 text-primary"
            )}
          >
            <CalendarDays className="mr-2 h-3.5 w-3.5" />
            Weekly
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleQuickSelect("monthly")}
            className={cn(
              rule.frequency === "monthly" && "bg-primary/10 text-primary"
            )}
          >
            <CalendarRange className="mr-2 h-3.5 w-3.5" />
            Monthly
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleQuickSelect("yearly")}
            className={cn(
              rule.frequency === "yearly" && "bg-primary/10 text-primary"
            )}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Yearly
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleQuickSelect("custom")}
            className={cn(
              rule.frequency === "custom" && "bg-primary/10 text-primary"
            )}
          >
            <Settings className="mr-2 h-3.5 w-3.5" />
            Custom...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <>
      {DropdownMenuChildren()}
      {/* Custom frequency Dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="sm:max-w-[525px] bg-background border-secondary p-0 gap-0">
          <DialogHeader className="p-4 border-b border-secondary">
            <DialogTitle className="text-lg font-semibold">
              Custom Frequency
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Customize your frequency rule to fit your needs.
            </DialogDescription>
          </DialogHeader>
          <div className="relative max-h-[70vh] overflow-y-auto customScrollbar2 py-4">
            <div className="grid gap-4 px-4">
              <div className="grid grid-cols-1 items-center gap-3">
                <Label
                  htmlFor="frequency-interval"
                  className="text-sm font-medium"
                >
                  Repeat
                </Label>
                <div className="flex items-center h-10 w-full rounded-md border-1 border-solid border-primary/10 focus-within:border-primary/20 focus-within:ring-1 focus-within:ring-primary/50 overflow-hidden">
                  <Select
                    value={
                      customRule.frequency === "custom"
                        ? "daily"
                        : customRule.frequency
                    }
                    onValueChange={(value: RecurrenceType) => {
                      const newRule: RecurrenceRule = {
                        ...customRule,
                        frequency: value,
                        customFrequency:
                          value !== "custom"
                            ? (value as
                                | "daily"
                                | "weekly"
                                | "monthly"
                                | "yearly")
                            : customRule.customFrequency, // Store the frequency type
                      };
                      if (value === "weekly") {
                        // Keep days for weekly (days of week)
                        newRule.customFrequency = "weekly";
                        newRule.months = [];
                      } else if (value === "monthly") {
                        // For monthly, days represent days of month (1-31)
                        newRule.customFrequency = "monthly";
                        newRule.days = [];
                        newRule.months = [];
                      } else if (value === "yearly") {
                        // For yearly, days represent days of month, months represent months
                        newRule.customFrequency = "yearly";
                        newRule.days = [];
                        newRule.months = [];
                      } else {
                        // Daily or other - clear days
                        newRule.customFrequency = "daily";
                        newRule.days = [];
                        newRule.months = [];
                      }
                      setCustomRule(newRule);
                    }}
                  >
                    <SelectTrigger className="h-full w-[120px] border-0 rounded-none bg-transparent focus:ring-0 focus:ring-offset-0 shadow-none px-3">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent className="bg-secondary border-secondary z-[100]">
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="h-6 w-px bg-secondary/50" />
                  <Input
                    id="interval"
                    type="number"
                    min={1}
                    value={customRule.interval}
                    onChange={(e) =>
                      setCustomRule({
                        ...customRule,
                        interval: Number(e.target.value) || 1,
                      })
                    }
                    className="flex-1 h-full border-0 rounded-none bg-transparent focus:ring-0 focus:ring-offset-0 px-3 shadow-sm focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="1"
                    autoComplete="off"
                  />
                </div>
              </div>

              {customRule.frequency === "weekly" && (
                <div className="grid grid-cols-1 items-start gap-3">
                  <Label className="text-sm font-medium">Days of Week</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <motion.div
                        key={day.value}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          type="button"
                          variant={
                            customRule.days.includes(day.value)
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          className={cn(
                            "transition-all duration-200 text-xs",
                            customRule.days.includes(day.value)
                              ? "bg-primary/10 border-primary/20 text-foreground hover:bg-primary/20"
                              : "bg-secondary/50 border-secondary"
                          )}
                          onClick={() => {
                            const days = customRule.days.includes(day.value)
                              ? customRule.days.filter((d) => d !== day.value)
                              : [...customRule.days, day.value].sort();
                            setCustomRule({ ...customRule, days });
                          }}
                        >
                          {day.label.slice(0, 3)}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {customRule.frequency === "monthly" && (
                <div className="grid grid-cols-1 items-start gap-3">
                  <Label className="text-sm font-medium">
                    Days of Month (1-31)
                  </Label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto customScrollbar2 p-1">
                    {DAYS_OF_MONTH.map((day) => {
                      const monthsWithoutDay = getMonthsWithoutDay(day);
                      const isProblematic = monthsWithoutDay.length > 0;
                      return (
                        <motion.div
                          key={day}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button
                            type="button"
                            variant={
                              customRule.days.includes(day)
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className={cn(
                              "transition-all duration-200 text-xs min-w-[2.5rem] relative",
                              customRule.days.includes(day)
                                ? "bg-primary/10 border-primary/20 text-foreground hover:bg-primary/20"
                                : "bg-secondary/50 border-secondary",
                              isProblematic &&
                                customRule.days.includes(day) &&
                                "opacity-90"
                            )}
                            onClick={() => {
                              const days = customRule.days.includes(day)
                                ? customRule.days.filter((d) => d !== day)
                                : [...customRule.days, day].sort(
                                    (a, b) => a - b
                                  );
                              setCustomRule({ ...customRule, days });
                            }}
                            title={
                              isProblematic
                                ? `This day won't occur in: ${monthsWithoutDay
                                    .map((m) => MONTHS[m].short)
                                    .join(", ")}`
                                : undefined
                            }
                          >
                            {day}
                            {isProblematic && (
                              <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                            )}
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                  {customRule.days.some(
                    (day) => getMonthsWithoutDay(day).length > 0
                  ) && (
                    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/30 border border-muted">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Some selected days won't occur in all months. Those
                        months will be skipped.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {customRule.frequency === "yearly" && (
                <>
                  <div className="grid grid-cols-1 items-start gap-3">
                    <Label className="text-sm font-medium">Months</Label>
                    <div className="flex flex-wrap gap-2">
                      {MONTHS.map((month) => (
                        <motion.div
                          key={month.value}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button
                            type="button"
                            variant={
                              customRule.months?.includes(month.value)
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className={cn(
                              "transition-all duration-200 text-xs",
                              customRule.months?.includes(month.value)
                                ? "bg-primary/10 border-primary/20 text-foreground hover:bg-primary/20"
                                : "bg-secondary/50 border-secondary"
                            )}
                            onClick={() => {
                              const currentMonths = customRule.months || [];
                              const months = currentMonths.includes(month.value)
                                ? currentMonths.filter((m) => m !== month.value)
                                : [...currentMonths, month.value].sort(
                                    (a, b) => a - b
                                  );

                              // Remove days that don't exist in the selected months
                              const validDays = customRule.days.filter((day) =>
                                isDayValidForMonths(day, months)
                              );

                              setCustomRule({
                                ...customRule,
                                months,
                                days: validDays,
                              });
                            }}
                          >
                            {month.short}
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 items-start gap-3">
                    <Label className="text-sm font-medium">
                      Days of Month (1-31)
                    </Label>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto customScrollbar2 p-1">
                      {(() => {
                        const selectedMonths = customRule.months || [];
                        return DAYS_OF_MONTH.map((day) => {
                          const isDisabled =
                            selectedMonths.length > 0 &&
                            !isDayValidForMonths(day, selectedMonths);
                          const invalidMonths = selectedMonths.filter(
                            (month) => day > getMaxDaysInMonth(month)
                          );

                          return (
                            <motion.div
                              key={day}
                              whileHover={!isDisabled ? { scale: 1.05 } : {}}
                              whileTap={!isDisabled ? { scale: 0.95 } : {}}
                            >
                              <Button
                                type="button"
                                variant={
                                  customRule.days.includes(day)
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                disabled={isDisabled}
                                className={cn(
                                  "transition-all duration-200 text-xs min-w-[2.5rem] relative",
                                  customRule.days.includes(day)
                                    ? "bg-primary/10 border-primary/20 text-foreground hover:bg-primary/20"
                                    : "bg-secondary/50 border-secondary",
                                  isDisabled &&
                                    "opacity-40 cursor-not-allowed hover:scale-100"
                                )}
                                onClick={() => {
                                  if (isDisabled) return;
                                  const days = customRule.days.includes(day)
                                    ? customRule.days.filter((d) => d !== day)
                                    : [...customRule.days, day].sort(
                                        (a, b) => a - b
                                      );
                                  setCustomRule({ ...customRule, days });
                                }}
                                title={
                                  isDisabled
                                    ? `This day doesn't exist in selected months: ${invalidMonths
                                        .map((m) => MONTHS[m].short)
                                        .join(", ")}`
                                    : undefined
                                }
                              >
                                {day}
                              </Button>
                            </motion.div>
                          );
                        });
                      })()}
                    </div>
                    {(customRule.months || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Select months first to see which days are available
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Start Date and End Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid grid-cols-1 items-start gap-3">
                  <Label className="text-sm font-medium">Start Date</Label>
                  <Popover modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !customRule.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customRule.startDate ? (
                          format(customRule.startDate, "PPP")
                        ) : (
                          <span>Pick a start date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 z-[110] pointer-events-auto"
                      align="start"
                      side="top"
                      onInteractOutside={(e) => {
                        // Allow closing when clicking outside the popover but inside the dialog
                        // Only prevent closing if clicking on the dialog overlay
                        const target = e.target as HTMLElement;
                        const dialogOverlay = target.closest(
                          "[data-radix-dialog-overlay]"
                        );
                        if (dialogOverlay) {
                          // Prevent closing if clicking on dialog overlay
                          e.preventDefault();
                        }
                        // Otherwise, allow normal popover closing behavior
                      }}
                    >
                      <div className="pointer-events-auto">
                        <CalendarUI
                          mode="single"
                          selected={customRule.startDate}
                          onSelect={(date) =>
                            setCustomRule({
                              ...customRule,
                              startDate: date ?? new Date(),
                            })
                          }
                          initialFocus
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-1 items-start gap-3">
                  <Label className="text-sm font-medium">End Date</Label>
                  <Popover modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !customRule.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customRule.endDate ? (
                          format(customRule.endDate, "PPP")
                        ) : (
                          <span>Pick an end date (optional)</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 z-[110] pointer-events-auto"
                      align="start"
                      side="top"
                      onInteractOutside={(e) => {
                        // Allow closing when clicking outside the popover but inside the dialog
                        // Only prevent closing if clicking on the dialog overlay
                        const target = e.target as HTMLElement;
                        const dialogOverlay = target.closest(
                          "[data-radix-dialog-overlay]"
                        );
                        if (dialogOverlay) {
                          // Prevent closing if clicking on dialog overlay
                          e.preventDefault();
                        }
                        // Otherwise, allow normal popover closing behavior
                      }}
                    >
                      <div className="pointer-events-auto">
                        <CalendarUI
                          mode="single"
                          selected={customRule.endDate}
                          onSelect={(date) =>
                            setCustomRule({ ...customRule, endDate: date })
                          }
                          disabled={(date) =>
                            customRule.startDate
                              ? date < customRule.startDate
                              : false
                          }
                          initialFocus
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setCustomDialogOpen(false)}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCustomSave}
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
