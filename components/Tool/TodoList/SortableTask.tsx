import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Tag,
  Share2,
  MoreVertical,
  Star,
  Calendar,
  Repeat,
  Edit,
  Trash2,
} from "lucide-react";
import { useTodoList } from "./provider/todolistProvider";
import { Task } from "./types";
import { FaXTwitter } from "react-icons/fa6";
import { CopilotTextarea } from "$/components/Tool/AITextArea";
import { HTMLCopanionTextAreaElement } from "../AITextArea/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MdModeEditOutline, MdOutlineModeEdit } from "react-icons/md";
import TaskButton from "./TaskButton";
import StatusBadge from "./StatusBadge";
import StepsBadge from "./StepsBadge";
import RecurrenceStatisticsBadge from "./RecurrenceStatisticsBadge";
import DueDateDropdown from "./DueDateDropdown";
import { cn } from "$/utils";
import { RecurrenceFilter } from "@/components/recurrence_filter";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectSeparator,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface Particle {
  id: number;
  color: string;
  scale: number;
  rotation: number;
}
// Add this helper function outside the component
const generateParticle = () => ({
  color: ["#4CAF50", "#FFC107", "#2196F3", "#E91E63"][
    Math.floor(Math.random() * 4)
  ],
  scale: Math.random() * 0.5 + 0.5,
  rotation: Math.random() * 360,
});

export const buttonSize = {
  sm: "h-4",
  md: "h-5",
  base: "h-6",
  lg: "h-7",
};

export const iconSize = {
  sm: 16,
  md: 20,
  base: 24,
  lg: 28,
};

// Editing mode view component
const EditingView = ({
  editedTitle,
  editedDescription,
  setEditedTitle,
  setEditedDescription,
  textareaRef,
  generating,
  setGenerating,
  handleTitleCancel,
}: {
  editedTitle: string;
  editedDescription: string;
  setEditedTitle: (value: string) => void;
  setEditedDescription: (value: string) => void;
  textareaRef: React.RefObject<HTMLCopanionTextAreaElement>;
  generating: boolean;
  setGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  handleTitleCancel: () => void;
}) => {
  return (
    <div className="flex-1 min-h-[40px] flex flex-col gap-1">
      {/* @ts-ignore suggestionsStyle warning */}
      <CopilotTextarea
        ref={textareaRef}
        className="flex-1 bg-transparent border-none outline-none text-foreground placeholder-muted-foreground w-full resize-none min-h-[20px] max-h-[120px] leading-[20px] font-medium customScrollbar2 overflow-y-auto text-xs cursor-text"
        placeholder="Task title"
        value={editedTitle}
        onValueChange={setEditedTitle}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleTitleCancel();
          }
        }}
        autosuggestionsConfig={{
          textareaPurpose: "To enhance the title of the todo task",
          disabledAutosuggestionsWhenTyping: true,
          chatApiConfigs: {
            suggestionsApiConfig: {
              maxTokens: 50,
              stop: ["\n", ".", "?"],
            },
            enhanceTextApiConfig: {
              makeSystemPrompt: (textareaPurpose, contextString) => {
                return `You are an expert task list creator.

The user is writing some text.
The purpose is: \"${textareaPurpose}\"

Your job is to optimize the length of the user's text:

If the text is under 50 characters:
- Expand it with relevant details and context
- Add descriptive elements while maintaining the core message
- Ensure the expanded text remains focused and meaningful
- No markdown formatting
- Do not use any markdown symbols or formatting like #, *, _, etc.

If the text is over 50 characters:
- Condense it to be more concise
- Remove redundant or unnecessary information
- Preserve the key message and important details
- Maintain clarity while being succinct
- Do not use any markdown symbols or formatting like #, *, _, etc.

Context for informed suggestions:
\`\`\`
${contextString}
\`\`\`
`;
              },
              fewShotMessages: [
                {
                  id: "1",
                  role: "user",
                  content: "Call mom",
                },
                {
                  id: "2",
                  role: "assistant",
                  content: "Call Mom – Check in and Share Updates.",
                },
                {
                  id: "3",
                  role: "user",
                  content: "Go to the gym",
                },
                {
                  id: "4",
                  role: "assistant",
                  content: "Go to the gym – Workout and Stay Fit.",
                },
              ],
              maxTokens: 50,
            },
          },
        }}
        suggestionsStyle={{
          fontStyle: "normal",
          color: "#9ba1ae",
        }}
        hoverMenuClassname="p-2 absolute z-10 top-[-10000px] left-[-10000px] mt-[-6px] opacity-0 transition-opacity duration-700"
        setgenerating={setGenerating}
        showSkeleton={false}
      />
      <input
        type="text"
        value={editedDescription}
        onChange={(e) => setEditedDescription(e.target.value)}
        placeholder="Description (optional)"
        className="bg-transparent border-none outline-none font-normal text-muted-foreground placeholder-muted-foreground w-full resize-none text-xs leading-tight"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleTitleCancel();
          }
        }}
      />
    </div>
  );
};

// Non-editing mode view component - Title only
const TaskTitleView = ({
  task,
  classNames,
}: {
  task: Task;
  classNames?: {
    titleText?: string;
  };
}) => {
  return (
    <span
      className={cn(
        `transition-colors font-normal text-sm flex-1 line-clamp-2`,
        classNames?.titleText,
        task.status === "completed"
          ? "text-muted-foreground line-through"
          : "text-foreground"
      )}
    >
      {task.title}
    </span>
  );
};

// Description view component
const TaskDescriptionView = ({ task }: { task: Task }) => {
  if (!task.description || !task.description.trim()) return null;

  return (
    <div className="text-xs text-muted-foreground line-clamp-3 overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        components={{
          p: ({ node, ...props }) => (
            <p
              {...props}
              className="inline my-0 text-xs text-muted-foreground leading-relaxed"
            />
          ),
          strong: ({ node, ...props }) => (
            <strong
              {...props}
              className="font-semibold text-xs text-muted-foreground"
            />
          ),
          em: ({ node, ...props }) => (
            <em {...props} className="italic text-xs text-muted-foreground" />
          ),
          code: ({ node, ...props }) => (
            <code
              {...props}
              className="text-[10px] bg-secondary/50 px-1 py-0.5 rounded font-mono"
            />
          ),
          ul: ({ node, ...props }) => (
            <ul
              {...props}
              className="list-disc list-inside pl-2 my-0 space-y-0.5 text-xs leading-relaxed"
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              {...props}
              className="list-decimal list-inside pl-2 my-0 space-y-0.5 text-xs leading-relaxed"
            />
          ),
          li: ({ node, ...props }) => (
            <li {...props} className="text-xs text-muted-foreground" />
          ),
          h1: ({ node, ...props }) => (
            <h1
              {...props}
              className="text-xs font-semibold text-muted-foreground my-0"
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              {...props}
              className="text-xs font-semibold text-muted-foreground my-0"
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              {...props}
              className="text-xs font-semibold text-muted-foreground my-0"
            />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              {...props}
              className="border-l-2 border-primary/20 pl-2 my-0 italic text-xs text-muted-foreground"
            />
          ),
          a: ({ node, ...props }) => (
            <a {...props} className="text-primary hover:underline text-xs" />
          ),
        }}
      >
        {task.description}
      </ReactMarkdown>
    </div>
  );
};

// Badges view component
const TaskBadgesView = ({
  task,
  formattedDueDate,
  size,
  inProgressTask,
}: {
  task: Task;
  formattedDueDate: {
    text: string;
    color: string;
    tooltip: string;
  } | null;
  size: "sm" | "md" | "base" | "lg";
  inProgressTask: string | undefined;
}) => {
  const hasBadges =
    formattedDueDate ||
    (task.recurrence && task.recurrence.frequency !== "one_time") ||
    task.steps.uncompleted + task.steps.completed > 0 ||
    task.status !== "pending";

  if (!hasBadges) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <StatusBadge
        status={task.status}
        size={size === "sm" ? "sm" : size === "lg" ? "md" : "sm"}
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
  );
};

// Action buttons for non-editing mode
export const TaskActionButtons = ({
  task,
  size,
  buttonSize,
  iconSize,
  selectedTaskId,
  setOnEditMode,
  dropdownOpen,
  setDropdownOpen,
  onToggleStar,
  handleConvertToTweet,
  onEditTask,
  onDeleteTask,
  setIsJustDeleted,
  classNames,
}: {
  task: Task;
  size: "sm" | "md" | "base" | "lg";
  buttonSize: Record<"sm" | "md" | "base" | "lg", string>;
  iconSize: Record<"sm" | "md" | "base" | "lg", number>;
  selectedTaskId: string | undefined;
  setOnEditMode: (id: string) => void;
  dropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  onToggleStar: (id: string) => void;
  handleConvertToTweet: () => void;
  onEditTask: (id: string, updates: any) => void;
  onDeleteTask: (id: string) => void;
  setIsJustDeleted: (value: boolean) => void;
  classNames?: {
    functionButton?: string;
  };
}) => {
  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="icon"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
            className={cn(
              `w-fit h-fit p-0 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200`,
              buttonSize[size],
              selectedTaskId === task._id
                ? "text-foreground/80"
                : "text-muted-foreground"
            )}
          >
            <MoreVertical size={iconSize[size]} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setOnEditMode(task._id);
              setDropdownOpen(false);
            }}
          >
            <Edit className="mr-2 h-3 w-3" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onToggleStar(task._id);
              setDropdownOpen(false);
            }}
          >
            <Star
              className={cn(
                "mr-2 h-3 w-3",
                task.starred &&
                "fill-orange-500 text-orange-500 dark:fill-yellow-400 dark:text-yellow-400"
              )}
            />
            Mark important
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              handleConvertToTweet();
              setDropdownOpen(false);
            }}
          >
            <FaXTwitter className="mr-2 h-3 w-3" />
            Build in Public Tweet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DueDateDropdown
            _id={task._id}
            dueDate={task.dueDate}
            completed={task.status === "completed"}
            finishedAt={task.finishedAt}
            buttonClassName={
              classNames?.functionButton + " border-none px-3 py-2"
            }
            subMenu={true}
          />
          <RecurrenceFilter
            value={task.recurrence}
            onChange={(rule) => {
              onEditTask(task._id, { recurrence: rule });
            }}
            buttonClassName={
              classNames?.functionButton + " border-none px-3 py-2"
            }
            subMenu={true}
          />
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                }}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete task
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-background border border-primary/10 text-foreground border-solid">
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  task.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs h-fit">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setIsJustDeleted(true);
                    onDeleteTask(task._id);
                    setDropdownOpen(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-fit text-xs"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

// Edit mode controls component
const EditModeControls = ({
  task,
  lists,
  onEditTask,
  handleTitleSave,
  handleTitleCancel,
  classNames,
  inProgressTask,
}: {
  task: Task;
  lists: any[];
  onEditTask: (id: string, updates: any) => void;
  handleTitleSave: () => void;
  handleTitleCancel: () => void;
  classNames?: {
    functionContainer?: string;
    functionButton?: string;
  };
  inProgressTask: string | undefined;
}) => {
  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0 py-1.5 pr-3">
      <div className={cn("gap-1 relative", classNames?.functionContainer)}>
        <div className="flex items-center gap-2 w-full justify-start flex-wrap">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="min-w-[120px] max-w-[200px]">
                  <Select
                    value={task.listId ?? "default"}
                    onValueChange={(value) => {
                      onEditTask(task._id, {
                        listId: value === "default" ? null : value,
                      });
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        "w-full justify-start overflow-hidden text-muted-foreground active:scale-95 transition-colors group relative hover:text-foreground shadow-none text-xs font-medium",
                        classNames?.functionButton
                      )}
                    >
                      <Tag className="mr-2 h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      <span className="text-left truncate block w-full line-clamp-1">
                        {lists.find((list) => list._id === task.listId)?.name ||
                          "Tasks"}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="w-56 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
                      <SelectGroup>
                        <SelectItem
                          value="default"
                          className="text-xs font-medium py-2"
                        >
                          Select a list
                        </SelectItem>
                        <SelectSeparator />
                        {lists.map((listItem) => (
                          <SelectItem
                            key={listItem._id}
                            value={listItem._id}
                            className="text-xs font-medium py-2"
                          >
                            {listItem.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {lists.find((list) => list._id === task.listId)?.name
                    ? `Current list: ${lists.find((list) => list._id === task.listId)?.name
                    }`
                    : "Select a list for this task"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="min-w-[120px] max-w-[200px]">
            <DueDateDropdown
              _id={task._id}
              dueDate={task.dueDate}
              completed={task.status === "completed"}
              finishedAt={task.finishedAt}
              buttonClassName={classNames?.functionButton}
            />
          </div>
          <div className="min-w-[120px] max-w-[200px]">
            <RecurrenceFilter
              value={task.recurrence}
              onChange={(rule) => {
                onEditTask(task._id, { recurrence: rule });
              }}
              buttonClassName={classNames?.functionButton}
            />
          </div>
          {/* Recurrence Statistics Badge - Show only if task has active recurrence */}
          {task.recurrence &&
            task.recurrence.frequency !== "one_time" &&
            task.statistics && (
              <RecurrenceStatisticsBadge
                statistics={task.statistics}
                size="md"
              />
            )}
          {/* Steps Badge - Show only if task has steps */}
          {task.steps.uncompleted + task.steps.completed !== 0 && (
            <StepsBadge
              completed={task.steps.completed}
              total={task.steps.uncompleted + task.steps.completed}
              size="md"
            />
          )}
          {/* Status Badge - Show only if task has non-pending status */}
          {task.status !== "pending" && (
            <StatusBadge
              status={task.status}
              size="md"
              inProgressTaskId={inProgressTask}
              taskId={task._id}
            />
          )}
        </div>
      </div>

      <div className="flex w-full items-center gap-2 flex-shrink-0 justify-end">
        <Button
          variant="destructive"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            handleTitleCancel();
          }}
          className="h-7"
          type="button"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            handleTitleSave();
          }}
          className="h-7"
          type="button"
        >
          Save
        </Button>
      </div>
    </div>
  );
};

const SortableTask = ({
  task,
  hideGrip,
  classNames,
  size = "md",
}: {
  task: Task;
  hideGrip?: boolean;
  classNames?: {
    list?: string;
    textContainer?: string;
    functionContainer?: string;
    functionButton?: string;
    titleText?: string;
  };
  size?: "sm" | "md" | "base" | "lg";
}) => {
  const [isJustCompleted, setIsJustCompleted] = useState(false);
  const [isJustDeleted, setIsJustDeleted] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [editedDescription, setEditedDescription] = useState(
    task.description || ""
  );
  const [generating, setGenerating] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);
  const {
    handleStatusChange: onStatusChange,
    handleToggleStar: onToggleStar,
    handleDeleteTask: onDeleteTask,
    handleEditTask: onEditTask,
    handleSelectTask: onSelectTask,
    lists,
    selectedTask,
    onEditMode,
    setOnEditMode,
    inProgressTask,
  } = useTodoList();
  const isEditing = onEditMode === task._id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, disabled: isEditing });

  const handleConvertToTweet = () => {
    // Format task details into a comprehensive text for the enhance prompt
    let taskInfo = `Task: ${task.title}\n\n`;

    // Note: For SortableTask, we only have basic task info
    // Full details would require fetching TaskDetails
    // For now, we'll use the title and basic info

    if (task.dueDate) {
      taskInfo += `Due Date: ${new Date(
        task.dueDate
      ).toLocaleDateString()}\n\n`;
    }

    // Dispatch custom event to trigger enhancement with task information
    const event = new CustomEvent("enhanceXTextarea", {
      detail: {
        taskInfo: taskInfo.trim(),
      },
    });
    window.dispatchEvent(event);
  };

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
    }
  }, [isJustCompleted]);

  useEffect(() => {
    if (isEditing) {
      setEditedTitle(task.title);
      setEditedDescription(task.description || "");
      // Focus the textarea when entering edit mode
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [isEditing, task.title, task.description]);

  const handleTitleSave = () => {
    const updates: { title?: string; description?: string } = {};
    let hasChanges = false;

    if (editedTitle.trim() && editedTitle !== task.title) {
      updates.title = editedTitle.trim();
      hasChanges = true;
    } else if (!editedTitle.trim()) {
      setEditedTitle(task.title);
    }

    const trimmedDescription = editedDescription.trim();
    const currentDescription = task.description || "";
    if (trimmedDescription !== currentDescription) {
      updates.description = trimmedDescription || "";
      hasChanges = true;
    }

    if (hasChanges) {
      onEditTask(task._id, updates);
    }
    setOnEditMode("");
  };

  const handleTitleCancel = () => {
    setEditedTitle(task.title);
    setEditedDescription(task.description || "");
    setOnEditMode("");
  };

  // Format due date for badge
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center group w-full overflow-x-clip ${isDragging ? "z-50" : "z-auto"
        }`}
    >
      {/* Add particle effects container */}
      <AnimatePresence>
        {particles.map((i) => (
          <motion.div
            key={i.id}
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
            onStatusChange(task._id, "completed");
          }
          if (isJustDeleted) {
            setIsJustDeleted(false);
            onDeleteTask(task._id);
          }
        }}
        transition={{
          duration: 0.4,
          ease: "easeInOut",
          layout: { duration: 0.3 },
        }}
        className={cn(
          "relative hover:bg-secondary transition-colors rounded-md w-full overflow-clip",
          // Status-based background colors
          task._id === inProgressTask && "bg-accent/10",
          classNames?.list
        )}
      >
        {/* 1px bottom line */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-[1px]",
            isDragging
              ? "bg-primary/20"
              : task._id === inProgressTask
                ? "bg-accent/20"
                : "bg-primary/10"
          )}
        />
        <div
          className={cn(
            "flex items-start gap-2 px-3 py-2 group",
            isEditing && "bg-secondary/30 cursor-default"
          )}
          onClick={(e) => {
            e.stopPropagation();

            if (isEditing) {
              return;
            }

            if (selectedTask?._id === task._id) {
              onSelectTask(undefined);
            } else {
              onSelectTask(task._id);
            }
          }}
        >
          {/* Left: Grip + CompleteButton (minimal space) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {!hideGrip && !isEditing && (
              <span
                {...attributes}
                {...listeners}
                className="cursor-grab opacity-0 group-hover:opacity-100 p-1"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            {!isEditing && (
              <TaskButton
                task={task}
                onStatusChange={onStatusChange}
                setIsJustCompleted={setIsJustCompleted}
                size={
                  size === "sm"
                    ? "small"
                    : size === "md"
                      ? "medium"
                      : size === "base"
                        ? "medium"
                        : "large"
                }
              />
            )}
          </div>

          {/* Middle: Title, Description, Tags (aligned vertically) */}
          <div
            className={cn(
              "flex-1 flex flex-col gap-1 min-w-0 p-1",
              classNames?.textContainer
            )}
            style={{
              wordWrap: "break-word",
              wordBreak: "break-word",
            }}
          >
            {isEditing ? (
              <EditingView
                editedTitle={editedTitle}
                editedDescription={editedDescription}
                setEditedTitle={setEditedTitle}
                setEditedDescription={setEditedDescription}
                textareaRef={textareaRef}
                generating={generating}
                setGenerating={setGenerating}
                handleTitleCancel={handleTitleCancel}
              />
            ) : (
              <>
                <TaskTitleView task={task} classNames={classNames} />
                <TaskDescriptionView task={task} />
                <TaskBadgesView
                  task={task}
                  formattedDueDate={formattedDueDate}
                  size={size}
                  inProgressTask={inProgressTask}
                />
              </>
            )}
          </div>

          {/* Right: EditButton + MoreButton */}
          {!isEditing && (
            <div className="flex-shrink-0">
              <TaskActionButtons
                task={task}
                size={size}
                buttonSize={buttonSize}
                iconSize={iconSize}
                selectedTaskId={selectedTask?._id}
                setOnEditMode={setOnEditMode}
                dropdownOpen={dropdownOpen}
                setDropdownOpen={setDropdownOpen}
                onToggleStar={onToggleStar}
                handleConvertToTweet={handleConvertToTweet}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                setIsJustDeleted={setIsJustDeleted}
                classNames={classNames}
              />
            </div>
          )}
        </div>
        {onEditMode === task._id && (
          <EditModeControls
            task={task}
            lists={lists}
            onEditTask={onEditTask}
            handleTitleSave={handleTitleSave}
            handleTitleCancel={handleTitleCancel}
            classNames={classNames}
            inProgressTask={inProgressTask}
          />
        )}
      </motion.li>
    </div>
  );
};

export default SortableTask;
