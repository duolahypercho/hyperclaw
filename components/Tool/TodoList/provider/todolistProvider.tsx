import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { cronAdd, fetchCronsFromBridge } from "$/components/Tool/Crons/utils";
import { addRunningJobId } from "$/lib/crons-running-store";
import { addPendingTaskCronRun } from "$/lib/task-cron-run-store";
import { useCronTaskStatusPoll } from "../hooks/useCronTaskStatusPoll";

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

const isValidObjectId = (id: string): boolean => OBJECT_ID_RE.test(id);

// Generates a valid 24-char hex string compatible with MongoDB ObjectId format.
// This is critical because activeTaskId in the backend is Schema.Types.ObjectId —
// non-hex strings would cause a Mongoose CastError.
const generateId = (): string => {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  let random = "";
  for (let i = 0; i < 16; i++) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return timestamp + random;
};

/**
 * Ensures an ID is a valid 24-char hex ObjectId. UUIDs and other formats
 * are deterministically converted by stripping non-hex chars and truncating.
 */
const sanitizeId = (id: string): string => {
  if (isValidObjectId(id)) return id;
  const hex = id.replace(/[^0-9a-f]/gi, "");
  if (hex.length >= 24) return hex.slice(0, 24);
  return hex.padEnd(24, "0");
};

import { DragEndEvent } from "@dnd-kit/core";
import {
  addTodoListAPI,
  addTodoStepAPI,
  addTodoTaskAPI,
  deleteTodoListAPI,
  deleteTodoStepAPI,
  deleteTodoTaskAPI,
  editTodoTaskDetailsAPI,
  editTodoTaskStepAPI,
  getTodoAPI,
  getTodoTaskAPI,
  getTodoTaskByIdAPI,
  getTodoTaskByListAPI,
  promoteToTaskAPI,
  reorderListsAPI,
  reorderStepsAPI,
  reorderTasksAPI,
  suggestStepAPI,
  suggestDescriptionAPI,
  updateTodoListAPI,
  updateTodoTaskAPI,
  toggleActiveTaskAPI,
  fetchActiveTasksAPI,
} from "$/services/tools/todo/local";
import { DefaultRecurrentRule } from "@/components/recurrence_filter";
import { arrayMove } from "@dnd-kit/sortable";
import { TabType } from "$/services/tools/todo/type";
import { Descendant } from "slate";
import isEqual from "lodash/isEqual";
import {
  convertMarkdownToSlate,
  convertSlateToMarkdown,
} from "../../../../utils/Slate";
import { useDebounce } from "$/hooks/isDebounce";
import { useService } from "$/Providers/ServiceProv";
import { List, TaskDetails as TaskDetailsType, Task, Step } from "../types";
import { RecurrenceRule } from "@/components/recurrence_filter";
import { useToast } from "@/components/ui/use-toast";
import {
  Sun,
    Star,
    Calendar,
    ListChecks,
    SquareCheckBig,
    Plus,
    Pencil,
    Trash,
    Columns3,
  } from "lucide-react";
import { AppSchema, defaultAppSchema } from "@OS/Layout/types";
import TodoDetailSkeleton from "../../../Skelenton/TodoDetail";
import { menuItem } from "@OS/utils/contextMenu";
import { DialogData } from "@OS/Layout/Dialog/DialogSchema";
import { useOS } from "@OS/Provider/OSProv";
import TaskDetails from "../TaskDetails";
import {
  getDateForDay,
  calculateOptimalGap,
  generateOrderValues,
} from "../utils";
import { useDebouncedReorder } from "../hooks";
import { useRouter } from "next/router";

interface Props {
  children: ReactNode;
  inMiniMode?: boolean;
}

interface exportedValue {
  tasks: Task[];
  lists: List[];
  title: string;
  selectedTask: TaskDetailsType | undefined;
  onEditMode: string;
  setOnEditMode: (onEditMode: string) => void;
  listId: string | undefined;
  currentTab: string;
  inProgressTask: string | undefined;
  loading: boolean;
  taskLoading: boolean;
  suggestStepLoading: boolean;
  setTasks: (tasks: Task[]) => void;
  setLists: (lists: List[]) => void;
  handleAddTask: ({
    title,
    listId,
    date,
    description,
    starred,
    myDay,
    recurrence,
    ignore,
    existingId,
    source,
    assignedAgent,
    linkedDocumentUrl,
    delivery,
  }: {
    title: string;
    listId?: string;
    date?: Date;
    description?: string;
    starred?: boolean;
    myDay?: boolean;
    recurrence?: RecurrenceRule;
    ignore?: boolean;
    /** When syncing from OpenClaw bridge, pass the bridge task id so we can dedupe */
    existingId?: string;
    /** When 'bridge', task came from ~/.hyperclaw/todo.json — do not write back to bridge (avoids loop) */
    source?: "app" | "bridge";
    assignedAgent?: string;
    linkedDocumentUrl?: string;
    /** Optional delivery channel for announcing result (e.g. when task is run by cron) */
    delivery?: { announce?: boolean; channel?: string; to?: string };
  }) => Promise<any>;
  handleDeleteTask: (id: string, ignore?: boolean) => void;
  handleStatusChange: (
    id: string,
    status: "pending" | "completed" | "in_progress" | "blocked",
    ignore?: boolean
  ) => void;
  handleEditList: (
    listId: string,
    fieldsToUpdate: Record<string, any>,
    ignore?: boolean
  ) => void;
  handleAddNextStep: (
    taskId: string,
    nextStep: string,
    newId?: string
  ) => Promise<string | undefined>;
  handlePromoteToTask: (taskId: string, stepId: string) => void;
  handleToggleMyDay: (id: string, ignore?: boolean) => void;
  handleReorderCalendar: (buckets: Record<string, string[]>) => void;
  handleToggleStar: (id: string, ignore?: boolean) => void;
  handleReorderTasks: (
    id: string,
    newIndex: number,
    view: TabType,
    oldIndex: number,
    listId?: string,
    startDate?: string,
    endDate?: string
  ) => void;
  handleSuggestStep: (taskId: string) => Promise<Step[]>;
  handleToggleStepComplete: (taskId: string, stepId: string) => void;
  handleDeleteStep: (taskId: string, stepId: string) => void;
  handleEditStep: (
    taskId: string,
    stepId: string,
    type: string,
    value: string
  ) => void;
  handleSelectList: (id: string) => void;
  handleImageUpload: (file: File) => Promise<string | undefined>;
  handleCreateList: ({
    name,
    planned,
    ignore,
  }: {
    name?: string;
    planned?: boolean;
    ignore?: boolean;
  }) => Promise<string | undefined>;
  handleDeleteList: (id: string, ignore?: boolean) => void;
  handleUpdateTodoListDescription: (value: Descendant[]) => void;
  onRenameList: (id: string, newName: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragEndSteps: (event: DragEndEvent) => void;
  handleTabChange: (tab: string, listId?: string) => void;
  handleEditTask: (
    id: string,
    fieldsToUpdate: Record<string, any>,
    ignore?: boolean
  ) => void;
  handleOnCloseTaskDetails: () => void;
  handleDragEndLists: (event: DragEndEvent) => void;
  handleSelectTask: (taskId: string | undefined, options?: { viewOnly?: boolean }) => void;
  handleTaskWorkflow: ({
    title,
    listId,
    date,
    description,
    starred,
    myDay,
    recurrence,
    ignore,
  }: {
    title: string;
    listId?: string;
    date?: Date;
    description?: string;
    starred?: boolean;
    myDay?: boolean;
    recurrence?: RecurrenceRule;
    ignore?: boolean;
  }) => Promise<TaskDetailsType | undefined>;
  fetchTasksForWeek: (startDate: Date, endDate: Date) => Promise<Task[]>;
  appSchema: AppSchema;
}

const initialState: exportedValue = {
  tasks: [],
  lists: [],
  title: "Focus",
  selectedTask: undefined,
  onEditMode: "",
  currentTab: "task",
  loading: false,
  taskLoading: false,
  inProgressTask: undefined,
  suggestStepLoading: false,
  listId: undefined,
  setTasks: () => { },
  setLists: () => { },
  handleAddTask: () => {
    return Promise.resolve(null);
  },
  setOnEditMode: () => { },
  handleDeleteTask: () => { },
  handlePromoteToTask: () => { },
  handleStatusChange: () => { },
  handleEditList: () => { },
  handleAddNextStep: () => {
    return Promise.resolve(undefined);
  },
  handleToggleMyDay: () => { },
  handleToggleStar: () => { },
  handleSuggestStep: () => {
    return Promise.resolve([]);
  },
  handleToggleStepComplete: () => { },
  handleDeleteStep: () => { },
  handleSelectList: () => { },
  handleReorderTasks: () => { },
  handleReorderCalendar: () => { },
  handleImageUpload: () => {
    return Promise.resolve("");
  },
  handleCreateList: () => {
    return Promise.resolve("");
  },
  handleDeleteList: () => { },
  onRenameList: () => { },
  handleDragEnd: () => { },
  handleDragEndSteps: () => { },
  handleTabChange: () => { },
  handleEditTask: () => { },
  handleEditStep: () => { },
  handleOnCloseTaskDetails: () => { },
  handleDragEndLists: () => { },
  handleSelectTask: () => { },
  handleUpdateTodoListDescription: () => { },
  handleTaskWorkflow: () => {
    return Promise.resolve(undefined);
  },
  fetchTasksForWeek: () => {
    return Promise.resolve([]);
  },
  appSchema: defaultAppSchema,
};

const TodoListContext = createContext<exportedValue>(initialState);

const outsideTabType = (str: string) => {
  return (
    str !== "myday" &&
    str !== "task" &&
    str !== "starred" &&
    str !== "finished" &&
    str !== "list" &&
    str !== "calendar"
  );
};

export function TodoListProvider({ children, inMiniMode }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const { getAppSettings, updateAppSettings } = useOS();
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<string>(
    getAppSettings("todo-list").currentActiveTab
      ? (getAppSettings("todo-list").currentActiveTab as TabType)
      : "myday"
  );
  const [title, setTitle] = useState<string>("Focus");
  const [selectedTask, setSelectedTask] = useState<TaskDetailsType | undefined>(
    undefined
  );
  const { toast, dismiss } = useToast();
  const { uploadFileToCloud } = useService();
  const [listId, setListId] = useState<string | undefined>(
    getAppSettings("todo-list").meta?.listId || undefined
  );
  const [inProgressTask, setInProgressTask] = useState<string | undefined>(
    undefined
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [taskLoading, setTaskLoading] = useState<boolean>(true);
  const [suggestStepLoading, setSuggestStepLoading] = useState<boolean>(false);
  const [onEditMode, setOnEditMode] = useState<string>("");
  const [descendantContent, setDescendantContent] = useState<Descendant[]>([]);
  const [isSaveNote, setIsSaveNote] = useState(false);
  const [descendantContentTaskId, setDescendantContentTaskId] = useState<string | undefined>(undefined);
  const debouncedContent = useDebounce(descendantContent, 300); // Debounce the content
  const initialLoaded = useRef(true);

  useEffect(() => {
    if (isSaveNote && selectedTask && descendantContentTaskId === selectedTask._id) {
      const markdown = convertSlateToMarkdown(descendantContent);
      // Function to normalize content, preserving consecutive newlines
      const normalizeContent = (text: string) =>
        text
          .replace(/\r\n|\r/g, "\n") // Normalize all line breaks to \n
          .replace(/(\n\s*\n)+/g, "\n\n") // Ensure only one blank line between sections
          .trim(); // Remove leading and trailing whitespace only

      const normalizedMarkdown = normalizeContent(markdown);
      const normalizedSelectedContent = normalizeContent(
        selectedTask?.details.description || ""
      );

      if (normalizedMarkdown === normalizedSelectedContent) {
        setIsSaveNote(false);
        return;
      }
      saveDataToBackend(markdown);
      setIsSaveNote(false);
    } else if (isSaveNote && (!selectedTask || descendantContentTaskId !== selectedTask._id)) {
      // Cancel save if task was switched
      setIsSaveNote(false);
    }
  }, [debouncedContent, selectedTask?._id, descendantContentTaskId]);

  // Update currentActiveTab in app settings whenever currentTab changes
  useEffect(() => {
    if (currentTab === getAppSettings("todo-list").currentActiveTab) return;
    if (currentTab.includes("list")) {
      updateAppSettings("todo-list", {
        currentActiveTab: currentTab,
        meta: {
          listId: currentTab.split(":")[1],
        },
      });
      return;
    }
    updateAppSettings("todo-list", {
      currentActiveTab: currentTab,
    });
  }, [currentTab]);

  const handleApiError = useCallback(
    (error: any, action: string) => {
      console.error(error);
      toast({
        title: `Failed to ${action}`,
        description: "Please try again",
        variant: "destructive",
      });
    },
    [toast]
  );

  const handleToggleTaskProperty = async (
    id: string,
    property: keyof Task,
    apiCall: (data: any) => Promise<any>,
    force?: boolean
  ) => {
    try {
      // Use functional update to get current value and update atomically
      let currentValue: any;
      let newValue: any;

      if (!force) {
        setTasks((prevTasks) => {
          const task = prevTasks.find((task) => task._id === id);
          currentValue = task?.[property];
          newValue = !currentValue;

          return prevTasks.map((task) =>
            task._id === id ? { ...task, [property]: newValue } : task
          );
        });
      } else {
        // If force is true, we still need to get the current value for the API call
        setTasks((prevTasks) => {
          const task = prevTasks.find((task) => task._id === id);
          currentValue = task?.[property];
          newValue = !currentValue;
          return prevTasks; // Don't update if force is true
        });
      }

      if (id === selectedTask?._id) {
        setSelectedTask({
          ...selectedTask,
          [property]: newValue,
        });
      }

      if (!isValidObjectId(id)) return;

      const response = await apiCall({
        id,
        [property]: newValue,
      });

      if (response.status !== 200) {
        throw new Error(`Failed to update ${property}`);
      }
    } catch (error) {
      handleApiError(error, `update ${property}`);
    }
  };

  const handleStatusChange = async (
    id: string,
    status: "pending" | "completed" | "in_progress" | "blocked",
    ignore?: boolean
  ) => {
    try {
      // Get the task before updating
      const taskBeforeUpdate = tasks.find((t) => t._id === id);
      const wasInProgress = taskBeforeUpdate?.status === "in_progress";
      const isNowInProgress = status === "in_progress";

      if (!isValidObjectId(id)) {
        if (!ignore) {
          setTasks((prev) =>
            prev.map((task) => (task._id === id ? { ...task, status } : task))
          );
        }
        return;
      }

      const response = await updateTodoTaskAPI({
        id,
        status,
      });
      if (response.status !== 200) {
        throw new Error("Failed to update status");
      }

      // Create a one-shot cron that runs immediately, then deletes itself
      if (isNowInProgress && taskBeforeUpdate?.assignedAgent && !wasInProgress) {
        const t = taskBeforeUpdate;
        const message = [
          `Work on task: ${t.title || ""}`,
          t.description ? `Description: ${t.description}` : "",
          t.linkedDocumentUrl ? `Document: ${t.linkedDocumentUrl}` : "",
          `Task ID: ${t._id}`,
        ]
          .filter(Boolean)
          .join("\n");
        const jobName = `Task [${t._id}]: ${(t.title || "Untitled").slice(0, 50)}`;
        await cronAdd({
          name: jobName,
          at: new Date().toISOString(),
          session: "isolated",
          agent: t.assignedAgent,
          message,
          deleteAfterRun: true,
        }).catch(console.error);
        // Track this task's cron run so we can move to Done (ok) or Review (error) when it finishes
        try {
          await new Promise((r) => setTimeout(r, 150));
          const jobs = await fetchCronsFromBridge();
          const job = jobs.find((j) => j.name?.includes(t._id) || j.name === jobName);
          if (job?.id) {
            addPendingTaskCronRun(t._id, job.id);
            addRunningJobId(job.id);
          }
        } catch {
          // ignore; task stays in progress until user moves it
        }
      }

      if (!ignore) {
        setTasks((prevTasks) => {
          const updatedTasks = prevTasks.map((task) =>
            task._id === id ? { ...task, status } : task
          );

          return updatedTasks;
        });
      }
      return response.data;
    } catch (error) {
      handleApiError(error, "update status");
    }
  };

  useCronTaskStatusPoll((taskId, status) => {
    handleStatusChange(taskId, status === "ok" ? "completed" : "blocked");
  });

  const handleToggleMyDay = (id: string, ignore?: boolean) => {
    return handleToggleTaskProperty(id, "myDay", updateTodoTaskAPI, ignore);
  };

  const handleToggleStar = (id: string, ignore?: boolean) => {
    return handleToggleTaskProperty(id, "starred", updateTodoTaskAPI, ignore);
  };

  const handleAddTask = useCallback(
    async ({
      title,
      listId,
      date,
      description,
      starred,
      myDay,
      recurrence,
      ignore = false,
      existingId,
      assignedAgent,
      linkedDocumentUrl,
      delivery,
    }: {
      title: string;
      listId?: string;
      date?: Date;
      description?: string;
      starred?: boolean;
      myDay?: boolean;
      recurrence?: RecurrenceRule;
      ignore?: boolean;
      existingId?: string;
      assignedAgent?: string;
      linkedDocumentUrl?: string;
      delivery?: { announce?: boolean; channel?: string; to?: string };
    }): Promise<any> => {
      const newObjectId = existingId ? sanitizeId(existingId) : generateId();
      try {
        const trimmedTitle = title.replace(/\n/g, '');

        if (!ignore) {
          setTasks((prevTasks) => [
            ...prevTasks,
            {
              _id: newObjectId,
              title: trimmedTitle,
              status: "pending",
              listId: listId || "",
              description: description || "",
              order: tasks.length,
              createdAt: new Date(),
              updatedAt: new Date(),
              starred: starred || currentTab === "starred",
              myDay: myDay || currentTab === "myday",
              dueDate: date,
              recurrence: recurrence || DefaultRecurrentRule,
              steps: { completed: 0, uncompleted: 0 },
              statistics: {
                finishedCount: 0,
                skippedCount: 0,
              },
              assignedAgent: assignedAgent?.trim() || undefined,
              linkedDocumentUrl: linkedDocumentUrl?.trim() || undefined,
            },
          ]);
        }

        const response = await addTodoTaskAPI({
          _id: newObjectId,
          title: trimmedTitle,
          listId: listId || "",
          description: description || "",
          order: tasks.length,
          starred: starred || currentTab === "starred",
          myDay: myDay || currentTab === "myday",
          dueDate: date,
          recurrence: recurrence,
          assignedAgent: assignedAgent?.trim() || undefined,
          linkedDocumentUrl: linkedDocumentUrl?.trim() || undefined,
          delivery,
        });

        if (response.status !== 200) {
          throw new Error("Failed to add task");
        }

        // Reconcile: the backend recalculates order based on context.
        // Patch the optimistic task with the authoritative order so the UI
        // stays consistent after a page refresh.
        if (!ignore && response.data?.order != null) {
          setTasks((prev) =>
            prev.map((t) =>
              t._id === newObjectId ? { ...t, order: response.data.order } : t
            )
          );
        }

        return response.data;
      } catch (error) {
        if (!ignore) {
          setTasks((prev) => prev.filter((t) => t._id !== newObjectId));
        }
        handleApiError(error, "add task");
      }
    },
    [tasks.length, currentTab, handleApiError]
  );

  const handleDeleteTask = async (id: string, ignore?: boolean) => {
    try {
      if (selectedTask?._id === id) {
        handleOnCloseTaskDetails();
      }

      if (!ignore) {
        setTasks((prev) => prev.filter((task) => task._id !== id));
      }

      // Ghost tasks with non-ObjectId IDs were never persisted — skip the API call.
      if (!isValidObjectId(id)) return;

      const response = await deleteTodoTaskAPI({ id });

      if (response.status !== 200) {
        throw new Error("Failed to delete task");
      }

    } catch (error) {
      handleApiError(error, "delete task");
    }
  };

  const handleReorderTasks = async (
    id: string,
    newIndex: number,
    view: TabType,
    oldIndex: number,
    listId?: string,
    startDate?: string,
    endDate?: string
  ) => {
    try {
      setTasks((items) => {
        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({
          ...item,
          order: index,
        }));
      });

      const ReorderToDoDataAPI = await reorderTasksAPI({
        id,
        newIndex: newIndex as number,
        view: view as TabType,
        listId: listId,
        startDate: startDate,
        endDate: endDate,
      });

      if (ReorderToDoDataAPI.status !== 200) {
        throw new Error("Failed to reorder task");
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to reorder task",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const { debouncedReorder } = useDebouncedReorder();

  const handleReorderCalendar = async (buckets: Record<string, string[]>) => {
    try {
      // Optimistically update the frontend state
      const updatedTasks = [...tasks];

      // Process each bucket to update task order, dueDate, and listId
      for (const [key, taskIds] of Object.entries(buckets)) {
        const isDateBucket =
          !isNaN(new Date(key).getTime()) && key.length === 10;
        const optimalGap = calculateOptimalGap(taskIds.length);
        const newOrders = generateOrderValues(taskIds.length, optimalGap);

        taskIds.forEach((taskId, index) => {
          const taskIndex = updatedTasks.findIndex(
            (task) => task._id === taskId
          );
          if (taskIndex !== -1) {
            updatedTasks[taskIndex] = {
              ...updatedTasks[taskIndex],
              order: newOrders[index],
              updatedAt: new Date(),
              ...(isDateBucket
                ? {
                  dueDate: new Date(key + "T23:59:59.999Z"),
                  listId: undefined,
                }
                : {
                  dueDate: undefined,
                  listId: key,
                }),
            };
          }
        });
      }

      // Update the frontend state optimistically
      setTasks(updatedTasks);

      // Call the backend API with debouncing
      await debouncedReorder(buckets);
    } catch (err) {
      console.error("reorder failed", err);

      // Revert the optimistic update on error
      // We could implement a more sophisticated revert mechanism here
      // For now, we'll just show an error and let the user refresh
      toast({
        title: "Failed to reorder calendar",
        description: "Please try again or refresh the page",
        variant: "destructive",
      });

      // Optionally, refetch the tasks to ensure consistency
      // await handleTabChange(currentTab, listId, true);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      const oldIndex = tasks.findIndex((item) => item._id === active.id);
      const newIndex = tasks.findIndex((item) => item._id === over.id);

      let tab: TabType;
      let listId: string | undefined;

      // split by :
      if (outsideTabType(currentTab)) {
        tab = currentTab.split(":")[0] as TabType;
        listId = currentTab.split(":")[1];
      } else {
        tab = currentTab as TabType;
        listId = undefined;
      }

      handleReorderTasks(
        active.id as string,
        newIndex as number,
        tab as TabType,
        oldIndex,
        listId
      );
    }
  };

  const handleDragEndLists = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id !== over.id) {
      try {
        const oldIndex = lists.findIndex((list) => list._id === active.id);
        const newIndex = lists.findIndex((list) => list._id === over.id);

        const newLists = arrayMove(lists, oldIndex, newIndex);
        setLists(newLists);

        const ReorderToDoDataAPI = await reorderListsAPI({
          id: active.id as string,
          newIndex: newIndex as number,
        });

        if (ReorderToDoDataAPI.status !== 200) {
          throw new Error("Failed to reorder list");
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "Failed to reorder list",
          description: "Please try again",
          variant: "destructive",
        });
      }
    }
  };

  const handleDragEndSteps = async (event: DragEndEvent) => {
    if (!selectedTask) return;

    const { active, over } = event;
    if (!over) return;

    try {
      if (active.id !== over.id) {
        const newIndex = selectedTask.details.steps.findIndex(
          (item) => item._id === over.id
        );

        if (newIndex === -1) {
          throw new Error("Over step not found");
        }

        setSelectedTask((prev) => {
          if (!prev) return prev;

          const updatedSteps = [...prev.details.steps];
          const activeIndex = updatedSteps.findIndex(
            (item) => item._id === active.id
          );

          if (activeIndex === -1) {
            throw new Error("Active step not found");
          }

          const [movedStep] = updatedSteps.splice(activeIndex, 1);
          updatedSteps.splice(newIndex, 0, movedStep);

          return {
            ...prev,
            details: {
              ...prev.details,
              steps: updatedSteps.map((step, index) => ({
                ...step,
                order: index,
              })),
            },
          };
        });

        const response = await reorderStepsAPI({
          id: selectedTask._id,
          stepId: active.id as string,
          newIndex,
        });

        if (response.status !== 200) {
          throw new Error("Failed to reorder step");
        }
      }
    } catch (error) {
      handleApiError(error, "reorder step");
    }
  };

  const handleSelectList = async (id: string) => {
    try {
      const getTodoListTask = await getTodoTaskByListAPI(id);
      if (getTodoListTask.status !== 200) {
        throw new Error("Failed to get tasks");
      }
      setTasks(getTodoListTask.data);
      setCurrentTab(`list:${id}`);
      setSelectedTask(undefined);
      setListId(id);
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to get tasks",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleCreateList = useCallback(
    async ({
      name = "New Goal",
      planned,
      ignore,
    }: {
      name?: string;
      planned?: boolean;
      ignore?: boolean;
    }) => {
      try {
        setLoading(true);
        const AddToDoDataAPI = await addTodoListAPI({
          name: name,
          planned: planned,
        });
        if (AddToDoDataAPI.status !== 200) {
          throw new Error("Failed to create list");
        }
        if (!ignore) {
          setLists((prevLists) => [...prevLists, AddToDoDataAPI.data]);
          setCurrentTab(`list:${AddToDoDataAPI.data._id}`);
          setTitle("New Goal");
          setSelectedTask(undefined);
          setTasks([]);
          setListId(AddToDoDataAPI.data._id);
        }
        return AddToDoDataAPI.data._id || "";
      } catch (error) {
        console.error(error);
        dismiss();
        toast({
          title: "Failed to create list",
          description: "Please try again",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [dismiss, toast]
  );

  const handleDeleteList = async (id: string, ignore?: boolean) => {
    try {
      setLoading(true);
      // Delete all tasks associated with this list

      if (!currentTab.includes(id)) {
        const DeleteToDoDataAPI = await deleteTodoListAPI({
          id: id,
        });
        if (DeleteToDoDataAPI.status !== 200) {
          throw new Error("Failed to delete list");
        }
        if (!ignore) {
          setLists((prevLists) => lists.filter((list) => list._id !== id));
          setTasks((prevTasks) =>
            prevTasks.filter((task) => task.listId !== id)
          );
        }
        return;
      }

      const [todoTaskAPIResponse, DeleteToDoDataAPI] = await Promise.all([
        handleTabChange("myday"),
        deleteTodoListAPI({
          id: id,
        }),
      ]);
      if (DeleteToDoDataAPI.status !== 200) {
        throw new Error("Failed to delete list");
      }
      setLists((prevLists) => lists.filter((list) => list._id !== id));
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to delete list",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddNextStep = async (
    taskId: string,
    nextStep: string,
    newId?: string
  ) => {
    try {
      const newStepId = newId || generateId();

      if (selectedTask?._id === taskId) {
        setSelectedTask((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            details: {
              ...prev.details,
              steps: [
                ...prev.details.steps,
                { _id: newStepId, title: nextStep, status: "pending" as const },
              ],
            },
          };
        });
      }

      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === taskId
            ? {
              ...task,
              steps: {
                ...task.steps,
                uncompleted: task.steps.uncompleted + 1,
              },
            }
            : task
        )
      );

      const EditToDoTaskNextStepAPI = await addTodoStepAPI({
        taskId: taskId,
        title: nextStep,
        _id: newStepId,
      });

      if (EditToDoTaskNextStepAPI.status !== 200) {
        throw new Error("Failed to add next step");
      }

      return newStepId;
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to add next step",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleToggleStepComplete = async (taskId: string, stepId: string) => {
    try {
      if (!selectedTask) {
        return;
      }
      // Find the specific step in the selected task
      const stepToUpdate = selectedTask.details.steps.find(
        (step) => step._id === stepId
      );
      if (!stepToUpdate) {
        throw new Error(`Step with ID ${stepId} not found`);
      }

      const isCurrentlyCompleted = stepToUpdate.status === "completed";

      // Update task steps' completion status in the tasks array
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === taskId
            ? {
              ...task,
              steps: {
                completed: isCurrentlyCompleted
                  ? Math.max(0, task.steps.completed - 1) // Decrement completed count if marking as incomplete
                  : task.steps.completed + 1, // Increment completed count if marking as complete
                uncompleted: isCurrentlyCompleted
                  ? task.steps.uncompleted + 1 // Increment uncompleted count if marking as incomplete
                  : Math.max(0, task.steps.uncompleted - 1), // Decrement uncompleted count if marking as complete
              },
            }
            : task
        )
      );

      // Update step completion status for the selected task
      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          details: {
            ...prev.details,
            steps: prev.details.steps.map((step) =>
              step._id === stepId
                ? {
                  ...step,
                  status: isCurrentlyCompleted ? "pending" : "completed",
                } // Toggle the `status` state
                : step
            ),
          },
        };
      });

      const EditTodoTaskCompletedAPI = await editTodoTaskStepAPI({
        id: taskId,
        stepId: stepId,
        status: !isCurrentlyCompleted ? "completed" : "pending", // Use the toggled state
      });
      if (EditTodoTaskCompletedAPI.status !== 200) {
        throw new Error("Failed to update step");
      }
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to update task",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handlePromoteToTask = async (taskId: string, stepId: string) => {
    try {
      if (!selectedTask) {
        return;
      }

      const taskInStep = tasks.find((task) => task._id === taskId);

      if (!taskInStep) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      const stepToPromote = selectedTask.details.steps.find(
        (step) => step._id === stepId
      );
      if (!stepToPromote) {
        throw new Error(`Step with ID ${stepId} not found`);
      }

      //remove the step from the selected task
      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          details: {
            ...prev.details,
            steps: prev.details.steps.filter((step) => step._id !== stepId),
          },
        };
      });

      const newTask: Task = {
        _id: stepId,
        title: stepToPromote.title,
        status: stepToPromote.status,
        starred: taskInStep.starred,
        myDay: taskInStep.myDay,
        description: "",
        listId: taskInStep.listId,
        order: taskInStep.order + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: {
          completed: 0,
          uncompleted: 0,
        },
        recurrence: DefaultRecurrentRule,
        statistics: {
          finishedCount: 0,
          skippedCount: 0,
        },
      };

      //add task into tasks array
      setTasks((prevTasks): Task[] => [
        ...prevTasks.map(
          (task): Task =>
            task._id === taskId
              ? {
                ...task,
                steps: {
                  completed:
                    stepToPromote.status === "completed"
                      ? task.steps.completed - 1
                      : task.steps.completed,
                  uncompleted:
                    stepToPromote.status !== "completed"
                      ? task.steps.uncompleted - 1
                      : task.steps.uncompleted,
                },
              }
              : task
        ),
        newTask,
      ]);

      const PromoteToTaskAPI = await promoteToTaskAPI({
        taskId: taskId,
        stepId: stepId,
      });

      if (PromoteToTaskAPI.status !== 200) {
        throw new Error("Failed to promote to task");
      }
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to promote task",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleEditStep = async (
    taskId: string,
    stepId: string,
    type: string,
    value: string
  ) => {
    try {
      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          details: {
            ...prev.details,
            steps: prev.details.steps.map((step) =>
              step._id === stepId ? { ...step, [type]: value } : step
            ),
          },
        };
      });
      const EditToDoTaskStepAPI = await editTodoTaskStepAPI({
        id: taskId,
        stepId: stepId,
        [type]: value,
      });
      if (EditToDoTaskStepAPI.status !== 200) {
        throw new Error("Failed to update step");
      }
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to update step",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const onRenameList = async (id: string, newName: string) => {
    try {
      setLists((prevLists) =>
        prevLists.map((list) =>
          list._id === id ? { ...list, name: newName } : list
        )
      );
      const UpdateToDoDataAPI = await updateTodoListAPI({
        id: id,
        name: newName,
      });
      if (UpdateToDoDataAPI.status !== 200) {
        throw new Error("Failed to update list");
      }
      dismiss();
    } catch (error) {
      console.error(error);
      dismiss();
      toast({
        title: "Failed to update list",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleTabChange = useCallback(
    async (tab: string, currentListId?: string, force?: boolean) => {
      try {
        setLoading(true);
        let newTab = tab;
        if (tab.includes("list") && currentListId) {
          if ((currentListId === listId && force) || currentListId !== listId) {
            await handleSelectList(currentListId);
            handleTitleChange(newTab, currentListId);
            return;
          }
        }

        handleTitleChange(newTab, currentListId);

        if (tab === currentTab && !force) return;
        setSelectedTask(undefined);

        if (tab === "kanban") {
          const todoTaskAPIResponse = await getTodoTaskAPI("task" as TabType);
          if (todoTaskAPIResponse.status !== 200) {
            throw new Error("Failed to get tasks");
          }
          setTasks(todoTaskAPIResponse.data);
          setListId(undefined);
          setCurrentTab(tab);
          return;
        }

        if (tab === "calendar") {
          const startDate = getDateForDay(0);
          const endDate = getDateForDay(6);
          const [calendarTasks, taskList] = await Promise.all([
            getTodoTaskAPI("calendar" as TabType, {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            }),
            getTodoTaskAPI("list" as TabType),
          ]);

          const combinedTasks = [
            ...new Map(
              [...(calendarTasks.data || []), ...(taskList.data || [])].map(
                (task) => [task._id, task]
              )
            ).values(),
          ].sort((a, b) => a.order - b.order);

          setTasks(combinedTasks);
          setListId(undefined);
          setCurrentTab(tab);
          return;
        }

        const todoTaskAPIResponse = await getTodoTaskAPI(tab as TabType);

        if (todoTaskAPIResponse.status !== 200) {
          throw new Error("Failed to get tasks");
        }
        setTasks(todoTaskAPIResponse.data);
        setListId(undefined);
        setCurrentTab(tab);
      } catch (error) {
        console.error(error);
        toast({
          title: "Failed to get tasks",
          description: "Please try again",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [currentTab, listId, lists]
  );

  const handleEditTask = useCallback(
    async (
      id: string,
      fieldsToUpdate: Record<string, any>,
      ignore?: boolean
    ) => {
      try {
        // Update local state with all the fields
        if (!ignore) {
          setTasks((prevTasks) =>
            prevTasks.map((task) =>
              task._id === id ? { ...task, ...fieldsToUpdate } : task
            )
          );
        }

        if (!isValidObjectId(id)) return;

        // Send all fields in a single API call
        const UpdateToDoDataAPI = await updateTodoTaskAPI({
          id: id,
          ...fieldsToUpdate,
        });

        if (UpdateToDoDataAPI.status !== 200) {
          throw new Error("Failed to update task");
        }

      } catch (error) {
        console.error(error);
        toast({
          title: "Failed to update task",
          description: "Please try again",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const handleOnCloseTaskDetails = () => {
    setSelectedTask(undefined);
    setDescendantContent([]);
    setDescendantContentTaskId(undefined);
    setIsSaveNote(false);
    updateAppSettings("todo-list", { detail: false });
  };

  const handleUpdateTodoListDescription = async (value: Descendant[]) => {
    try {
      if (!selectedTask) {
        return;
      }
      // Prevent updating if value is empty or unchanged
      if (value.length === 0 || isEqual(value, descendantContent)) {
        return;
      }

      setDescendantContent(value);
      setDescendantContentTaskId(selectedTask._id);
      setIsSaveNote(true);
    } catch (error) {
      console.error(error);
    }
  };

  const saveDataToBackend = async (value: string) => {
    try {
      if (!selectedTask) {
        return;
      }
      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          details: {
            ...prev.details,
            description: value,
          },
        };
      });
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === selectedTask._id ? { ...task, description: value } : task
        )
      );
      const EditToDoTaskDetailsAPI = await editTodoTaskDetailsAPI({
        id: selectedTask._id,
        description: value,
      });

      if (EditToDoTaskDetailsAPI.status !== 200) {
        throw new Error("Failed to update task");
      }

    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to update task",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      if (!selectedTask) {
        return;
      }

      if (!selectedTask?._id) return;

      const editorId = `/todo/${selectedTask._id}/`;

      const uploadFileToCloudResponse = await uploadFileToCloud(
        file,
        "image",
        `${editorId}`
      );
      if (uploadFileToCloudResponse) {
        const uploadAttachmentAPIResponse = await editTodoTaskDetailsAPI({
          id: selectedTask._id,
          attachments: [uploadFileToCloudResponse],
        });
        if (uploadAttachmentAPIResponse.status !== 200) {
          throw new Error("Failed to upload attachment");
        }
        return uploadFileToCloudResponse;
      }
      return "";
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to upload attachment",
        description: "Please try again",
        variant: "destructive",
      });
      return "";
    }
  };

  const handleDeleteStep = async (taskId: string, stepId: string) => {
    try {
      const stepToDelete = selectedTask?.details.steps.find(
        (step) => step._id === stepId
      );
      const wasCompleted = stepToDelete?.status === "completed";

      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          details: {
            ...prev.details,
            steps: prev.details.steps.filter((step) => step._id !== stepId),
          },
        };
      });

      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === taskId
            ? {
              ...task,
              steps: {
                completed: wasCompleted
                  ? task.steps.completed - 1
                  : task.steps.completed,
                uncompleted: !wasCompleted
                  ? task.steps.uncompleted - 1
                  : task.steps.uncompleted,
              },
            }
            : task
        )
      );

      const DeleteToDoStepAPI = await deleteTodoStepAPI({
        id: taskId,
        stepId: stepId,
      });
      if (DeleteToDoStepAPI.status !== 200) {
        throw new Error("Failed to delete step");
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to delete step",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleSuggestStep = useCallback(
    async (taskId: string) => {
      try {
        setSuggestStepLoading(true);

        const suggestStepAPIResponse = await suggestStepAPI({
          taskId: taskId,
        });

        if (suggestStepAPIResponse.status !== 200) {
          throw new Error("Failed to suggest step");
        }

        setTasks((prevTasks) =>
          prevTasks.map((task) =>
            task._id === taskId
              ? {
                ...task,
                steps: {
                  completed: 0,
                  uncompleted: suggestStepAPIResponse.data.steps.length || 0,
                },
              }
              : task
          )
        );

        // Refetch task details to ensure we have the latest data
        // This ensures the frontend updates properly, especially if the task is currently selected
        try {
          const getTodoTaskByIdAPIResponse = await getTodoTaskByIdAPI(taskId);

          if (getTodoTaskByIdAPIResponse.status === 200 && getTodoTaskByIdAPIResponse.data) {
            // Update selectedTask if this task is currently selected
            // Guard: Only update if the selected task matches the taskId we're updating
            // This prevents race conditions where user switches to a different task while refetch is in progress
            setSelectedTask((prev) => {
              if (!prev || prev._id !== taskId) return prev;

              // Convert markdown to slate content
              const slateContent =
                convertMarkdownToSlate(
                  getTodoTaskByIdAPIResponse.data.details?.description || ""
                ) || [];

              // Update with full task data - exclude description from top level since it should only be in details
              const { description: ___, steps: ____, ...apiDataWithoutExcluded } = getTodoTaskByIdAPIResponse.data;
              return {
                ...apiDataWithoutExcluded,
                details: {
                  ...getTodoTaskByIdAPIResponse.data.details,
                  descendants: slateContent,
                },
              };
            });
          }
        } catch (refetchError) {
          // If refetch fails, still update with the response data as fallback
          console.warn("Failed to refetch task details after suggesting steps:", refetchError);
          setSelectedTask((prev) => {
            if (!prev || prev._id !== taskId) return prev;
            return {
              ...prev,
              details: {
                ...prev.details,
                steps: suggestStepAPIResponse.data.steps,
              },
            };
          });
        }

        return suggestStepAPIResponse.data.steps;
      } catch (error) {
        console.error(error);
        toast({
          title: "Failed to suggest step",
          description: "Please try again",
          variant: "destructive",
        });
        return [];
      } finally {
        setSuggestStepLoading(false);
      }
    },
    [toast]
  );

  const handleEditList = async (
    listId: string,
    fieldsToUpdate: Record<string, any>,
    ignore?: boolean
  ) => {
    try {
      const updateTodoListAPIResponse = await updateTodoListAPI({
        id: listId,
        ...fieldsToUpdate,
      });
      if (updateTodoListAPIResponse.status !== 200) {
        throw new Error("Failed to update list");
      }
      if (!ignore) {
        setLists((prevLists) =>
          prevLists.map((list) =>
            list._id === listId ? { ...list, ...fieldsToUpdate } : list
          )
        );
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getActiveTask = async (): Promise<{ data: string | null }> => {
    try {
      const fetchActiveTasksAPIResponse = await fetchActiveTasksAPI();
      if (fetchActiveTasksAPIResponse.status !== 200) {
        throw new Error("Failed to fetch active tasks");
      }
      return fetchActiveTasksAPIResponse.data;
    } catch (error) {
      console.error(error);
      return { data: null };
    }
  };

  const hasLoadedInitialData = useRef(false);

  const loadInitialData = useCallback(async () => {
    if (hasLoadedInitialData.current) return;
    try {
      hasLoadedInitialData.current = true;

      // Get current settings and determine initial state
      const currentSettings = getAppSettings("todo-list");
      const initialTab = (
        inMiniMode ? "myday" : currentSettings.currentActiveTab
      ) as TabType;

      // Batch update all initial settings
      updateAppSettings("todo-list", {
        ...(inMiniMode && { currentActiveTab: "myday" }),
        detail: false,
      });

      // Parallel loading of basic data
      const [todoListResponse] = await Promise.all([
        getTodoAPI(), // Always load lists first
      ]);

      // Set lists immediately
      setLists(todoListResponse.data.TodoList);

      if (router.pathname === "/dashboard") {
        const [tabPromise, activeTaskPromise] = await Promise.all([
          handleTabChange("task" as TabType, undefined, true),
          getActiveTask(),
        ]);

        if (activeTaskPromise && activeTaskPromise.data) {
          setInProgressTask(activeTaskPromise.data);
          // Load the active task into selectedTask
          await handleSelectTask(activeTaskPromise.data);
        }

        return;
      }

      // Handle different tab types with optimized loading
      if (initialTab === "calendar") {
        // Load calendar data in parallel
        const startDate = getDateForDay(0);
        const endDate = getDateForDay(6);

        const [calendarTasks, plannedTasks, unplannedTasks, activeTaskPromise] =
          await Promise.all([
            getTodoTaskAPI("calendar" as TabType, {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              limit: 100,
            }),
            getTodoTaskAPI("list" as TabType, {
              limit: 100,
              planned: true,
            }),
            getTodoTaskAPI("list" as TabType, {
              limit: 100,
              planned: false,
            }),
            getActiveTask(),
          ]);

        const combinedTasks = [
          ...new Map(
            [
              ...(calendarTasks.data || []),
              ...(plannedTasks.data || []),
              ...(unplannedTasks.data || []),
            ].map((task) => [task._id, task])
          ).values(),
        ].sort((a, b) => a.order - b.order);

        setTasks(combinedTasks);
        setTitle("Calendar");
        setCurrentTab("calendar");
        if (activeTaskPromise && activeTaskPromise.data) {
          setInProgressTask(activeTaskPromise.data);
          // Load the active task into selectedTask
          await handleSelectTask(activeTaskPromise.data);
        }
      } else {
        // For other tabs, load optimistically
        // If user is at dashboard, load "task" tab, otherwise use initialTab or default to "myday"
        let tabToLoad: string = initialTab || "myday";
        let listIdToLoad = undefined;

        if (initialTab && outsideTabType(initialTab)) {
          tabToLoad = `list:${getAppSettings("todo-list").meta.listId}`;
          listIdToLoad = getAppSettings("todo-list").meta.listId;
        }

        const [tabPromise, activeTaskPromise] = await Promise.all([
          handleTabChange(tabToLoad as TabType, listIdToLoad, true),
          getActiveTask(),
        ]);

        if (activeTaskPromise && activeTaskPromise.data) {
          setInProgressTask(activeTaskPromise.data);
          // Load the active task into selectedTask
          await handleSelectTask(activeTaskPromise.data);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setTaskLoading(false);
      initialLoaded.current = false;
    }
  }, [getAppSettings, updateAppSettings]);

  const fetchTasksForWeek = async (startDate: Date, endDate: Date): Promise<Task[]> => {
    try {
      const calendarTasks = await getTodoTaskAPI("calendar" as TabType, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 100,
      });
      if (calendarTasks.status !== 200) {
        throw new Error("Failed to fetch tasks for week");
      }
      return calendarTasks.data as Task[];
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to fetch tasks for week",
        description: "Please try again",
        variant: "destructive",
      });
      return [];
    }
  };

  const handleTitleChange = (tab: string, currentListId?: string) => {
    if (tab === "myday") {
      setTitle("Focus");
      return;
    }
    if (tab === "starred") {
      setTitle("Priority");
      return;
    }
    if (tab === "task") {
      setTitle("Tasks");
      return;
    }
    if (tab === "finished") {
      setTitle("Completed");
      return;
    }
    if (tab === "list") {
      const list = lists.find((list) => list._id === currentListId);
      setTitle(list?.name || "List");
      return;
    }
    setTitle("Tasks");
  };

  const handleSelectTask = async (taskId: string | undefined, options?: { viewOnly?: boolean }) => {
    try {
      if (!taskId) {
        setSelectedTask(undefined);
        setDescendantContent([]);
        setDescendantContentTaskId(undefined);
        setIsSaveNote(false);
        updateAppSettings("todo-list", { detail: false });
        return;
      }

      // Find the task in the current tasks array for optimistic update
      const existingTask = tasks.find((task) => task._id === taskId);

      // Optimistic update: Set loading state and show detail panel
      setTaskLoading(true);
      updateAppSettings("todo-list", { detail: true });

      // Set a temporary selected task with basic data for immediate UI feedback
      if (existingTask) {
        // Exclude description and listId from Task since TaskDetails doesn't have description at top level
        const { listId: _, description: __, steps: ___, ...taskWithoutExcluded } = existingTask;
        setSelectedTask({
          ...taskWithoutExcluded,
          listId: existingTask.listId || "", // Ensure listId is always a string
          details: {
            description: existingTask.description || "",
            steps: [],
            descendants: [],
            attachments: [],
          },
        } as TaskDetailsType);
      }

      const viewOnly = options?.viewOnly === true;
      if (!viewOnly) {
        setInProgressTask(taskId);
        setTasks((prevTasks) =>
          prevTasks.map((task) =>
            task._id === taskId ? { ...task, status: "in_progress" } : task
          )
        );
      }

      const apiCalls = viewOnly
        ? [getTodoTaskByIdAPI(taskId)]
        : [getTodoTaskByIdAPI(taskId), toggleActiveTaskAPI(taskId)];
      const results = await Promise.all(apiCalls);
      const getTodoTaskByIdAPIResponse = results[0] as { status: number; data?: unknown };
      const toggleActiveTaskAPIResponse = results[1] as { status: number } | undefined;

      if (getTodoTaskByIdAPIResponse.status !== 200) {
        throw new Error("Failed to get task details");
      }

      if (!viewOnly && toggleActiveTaskAPIResponse?.status !== 200) {
        throw new Error("Failed to toggle active task");
      }

      const taskData = getTodoTaskByIdAPIResponse.data as TaskDetailsType | undefined;
      if (!taskData) throw new Error("Task not found");

      // Convert markdown to slate content
      const slateContent =
        convertMarkdownToSlate(
          taskData.details?.description || ""
        ) || [];

      // Update with full task data
      setSelectedTask({
        ...taskData,
        details: {
          ...taskData.details,
          descendants: slateContent,
        },
      });

      // Reset descendant content state to match the new task
      setDescendantContent(slateContent);
      setDescendantContentTaskId(taskId);
      setIsSaveNote(false);
    } catch (error) {
      console.error(error);
      // On error, hide detail panel and clear selected task
      setSelectedTask(undefined);
      setDescendantContent([]);
      setDescendantContentTaskId(undefined);
      setIsSaveNote(false);
      updateAppSettings("todo-list", { detail: false });
      toast({
        title: "Failed to get task",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setTaskLoading(false);
    }
  };

  const handleTaskWorkflow = useCallback(
    async ({
      title,
      listId,
      date,
      description,
      starred,
      myDay,
      recurrence,
      ignore = false,
    }: {
      title: string;
      listId?: string;
      date?: Date;
      description?: string;
      starred?: boolean;
      myDay?: boolean;
      recurrence?: RecurrenceRule;
      ignore?: boolean;
    }): Promise<TaskDetailsType | undefined> => {
      try {
        // add task to backend
        const newObjectId = generateId();

        const response = await addTodoTaskAPI({
          _id: newObjectId,
          title,
          listId: listId || "",
          description: description || "",
          order: tasks.length,
          starred: starred || currentTab === "starred",
          myDay: myDay || currentTab === "myday",
          dueDate: date,
          recurrence: recurrence,
        });

        if (response.status !== 200) {
          throw new Error("Failed to add task");
        }

        const now = new Date();
        const resolvedStarred = starred || currentTab === "starred";
        const resolvedMyDay = myDay || currentTab === "myday";
        const d = response.data;

        const newTask: TaskDetailsType = {
          _id: d._id ?? newObjectId,
          title: d.title ?? title,
          status: d.status ?? "pending",
          starred: d.starred ?? resolvedStarred,
          myDay: d.myDay ?? resolvedMyDay,
          listId: d.listId ?? listId ?? "",
          order: d.order ?? tasks.length,
          createdAt: d.createdAt ? new Date(d.createdAt) : now,
          updatedAt: d.updatedAt ? new Date(d.updatedAt) : now,
          dueDate: d.dueDate ? new Date(d.dueDate) : date,
          recurrence: d.recurrence ?? recurrence ?? DefaultRecurrentRule,
          statistics: d.statistics ?? { finishedCount: 0, skippedCount: 0 },
          details: {
            description: d.details?.description ?? description ?? "",
            steps: [],
            descendants: [],
            attachments: d.details?.attachments ?? [],
          },
        };

        const rawTask: Task = {
          _id: d._id ?? newObjectId,
          title: d.title ?? title,
          status: d.status ?? "pending",
          starred: d.starred ?? resolvedStarred,
          myDay: d.myDay ?? resolvedMyDay,
          listId: d.listId ?? listId ?? "",
          order: d.order ?? tasks.length,
          createdAt: d.createdAt ? new Date(d.createdAt) : now,
          updatedAt: d.updatedAt ? new Date(d.updatedAt) : now,
          dueDate: d.dueDate ? new Date(d.dueDate) : date,
          description: d.details?.description ?? description ?? "",
          recurrence: d.recurrence ?? recurrence ?? DefaultRecurrentRule,
          statistics: d.statistics ?? { finishedCount: 0, skippedCount: 0 },
          steps: { completed: 0, uncompleted: 0 },
        };

        // Add task to state immediately (without steps)
        setTasks((prevTasks) => [...prevTasks, rawTask]);

        // Generate steps and description in the background
        setSuggestStepLoading(true);
        Promise.all([
          suggestStepAPI({
            taskId: newObjectId,
          }),
          suggestDescriptionAPI({
            taskId: newObjectId,
          }),
        ])
          .then(([suggestedSteps, suggestedDescription]) => {
            // Update tasks state with both steps and description
            setTasks((prevTasks) =>
              prevTasks.map((task) =>
                task._id === newObjectId
                  ? {
                    ...task,
                    ...(suggestedSteps.status === 200 && {
                      steps: {
                        completed: 0,
                        uncompleted: suggestedSteps.data.steps.length || 0,
                      },
                    }),
                    ...(suggestedDescription.status === 200 && {
                      description: suggestedDescription.data.description || "",
                    }),
                  }
                  : task
              )
            );
            // Update selectedTask ONLY if it's still the same task (user hasn't switched)
            // Using functional update to access current state value, avoiding stale closure
            // The check `prev._id !== newObjectId` ensures we don't update if user switched tasks
            setSelectedTask((prev) => {
              // If no task is selected, or user switched to a different task, don't update
              if (!prev || prev._id !== newObjectId) return prev;

              // Convert description to Slate descendants if description was suggested
              let descendants = prev.details.descendants;
              if (suggestedDescription.status === 200 && suggestedDescription.data.description) {
                descendants = convertMarkdownToSlate(suggestedDescription.data.description) || [];
              }

              // Only update if the selected task is still the one we just created
              const updatedTask = {
                ...prev,
                details: {
                  ...prev.details,
                  ...(suggestedSteps.status === 200 && {
                    steps: suggestedSteps.data.steps,
                  }),
                  ...(suggestedDescription.status === 200 && {
                    description: suggestedDescription.data.description || "",
                    descendants: descendants,
                  }),
                },
              };

              // Update descendantContent state if description was suggested
              if (suggestedDescription.status === 200 && suggestedDescription.data.description) {
                setDescendantContent(descendants);
                setDescendantContentTaskId(newObjectId);
              }

              return updatedTask;
            });
          })
          .catch((error) => {
            console.error("Failed to generate steps or description:", error);
            toast({
              title: "Failed to generate steps or description",
              description: "They will be available when you refresh",
              variant: "destructive",
            });
          })
          .finally(() => {
            setSuggestStepLoading(false);
          });

        // Return task immediately (without waiting for steps)
        return newTask;
      } catch (error) {
        handleApiError(error, "add task workflow");
      }
    },
    [tasks.length, currentTab, handleApiError, toast]
  );

  
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedTask) {
      // Find the corresponding task in the tasks array
      const updatedTask = tasks.find((task) => task._id === selectedTask._id);

      if (updatedTask) {
        // Update selectedTask with the new goal data, preserving the details object
        setSelectedTask((prev) => {
          if (!prev) return prev;

          // Check if any task properties have actually changed
          const hasChanges =
            prev.title !== updatedTask.title ||
            prev.status !== updatedTask.status ||
            prev.starred !== updatedTask.starred ||
            prev.myDay !== updatedTask.myDay ||
            prev.listId !== (updatedTask.listId || "") ||
            prev.order !== updatedTask.order ||
            prev.dueDate !== updatedTask.dueDate ||
            prev.finishedAt !== updatedTask.finishedAt ||
            prev.createdAt !== updatedTask.createdAt ||
            prev.updatedAt !== updatedTask.updatedAt;

          // Only update if there are actual changes to avoid unnecessary re-renders
          if (!hasChanges) return prev;

          // Exclude description and steps from Task since TaskDetails doesn't have them at top level
          const { description: ___, steps: ____, ...updatedTaskWithoutExcluded } = updatedTask;
          return {
            ...prev,
            ...updatedTaskWithoutExcluded,
            listId: updatedTask.listId || prev.listId || "",
            // Preserve the details object since it's not part of Task type
            details: prev.details,
          };
        });
      }
    }
  }, [tasks, selectedTask?._id]);

  // Update Electron progress bar based on selected task steps
  useEffect(() => {
    // Check if running in Electron
    if (typeof window === "undefined" || !window.electronAPI) {
      return;
    }

    if (selectedTask && selectedTask.details?.steps) {
      const steps = selectedTask.details.steps;
      const totalSteps = steps.length;

      if (totalSteps === 0) {
        // No steps, remove progress bar
        window.electronAPI.setProgressBar(-1);
      } else {
        // Calculate progress: completed steps / total steps
        const completedSteps = steps.filter(
          (step) => step.status === "completed"
        ).length;
        const progress = completedSteps / totalSteps;

        // Set progress bar (0 to 1)
        window.electronAPI.setProgressBar(progress);
      }
    } else {
      // No task selected, remove progress bar
      window.electronAPI.setProgressBar(-1);
    }
  }, [selectedTask?.details?.steps]);

  const appSchema: AppSchema = useMemo(() => {
    return {
      sidebar: {
        sections: [
          {
            id: "tasks",
            items: [
              {
                id: "calendar",
                title: "Calendar",
                icon: Calendar,
                onClick: () => handleTabChange("calendar"),
              },
              {
                id: "myday",
                title: "Focus",
                icon: Sun,
                onClick: () => handleTabChange("myday"),
              },
              {
                id: "starred",
                title: "Priority",
                icon: Star,
                onClick: () => handleTabChange("starred"),
              },
              {
                id: "finished",
                title: "Completed",
                icon: SquareCheckBig,
                onClick: () => handleTabChange("finished"),
              },
              {
                id: "task",
                title: "Tasks",
                icon: ListChecks,
                onClick: () => handleTabChange("task"),
              },
              {
                id: "kanban",
                title: "Kanban",
                icon: Columns3,
                isActive: currentTab === "kanban",
                onClick: () => handleTabChange("kanban"),
              },
            ],
          },
          {
            id: "lists",
            title: "Lists",
            items: [
              ...lists.map((list) => ({
                id: `list:${list._id}`,
                title: list.name,
                icon: list.planned ? Calendar : ListChecks,
                onClick: () => handleTabChange(`list:${list._id}`, list._id),
                contextMenu: [
                  menuItem({
                    label: list.planned
                      ? "Remove from Planning"
                      : "Add to Planning",
                    icon: list.planned ? ListChecks : Calendar,
                    onClick: () =>
                      handleEditList(list._id, {
                        planned: !list.planned,
                      }),
                  }),
                  menuItem({
                    label: "Rename",
                    icon: Pencil,
                    dialog: {
                      id: "rename-list",
                      data: {
                        listId: list._id,
                      },
                    },
                  }),
                  menuItem({
                    label: "Delete",
                    icon: Trash,
                    dialog: {
                      id: "delete-list",
                      data: {
                        listId: list._id,
                      },
                    },
                    variant: "destructive",
                  }),
                ],
              })),
              {
                id: "create-new-list",
                title: "Create new goal",
                icon: Plus,
                isDraggable: false,
                onClick: () =>
                  handleCreateList({
                    name: "New Goal",
                    planned: false,
                    ignore: false,
                  }),
              },
            ],
            type: "rowOrder+collapsible",
            reorder: handleDragEndLists,
          },
        ],
      },
      detail: {
        animationKey: "todolist_detail",
        body: (
          <>
            {taskLoading || initialLoaded.current ? (
              <TodoDetailSkeleton />
            ) : selectedTask ? (
              <TaskDetails task={selectedTask} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No task selected
                </p>
              </div>
            )}
          </>
        ),
      },
      dialogs: [
        {
          id: "rename-list",
          title: "Rename list",
          description: "Enter a new name for your list",
          type: "form",
          formProps: {
            formId: "rename-list",
            persistenceStrategy: "close",
            schemaConfig: {
              listName: {
                key: "listName",
                type: "input",
                display: "List Name",
                placeholder: "Enter list name",
                required: true,
                requiredMessage: "List name is required",
                minLength: 1,
                maxLength: 50,
                lengthHint: true,
                defaultValue: "",
                layout: "column",
                description: "Enter a new name for your list",
                hintMessage: "Maximum 50 characters",
              },
            },
          },
          actions: {
            primary: {
              id: "rename-list-action",
              label: "Rename",
              onClick: async (data?: DialogData) => {
                if (data?.dialogData?.listId && data?.formData?.listName) {
                  await onRenameList(
                    data.dialogData.listId,
                    data.formData.listName
                  );
                }
              },
            },
            close: {
              id: "cancel-rename-list-action",
              label: "Cancel",
            },
          },
        },
        {
          id: "delete-list",
          title: "Delete list",
          description:
            "This action cannot be undone. This will permanently delete your list and remove your data from our servers.",
          type: "alert",
          actions: {
            confirm: {
              id: "delete-list-action",
              label: "Delete",
              onClick: async (data?: DialogData) => {
                if (data?.dialogData?.listId) {
                  await handleDeleteList(data.dialogData.listId);
                }
              },
            },
            close: {
              id: "cancel-delete-list-action",
              label: "Cancel",
            },
          },
        },
      ],
    };
  }, [
    lists,
    currentTab,
    listId,
    selectedTask,
    taskLoading,
    handleCreateList,
    handleDeleteList,
    handleTabChange,
    handleSelectTask,
    handleDragEndLists,
    handleDragEndSteps,
    handleEditTask,
    handleEditStep,
    handleImageUpload,
    handleOnCloseTaskDetails,
    handleUpdateTodoListDescription,
    fetchTasksForWeek,
  ]);

  const value: exportedValue = useMemo(
    () => ({
      tasks,
      lists,
      title,
      listId,
      loading,
      taskLoading,
      inProgressTask,
      suggestStepLoading,
      selectedTask,
      currentTab,
      appSchema,
      onEditMode,
      setOnEditMode,
      // Functions
      setTasks,
      setLists,
      handleAddTask,
      handleDeleteTask,
      handlePromoteToTask,
      handleStatusChange,
      handleToggleMyDay,
      handleToggleStar,
      handleSuggestStep,
      handleReorderTasks,
      handleReorderCalendar,
      handleSelectList,
      handleCreateList,
      handleDeleteList,
      handleDeleteStep,
      handleAddNextStep,
      handleEditList,
      handleToggleStepComplete,
      onRenameList,
      handleDragEnd,
      handleDragEndSteps,
      handleTabChange,
      handleEditTask,
      handleEditStep,
      handleImageUpload,
      handleOnCloseTaskDetails,
      handleUpdateTodoListDescription,
      handleDragEndLists,
      handleSelectTask,
      fetchTasksForWeek,
      handleTaskWorkflow,
    }),
    [
      tasks,
      lists,
      title,
      listId,
      inProgressTask,
      loading,
      taskLoading,
      suggestStepLoading,
      selectedTask,
      currentTab,
      appSchema,
      onEditMode,
      setOnEditMode,
    ]
  );

  return (
    <TodoListContext.Provider value={value}>
      {children}
    </TodoListContext.Provider>
  );
}


export function useTodoList() {
  const context = useContext(TodoListContext);
  if (context === undefined) {
    throw new Error("useTodoList must be used within a TodoListProvider");
  }
  return context;
}
