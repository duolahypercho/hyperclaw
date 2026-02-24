"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Task } from "$/components/Tool/TodoList/types";
import {
  Search,
  X,
  MessageSquare,
  Plus,
  History,
  CheckSquare,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebounce } from "$/hooks/isDebounce";
import { searchTaskAPI } from "$/services/tools/todo/local";
import { cn } from "@/lib/utils";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  handleSelectTask: (taskId: string) => void;
  onNewTask?: () => void;
  zIndex?: number;
}

const SearchDialog = ({
  open,
  onOpenChange,
  tasks,
  handleSelectTask,
  onNewTask,
  zIndex = 100,
}: SearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query to avoid excessive filtering/database calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  // Search tasks from backend API when debounced query changes
  useEffect(() => {
    const searchTasks = async () => {
      const query = debouncedSearchQuery.trim();

      // If no query, clear search results and use original tasks
      if (!query) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = await searchTaskAPI({ searchQuery: query });
        if (response.status === 200 && response.data) {
          setSearchResults(response.data as any[]);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Failed to search tasks:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    searchTasks();
  }, [debouncedSearchQuery]);

  const handleClose = () => {
    onOpenChange(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleNewTaskClick = () => {
    if (onNewTask) {
      onNewTask();
      handleClose();
    }
  };

  // Determine which tasks to use: search results or all tasks
  const tasksToDisplay = useMemo(() => {
    const query = debouncedSearchQuery.trim();
    return query ? searchResults : tasks;
  }, [debouncedSearchQuery, searchResults, tasks]);

  // Group tasks by time periods - works for both search and all tasks
  const tasksByTime = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filteredTasks = tasksToDisplay;

    const todayTasks: Task[] = [];
    const yesterdayTasks: Task[] = [];
    const previous30Days: Task[] = [];
    const older: Task[] = [];

    filteredTasks.forEach((task) => {
      const taskDate = task.updatedAt
        ? new Date(task.updatedAt)
        : new Date(task.createdAt);
      taskDate.setHours(0, 0, 0, 0);

      if (taskDate.getTime() === now.getTime()) {
        todayTasks.push(task);
      } else if (taskDate.getTime() === yesterday.getTime()) {
        yesterdayTasks.push(task);
      } else if (taskDate >= thirtyDaysAgo && taskDate < yesterday) {
        previous30Days.push(task);
      } else if (taskDate < thirtyDaysAgo) {
        older.push(task);
      }
    });

    // Sort each group by updatedAt (most recent first)
    const sortByDate = (a: Task, b: Task) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(a.createdAt);
      const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    };

    return {
      today: todayTasks.sort(sortByDate),
      yesterday: yesterdayTasks.sort(sortByDate),
      previous30Days: previous30Days.sort(sortByDate),
      older: older.sort(sortByDate),
    };
  }, [tasksToDisplay]);

  // Get month name for older tasks
  const getMonthName = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  // Group older tasks by month
  const olderTasksByMonth = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    tasksByTime.older.forEach((task) => {
      const taskDate = task.updatedAt
        ? new Date(task.updatedAt)
        : new Date(task.createdAt);
      const monthKey = getMonthName(taskDate);
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(task);
    });
    return grouped;
  }, [tasksByTime.older]);

  const handleTaskClick = (taskId: string) => {
    handleSelectTask(taskId);
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setSearchQuery("");
        }
      }}
    >
      <DialogContent
        className="max-w-md h-[600px] flex flex-col p-0 bg-card border-border"
        variant="secondary"
        style={{ zIndex }}
      >
        <DialogHeader className="px-4 pt-2 pb-2 border-b border-border border-solid border-t-0 border-r-0 border-l-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                ref={searchInputRef}
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 pl-0 pr-10"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto customScrollbar2 px-4 pb-4 space-y-2">
          {onNewTask && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleNewTaskClick}
              className="flex items-center justify-start gap-2 whitespace-nowrap w-full"
            >
              <Plus className="w-4 h-4" />
              <span>New Goal</span>
            </Button>
          )}

          {isSearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          )}

          {!isSearching && tasksByTime.today.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                Today
              </h3>
              <div className="space-y-1">
                {tasksByTime.today.map((task) => (
                  <div
                    key={task._id}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors group"
                    onClick={() => handleTaskClick(task._id)}
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-medium truncate flex-1">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching && tasksByTime.yesterday.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                Yesterday
              </h3>
              <div className="space-y-1">
                {tasksByTime.yesterday.map((task) => (
                  <div
                    key={task._id}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors group"
                    onClick={() => handleTaskClick(task._id)}
                  >
                    <CheckSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-medium truncate flex-1">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching && tasksByTime.previous30Days.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                Previous 30 Days
              </h3>
              <div className="space-y-1">
                {tasksByTime.previous30Days.map((task) => (
                  <div
                    key={task._id}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors group"
                    onClick={() => handleTaskClick(task._id)}
                  >
                    <CheckSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-medium truncate flex-1">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching &&
            Object.keys(olderTasksByMonth).length > 0 &&
            Object.entries(olderTasksByMonth)
              .sort((a, b) => {
                const dateA = new Date(a[0]);
                const dateB = new Date(b[0]);
                return dateB.getTime() - dateA.getTime();
              })
              .map(([month, monthTasks]) => (
                <div key={month} className="mb-4">
                  <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                    {month}
                  </h3>
                  <div className="space-y-1">
                    {monthTasks.map((task) => (
                      <div
                        key={task._id}
                        className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors group"
                        onClick={() => handleTaskClick(task._id)}
                      >
                        <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-medium truncate flex-1">
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

          {!isSearching &&
            tasksByTime.today.length === 0 &&
            tasksByTime.yesterday.length === 0 &&
            tasksByTime.previous30Days.length === 0 &&
            Object.keys(olderTasksByMonth).length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Search className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  {debouncedSearchQuery.trim()
                    ? "No tasks found"
                    : "No tasks yet"}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {debouncedSearchQuery.trim()
                    ? "Try a different search term"
                    : "Create your first task to get started"}
                </p>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchDialog;
