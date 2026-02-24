import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTodoList } from "./provider/todolistProvider";
import TaskView, { TaskItem } from "./TaskView";
import { cn } from "$/utils";
import {
  getDateForDay,
  getDayIndexFromDate,
  isPast,
  isToday,
  formatDate,
  generateDateRange,
} from "./utils";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  DragMoveEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { ChevronLeft, ChevronRight, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import HyperchoTooltips from "$/components/UI/HyperchoTooltip";

interface UnifiedTaskViewProps {
  showSpecialTasks?: boolean;
}

type ViewMode = "special" | "planned";

export const UnifiedTaskView: React.FC<UnifiedTaskViewProps> = ({
  showSpecialTasks = true,
}) => {
  const {
    tasks,
    setTasks,
    lists,
    handleAddTask,
    handleEditTask,
    handleStatusChange,
    handleToggleStar,
    handleDeleteTask,
    handleCreateList,
    handleReorderCalendar,
    loading,
    fetchTasksForWeek,
    handleEditList,
    handleDeleteList,
  } = useTodoList();

  const [items, setItems] = useState<Record<string, any>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("special");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [editingLineIndex, setEditingLineIndex] = useState<{
    id: string;
    lineIndex: number;
    dayIndex?: number;
  } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [initialItems, setInitialItems] = useState<Record<string, any>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate initial week key inside the component
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const initialWeekKey = React.useMemo(() => {
    const initialBaseDate = new Date();
    const initialStartDate = getStartOfWeek(initialBaseDate);
    const initialEndDate = new Date(initialStartDate);
    initialEndDate.setDate(initialStartDate.getDate() + 6);
    return `${initialStartDate.toISOString()}_${initialEndDate.toISOString()}`;
  }, []);

  const [fetchedWeeks, setFetchedWeeks] = useState<Set<string>>(
    () => new Set([initialWeekKey])
  );

  // Create a callback ref function
  const setInputRef = useCallback(
    (id: string) => (el: HTMLInputElement | null) => {
      inputRefs.current[id] = el;
    },
    []
  );

  // Calculate start and end date based on weekOffset and group tasks
  useEffect(() => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + weekOffset * 7);
    const startDate = getStartOfWeek(baseDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const grouped: Record<string, typeof tasks> = {};
    const dateRange = generateDateRange(startDate, endDate);

    // Ensure dateRange is valid before processing
    if (dateRange && dateRange.length > 0) {
      dateRange.forEach((date) => {
        if (date) {
          grouped[date.toISOString().split("T")[0]] = [];
        }
      });
    }

    // Add list containers
    lists.forEach((l) => (grouped[l._id] = []));

    // Group tasks by date or list
    tasks.forEach((t) => {
      if (t.listId) {
        // Only push if the list exists (might be deleted)
        if (grouped[t.listId]) {
          grouped[t.listId].push(t);
        }
      } else if (t.dueDate) {
        const dueDate =
          t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const dateKey = dueDate.toISOString().split("T")[0];
        if (grouped[dateKey]) {
          grouped[dateKey].push(t);
        } else {
          grouped[dateKey] = [t];
        }
      }
    });

    // Sort tasks in each group
    Object.values(grouped).forEach((arr) =>
      arr.sort((a, b) =>
        a.status !== b.status
          ? a.status === "completed"
            ? 1
            : -1
          : a.order - b.order
      )
    );

    setItems((prev) => {
      const newItemsStr = JSON.stringify(grouped);
      const prevItemsStr = JSON.stringify(prev);
      return newItemsStr !== prevItemsStr ? grouped : prev;
    });

    const shadowClone = Object.fromEntries(
      Object.entries(grouped).map(([key, value]) => [key, [...value]])
    );

    setInitialItems(shadowClone);
    setStartDate(startDate);
    setEndDate(endDate);
    setInitialLoading(false);
  }, [tasks, lists, weekOffset]);

  // Fetch additional tasks when navigating to different weeks
  useEffect(() => {
    if (initialLoading) return;
    if (!startDate || !endDate) return;

    const weekKey = `${startDate.toISOString()}_${endDate.toISOString()}`;

    if (!fetchedWeeks.has(weekKey)) {
      const fetchAdditionalTasks = async () => {
        try {
          const fetchedTasks = await fetchTasksForWeek(startDate, endDate);
          setFetchedWeeks((prev) => {
            const newSet = new Set(prev);
            newSet.add(weekKey);
            return newSet;
          });
          const allTasks = [...tasks, ...fetchedTasks].sort((a, b) => {
            if (a.status !== b.status) {
              return a.status === "completed" ? 1 : -1;
            }
            return a.order - b.order;
          });

          setTasks(allTasks);
        } catch (error) {
          console.error("Failed to fetch additional tasks:", error);
        }
      };

      fetchAdditionalTasks();
    }
  }, [
    startDate,
    endDate,
    initialLoading,
    weekOffset,
    fetchedWeeks,
    setTasks,
    fetchTasksForWeek,
    tasks,
  ]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingLineIndex && inputRefs.current[editingLineIndex.id]) {
      inputRefs.current[editingLineIndex.id]?.focus();
    }
  }, [editingLineIndex]);

  // Handle line click to start editing - ALWAYS use lineIndex 0 (first line)
  const handleLineClick = useCallback(
    (id: string, lineIndex: number, dayIndex?: number) => {
      // Always set to first line (lineIndex 0) regardless of which line was clicked
      setEditingLineIndex({ id, lineIndex: 0, dayIndex });
    },
    []
  );

  // Handle input blur to save or cancel
  const handleInputBlur = useCallback(
    async (newTaskTitle: string) => {
      if (!editingLineIndex) return;

      if (newTaskTitle.trim()) {
        try {
          let response: any;
          let key: string;
          if (
            editingLineIndex.dayIndex === undefined &&
            (viewMode === "special" || viewMode === "planned")
          ) {
            response = await handleAddTask({
              title: newTaskTitle,
              listId: editingLineIndex.id,
            });
            key = editingLineIndex.id;
          } else {
            // This is a day-based task - set planned and due date
            const dueDate =
              editingLineIndex.dayIndex !== undefined
                ? getDateForDay(editingLineIndex.dayIndex)
                : new Date(); // Set to end of current day

            dueDate.setHours(0, 0, 0, 0);

            response = await handleAddTask({
              title: newTaskTitle,
              date: dueDate,
            });
            key = dueDate.toISOString().split("T")[0];
          }
        } catch (error) {
          console.error("Failed to add task:", error);
        }
      }

      setEditingLineIndex(null);
    },
    [editingLineIndex, handleAddTask, viewMode]
  );

  // Handle input key press
  const handleInputKeyPress = useCallback(
    (e: React.KeyboardEvent, newTaskTitle: string) => {
      if (e.key === "Enter") {
        handleInputBlur(newTaskTitle);
      } else if (e.key === "Escape") {
        setEditingLineIndex(null);
      }
    },
    [handleInputBlur]
  );

  const handleToggleStarTask = useCallback(
    (key: string, taskId: string) => {
      handleToggleStar(taskId);
    },
    [handleToggleStar]
  );

  const handleEditTaskClick = useCallback(
    (key: string, taskId: string, newTitle: string) => {
      handleEditTask(taskId, { title: newTitle });
    },
    [handleEditTask]
  );

  const handleDeleteTaskClick = useCallback(
    (key: string, taskId: string) => {
      handleDeleteTask(taskId);
    },
    [handleDeleteTask]
  );

  const handleCreateListHandler = useCallback(
    async (planned?: boolean) => {
      const id = await handleCreateList({ planned });
    },
    [handleCreateList]
  );

  const handleDeleteListHandler = useCallback(
    (id: string) => {
      handleDeleteList(id);
    },
    [handleDeleteList]
  );

  const handleEditListHandler = useCallback(
    (id: string, fieldsToUpdate: Record<string, any>) => {
      handleEditList(id, fieldsToUpdate);
    },
    [handleEditList]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // don't start drag until pointer moves ≥5px
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const { id } = active;
    setActiveTaskId(id as string);
  };

  // Helper function to find which container a task belongs to
  const findContainerIdForTask = (taskId: string): string | null => {
    for (const [containerId, containerTasks] of Object.entries(items)) {
      const task = containerTasks.find((task: any) => task._id === taskId);
      if (task) {
        return containerId;
      }
    }
    return null;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;

    // Handle Items Sorting
    if (
      active.data.current?.type === "item" &&
      over?.data.current?.type === "item" &&
      active &&
      over &&
      active.id !== over.id
    ) {
      // Find the active container and over container
      const activeContainer = findContainerIdForTask(active.id as string);
      const overContainer = findContainerIdForTask(over.id as string);

      // If the active or over container is not found, return
      if (!activeContainer || !overContainer) return;

      // Find the index of the active and over item
      const activeitemIndex = items[activeContainer]?.findIndex(
        (item: any) => item._id === active.id
      );
      const overitemIndex = items[overContainer]?.findIndex(
        (item: any) => item._id === over.id
      );

      // In the same container
      if (activeContainer === overContainer) {
        let newItems = { ...items };
        newItems[activeContainer] = arrayMove(
          newItems[activeContainer],
          activeitemIndex,
          overitemIndex
        );

        setItems(newItems);
      } else {
        // In different containers
        let newItems = { ...items };
        const removedItems = [...newItems[activeContainer]];
        const [removeditem] = removedItems.splice(activeitemIndex, 1);
        const addedItems = [...newItems[overContainer]];
        addedItems.splice(overitemIndex, 0, removeditem);

        newItems[activeContainer] = removedItems;
        newItems[overContainer] = addedItems;
        setItems(newItems);
      }
    }

    // Handling Item Drop Into a Container
    if (
      active.data.current?.type === "item" &&
      over?.data.current?.type === "container" &&
      active &&
      over &&
      active.id !== over.id
    ) {
      // Find the active and over container
      const activeContainer = findContainerIdForTask(active.id as string);
      const overContainer = over.id;

      // If the active or over container is not found, return
      if (!activeContainer || !overContainer) return;

      // Find the index of the active and over item
      const activeitemIndex = items[activeContainer]?.findIndex(
        (item: any) => item._id === active.id
      );

      // Remove the active item from the active container and add it to the over container
      let newItems = { ...items };
      const [removeditem] = newItems[activeContainer].splice(
        activeitemIndex,
        1
      );

      newItems[overContainer].push(removeditem);
      setItems(newItems);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    let newItems = { ...items };
    // Handling Container Sorting
    if (
      active.data.current?.type === "container" &&
      over?.data.current?.type === "container" &&
      active &&
      over &&
      active.id !== over.id
    ) {
      //move containers indexes
      newItems[active.id] = newItems[over.id];
      newItems[over.id] = newItems[active.id];
      setItems(newItems);
    }

    // Handling item Sorting
    if (
      active.data.current?.type === "item" &&
      over?.data.current?.type === "item" &&
      active &&
      over &&
      active.id !== over.id
    ) {
      // Find the active and over container
      const activeContainer = findContainerIdForTask(active.id as string);
      const overContainer = findContainerIdForTask(over.id as string);

      // If the active or over container is not found, return
      if (!activeContainer || !overContainer) return;

      // Find the index of the active and over item
      const activeitemIndex = items[activeContainer]?.findIndex(
        (item: any) => item._id === active.id
      );
      const overitemIndex = items[overContainer]?.findIndex(
        (item: any) => item._id === over.id
      );

      // In the same container
      if (activeContainer === overContainer) {
        newItems = { ...items };
        newItems[activeContainer] = arrayMove(
          newItems[activeContainer],
          activeitemIndex,
          overitemIndex
        );
        newItems[activeContainer] = newItems[activeContainer].sort(
          (a: any, b: any) =>
            (a.status === "completed") !== (b.status === "completed")
              ? a.status === "completed"
                ? 1
                : -1
              : 0
        );
        setItems(newItems);
      } else {
        // In different containers
        newItems = { ...items };
        const removedItems = [...newItems[activeContainer]];
        const [removeditem] = removedItems.splice(activeitemIndex, 1);
        const addedItems = [...newItems[overContainer]];
        addedItems.splice(overitemIndex, 0, removeditem);

        newItems[activeContainer] = removedItems;
        newItems[overContainer] = addedItems;
        newItems[overContainer] = newItems[overContainer].sort(
          (a: any, b: any) =>
            (a.status === "completed") !== (b.status === "completed")
              ? a.status === "completed"
                ? 1
                : -1
              : 0
        );
        setItems(newItems);
      }
    }
    // Handling item dropping into Container
    if (
      active.data.current?.type === "item" &&
      over?.data.current?.type === "container" &&
      active &&
      over &&
      active.id !== over.id
    ) {
      // Find the active and over container
      const activeContainer = findContainerIdForTask(active.id as string);
      const overContainer = over.id;

      // If the active or over container is not found, return
      if (!activeContainer || !overContainer) return;
      // Find the index of the active and over item
      const activeitemIndex = items[activeContainer]?.findIndex(
        (item: any) => item._id === active.id
      );

      newItems = { ...items };
      const [removeditem] = newItems[activeContainer].splice(
        activeitemIndex,
        1
      );
      newItems[overContainer].push(removeditem);
      newItems[overContainer] = newItems[overContainer].sort((a: any, b: any) =>
        (a.status === "completed") !== (b.status === "completed")
          ? a.status === "completed"
            ? 1
            : -1
          : 0
      );
      setItems(newItems);
    }
    setActiveTaskId(null);

    if (JSON.stringify(initialItems) !== JSON.stringify(newItems)) {
      const newItemsToSend = Object.fromEntries(
        Object.entries(newItems).map(([key, value]) => [
          key,
          value.map((item: any) => item._id),
        ])
      );
      handleReorderCalendar(newItemsToSend);
    }
  };

  return (
    <div className="w-full h-full relative grid grid-rows-[auto_1fr]">
      {/* Week Navigation */}
      <div className="absolute w-full top-0 left-0 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setWeekOffset((prev) => prev - 1)}
          aria-label="Previous week"
          className="w-fit h-fit p-1"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setWeekOffset((prev) => prev + 1)}
          aria-label="Next week"
          className="w-fit h-fit p-1"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      {/* Weekly Grid - 54vh */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <SortableContext items={[...Object.keys(items)]}>
          <div className="max-h-[60vh] grid grid-cols-7 gap-3 w-full mx-auto">
            {startDate &&
              endDate &&
              generateDateRange(startDate, endDate).map((date, idx) => {
                const isTodayDate = isToday(date);
                const isPastDate = isPast(date);
                const dayTasks = items[date.toISOString().split("T")[0]] || [];

                return (
                  <TaskView
                    key={date.toISOString().split("T")[0]}
                    id={date.toISOString().split("T")[0]}
                    animationDelay={idx + 1}
                    title={getDayIndexFromDate(date) || "Day"}
                    description={formatDate(date)}
                    tasks={dayTasks}
                    isToday={isTodayDate}
                    isPast={isPastDate}
                    editingLineIndex={editingLineIndex}
                    handleDeleteListHandler={() => {}}
                    handleEditListHandler={() => {}}
                    onLineClick={(id, lineIndex) =>
                      handleLineClick(id, lineIndex, idx)
                    }
                    className="min-h-[60vh]"
                    onInputBlur={handleInputBlur}
                    onInputKeyPress={handleInputKeyPress}
                    onToggleStar={handleToggleStarTask}
                    onEditTask={handleEditTaskClick}
                    onDeleteTask={handleDeleteTaskClick}
                    setInputRef={setInputRef}
                  />
                );
              })}
          </div>

          {/* Tab Section - 46vh */}
          {showSpecialTasks && (
            <div className="flex-1 min-h-0 border-solid border-t border-border border-b-0 border-r-0 border-l-0 flex flex-col">
              {/* Tab Bar */}
              <div className="flex items-end justify-start pt-4 pb-0 border-none">
                <div className="flex items-center gap-0 relative">
                  {/* MY LISTS Tab */}
                  <button
                    onClick={() => setViewMode("special")}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold flex items-center gap-1 transition-all border-b-2",
                      viewMode === "special"
                        ? "text-black dark:text-white border-[#a259ff] border-b-2"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                  >
                    MY LISTS
                  </button>
                  {/* Divider */}
                  <div className="h-5 w-px bg-border mx-1" />
                  {/* PLANNING Tab */}
                  <button
                    onClick={() => {
                      setViewMode("planned");
                    }}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold flex items-center gap-1 transition-all border-b-2",
                      viewMode === "planned"
                        ? "text-black dark:text-white border-[#a259ff] border-b-2"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                  >
                    PLANNING
                  </button>

                  <HyperchoTooltips value="Create a new goal">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        handleCreateListHandler(viewMode === "planned")
                      }
                      className="h-fit w-fit p-1"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </Button>
                  </HyperchoTooltips>
                </div>
              </div>

              {/* List Columns or Planned View */}
              <div className="flex-1 min-h-0 overflow-x-auto customScrollbar2 grid grid-cols-7 w-full">
                {viewMode === "special" &&
                  (lists && lists.length > 0 ? (
                    lists
                      .filter((list) => !list.planned)
                      .map((list, index) => {
                        const listTasks = items[list._id] ?? [];
                        return (
                          <TaskView
                            key={list._id}
                            id={list._id}
                            animationDelay={8 + index}
                            title={list.name}
                            description=""
                            tasks={listTasks}
                            list={list}
                            isToday={false}
                            isPast={false}
                            editingLineIndex={editingLineIndex}
                            onLineClick={(id, lineIndex) =>
                              handleLineClick(id, lineIndex)
                            }
                            handleEditListHandler={handleEditListHandler}
                            handleDeleteListHandler={handleDeleteListHandler}
                            onInputBlur={handleInputBlur}
                            onInputKeyPress={handleInputKeyPress}
                            onToggleStar={handleToggleStarTask}
                            onEditTask={handleEditTaskClick}
                            onDeleteTask={handleDeleteTaskClick}
                            setInputRef={setInputRef}
                          />
                        );
                      })
                  ) : loading ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <p className="text-sm">Loading lists...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <p className="text-sm">No lists found</p>
                        <p className="text-xs mb-4">
                          Create a new goal to get started
                        </p>
                        <button
                          onClick={() => handleCreateListHandler(false)}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                        >
                          Create New Goal
                        </button>
                      </div>
                    </div>
                  ))}
                {viewMode === "planned" &&
                  (lists && lists.length > 0 ? (
                    lists
                      .filter((list) => list.planned)
                      .map((list, index) => {
                        const listTasks = items[list._id] ?? [];
                        return (
                          <TaskView
                            key={list._id}
                            id={list._id}
                            animationDelay={8 + index}
                            title={list.name}
                            description=""
                            tasks={listTasks}
                            list={list}
                            isToday={false}
                            isPast={false}
                            handleEditListHandler={handleEditListHandler}
                            editingLineIndex={editingLineIndex}
                            handleDeleteListHandler={handleDeleteListHandler}
                            onLineClick={(id, lineIndex) =>
                              handleLineClick(id, lineIndex)
                            }
                            onInputBlur={handleInputBlur}
                            onInputKeyPress={handleInputKeyPress}
                            onToggleStar={handleToggleStarTask}
                            onEditTask={handleEditTaskClick}
                            onDeleteTask={handleDeleteTaskClick}
                            setInputRef={setInputRef}
                          />
                        );
                      })
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <p className="text-sm">No goals found</p>
                        <p className="text-xs mb-4">
                          Create a new goal to get started
                        </p>
                        <button
                          onClick={() => handleCreateListHandler(true)}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                        >
                          Create New Goal
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </SortableContext>
        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeTaskId && (
            <div className="w-[90px] pointer-events-none">
              <TaskItem
                task={tasks.find((t) => t._id === activeTaskId)!}
                id={activeTaskId}
                onEditTask={() => {}}
                onDeleteTask={() => {}}
                isOverlay
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default UnifiedTaskView;
