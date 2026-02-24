import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  Flag,
  Inbox,
  Plus,
  Sparkles,
  CalendarIcon,
  CalendarArrowUp,
  CalendarDays,
  CalendarX,
  CalendarClock,
  Folder,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
} from "@/components/ui/select";
import { CopilotTextarea } from "$/components/Tool/AITextArea";
import { cn } from "$/utils";
import { useAddTaskForm } from "./hooks/useAddTaskForm";
import { useLiveTranscription, VoiceController } from "$/components/Tool/VoiceToText";
import { useToast } from "@/components/ui/use-toast";
import { AnimatePresence } from "framer-motion";

interface AddTaskFormProps {
  lists: { _id: string; name: string }[];
  onSubmit: (params: {
    title: string;
    description?: string;
    date?: Date;
    starred: boolean;
    myDay: boolean;
    listId?: string;
  }) => Promise<any>;
  activeListId?: string;
  onTaskCreated?: (task: any) => void;
  onWorkflowStart?: (taskTitle: string) => void;
  workflow?: boolean;
  variant?: "dialog" | "inline";
  zIndex?: number;
  classNames?: {
    form?: string;
    textarea?: string;
    select?: string;
    button?: string;
    functionContainer?: string;
  };
  onCancel?: () => void;
  showCancelButton?: boolean;
  showMyDay?: boolean;
  placeholder?: string;
}

// Icon mapping for formatted due date
const iconMap = {
  CalendarIcon,
  Calendar,
  CalendarArrowUp,
  CalendarDays,
  CalendarX,
  CalendarClock,
} as const;

const dueDateIconMap = {
  CalendarIcon: CalendarIcon,
  Calendar: Calendar,
  CalendarArrowUp: CalendarArrowUp,
  CalendarDays: CalendarDays,
  CalendarX: CalendarX,
  CalendarClock: CalendarClock,
};

export const AddTaskForm = ({
  lists,
  onSubmit,
  activeListId,
  onTaskCreated,
  onWorkflowStart,
  workflow = false,
  variant = "inline",
  zIndex = 100,
  classNames,
  onCancel,
  showCancelButton = false,
  showMyDay = false,
  placeholder,
}: AddTaskFormProps) => {
  const form = useAddTaskForm({
    activeListId,
    initialPlaceholder: placeholder,
  });

  const {
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
    isManuallySetDate,
    setIsManuallySetDate,
    setDetectedTimeText,
    textareaRef,
    currentPlaceholder,
    setCurrentPlaceholder,
    formattedDueDate,
    dueDateItems,
    resetForm,
    getTaskParams,
  } = form;

  // Voice transcription state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const { toast } = useToast();

  // Live transcription hook
  const {
    transcript,
    isListening,
    error: transcriptionError,
    audioData,
    startListening,
    stopListening,
    clearTranscript,
  } = useLiveTranscription();

  // Set placeholder when component mounts or placeholder changes
  useEffect(() => {
    if (placeholder) {
      setCurrentPlaceholder(placeholder);
    }
  }, [placeholder, setCurrentPlaceholder]);

  // Sync transcript to input value when in voice mode
  useEffect(() => {
    if (isVoiceMode && transcript) {
      setNewTaskTitle(transcript);
    }
  }, [transcript, isVoiceMode, setNewTaskTitle]);

  // Show transcription errors
  useEffect(() => {
    if (transcriptionError) {
      toast({
        title: "Transcription Error",
        description: transcriptionError,
        variant: "destructive",
      });
    }
  }, [transcriptionError, toast]);

  // Cleanup: Stop listening when voice mode is disabled
  useEffect(() => {
    if (!isVoiceMode && isListening) {
      stopListening();
      clearTranscript();
    }
  }, [isVoiceMode, isListening, stopListening, clearTranscript]);

  const handleVoiceModeStart = useCallback(() => {
    setIsVoiceMode(true);
    startListening();
  }, [startListening]);

  const handleVoiceModeStop = useCallback(() => {
    stopListening();
    setIsVoiceMode(false);
    clearTranscript();
  }, [stopListening, clearTranscript]);

  const handleVoiceModeSend = useCallback(async () => {
    const transcriptToSend = transcript || newTaskTitle;

    if (!transcriptToSend.trim()) {
      toast({
        title: "No transcript",
        description: "Please speak something before creating the task",
        variant: "destructive",
      });
      return;
    }

    // Stop listening if still active
    if (isListening) {
      stopListening();
    }

    // Set the transcript as the input value first to trigger time detection
    setNewTaskTitle(transcriptToSend);

    // Wait a bit for time detection to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Submit the task
    setLoading(true);
    try {
      if (workflow) {
        onWorkflowStart?.(transcriptToSend);
      }

      // Get task params (will use the updated title and detected time)
      const params = getTaskParams();
      const result = await onSubmit(params);

      if (result && onTaskCreated) {
        onTaskCreated(result);
      }

      // Clear transcript and reset voice mode
      clearTranscript();
      setIsVoiceMode(false);
      resetForm();
    } catch (error) {
      console.error("Error creating task from voice:", error);
      toast({
        title: "Failed to create task",
        description: "Could not create the task. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    transcript,
    newTaskTitle,
    isListening,
    stopListening,
    setNewTaskTitle,
    workflow,
    onWorkflowStart,
    getTaskParams,
    onSubmit,
    onTaskCreated,
    clearTranscript,
    resetForm,
    toast,
    setLoading,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!newTaskTitle.trim()) {
      setLoading(false);
      return;
    }

    try {
      if (workflow) {
        // Notify parent that workflow is starting
        onWorkflowStart?.(newTaskTitle);
      }

      const params = getTaskParams();
      const result = await onSubmit(params);

      if (result && onTaskCreated) {
        onTaskCreated(result);
      }

      resetForm();
    } catch (error) {
      console.error("Error submitting task:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onCancel?.();
  };

  const DueDateIcon = dueDateIconMap[formattedDueDate.icon] || CalendarIcon;

  const isDialog = variant === "dialog";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        isDialog
          ? "flex flex-col gap-0"
          : "flex flex-col items-center gap-2 border border-solid border-primary/10 rounded-lg shadow-lg",
        classNames?.form
      )}
    >
      {/* Task Title Input with CopilotTextarea */}
      <div
        className={cn(
          isDialog
            ? "px-4 pt-4 pb-1"
            : "flex gap-2 w-full items-start p-3",
          classNames?.textarea
        )}
      >
        <div className={cn("flex-1 flex flex-col gap-2", !isDialog && "w-full")}>
          <div className="min-h-[20px]">
            {/* @ts-ignore suggestionsStyle warning */}
            <CopilotTextarea
              ref={textareaRef}
              className={cn(
                "bg-transparent border-none outline-none text-foreground w-full resize-none min-h-[20px] max-h-[120px] leading-[20px] customScrollbar2 overflow-y-auto",
                isDialog
                  ? "font-semibold text-base"
                  : "font-medium text-sm placeholder-muted-foreground"
              )}
              placeholder={currentPlaceholder}
              value={newTaskTitle}
              onValueChange={setNewTaskTitle}
              style={{ minHeight: "20px" }}
              onClick={(e) => {
                e.stopPropagation();
                setTimeout(() => {
                  textareaRef.current?.focus();
                }, 0);
              }}
              onFocus={() => {
                setTimeout(() => {
                  textareaRef.current?.focus();
                }, 0);
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
                    makeSystemPrompt: (
                      textareaPurpose: string,
                      contextString: string
                    ) => {
                      return `You are an expert task list creator.

The user is writing some text.
The purpose is: "${textareaPurpose}"

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
          </div>
          {/* Description Input */}
          <input
            type="text"
            value={newTaskDescription}
            onChange={(e) => setNewTaskDescription(e.target.value)}
            placeholder="Description (optional)"
            className="bg-transparent border-none outline-none font-normal text-muted-foreground placeholder-muted-foreground w-full resize-none text-xs leading-tight"
            disabled={loading}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className={cn(
          isDialog
            ? "px-4 pb-3 flex items-center gap-2 flex-wrap"
            : "w-full px-4 pb-3 flex items-center gap-2 flex-wrap justify-start",
          classNames?.functionContainer
        )}
      >
        {/* Date Button */}
        <TooltipProvider>
          <Tooltip disableHoverableContent open={!isDatePickerOpen ? undefined : false}>
            <DropdownMenu
              open={isDatePickerOpen}
              onOpenChange={setIsDatePickerOpen}
            >
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size={isDialog ? "xs" : "xs"}
                    className={cn(
                      "gap-2 rounded-sm transition-colors group relative",
                      isDialog ? "h-6" : "h-6",
                      formattedDueDate.color
                    )}
                  >
                    <DueDateIcon
                      className={cn(
                        "transition-transform duration-200 group-hover:scale-110",
                        isDialog ? "w-3.5 h-3.5" : "w-3.5 h-3.5"
                      )}
                    />
                    <span className="truncate">{formattedDueDate.text}</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent style={{ zIndex }}>
                <p className="text-xs">{formattedDueDate.tooltip}</p>
              </TooltipContent>
              <DropdownMenuContent
                className="w-56 z-[10000] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                style={{ zIndex: zIndex + 1 }}
              >
                <DropdownMenuLabel>Due date</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {dueDateItems.map((dueDate) => {
                  const Icon = iconMap[dueDate.icon] || CalendarIcon;
                  return (
                    <DropdownMenuItem
                      key={dueDate.name}
                      onClick={() => dueDate.onClick()}
                      className="text-muted-foreground text-xs font-medium"
                    >
                      <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                      {dueDate.name}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSub
                  open={isCustomDatePickerOpen}
                  onOpenChange={setIsCustomDatePickerOpen}
                >
                  <DropdownMenuSubTrigger
                    className="text-muted-foreground text-xs font-medium"
                    onPointerMove={(e) => e.stopPropagation()}
                  >
                    <CalendarClock className="mr-2 h-4 w-4 flex-shrink-0" />
                    Custom date
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent
                      className="text-muted-foreground text-xs font-medium bg-card shadow-xl border"
                      style={{ zIndex: zIndex + 60 }}
                      onFocusOutside={(e) => e.preventDefault()}
                    >
                      <DropdownMenuLabel>Pick a date</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <CalendarUI
                        mode="single"
                        selected={customDate || newTaskDueDate}
                        onSelect={(date) => setCustomDate(date)}
                        initialFocus
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          className="w-full"
                          size="sm"
                          type="button"
                          disabled={!customDate}
                          onClick={() => {
                            if (!customDate) return;
                            const endOfDay = new Date(customDate);
                            endOfDay.setHours(23, 59, 59, 999);
                            setNewTaskDueDate(endOfDay);
                            setCustomDate(undefined);
                            setIsDatePickerOpen(false);
                            setIsCustomDatePickerOpen(false);
                            setIsManuallySetDate(true);
                            setDetectedTimeText("");
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          className="w-full"
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCustomDate(undefined);
                            setIsCustomDatePickerOpen(false);
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
          </Tooltip>
        </TooltipProvider>

        {/* Priority Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={isDialog ? "xs" : "xs"}
                className={cn(
                  "font-medium gap-2 hover:bg-primary/10 rounded-sm",
                  isDialog ? "h-6" : "h-6",
                  newTaskStarred && "bg-primary/10"
                )}
                onClick={() => setNewTaskStarred(!newTaskStarred)}
                type="button"
              >
                <Flag
                  className={cn(
                    isDialog ? "w-3.5 h-3.5" : "w-3.5 h-3.5",
                    newTaskStarred && "fill-orange-400 text-orange-400"
                  )}
                />
                Priority
              </Button>
            </TooltipTrigger>
            <TooltipContent style={{ zIndex }}>
              <p className="text-xs">
                {newTaskStarred
                  ? "Remove priority from this task"
                  : "Mark this task as priority"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Enhance Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={isDialog ? "xs" : "xs"}
                className={cn(
                  "font-medium gap-2 hover:bg-primary/10 rounded-sm",
                  isDialog ? "h-6" : "h-6"
                )}
                onClick={() => textareaRef.current?.enhance({})}
                type="button"
                loading={generating}
                loadingText="Enhancing..."
                disabled={loading}
              >
                <Sparkles className={cn(isDialog ? "w-3.5 h-3.5" : "w-3.5 h-3.5")} />
                {isDialog ? "Enhance" : "Enhance"}
              </Button>
            </TooltipTrigger>
            <TooltipContent style={{ zIndex }}>
              <p className="text-xs">
                {generating
                  ? "AI is enhancing your task..."
                  : "Use AI to improve and refine your task title"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Footer - List Selection and Action Buttons */}
      <div
        className={cn(
          isDialog
            ? "px-4 pb-4 pt-2 flex items-center justify-between border-t border-border"
            : "w-full flex justify-between items-center py-2 px-3 border-t border-border"
        )}
      >
        {/* List Selection */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className={cn(
                "font-medium gap-2 hover:bg-primary/10 rounded-sm min-w-[100px] justify-start"
              )}
            >
              <Inbox className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">
                {newTaskListId === "inbox"
                  ? "Inbox"
                  : lists.find((l) => l._id === newTaskListId)?.name ||
                  "Inbox"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
            style={{ zIndex: zIndex + 1 }}
          >
            <DropdownMenuLabel>Select List</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setNewTaskListId("inbox")}
              className={cn(
                "text-xs font-medium",
                newTaskListId === "inbox" && "bg-primary/10"
              )}
            >
              <Inbox className="mr-2 h-4 w-4 flex-shrink-0" />
              Inbox
            </DropdownMenuItem>
            {lists.map((list) => (
              <DropdownMenuItem
                key={list._id}
                onClick={() => setNewTaskListId(list._id)}
                className={cn(
                  "text-xs font-medium",
                  newTaskListId === list._id && "bg-primary/10"
                )}
              >
                <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                {list.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>


        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {showCancelButton && (
            <Button
              variant="ghost"
              size={isDialog ? "sm" : "sm"}
              onClick={handleCancel}
              className={cn(isDialog ? "h-8 px-4 text-xs" : "h-8 px-3 text-xs")}
              type="button"
            >
              Cancel
            </Button>
          )}

          {/* Voice Controller - Show when in voice mode */}
          <AnimatePresence mode="wait">
            {isVoiceMode ? (
              <VoiceController
                key="voice-controller"
                isListening={isListening}
                transcript={transcript}
                currentValue={newTaskTitle}
                audioData={audioData}
                onStart={handleVoiceModeStart}
                onStop={handleVoiceModeStop}
                onSend={handleVoiceModeSend}
              />
            ) : (
              <React.Fragment key="default-buttons">
                {/* Mic Button - Show when input is empty */}
                {!newTaskTitle.trim() && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size={isDialog ? "sm" : "sm"}
                          onClick={handleVoiceModeStart}
                          type="button"
                          disabled={loading}
                          className={cn(
                            isDialog ? "h-8 px-4 text-xs" : "h-8 px-3 text-xs"
                          )}
                        >
                          <Mic className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent style={{ zIndex }}>
                        <p className="text-xs">Start voice input to create a task</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <Button
                  size={isDialog ? "sm" : "sm"}
                  type="submit"
                  disabled={!newTaskTitle.trim() || generating}
                  loading={loading}
                  loadingText={isDialog ? "Adding task..." : "Creating task..."}
                  className={cn(
                    isDialog
                      ? "h-8 px-4 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      : "w-fit px-3 py-1 text-xs h-8"
                  )}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add task
                </Button>
              </React.Fragment>
            )}
          </AnimatePresence>
        </div>
      </div>
    </form>
  );
};
