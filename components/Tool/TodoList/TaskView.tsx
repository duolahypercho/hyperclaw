import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { cn } from "$/utils";
import { List, Task } from "./types";
import TaskButton from "./TaskButton";
import StatusBadge from "./StatusBadge";
import RemoveButton from "./RemoveButton";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { EllipsisTooltip } from "$/components/Tool/TodoList/component/EllipsisTooltip";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  EllipsisVerticalIcon,
  ListChecks,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTodoList } from "./provider/todolistProvider";
import { useOS } from "@OS/Provider/OSProv";
import ZSidebarDropdown from "$/components/UI/ZDropdown";
import { useDialog } from "@OS/Layout/Dialog/DialogContext";
import { DeleteConfirmation } from "$/components/UI/DeleteConfirmation";

interface Particle {
  id: number;
  color: string;
  scale: number;
  rotation: number;
}

const generateParticle = () => ({
  color: ["#4CAF50", "#FFC107", "#2196F3", "#E91E63"][
    Math.floor(Math.random() * 4)
  ],
  scale: Math.random() * 0.5 + 0.5,
  rotation: Math.random() * 360,
});

interface TaskItemProps {
  id: string;
  task: Task;
  onEditTask: (key: string, taskId: string, newTitle: string) => void;
  onDeleteTask: (key: string, taskId: string) => void;
  isOverlay?: boolean;
  showRed?: boolean;
}

// Memoized TaskItem component to prevent unnecessary re-renders
const TaskItemComponent: React.FC<TaskItemProps> = ({
  task,
  id,
  onEditTask,
  onDeleteTask,
  isOverlay,
  showRed,
}) => {
  const [isJustCompleted, setIsJustCompleted] = useState(false);
  const [isJustDeleted, setIsJustDeleted] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const {
    handleSelectTask: onSelectTask,
    selectedTask,
    handleStatusChange,
    inProgressTask,
  } = useTodoList();
  const { updateAppSettings, currentAppSettings } = useOS();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task._id,
    disabled: isOverlay || isEditing, // Disable drag when editing
    data: {
      type: "item",
      item: task,
      container: id,
    },
  });

  // Memoize event handlers to prevent unnecessary re-renders
  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleEditBlur = useCallback(() => {
    setIsEditing(false);
    if (editValue.trim() !== task.title && editValue.trim()) {
      onEditTask(id, task._id, editValue.trim());
    } else {
      setEditValue(task.title); // Reset to original value if empty or unchanged
    }
  }, [editValue, task.title, task._id, id, onEditTask]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setIsEditing(false);
        if (editValue.trim() !== task.title && editValue.trim()) {
          onEditTask(id, task._id, editValue.trim());
        } else {
          setEditValue(task.title);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
        setEditValue(task.title);
      }
    },
    [editValue, task.title, task._id, id, onEditTask]
  );

  const handleEditChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditValue(e.target.value);
    },
    []
  );

  const handleDeleteClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsJustDeleted(true);
  }, []);

  // Only update editValue when task.title changes from outside
  useEffect(() => {
    if (!isEditing) {
      setEditValue(task.title);
    }
  }, [task.title, isEditing]);

  // Handle completion animation
  useEffect(() => {
    if (isJustCompleted) {
      setParticles(
        [...Array(20)].map((_, i) => ({
          id: i,
          ...generateParticle(),
        }))
      );

      const timeout = setTimeout(() => {
        setParticles([]);
      }, 1000);

      return () => clearTimeout(timeout);
    } else {
      setParticles([]);
    }
  }, [isJustCompleted]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const style = isOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      };

  if (isOverlay) {
    return (
      <div className="group flex flex-row gap-3 items-center relative transition-all duration-200 rounded-none min-h-[30px] opacity-50">
        <div className="flex flex-row h-full gap-[0.1rem] items-center justify-between w-full">
          <div
            className={cn(
              "flex-1 flex items-center gap-3 font-medium leading-tight border-b border-solid border-t-0 border-r-0 border-l-0 text-sm p-1.5 overflow-hidden",
              "border-muted-foreground/10",
              task.status === "completed"
                ? "text-muted-foreground"
                : "text-foreground",
              showRed &&
                task.status !== "completed" &&
                "text-red-500 border-red-500"
            )}
          >
            <EllipsisTooltip
              className={
                "whitespace-nowrap overflow-hidden text-ellipsis w-full hover:text-primary/80 transition-colors cursor-text " +
                (task.status === "completed" ? "line-through" : "")
              }
            >
              <span onClick={handleTitleClick}>{task.title}</span>
            </EllipsisTooltip>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(isEditing ? {} : listeners)} // Only apply listeners when not editing
      style={style}
      className="flex flex-row gap-3 items-center relative transition-all duration-200 rounded-none min-h-[30px]"
      onMouseEnter={() => setIsTooltipHovered(true)}
      onMouseLeave={() => setIsTooltipHovered(false)}
    >
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{
              scale: 0,
              x: 0,
              y: 0,
              opacity: 1,
            }}
            animate={{
              scale: 1,
              x: (Math.random() - 0.5) * 200,
              y: (Math.random() - 0.5) * 200,
              opacity: 0,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.8,
              ease: "easeOut",
            }}
            style={{
              position: "absolute",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#4CAF50",
              zIndex: 50,
            }}
          />
        ))}
      </AnimatePresence>

      <motion.li
        initial={{ opacity: 1, x: 0 }}
        animate={{
          opacity: isJustCompleted || isJustDeleted ? 0 : 1,
          x: isJustCompleted ? -100 : isJustDeleted ? 100 : 0,
          scale: isJustCompleted || isJustDeleted ? 0.95 : 1,
        }}
        onAnimationComplete={() => {
          if (isJustCompleted) {
            setIsJustCompleted(false);
            handleStatusChange(task._id, "completed");
          }
          if (isJustDeleted) {
            setIsJustDeleted(false);
            onDeleteTask(id, task._id);
          }
        }}
        className={cn(
          "flex flex-row h-fit gap-[0.1rem] items-center justify-between w-full transition-colors rounded",
          // Status-based background colors
          task.status === "in_progress" && "bg-accent/5 border-accent/20"
        )}
      >
        <div
          className={cn(
            "h-full inline-flex items-center justify-center transition-opacity",
            isTooltipHovered ? "opacity-100" : "opacity-0"
          )}
        >
          <TaskButton
            task={task}
            onStatusChange={handleStatusChange}
            setIsJustCompleted={setIsJustCompleted}
            size="small"
          />
        </div>

        <motion.div
          className={cn(
            "flex-1 flex items-center gap-3 font-medium leading-tight border-b border-solid border-t-0 border-r-0 border-l-0 text-sm overflow-hidden h-full transition-colors",
            "border-muted-foreground/10",
            // Status-based background colors
            task.status === "in_progress" && "bg-accent/5 border-accent/20",
            task.status === "completed"
              ? "text-muted-foreground"
              : "text-foreground",
            showRed &&
              task.status !== "completed" &&
              "text-red-500 border-red-500"
          )}
        >
          {isEditing ? (
            <TextareaAutosize
              value={editValue}
              onChange={handleEditChange}
              onBlur={handleEditBlur}
              onKeyDown={handleEditKeyDown}
              className="w-full resize-none border-none bg-transparent p-0 text-sm leading-snug focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none shadow-none overflow-auto customScrollbar2"
              ref={textareaRef}
              autoFocus
              onFocus={(e) => {
                // Prevent drag and drop events when focused
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                // Prevent drag and drop events when clicking textarea
                e.stopPropagation();
              }}
            />
          ) : (
            <div className="flex items-center gap-2 w-full">
              <EllipsisTooltip
                className={cn(
                  "whitespace-nowrap overflow-hidden text-ellipsis flex-1 hover:text-primary/80 transition-colors cursor-text",
                  showRed &&
                    task.status !== "completed" &&
                    "text-red-500 border-red-500",
                  task.status === "completed" && "line-through"
                )}
                expandedClassName={cn(
                  "text-sm p-0 bg-background text-foreground font-medium shadow-none",
                  showRed &&
                    task.status !== "completed" &&
                    "text-red-500 border-red-500",
                  task.status === "completed" && "line-through"
                )}
                onClick={handleTitleClick}
                expandedExtra={(closeTooltip) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "bg-muted transition-opacity duration-200 h-fit w-fit p-1 pointer-events-auto rounded-sm",
                      isTooltipHovered ? "block" : "hidden"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTooltip();
                      if (selectedTask?._id === task._id) {
                        onSelectTask(undefined);
                        updateAppSettings("todo-list", {
                          detail: false,
                          meta: {
                            ...currentAppSettings.meta,
                            taskId: undefined,
                          },
                        });
                      } else {
                        onSelectTask(task._id);
                        updateAppSettings("todo-list", {
                          detail: true,
                          meta: {
                            ...currentAppSettings.meta,
                            taskId: task._id,
                          },
                        });
                      }
                    }}
                  >
                    <EllipsisVerticalIcon className="w-3.5 h-3.5" />
                  </Button>
                )}
              >
                {task.title}
              </EllipsisTooltip>
              <StatusBadge
                status={task.status}
                size="sm"
                inProgressTaskId={inProgressTask}
                taskId={task._id}
              />
            </div>
          )}
        </motion.div>

        <motion.div
          className={cn(
            "h-full inline-flex items-center justify-center transition-opacity",
            isTooltipHovered ? "opacity-100" : "opacity-0"
          )}
          onClick={handleDeleteClick}
        >
          <RemoveButton onDelete={handleDeleteClick} size="sm" />
        </motion.div>
      </motion.li>
    </div>
  );
};

// Memoized version of TaskItem to prevent unnecessary re-renders
export const TaskItem = React.memo(
  TaskItemComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.task._id === nextProps.task._id &&
      prevProps.task.title === nextProps.task.title &&
      prevProps.task.status === nextProps.task.status &&
      prevProps.task.starred === nextProps.task.starred &&
      prevProps.showRed === nextProps.showRed &&
      prevProps.isOverlay === nextProps.isOverlay
    );
  }
);

// Memoized EmptyTaskItem component
const EmptyTaskItemComponent: React.FC<{
  id: string;
  onInputBlur: () => void;
  onInputKeyPress: (e: React.KeyboardEvent) => void;
  onNewTaskTitleChange: (value: string) => void;
  setInputRef: (id: string) => (el: HTMLInputElement | null) => void;
  onLineClick: (id: string, lineIndex: number) => void;
  neededTemplateLines: number;
}> = ({
  onInputBlur,
  onInputKeyPress,
  onNewTaskTitleChange,
  setInputRef,
  id,
  onLineClick,
  neededTemplateLines,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const handleLineClick = useCallback(
    (lineIndex: number) => {
      onLineClick(id, lineIndex);
    },
    [id, onLineClick]
  );

  return (
    <div className="px-[21px] flex-1 flex flex-col">
      {/* First template line (editable) */}
      {isEditing ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center min-h-[30px] border-b border-solid border-t-0 border-r-0 border-l-0 border-muted-foreground/10"
        >
          <Input
            placeholder="Add a new goal..."
            className="h-fit border-none bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-muted-foreground/60 hover:text-muted-foreground/80 focus:text-foreground shadow-none"
            ref={setInputRef(id)}
            value={newTaskTitle}
            onChange={(e) => onNewTaskTitleChange(e.target.value)}
            onBlur={onInputBlur}
            onKeyDown={onInputKeyPress}
            autoFocus
          />
        </motion.div>
      ) : (
        <div
          className="flex items-center min-h-[30px] border-b border-solid border-t-0 border-r-0 border-l-0 border-muted-foreground/10 hover:border-muted-foreground/40 transition-all duration-200 cursor-text"
          onClick={() => handleLineClick(0)}
        />
      )}

      {/* Additional template lines */}
      {[...Array(neededTemplateLines - 1)].map((_, lineIndex) => (
        <div
          key={lineIndex + 1}
          className="flex items-center min-h-[30px] border-b border-solid border-t-0 border-r-0 border-l-0 border-muted-foreground/10 hover:border-muted-foreground/40 transition-all duration-200 cursor-text"
          onClick={() => handleLineClick(lineIndex + 1)}
        />
      ))}
    </div>
  );
};

export const EmptyTaskItem = React.memo(EmptyTaskItemComponent);

interface TaskViewProps {
  id: string;
  animationDelay: number;
  title: string;
  description: string;
  tasks: Task[];
  isToday: boolean;
  isPast: boolean;
  editingLineIndex: { id: string; lineIndex: number } | null;
  onLineClick: (id: string, lineIndex: number) => void;
  onInputBlur: (newTaskTitle: string) => void;
  onInputKeyPress: (e: React.KeyboardEvent, newTaskTitle: string) => void;
  onToggleStar: (key: string, taskId: string) => void;
  onEditTask: (key: string, taskId: string, newTitle: string) => void;
  handleDeleteListHandler: (id: string) => void;
  handleEditListHandler: (
    id: string,
    fieldsToUpdate: Record<string, any>
  ) => void;
  onDeleteTask: (key: string, taskId: string) => void;
  setInputRef: (id: string) => (el: HTMLInputElement | null) => void;
  list?: List;
  className?: string;
}

// Memoized TaskView component
const TaskViewComponent: React.FC<TaskViewProps> = ({
  id,
  animationDelay,
  title,
  description,
  tasks,
  isToday,
  isPast: isPastDate,
  editingLineIndex,
  onLineClick,
  onInputBlur,
  onInputKeyPress,
  onEditTask,
  onDeleteTask,
  setInputRef,
  list,
  className,
  handleDeleteListHandler,
  handleEditListHandler,
}) => {
  const isEditing = editingLineIndex?.id === id;

  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "container", container: id },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTaskTitleForList, setNewTaskTitleForList] = useState("");

  // Determine if there are unfinished tasks
  const hasUnfinishedTasks = useMemo(
    () => tasks.some((task) => task.status !== "completed"),
    [tasks]
  );

  // Create a consistent delay based on string hash or use a fallback
  const getAnimationDelay = useCallback(() => {
    return animationDelay * 0.1 || 0;
  }, [animationDelay]);

  // Calculate template lines to fill remaining space
  const templateLinesCount = useMemo(() => {
    if (!containerHeight || containerHeight < 100) return 0;
    const taskHeight = 30;
    const headerHeight = 50;
    const totalTasksH = tasks.length * taskHeight;
    const availableH = containerHeight - headerHeight - totalTasksH;
    const rawCount = Math.floor(availableH / taskHeight);
    return Math.max(0, rawCount);
  }, [tasks.length, containerHeight]);

  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const node = scrollRef.current;
    const handleResize = () => setContainerHeight(node.clientHeight);

    handleResize();

    const resizeObserver = new window.ResizeObserver(handleResize);
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, []);

  // Determine if we should show red (past date and unfinished tasks)
  const showRed = useMemo(
    () => isPastDate && hasUnfinishedTasks,
    [isPastDate, hasUnfinishedTasks]
  );

  const sortableItems = useMemo(() => (tasks ?? []).map((t) => t._id), [tasks]);

  const { openDialog } = useDialog();

  // Memoized handlers
  const handleLineClick = useCallback(
    (lineIndex: number) => {
      onLineClick(id, lineIndex);
    },
    [id, onLineClick]
  );

  const handleInputBlur = useCallback(
    (newTaskTitle: string) => {
      onInputBlur(newTaskTitle);
      setNewTaskTitleForList("");
    },
    [onInputBlur]
  );

  // Handle input key press
  const handleInputKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        onInputKeyPress(e, newTaskTitleForList);
        setNewTaskTitleForList("");
      }
    },
    [onInputKeyPress, newTaskTitleForList]
  );

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: getAnimationDelay() }}
      className={cn(
        "flex flex-col flex-1 min-h-0 rounded-xl border-none",
        isOver && "border-primary/50",
        showRed && "border-red-500",
        className
      )}
    >
      <div className="border-b border-border/30">
        <div className="mb-2 px-[21px]">
          <p
            className={cn(
              "text-[10px] font-semibold text-muted-foreground/80",
              isToday && "text-muted-foreground"
            )}
          >
            {description}
          </p>
          <div className="flex flex-row items-center justify-between">
            <h3
              className={cn(
                "font-semibold text-lg",
                isToday ? "text-foreground" : "text-muted-foreground/80",
                showRed && "text-red-500"
              )}
            >
              {title}
            </h3>
            {list && (
              <ZSidebarDropdown
                title="Action"
                showDialog={showDropdown}
                setShowDialog={setShowDropdown}
                items={[
                  {
                    itemChild: {
                      children: list.planned ? (
                        <div className="flex flex-row items-center w-full">
                          <ListChecks className="mr-2 h-3 w-3" />
                          Remove from planning
                        </div>
                      ) : (
                        <div className="flex flex-row items-center w-full">
                          <Calendar className="mr-2 h-3 w-3" />
                          Add to planning
                        </div>
                      ),
                      className: "text-muted-foreground hover:text-foreground",
                    },
                    onClick: () => {
                      handleEditListHandler(list._id, {
                        planned: !list.planned,
                      });
                    },
                  },
                  {
                    itemChild: {
                      children: (
                        <div className="flex flex-row items-center w-full">
                          <Pencil className="mr-2 h-3 w-3" />
                          Rename list
                        </div>
                      ),
                      className: "text-muted-foreground hover:text-foreground",
                    },
                    onClick: () => {
                      openDialog("rename-list", {
                        listId: list._id,
                      });
                    },
                  },
                  {
                    itemChild: {
                      children: (
                        <DeleteConfirmation
                          initialText="Delete list"
                          confirmText="Confirm delete"
                          onConfirm={() => {
                            if (list) {
                              handleDeleteListHandler(list._id);
                              setShowDropdown(false);
                            }
                          }}
                          onCancel={() => setShowDropdown(false)}
                          variant="dropdown"
                        />
                      ),
                      className: "p-0",
                    },
                  },
                ]}
                classNames={{
                  content: "w-48",
                  subContent: "w-48",
                }}
                align="end"
              />
            )}
          </div>
        </div>
      </div>

      {/* Tasks Container */}
      <div
        ref={scrollRef}
        className="flex-1 flex flex-col min-h-0 overflow-x-hidden overflow-y-auto customScrollbar2"
      >
        {/* Render tasks */}
        <SortableContext
          items={sortableItems}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskItem
              key={task._id}
              id={id}
              task={task}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              showRed={showRed}
            />
          ))}
        </SortableContext>

        {/* Template lines container */}
        <div className="flex-1 flex flex-col min-h-0 px-[26px]">
          {/* First template line (editable) */}
          {isEditing ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center h-[30px] border-b border-solid border-t-0 border-r-0 border-l-0 border-muted-foreground/10"
            >
              <Input
                placeholder="Add a new goal..."
                className="h-fit border-none bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-muted-foreground/60 hover:text-muted-foreground/80 focus:text-foreground shadow-none"
                ref={setInputRef(id)}
                value={newTaskTitleForList}
                onChange={(e) => setNewTaskTitleForList(e.target.value)}
                onBlur={() => handleInputBlur(newTaskTitleForList)}
                onKeyDown={handleInputKeyPress}
                autoFocus
              />
            </motion.div>
          ) : (
            <div
              className="flex items-center h-[30px] border-b border-solid border-t-0 border-r-0 border-l-0 border-muted-foreground/10 hover:border-muted-foreground/40 transition-all duration-200 cursor-text"
              onClick={() => handleLineClick(0)}
            />
          )}

          {/* Additional template lines */}
          {[...Array(templateLinesCount)].map((_, lineIndex) => (
            <div
              key={lineIndex}
              className="flex items-center h-[30px] border-b border-solid border-t-0 border-r-0 border-l-0 border-muted-foreground/10 hover:border-muted-foreground/40 transition-all duration-200 cursor-text"
              onClick={() => handleLineClick(lineIndex)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export const TaskView = React.memo(
  TaskViewComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.id === nextProps.id &&
      prevProps.title === nextProps.title &&
      prevProps.description === nextProps.description &&
      prevProps.tasks.length === nextProps.tasks.length &&
      prevProps.tasks.every(
        (task, index) =>
          task._id === nextProps.tasks[index]?._id &&
          task.title === nextProps.tasks[index]?.title &&
          task.status === nextProps.tasks[index]?.status
      ) &&
      prevProps.isToday === nextProps.isToday &&
      prevProps.isPast === nextProps.isPast &&
      prevProps.editingLineIndex?.id === nextProps.editingLineIndex?.id
    );
  }
);

export default TaskView;
