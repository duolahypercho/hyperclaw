"use client";

import {
  Plus,
  Sun,
  Tag,
  Trash2,
  ListChecks,
  Trash,
  EllipsisVertical,
  GripVertical,
  WandSparkles,
  Loader2,
  ListTodo,
  ArrowLeft,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IoMdStar, IoMdStarOutline } from "react-icons/io";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaCheck } from "react-icons/fa";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CopilotTextarea } from "../AITextArea";
import { HTMLCopanionTextAreaElement } from "../AITextArea/types";
import { cn } from "../../../utils";
import { useTodoList } from "./provider/todolistProvider";
import { Step, TaskDetails as TaskDetailsType } from "./types";
import { convertSlateToMarkdown } from "$/utils/Slate";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DueDateDropdown from "./DueDateDropdown";
import HyperchoTooltip from "../../UI/HyperchoTooltip";
import { useInteractApp } from "@OS/Provider/InteractAppProv";
import { Textarea } from "@/components/ui/textarea";
import { RecurrenceFilter } from "@/components/recurrence_filter";
import { Input } from "@/components/ui/input";

interface CompletedButtonProps {
  taskId: string;
  completed: boolean;
  onToggleComplete: (taskId: string) => void;
}

const CompletedButton = ({
  taskId,
  completed,
  onToggleComplete,
}: CompletedButtonProps) => {
  if (completed) {
    return (
      <button
        onClick={() => {
          onToggleComplete(taskId);
        }}
        className={`w-4 h-4 ml-1 rounded-full border border-solid bg-accent border-accent
        flex items-center justify-center transition-colors active:scale-95`}
      >
        <FaCheck size={8} className="text-accent-foreground" />
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        onToggleComplete(taskId);
      }}
      className={`w-4 h-4 ml-1 rounded-full border-2 border-solid border-accent flex items-center justify-center transition-colors active:scale-95`}
    ></button>
  );
};

const StepItem = ({
  taskId,
  step,
  onToggleComplete,
  handleDeleteStep,
  handlePromoteToTask,
  handleEditStep,
}: {
  taskId: string;
  step: Step;
  onToggleComplete: (taskId: string, stepId: string) => void;
  handleDeleteStep: (taskId: string, stepId: string) => void;
  handlePromoteToTask: (taskId: string, stepId: string) => void;
  handleEditStep: (
    taskId: string,
    stepId: string,
    type: string,
    value: string
  ) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: step._id });
  const { _id, title, status } = step;
  const completed = status === "completed";
  const [editedTitle, setEditedTitle] = useState(title);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Auto-size textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to get accurate scrollHeight
    textarea.style.height = "auto";
    // Set height based on content, but respect max
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 120;
    const newHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [editedTitle]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="transition-colors rounded-md shadow-sm list-none bg-secondary/30 hover:bg-secondary/50 border border-solid border-primary/10"
    >
      <div className="flex items-center gap-1 pl-2 p-1 group">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab opacity-0 group-hover:opacity-100 p-1"
        >
          <GripVertical className="h-3 w-3 text-primary/70" />
        </span>
        <CompletedButton
          taskId={taskId}
          completed={completed}
          onToggleComplete={(taskId) => {
            onToggleComplete(taskId, _id);
          }}
        />
        <div className="flex-1 flex items-start">
          <Textarea
            ref={textareaRef}
            className={cn(
              "w-full bg-transparent border-none outline-none text-foreground placeholder-muted-foreground text-xs resize-none min-h-[20px] max-h-[120px] leading-[20px] rounded px-2 py-1 focus:outline-none focus:ring-0 focus:border-none focus:shadow-none focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none font-medium overflow-y-auto customScrollbar2",
              completed && "line-through text-primary/70"
            )}
            rows={1}
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={() => {
              if (editedTitle.trim() !== title || editedTitle.trim() !== "") {
                handleEditStep(taskId, _id, "title", editedTitle);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (editedTitle.trim() === "") {
                  return;
                }
                handleEditStep(taskId, _id, "title", editedTitle);
              }
              if (e.key === "Escape") {
                setEditedTitle(title);
              }
            }}
          />
        </div>
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="icon" className="w-full justify-start p-0">
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {!completed && (
                <DropdownMenuItem
                  onClick={() => {
                    onToggleComplete(taskId, _id);
                  }}
                >
                  <button
                    className={`w-4 h-4 mr-2 rounded-full border border-solid bg-transparent border-accent
          flex items-center justify-center transition-colors active:scale-95`}
                  >
                    <FaCheck size={6} className="text-accent-foreground" />
                  </button>
                  Mark as complete
                </DropdownMenuItem>
              )}
              {completed && (
                <DropdownMenuItem
                  onClick={() => {
                    onToggleComplete(taskId, _id);
                  }}
                >
                  <button
                    className={`w-4 h-4 mr-2 rounded-full border-2 border-solid border-accent flex items-center justify-center transition-colors active:scale-95`}
                  ></button>
                  Mark as incomplete
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  handlePromoteToTask(taskId, _id);
                }}
              >
                <ListTodo className="mr-2 h-4 w-4" />
                Promote to task
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  handleDeleteStep(taskId, _id);
                }}
                className="text-destructive-foreground bg-destructive hover:bg-destructive/80 hover:text-destructive-foreground focus:bg-destructive/80 focus:text-destructive-foreground"
              >
                <Trash className="mr-2 h-4 w-4 text-destructive-foreground" />
                Delete Step
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
};

const NextStepContainer = ({
  selectedSteps,
  suggestStepLoading,
  selectedId,
  onAddNextStep,
  handleToggleStepComplete,
  handlePromoteToTask,
  handleDeleteStep,
  handleEditStep,
  handleDragEndSteps,
}: {
  selectedSteps: Step[];
  suggestStepLoading: boolean;
  selectedId: string;
  onAddNextStep: (taskId: string, nextStep: string) => void;
  handlePromoteToTask: (taskId: string, stepId: string) => void;
  handleToggleStepComplete: (taskId: string, stepId: string) => void;
  handleDeleteStep: (taskId: string, stepId: string) => void;
  handleEditStep: (
    taskId: string,
    stepId: string,
    type: string,
    value: string
  ) => void;
  handleDragEndSteps: (event: DragEndEvent) => void;
}) => {
  const [showNextStepInput, setShowNextStepInput] = useState(false);
  const [nextStepText, setNextStepText] = useState("");
  // Sort steps to show completed ones at the bottom
  const sortedSteps = useMemo(() => {
    if (!Array.isArray(selectedSteps)) return [];
    return [...selectedSteps].sort((a, b) => {
      const aCompleted = a.status === "completed";
      const bCompleted = b.status === "completed";
      if (aCompleted === bCompleted) return 0;
      return aCompleted ? 1 : -1;
    });
  }, [selectedSteps]);

  return (
    <div className="flex flex-col gap-1">
      {sortedSteps.length !== 0 && (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleDragEndSteps}
        >
          <SortableContext items={sortedSteps.map((step) => step._id)}>
            <div className="space-y-1">
              {sortedSteps.map((step, index) => (
                <StepItem
                  key={step.title + step.status + index}
                  taskId={selectedId}
                  step={step}
                  onToggleComplete={(taskId, stepId) => {
                    handleToggleStepComplete(taskId, stepId);
                  }}
                  handleDeleteStep={(taskId, stepId) => {
                    handleDeleteStep(taskId, stepId);
                  }}
                  handleEditStep={(taskId, stepId, type, value) => {
                    handleEditStep(taskId, stepId, type, value);
                  }}
                  handlePromoteToTask={(taskId, stepId) => {
                    handlePromoteToTask(taskId, stepId);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {suggestStepLoading && (
        <div className="w-full flex flex-col items-center gap-1 group">
          <div className="w-full h-10 bg-secondary rounded-lg animate-pulse" />
          <div className="w-full h-10 bg-secondary rounded-lg animate-pulse" />
          <div className="w-full h-10 bg-secondary rounded-lg animate-pulse" />
        </div>
      )}
      {!suggestStepLoading && showNextStepInput ? (
        <div className="transition-colors rounded-lg list-none">
          <div className="flex items-center gap-1 px-4 py-2">
            <Input
              className="border-0 border-b-1 w-full bg-transparent text-foreground ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none rounded-none"
              placeholder="Add your next step"
              value={nextStepText}
              onChange={(e) => setNextStepText(e.target.value)}
              autoFocus
              onBlur={() => {
                setShowNextStepInput(false);
                if (nextStepText.trim() === "") {
                  return;
                }
                // Here you can add logic to save the next step
                onAddNextStep(selectedId, nextStepText);
                setNextStepText("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (nextStepText.trim() === "") {
                    setShowNextStepInput(false);
                    return;
                  }
                  onAddNextStep(selectedId, nextStepText);
                  setNextStepText("");
                }
                if (e.key === "Escape") {
                  setShowNextStepInput(false);
                  setNextStepText("");
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div className="transition-colors rounded-lg list-none">
          {!suggestStepLoading && (
            <Button
              variant="ghost"
              className="w-full justify-start active:scale-100 cursor-text text-xs"
              onClick={() => setShowNextStepInput(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Next step
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const TaskDetails = ({
  task,
  classNames,
}: {
  task: TaskDetailsType;
  classNames?: {
    container?: string;
    textArea?: string;
    button?: string;
  };
}) => {
  const {
    lists: list,
    suggestStepLoading,
    taskLoading,
    handleEditTask: onEditTask,
    handleStatusChange: onStatusChange,
    handlePromoteToTask: onPromoteToTask,
    handleToggleMyDay: onToggleMyDay,
    handleToggleStar: onToggleStar,
    handleDeleteTask: onDeleteTask,
    handleOnCloseTaskDetails: onClose,
    handleUpdateTodoListDescription: onUpdateTodoListDescription,
    handleImageUpload: handleImageUpload,
    handleAddNextStep: onAddNextStep,
    handleToggleStepComplete: onToggleStepComplete,
    handleDeleteStep: handleDeleteStep,
    handleEditStep: onEditStep,
    handleSuggestStep: onSuggestStep,
    handleDragEndSteps: handleDragEndSteps,
  } = useTodoList();
  const { toggleDetail } = useInteractApp();

  const [editedTitle, setEditedTitle] = useState(task.title);
  const [completed, setCompleted] = useState(task.status === "completed");
  const [selectedSteps, setSelectedSteps] = useState(task.details.steps);
  const [generating, setGenerating] = useState(false);
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);

  useEffect(() => {
    if (!task) {
      return;
    }
    setEditedTitle(task.title);
    setCompleted(task.status === "completed");
    setSelectedSteps(task.details.steps);
  }, [task]);

  const handleConvertToTweet = () => {
    // Format task details into a comprehensive text for the enhance prompt
    let taskInfo = `Task: ${task.title}\n\n`;

    // Add description if available
    if (task.details.descendants && task.details.descendants.length > 0) {
      try {
        const description = convertSlateToMarkdown(task.details.descendants);
        if (description.trim()) {
          taskInfo += `Description: ${description}\n\n`;
        }
      } catch (error) {
        console.error("Error converting description:", error);
      }
    }

    // Add steps if available
    if (selectedSteps && selectedSteps.length > 0) {
      const completedSteps = selectedSteps.filter(
        (step) => step.status === "completed"
      );
      const uncompletedSteps = selectedSteps.filter(
        (step) => step.status !== "completed"
      );

      if (uncompletedSteps.length > 0) {
        taskInfo += `Steps to complete:\n`;
        uncompletedSteps.forEach((step, index) => {
          taskInfo += `${index + 1}. ${step.title}\n`;
        });
        taskInfo += `\n`;
      }

      if (completedSteps.length > 0) {
        taskInfo += `Completed steps:\n`;
        completedSteps.forEach((step, index) => {
          taskInfo += `${index + 1}. ${step.title}\n`;
        });
        taskInfo += `\n`;
      }
    }

    // Add due date if available
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

  const buttonItemType = [
    {
      name: suggestStepLoading ? "Generating step..." : "Suggest step",
      tooltip: "Suggest a step to complete the task",
      icon: (
        <div className="flex items-center">
          {suggestStepLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
          ) : (
            <WandSparkles className="mr-2 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
          )}
        </div>
      ),
      onClick: () => {
        if (suggestStepLoading) {
          return;
        }
        onSuggestStep(task._id);
      },
    },
    {
      name: `${task.myDay ? "Remove from" : "Add to"} Today`,
      tooltip: "Add the task to your Today list",
      icon: (
        <Sun
          className={`mr-2 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
            task.myDay &&
            "text-orange-500 fill-orange-500 dark:text-yellow-400 dark:fill-yellow-400"
          }`}
        />
      ),
      onClick: () => onToggleMyDay(task._id),
    },
    {
      name: "Convert to Tweet",
      tooltip: "Convert task to a tweet",
      icon: (
        <Share2 className="mr-2 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
      ),
      onClick: handleConvertToTweet,
    },
    /*     {
      name: "Repeat",
      icon: <Repeat className="mr-2 h-4 w-4" />,
      onClick: () => {},
    }, */
  ];

  if (taskLoading) {
    return null;
  }

  return (
    <div
      className={cn(
        "w-full h-full mx-auto shadow-sm flex flex-col p-4",
        classNames?.container
      )}
    >
      <div className="flex-none">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (toggleDetail) {
                toggleDetail({ show: false, toolId: "todo-list" });
              }
              onClose();
            }}
            className={cn(
              "flex items-center p-1 h-fit text-sm font-medium rounded-full transition-all active:scale-95",
              classNames?.button
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CompletedButton
            taskId={task._id}
            completed={completed}
            onToggleComplete={() =>
              completed
                ? onStatusChange(task._id, "pending")
                : onStatusChange(task._id, "completed")
            }
          />
          <div className="flex-1 flex items-center">
            <Input
              className="w-full bg-transparent border-none outline-none text-foreground placeholder-muted-foreground text-xs resize-none min-h-[20px] leading-[20px] rounded pr-3 pl-0 focus:outline-none focus:ring-0 focus:border-none focus:shadow-none focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none font-medium"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={() => {
                if (editedTitle.trim() !== task.title) {
                  onEditTask(task._id, { title: editedTitle });
                }
              }}
            />
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={() => onToggleStar(task._id)}
            className={`${
              task.starred &&
              "text-orange-500 fill-orange-500 dark:text-yellow-400 dark:fill-yellow-400"
            } hover:text-yellow-400`}
          >
            {task.starred ? (
              <IoMdStar size={20} />
            ) : (
              <IoMdStarOutline size={20} />
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto customScrollbar2 space-y-3">
        <div className="flex flex-col gap-0">
          <NextStepContainer
            selectedSteps={selectedSteps}
            suggestStepLoading={suggestStepLoading}
            selectedId={task._id}
            onAddNextStep={onAddNextStep}
            handleToggleStepComplete={onToggleStepComplete}
            handleDeleteStep={handleDeleteStep}
            handleEditStep={onEditStep}
            handlePromoteToTask={onPromoteToTask}
            handleDragEndSteps={handleDragEndSteps}
          />
          {buttonItemType.map((item) => (
            <HyperchoTooltip key={item.name} value={item.tooltip}>
              <Button
                key={item.name}
                variant="ghost"
                className="w-full justify-start transition-colors group text-xs"
                onClick={item.onClick}
              >
                {item.icon}
                {item.name}
              </Button>
            </HyperchoTooltip>
          ))}
          {/*           <Button variant="ghost" className="w-full justify-start">
            <Bell className="mr-2 h-4 w-4" />
            Remind me
          </Button>
          */}
          <RecurrenceFilter
            value={task.recurrence}
            onChange={(rule) => {
              onEditTask(task._id, { recurrence: rule });
            }}
            buttonClassName="border-none"
            iconClassName="h-4 w-4"
          />
          <DueDateDropdown
            _id={task._id}
            dueDate={task.dueDate}
            completed={task.status === "completed"}
            finishedAt={task.finishedAt}
            buttonClassName="border-none"
            iconClassName="h-4 w-4"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div>
                <HyperchoTooltip value="Change the category of the task">
                  <Button
                    variant="ghost"
                    className="w-full justify-start transition-colors active:scale-95 group text-xs"
                  >
                    <Tag className="mr-2 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    {list.find((list) => list._id === task.listId)?.name ||
                      "Click me to change list"}
                  </Button>
                </HyperchoTooltip>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {list.map((listItem) => (
                <DropdownMenuItem
                  key={listItem._id}
                  onClick={() => onEditTask(task._id, { listId: listItem._id })}
                >
                  <ListChecks className="mr-2 h-4 w-4" />
                  {listItem.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          className={cn(
            "flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground text-sm resize-none min-h-[20px] leading-[20px] p-1 transition-colors border-1 border-solid border-primary/10 overflow-hidden rounded-md",
            classNames?.textArea
          )}
        >
          <CopilotTextarea
            ref={textareaRef}
            className={cn(
              "w-full h-full bg-transparent border outline-none text-foreground placeholder-muted-foreground resize-none min-h-[20px] leading-[20px] rounded-none p-3 transition-colors overflow-y-auto border-none overflow-x-hidden text-xs",
              classNames?.textArea
            )}
            placeholder="Add a description"
            autosuggestionsConfig={{
              textareaPurpose: "The brief description of the current todo task",
              disabledAutosuggestionsWhenTyping: true,
              chatApiConfigs: {
                suggestionsApiConfig: {
                  maxTokens: 50,
                  stop: ["\n", ".", "?"],
                },
                enhanceTextApiConfig: {},
              },
            }}
            suggestionsStyle={{
              fontStyle: "normal",
              color: "#9ba1ae",
            }}
            hoverMenuClassname="p-2 absolute z-10 top-[-10000px] left-[-10000px] mt-[-6px] opacity-0 transition-opacity duration-700"
            setgenerating={setGenerating}
            showToolbar={true}
            onDescendantChange={(descendants) => {
              onUpdateTodoListDescription(descendants);
            }}
            initialDescendant={
              task.details.descendants.length === 0
                ? undefined
                : task.details.descendants
            }
            handleImageUpload={handleImageUpload}
          />
          <div className="w-full flex justify-end items-center">
            <Button
              type="button"
              className={cn("w-fit px-4 py-1 text-xs relative h-fit")}
              onClick={() =>
                textareaRef.current?.enhance({
                  enhanceText: "Enhance the task description",
                  systemPrompt:
                    "You are an expert task list creator to help the user create a detailed and informative task description",
                  history: [
                    {
                      id: "1",
                      role: "user",
                      content: "Buy groceries",
                    },
                    {
                      id: "2",
                      role: "assistant",
                      content:
                        "Buy weekly groceries - Get fresh produce, pantry staples, and household items from Trader Joe's",
                    },
                    {
                      id: "3",
                      role: "user",
                      content: "Schedule dentist",
                    },
                    {
                      id: "4",
                      role: "assistant",
                      content:
                        "Schedule bi-annual dental checkup and cleaning - Call Dr. Smith's office during business hours",
                    },
                  ],
                })
              }
              loading={generating}
              loadingText="Enhancing..."
            >
              Enhance
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <span className="mx-2">•</span>
          <span>
            Updated on {new Date(task.updatedAt).toLocaleDateString()}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDeleteTask(task._id)}
          className="text-red-300 hover:text-red-400 transition-colors active:scale-95"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default TaskDetails;
