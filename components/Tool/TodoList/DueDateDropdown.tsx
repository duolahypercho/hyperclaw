import React, { useEffect, useMemo, useState, memo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "$/utils";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarIcon,
  Calendar,
  CalendarArrowUp,
  CalendarDays,
  CalendarX,
  Clock,
  CalendarClock,
  CalendarCheck,
} from "lucide-react";
import { format } from "date-fns";
import { useTodoList } from "./provider/todolistProvider";

interface DueDateDropdownProps {
  _id: string;
  dueDate: Date | undefined;
  completed: boolean;
  finishedAt: Date | undefined;
  buttonClassName?: string;
  iconClassName?: string;
  subMenu?: boolean;
}

const DueDateDropdown = ({
  _id,
  dueDate: taskDueDate,
  completed,
  finishedAt,
  buttonClassName,
  iconClassName,
  subMenu = false,
}: DueDateDropdownProps) => {
  const [customDate, setCustomDate] = useState<Date | undefined>(
    taskDueDate ? new Date(taskDueDate) : new Date()
  );
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
  const { handleEditTask: onEditTask } = useTodoList();
  const dueDateItem = [
    {
      name: "Remove Due Date",
      onClick: () => {
        onEditTask(_id, { dueDate: null });
      },
      icon: <CalendarX className="mr-2 h-3.5 w-3.5 flex-shrink-0" />,
    },
    {
      name: "Due Today",
      onClick: () => {
        const today = new Date();
        //at the end of the day
        today.setHours(23, 59, 59, 999);
        onEditTask(_id, { dueDate: today.toISOString() });
      },
      icon: <Calendar className="mr-2 h-3.5 w-3.5 flex-shrink-0" />,
    },
    {
      name: "Due This Week",
      onClick: () => {
        const today = new Date();
        // Calculate days until Sunday (0 = Sunday, 6 = Saturday)
        const daysUntilSunday = 7 - today.getDay();
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + daysUntilSunday);
        endOfWeek.setHours(23, 59, 59, 999);
        onEditTask(_id, { dueDate: endOfWeek.toISOString() });
      },
      icon: <CalendarArrowUp className="mr-2 h-3.5 w-3.5 flex-shrink-0" />,
    },
    {
      name: "Due This Work Week",
      onClick: () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        let daysUntilFriday = 5 - dayOfWeek;
        if (daysUntilFriday < 0) {
          // If today is Saturday (6) or Sunday (0), set to next week's Friday
          daysUntilFriday += 7;
        }
        const endOfWorkWeek = new Date(today);
        endOfWorkWeek.setDate(today.getDate() + daysUntilFriday);
        endOfWorkWeek.setHours(23, 59, 59, 999);
        onEditTask(_id, { dueDate: endOfWorkWeek.toISOString() });
      },
      icon: <CalendarArrowUp className="mr-2 h-3.5 w-3.5 flex-shrink-0" />,
    },
    {
      name: "Due Tomorrow",
      onClick: () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);
        onEditTask(_id, { dueDate: tomorrow.toISOString() });
      },
      icon: <CalendarArrowUp className="mr-2 h-3.5 w-3.5 flex-shrink-0" />,
    },
    {
      name: "Due Next Week",
      onClick: () => {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(23, 59, 59, 999);
        onEditTask(_id, { dueDate: nextWeek.toISOString() });
      },
      icon: <CalendarDays className="mr-2 h-3.5 w-3.5 flex-shrink-0" />,
    },
  ];

  // Track current time to drive updates
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Sync customDate and force update when taskDueDate prop changes
  useEffect(() => {
    if (taskDueDate) {
      setCustomDate(new Date(taskDueDate));
    } else {
      setCustomDate(new Date());
    }
    // Force immediate update of nowMs to recalculate display when due date changes
    setNowMs(Date.now());
  }, [taskDueDate]); // Use timestamp to detect actual date changes

  // Calculate the appropriate update interval
  const updateInterval = useMemo(() => {
    if (!taskDueDate) return null;

    const now = new Date(nowMs);
    const dueDate = new Date(taskDueDate);

    if (isNaN(dueDate.getTime())) return null; // Handle invalid date

    const diffMs = dueDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) return "expired";
    if (diffMins < 60) return 1000 * 60; // Update every minute
    if (diffHours < 24) return 1000 * 60 * 60; // Update every hour
    if (diffDays < 7) return 1000 * 60 * 60 * 24; // Update every day
    return null; // Otherwise, no regular updates needed
  }, [taskDueDate, nowMs]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    // Handle expired case
    if (updateInterval === "expired") {
      setNowMs(Date.now());
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now()); // Force update when screen becomes active
        if (updateInterval) {
          clearInterval(intervalId); // Clear any existing interval
          intervalId = setInterval(() => {
            setNowMs(Date.now());
          }, updateInterval);
        }
      } else if (intervalId) {
        clearInterval(intervalId); // Stop interval when the screen is inactive
      }
    };

    // Initial setup for interval
    if (updateInterval) {
      intervalId = setInterval(() => {
        setNowMs(Date.now());
      }, updateInterval);
    }

    // Listen for visibility change
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId); // Cleanup interval on unmount
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [updateInterval]);

  // Update the formattedDueDate useMemo
  const formattedDueDate = useMemo(() => {
    // If task is completed, return a simpler state
    if (completed) {
      if (!finishedAt) {
        return {
          text: "Completed",
          color: "text-muted-foreground",
          hoverColor: "hover:text-foreground",
          icon: CalendarCheck,
          variant: "default" as const,
          tooltip: "Completed",
        };
      }

      return {
        text: "Completed",
        color: "text-muted-foreground",
        hoverColor: "hover:text-foreground",
        icon: CalendarCheck,
        variant: "default" as const,
        tooltip: `Completed ${format(
          new Date(finishedAt || ""),
          "MMM d, h:mm a"
        )}`,
      };
    }

    if (!taskDueDate)
      return {
        text: "Due date",
        color: "text-muted-foreground",
        hoverColor: "hover:text-foreground",
        icon: CalendarIcon,
        tooltip: "Click to set due date",
      };

    const now = new Date(nowMs);
    const dueDate = new Date(taskDueDate);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMins < 0) {
      return {
        text: "Overdue",
        color: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        tooltip: `Overdue by ${format(dueDate, "MMM d, h:mm a")}`,
        icon: CalendarX,
      };
    } else if (diffMins < 60) {
      return {
        text: `${diffMins}m`,
        color:
          diffMins < 30
            ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "bg-warning/10 text-warning hover:bg-warning/20",
        icon: Clock,
        tooltip: `Due ${format(dueDate, "h:mm a")}`,
      };
    } else if (diffHours < 24) {
      return {
        text: `${diffHours}h`,
        color:
          diffHours < 3
            ? "bg-warning/10 text-warning hover:bg-warning/20"
            : "bg-yellow-400/20 text-yellow-700 hover:bg-yellow-400/20 dark:bg-yellow-300 dark:text-yellow-300 dark:hover:bg-yellow-400/20",
        icon: CalendarClock,
        tooltip: `Due ${format(dueDate, "h:mm a")}`,
      };
    } else if (diffDays < 7) {
      return {
        text: `${diffDays}d`,
        color:
          diffDays < 2
            ? "bg-yellow-400/20 text-yellow-700 hover:bg-yellow-400/20 dark:bg-yellow-300/10 dark:text-yellow-300 dark:hover:bg-yellow-400/20"
            : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800",
        icon: CalendarCheck,
        tooltip: `Due ${format(dueDate, "MMM d")}`,
      };
    } else if (diffMonths < 1) {
      return {
        text: format(dueDate, "MMM d"),
        color:
          "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800",
        icon: CalendarDays,
        tooltip: `Due ${format(dueDate, "MMM d")}`,
      };
    } else {
      return {
        text: format(dueDate, "MMM d, yyyy"),
        color: "text-muted-foreground hover:text-foreground",
        icon: CalendarIcon,
        tooltip: `Due ${format(dueDate, "MMM d, yyyy")}`,
      };
    }
  }, [taskDueDate, completed, finishedAt, nowMs]);

  if (subMenu) {
    return (
      <DropdownMenuSub
        open={isCustomDateOpen}
        onOpenChange={setIsCustomDateOpen}
      >
        <DropdownMenuSubTrigger
          className={cn(
            "w-full justify-start overflow-hidden active:scale-95 transition-colors group relative text-xs font-medium border border-solid border-primary/10 rounded-md",
            formattedDueDate.color,
            buttonClassName
          )}
        >
          <formattedDueDate.icon
            className={cn(
              "mr-2 h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
              iconClassName
            )}
          />
          <span>
            {formattedDueDate.text}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-56 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
            <DropdownMenuLabel>Due date</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {dueDateItem.map((dueDate) => (
              <DropdownMenuItem
                key={dueDate.name}
                onClick={() => dueDate.onClick()}
                className="text-muted-foreground text-xs font-medium"
              >
                {dueDate.icon}
                {dueDate.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-muted-foreground text-xs font-medium">
                <CalendarClock className="mr-2 h-4 w-4 flex-shrink-0" />
                Custom date
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="text-muted-foreground text-xs font-medium">
                  <DropdownMenuLabel>Pick a date</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <CalendarUI
                    mode="single"
                    selected={customDate}
                    onSelect={(date) => setCustomDate(date)}
                    initialFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      className="w-full"
                      type="button"
                      disabled={!customDate}
                      onClick={() => {
                        if (!customDate) return;

                        const endOfDay = new Date(customDate);
                        endOfDay.setHours(23, 59, 59, 999);
                        onEditTask(_id, {
                          dueDate: endOfDay.toISOString(),
                        });
                        setCustomDate(undefined);
                        setIsCustomDateOpen(false);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      className="w-full"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setCustomDate(undefined);
                        //close the dropdown
                        setIsCustomDateOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu open={isCustomDateOpen} onOpenChange={setIsCustomDateOpen}>
      <DropdownMenuTrigger asChild>
        <div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className={cn(
                    "w-full justify-start overflow-hidden active:scale-95 transition-colors group relative text-xs font-medium border border-solid border-primary/10 rounded-md",
                    formattedDueDate.color,
                    buttonClassName
                  )}
                >
                  <formattedDueDate.icon
                    className={cn(
                      "mr-2 h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                      iconClassName
                    )}
                  />
                  <span
                    className={"truncate block w-full line-clamp-1 text-left"}
                  >
                    {formattedDueDate.text}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{formattedDueDate.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <DropdownMenuLabel>Due date</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dueDateItem.map((dueDate) => (
          <DropdownMenuItem
            key={dueDate.name}
            onClick={() => dueDate.onClick()}
            className="text-muted-foreground text-xs font-medium"
          >
            {dueDate.icon}
            {dueDate.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-muted-foreground text-xs font-medium">
            <CalendarClock className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
            Custom date
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="text-muted-foreground text-xs font-medium">
              <DropdownMenuLabel>Pick a date</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <CalendarUI
                mode="single"
                selected={customDate}
                onSelect={(date) => setCustomDate(date)}
                initialFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  className="w-full text-xs h-7"
                  type="button"
                  disabled={!customDate}
                  onClick={() => {
                    if (!customDate) return;

                    const endOfDay = new Date(customDate);
                    endOfDay.setHours(23, 59, 59, 999);
                    onEditTask(_id, { dueDate: endOfDay.toISOString() });
                    setCustomDate(undefined);
                    setIsCustomDateOpen(false);
                  }}
                >
                  Confirm
                </Button>
                <Button
                  className="w-full text-xs h-7"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setCustomDate(undefined);
                    //close the dropdown
                    setIsCustomDateOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DueDateDropdown;
