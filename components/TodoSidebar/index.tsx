"use client";

import React, { useMemo, useState, memo } from "react";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { Task } from "$/components/Tool/TodoList/types";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "$/hooks/useLocalStorage";
import {
  ListChecks,
  Plus,
  Search,
  ChevronRight,
  Folder,
  FolderOpen,
  Calendar,
  CheckCircle2,
  Inbox,
  FolderPlus,
  FolderX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  TaskActionButtons,
  buttonSize,
  iconSize,
} from "$/components/Tool/TodoList/SortableTask";
import TodoSidebarSkeleton from "./TodoSidebarSkeleton";
import AddTaskDialog from "./AddTaskDialog";
import SearchDialog from "./SearchDialog";
import StatusBadge from "$/components/Tool/TodoList/StatusBadge";
import StepsBadge from "$/components/Tool/TodoList/StepsBadge";
import RecurrenceStatisticsBadge from "$/components/Tool/TodoList/RecurrenceStatisticsBadge";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";

interface TodoSidebarProps {
  className?: string;
}

interface TaskItemProps {
  task: Task;
  isSelected: boolean;
  selectedTaskId?: string;
  inProgressTask?: string;
  onSelectTask: (taskId: string) => void;
  setOnEditMode: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  onEditTask: (id: string, fieldsToUpdate: Record<string, any>, ignore?: boolean) => void;
  onDeleteTask: (id: string, ignore?: boolean) => void;
}

const TaskItem = memo(({
  task,
  isSelected,
  selectedTaskId,
  inProgressTask,
  onSelectTask,
  setOnEditMode,
  onToggleStar,
  onEditTask,
  onDeleteTask,
}: TaskItemProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleConvertToTweet = () => {
    let taskInfo = `Task: ${task.title}\n\n`;
    if (task.dueDate) {
      taskInfo += `Due Date: ${new Date(
        task.dueDate
      ).toLocaleDateString()}\n\n`;
    }
    const event = new CustomEvent("enhanceXTextarea", {
      detail: {
        taskInfo: taskInfo.trim(),
      },
    });
    window.dispatchEvent(event);
  };

  // Format due date for badge (same logic as SortableTask)
  const formattedDueDate = useMemo(() => {
    if (!task.dueDate) return null;

    const now = new Date();
    const dueDate = new Date(task.dueDate);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 0) {
      return {
        text: "Overdue",
        color:
          "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/20 dark:text-destructive dark:border-destructive/30",
        tooltip: `Overdue by ${format(dueDate, "MMM d")}`,
      };
    } else if (diffMins < 60) {
      return {
        text: `${diffMins}m`,
        color:
          diffMins < 30
            ? "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/20 dark:text-destructive dark:border-destructive/30"
            : "bg-yellow-500/20 text-yellow-400 border border-yellow-400/60 dark:bg-yellow-400/20 dark:text-yellow-200 dark:border-yellow-200",
        tooltip: `Due ${format(dueDate, "h:mm a")}`,
      };
    } else if (diffHours < 24) {
      return {
        text: `${diffHours}h`,
        color:
          diffHours < 3
            ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:bg-yellow-400/10 dark:text-yellow-300 dark:border-yellow-400/30"
            : "bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-400/10 dark:text-green-300 dark:border-green-400/30",
        tooltip: `Due ${format(dueDate, "h:mm a")}`,
      };
    } else if (diffDays < 7) {
      return {
        text: `${diffDays}d`,
        color:
          diffDays < 2
            ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:bg-yellow-400/10 dark:text-yellow-300 dark:border-yellow-400/30"
            : "bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-400/10 dark:text-green-300 dark:border-green-400/30",
        tooltip: `Due ${format(dueDate, "MMM d")}`,
      };
    } else {
      return {
        text: format(dueDate, "MMM d"),
        color:
          "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary dark:border-primary/30",
        tooltip: `Due ${format(dueDate, "MMM d, yyyy")}`,
      };
    }
  }, [task.dueDate]);

  // Check if task has badges to show
  const hasBadges =
    formattedDueDate ||
    (task.recurrence && task.recurrence.frequency !== "one_time") ||
    task.steps.uncompleted + task.steps.completed > 0 ||
    task.status !== "pending";

  return (
    <div
      className={cn(
        "group flex flex-col gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs",
        "hover:bg-primary/5",
        isSelected && "bg-primary/10"
      )}
      onClick={() => onSelectTask?.(task._id)}
    >
      {/* Task Title Row */}
      <div className="flex items-center gap-2">
        {/* Task Title */}
        <span
          className={cn(
            "flex-1 truncate font-medium tracking-normal",
            task.status === "completed"
              ? "line-through text-muted-foreground"
              : "text-foreground"
          )}
        >
          {task.title}
        </span>

        {/* Action Buttons */}
        <div
          className="flex-shrink-0 flex items-center"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TaskActionButtons
            task={task}
            size="sm"
            buttonSize={buttonSize}
            iconSize={iconSize}
            selectedTaskId={selectedTaskId}
            setOnEditMode={setOnEditMode}
            dropdownOpen={dropdownOpen}
            setDropdownOpen={setDropdownOpen}
            onToggleStar={onToggleStar}
            handleConvertToTweet={handleConvertToTweet}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            setIsJustDeleted={() => { }}
          />
        </div>
      </div>

      {/* Badges Row */}
      {hasBadges && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge
            status={task.status}
            size="sm"
            inProgressTaskId={inProgressTask}
            taskId={task._id}
          />
          {formattedDueDate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      "inline-flex items-center gap-1 border cursor-help border-solid transition-colors text-[10px] px-1.5 py-0.5 h-fit",
                      formattedDueDate.color
                    )}
                  >
                    <Calendar className="w-3 h-3" />
                    <span className="font-medium leading-[10px]">
                      {formattedDueDate.text}
                    </span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{formattedDueDate.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {task.recurrence &&
            task.recurrence.frequency !== "one_time" &&
            task.statistics && (
              <RecurrenceStatisticsBadge
                statistics={task.statistics}
                size="sm"
                classNameText="leading-[10px]"
              />
            )}
          {task.steps.uncompleted + task.steps.completed > 0 && (
            <StepsBadge
              completed={task.steps.completed}
              total={task.steps.uncompleted + task.steps.completed}
              size="sm"
              classNameText="leading-[10px]"
            />
          )}
        </div>
      )}
    </div>
  );
});

TaskItem.displayName = "TaskItem";

interface ListSectionProps {
  list?: { _id: string; name: string };
  tasks: Task[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedTaskId?: string;
  inProgressTask?: string;
  onSelectTask: (taskId: string) => void;
  setOnEditMode: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  onEditTask: (id: string, fieldsToUpdate: Record<string, any>, ignore?: boolean) => void;
  onDeleteTask: (id: string, ignore?: boolean) => void;
}

const ListSection = memo(
  ({
    list,
    tasks: listTasks,
    isExpanded,
    onToggle,
    selectedTaskId,
    inProgressTask,
    onSelectTask,
    setOnEditMode,
    onToggleStar,
    onEditTask,
    onDeleteTask,
  }: ListSectionProps) => {
    const FolderIcon = isExpanded ? FolderOpen : Folder;
    const displayName = list?.name || "Inbox";

    return (
      <div className="mb-1">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all group"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {list ? <FolderIcon className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" /> : <Inbox className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />}
            <span className="text-xs font-medium tracking-normal text-muted-foreground truncate group-hover:text-foreground">
              {displayName}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-muted-foreground bg-primary/10 px-1.5 py-0.5 rounded-full">
              {listTasks.length}
            </span>
            <ChevronRight
              className={cn(
                "w-3 h-3 text-muted-foreground group-hover:text-foreground transition-transform duration-200",
                isExpanded && "rotate-90"
              )}
            />
          </div>
        </button>

        {isExpanded && (
          <div className="pl-2 mt-0.5">
            <div className="space-y-0.5">
              {listTasks.map((task) => (
                <TaskItem
                  key={task._id}
                  task={task}
                  isSelected={selectedTaskId === task._id}
                  selectedTaskId={selectedTaskId}
                  inProgressTask={inProgressTask}
                  onSelectTask={onSelectTask}
                  setOnEditMode={setOnEditMode}
                  onToggleStar={onToggleStar}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Ignore tasks array and onToggle changes to prevent unnecessary re-renders
    // But ensure function props are always available
    const isExpandedEqual = prevProps.isExpanded === nextProps.isExpanded;
    const listIdEqual = prevProps.list?._id === nextProps.list?._id;
    const functionsEqual =
      prevProps.onSelectTask === nextProps.onSelectTask &&
      prevProps.onEditTask === nextProps.onEditTask &&
      prevProps.onDeleteTask === nextProps.onDeleteTask;

    // If expanded state, listId, and functions are equal, skip re-render (return true)
    return isExpandedEqual && listIdEqual && functionsEqual;
  }
);

ListSection.displayName = "ListSection";

const TodoSidebarContent = ({ className }: TodoSidebarProps) => {
  const {
    tasks,
    lists,
    loading,
    handleSelectTask,
    selectedTask,
    handleAddTask,
    handleToggleStar,
    handleEditTask,
    handleDeleteTask,
    setOnEditMode,
    inProgressTask,
    handleCreateList,
  } = useTodoList();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>(
    {}
  );
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useLocalStorage<boolean>(
    "todo-sidebar-show-completed",
    false
  );
  const [showEmptyLists, setShowEmptyLists] = useLocalStorage<boolean>(
    "todo-sidebar-show-empty-lists",
    true
  );

  // Get all tasks organized by list
  const tasksByList = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Filter out completed tasks if toggle is off
    const filteredTasks = showCompletedTasks
      ? tasks
      : tasks.filter((task) => task.status !== "completed");

    // Group tasks by list
    const grouped: Record<string, Task[]> = {};
    const ungrouped: Task[] = [];

    filteredTasks.forEach((task) => {
      if (task.listId) {
        if (!grouped[task.listId]) {
          grouped[task.listId] = [];
        }
        grouped[task.listId].push(task);
      } else {
        ungrouped.push(task);
      }
    });

    // Sort tasks within each list
    Object.keys(grouped).forEach((listId) => {
      grouped[listId].sort((a, b) => {
        // Completed tasks go to the end
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (a.status !== "completed" && b.status === "completed") return -1;
        return a.order - b.order;
      });
    });

    ungrouped.sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return a.order - b.order;
    });

    return { grouped, ungrouped };
  }, [tasks, showCompletedTasks]);

  const toggleList = (listId: string) => {
    setExpandedLists((prev) => ({
      ...prev,
      [listId]: !prev[listId],
    }));
  };

  const isListExpanded = (listId: string) => {
    return expandedLists[listId] !== false; // Default to true
  };

  const handleNewTask = () => {
    //setIsAddTaskDialogOpen(true);
    handleSelectTask(undefined);
  };

  const handleOpenSearch = () => {
    setIsSearchOpen(true);
  };

  if (loading) {
    return <TodoSidebarSkeleton className={className} />;
  }

  return (
    <>
      <div className={cn("h-full flex flex-col overflow-hidden", className)}>
        {/* New Goal & Search */}
        <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-0.5">
          <Button
            onClick={handleNewTask}
            variant="ghost"
            size="xs"
            className="w-full justify-start gap-2"
          >
            <Plus />
            New Goal
          </Button>
          <Button
            onClick={() => handleCreateList({ name: "New Project", planned: false, ignore: true })}
            variant="ghost"
            size="xs"
            className="w-full justify-start gap-2"
          >
            <FolderPlus />
            New Project
          </Button>
          <Button
            onClick={handleOpenSearch}
            variant="ghost"
            size="xs"
            className="w-full justify-start gap-2"
          >
            <Search />
            Search Goal
          </Button>
          {/* Show Completed Toggle */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors hover:text-foreground active:text-foreground/70 text-muted-foreground duration-300 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-primary/5 active:bg-primary/10 font-medium">
            <div className="flex items-center gap-2 flex-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-xs">Show completed</span>
            </div>
            <Switch
              checked={showCompletedTasks}
              onCheckedChange={setShowCompletedTasks}
              className="scale-75"
            />
          </div>
          {/* Show Empty Lists Toggle */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors hover:text-foreground active:text-foreground/70 text-muted-foreground duration-300 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-primary/5 active:bg-primary/10 font-medium">
            <div className="flex items-center gap-2 flex-1">
              <FolderX className="w-3.5 h-3.5" />
              <span className="text-xs">Show empty lists</span>
            </div>
            <Switch
              checked={showEmptyLists}
              onCheckedChange={setShowEmptyLists}
              className="scale-75"
            />
          </div>
        </div>

        {/* Task Lists */}
        <div className="flex-1 overflow-y-auto customScrollbar2 px-2 py-2">
          <div className="space-y-1">
            {/* Tasks grouped by lists */}
            {lists
              .filter((list) => {
                // If showEmptyLists is false, filter out lists with no tasks
                if (!showEmptyLists) {
                  const listTasks = tasksByList.grouped[list._id] || [];
                  return listTasks.length > 0;
                }
                return true;
              })
              .map((list) => {
                const listTasks = tasksByList.grouped[list._id] || [];
                const listId = list._id;
                return (
                  <ListSection
                    key={listId}
                    list={list}
                    tasks={listTasks}
                    isExpanded={isListExpanded(listId)}
                    onToggle={() => toggleList(listId)}
                    selectedTaskId={selectedTask?._id}
                    inProgressTask={inProgressTask}
                    onSelectTask={handleSelectTask}
                    setOnEditMode={setOnEditMode}
                    onToggleStar={handleToggleStar}
                    onEditTask={handleEditTask}
                    onDeleteTask={handleDeleteTask}
                  />
                );
              })}

            {/* Ungrouped tasks */}
            {tasksByList.ungrouped.length > 0 && (
              <ListSection
                tasks={tasksByList.ungrouped}
                isExpanded={isListExpanded("ungrouped")}
                onToggle={() => toggleList("ungrouped")}
                selectedTaskId={selectedTask?._id}
                inProgressTask={inProgressTask}
                onSelectTask={handleSelectTask}
                setOnEditMode={setOnEditMode}
                onToggleStar={handleToggleStar}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
              />
            )}

            {/* Empty State */}
            {Object.keys(tasksByList.grouped).length === 0 &&
              tasksByList.ungrouped.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <ListChecks className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <p className="text-sm text-muted-foreground">No tasks yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Create your first task to get started
                  </p>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={isAddTaskDialogOpen}
        onOpenChange={setIsAddTaskDialogOpen}
        lists={lists}
        handleAddTask={
          handleAddTask as (params: {
            title: string;
            description?: string;
            date?: Date;
            starred: boolean;
            myDay: boolean;
            listId?: string;
          }) => Promise<any>
        }
      />

      {/* Search Dialog */}
      <SearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        tasks={tasks}
        handleSelectTask={handleSelectTask}
        onNewTask={handleNewTask}
      />
    </>
  );
};

const TodoSidebar = ({ className }: TodoSidebarProps) => {
  return <TodoSidebarContent className={className} />;
};

export default TodoSidebar;
