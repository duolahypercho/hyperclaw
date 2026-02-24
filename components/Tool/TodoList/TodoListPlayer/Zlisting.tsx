"use client";

import { AnimatePresence, motion } from "framer-motion";
import { closestCenter, DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTodoList } from "../provider/todolistProvider";
import TodoListSkeleton from "$/components/Skelenton/TodoList";
import { TaskList } from "./TaskList";
import { SpecificList } from "./ZSpecificList";
import {
  ListChecks,
  Star,
  Calendar,
  Sun,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { IoMdCheckbox, IoMdCheckboxOutline } from "react-icons/io";
import ZSidebarDropdown from "$/components/UI/ZDropdown";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { List } from "../types";
import { AlertDelete } from "$/components/UI/AlertDelete";
import TodoDetailSkeleton from "$/components/Skelenton/TodoDetail";
import TaskDetails from "../TaskDetails";

export const TodoListContainerLayout = ({
  children,
  headerOff,
}: {
  children: React.ReactNode;
  headerOff?: boolean;
}) => {
  const {
    handleDragEnd,
    handleDeleteList: onDeleteList,
    onRenameList,
  } = useTodoList();
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const [listToRename, setListToRename] = useState<List | null>(null);

  const handleRename = () => {
    if (listToRename && newListName.trim() !== "") {
      onRenameList(listToRename._id, newListName.trim());
      setIsRenameDialogOpen(false);
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="max-w-3xl w-full h-full overflow-hidden mx-auto flex flex-col">
        <MainBody
          headerOff={headerOff}
          setDeleteListId={setDeleteListId}
          setListToRename={setListToRename}
          setIsRenameDialogOpen={setIsRenameDialogOpen}
          setNewListName={setNewListName}
          setDeleteDialogOpen={setDeleteDialogOpen}
        >
          {children}
        </MainBody>
      </div>
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="bg-background border-primary/10 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rename List</DialogTitle>
          </DialogHeader>
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="bg-background border-primary/10 text-foreground placeholder-foreground/50"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              className="bg-transparent text-foreground hover:bg-secondary/70 hover:text-hover"
              onClick={() => setIsRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={"primary"}
              onClick={handleRename}
              className="bg-primary text-primary-foreground hover:bg-primary/70"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDelete
        dialogTitle="Are you absolutely sure?"
        dialogDescription="This action cannot be undone. This will permanently delete your list and remove your data from our servers."
        deleteButtonTitle="Continue"
        showDialog={deleteDialogOpen}
        setShowDialog={setDeleteDialogOpen}
        onDelete={() => {
          if (deleteListId) {
            onDeleteList(deleteListId);
          } else {
            throw new Error("No list id to delete");
          }
        }}
      >
        <></>
      </AlertDelete>
    </DndContext>
  );
};

export const TabsContainer = ({ headerOff }: { headerOff?: boolean }) => {
  const { currentTab, tasks, loading, lists, listId } = useTodoList();

  if (loading) {
    return (
      <TodoListContainerLayout>
        <TodoListSkeleton />
      </TodoListContainerLayout>
    );
  }

  if (currentTab.includes("list")) {
    const unfinishedTasks = tasks.filter(
      (task) => task.status !== "completed" && task.listId === listId
    );
    const finishedTasks = tasks.filter(
      (task) => task.status === "completed" && task.listId === listId
    );
    return (
      <TodoListContainerLayout headerOff={headerOff}>
        <SortableContext items={unfinishedTasks.map((task) => task._id)}>
          <TaskList
            list={lists.find((list) => list._id === listId) || lists[0]}
            title={
              lists.find((list) => list._id === listId)?.name || lists[0].name
            }
            unfinishedTasks={unfinishedTasks}
            finishedTasks={finishedTasks}
          />
        </SortableContext>
      </TodoListContainerLayout>
    );
  } else if (currentTab === "starred") {
    const unfinishedStarredTasks = tasks.filter(
      (task) => task.status !== "completed" && task.starred
    );
    const finishedStarredTasks = tasks.filter(
      (task) => task.status === "completed" && task.starred
    );
    return (
      <TodoListContainerLayout headerOff={headerOff}>
        <SortableContext items={unfinishedStarredTasks.map((task) => task._id)}>
          <SpecificList
            key={"starred"}
            title={"Priority"}
            unfinishedTasks={unfinishedStarredTasks}
            finishedTasks={finishedStarredTasks}
          />
        </SortableContext>
      </TodoListContainerLayout>
    );
  } else if (currentTab === "finished") {
    return (
      <TodoListContainerLayout headerOff={headerOff}>
        <SpecificList
          key={"finished"}
          title={"Completed"}
          unfinishedTasks={[]}
          finishedTasks={tasks}
        />
      </TodoListContainerLayout>
    );
  } else if (currentTab === "myday") {
    const unfinishedMyDayTasks = tasks.filter(
      (task) => task.status !== "completed" && task.myDay
    );
    const finishedMyDayTasks = tasks.filter(
      (task) => task.status === "completed" && task.myDay
    );
    return (
      <TodoListContainerLayout headerOff={headerOff}>
        <SortableContext items={unfinishedMyDayTasks.map((task) => task._id)}>
          <SpecificList
            key={"myday"}
            title={"Today"}
            unfinishedTasks={unfinishedMyDayTasks}
            finishedTasks={finishedMyDayTasks}
          />
        </SortableContext>
      </TodoListContainerLayout>
    );
  } else if (currentTab === "task") {
    const unfinishedTasks = tasks.filter(
      (task) =>
        task.status !== "completed" && (!task.listId || task.listId === "")
    );
    const finishedTasks = tasks.filter(
      (task) =>
        task.status === "completed" && (!task.listId || task.listId === "")
    );
    return (
      <TodoListContainerLayout headerOff={headerOff}>
        <SortableContext items={unfinishedTasks.map((task) => task._id)}>
          <SpecificList
            key={"task"}
            title={"Task"}
            unfinishedTasks={unfinishedTasks}
            finishedTasks={finishedTasks}
          />
        </SortableContext>
      </TodoListContainerLayout>
    );
  }
  return <></>;
};

const MainBody = ({
  children,
  setDeleteListId,
  setListToRename,
  setIsRenameDialogOpen,
  setNewListName,
  setDeleteDialogOpen,
  headerOff,
}: {
  children: React.ReactNode;
  setDeleteListId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsRenameDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNewListName: React.Dispatch<React.SetStateAction<string>>;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setListToRename: React.Dispatch<React.SetStateAction<List | null>>;
  headerOff?: boolean;
}) => {
  const {
    title,
    currentTab,
    lists,
    handleTabChange: onTabChange,
    handleCreateList: onCreateList,
    listId,
    selectedTask,
    taskLoading,
  } = useTodoList();

  const [showDropdown, setShowDropdown] = useState(false);

  const buttonItems = useMemo(
    () => [
      {
        name: "Today",
        tab: "myday",
        icon: (
          <Sun
            className={`mr-2 h-3 w-3 ${
              currentTab === "myday"
                ? "text-orange-500 fill-orange-500 dark:text-yellow-400 dark:fill-yellow-400"
                : ""
            }`}
          />
        ),
        onClick: () => onTabChange("myday"),
        className: `w-full text-xs justify-start ${
          currentTab === "myday" ? "bg-primary/10 text-foreground/80" : ""
        }`,
      },
      {
        name: "Priority",
        tab: "starred",
        icon: (
          <Star
            className="mr-2 h-3 w-3"
            fill={currentTab === "starred" ? "rgb(250, 204,21)" : "transparent"}
            color={currentTab === "starred" ? "rgb(250, 204,21)" : undefined}
          />
        ),
        onClick: () => onTabChange("starred"),
        className: `w-full text-xs justify-start ${
          currentTab === "starred" ? "bg-primary/10 text-foreground/80" : ""
        }`,
      },
      {
        name: "Completed",
        tab: "finished",
        icon:
          currentTab === "finished" ? (
            <IoMdCheckbox className="mr-2 h-3 w-3" />
          ) : (
            <IoMdCheckboxOutline className="mr-2 h-3 w-3" />
          ),
        onClick: () => onTabChange("finished"),
        className: `w-full text-xs justify-start ${
          currentTab === "finished" ? "bg-primary/10 text-foreground/80" : ""
        }`,
      },
      {
        name: "Tasks",
        tab: "task",
        icon: (
          <ListChecks
            className={`mr-2 h-3 w-3 ${
              currentTab === "task" ? "text-foreground" : ""
            }`}
          />
        ),
        onClick: () => onTabChange("task"),
        className: `w-full text-xs justify-start ${
          currentTab === "task" ? "bg-primary/10 text-foreground/80" : ""
        }`,
      },
      {
        name: "Lists",
        tab: "list",
        icon: (
          <ListChecks
            className={`mr-2 h-3 w-3  ${
              currentTab.includes("list") ? "text-foreground" : ""
            }`}
          />
        ),
        className: `w-full text-xs justify-start text-muted-foreground ${
          currentTab.includes("list") ? "bg-primary/10 text-foreground/80" : ""
        }`,
        subItems: [
          ...lists.map((list) => ({
            children: (
              <>
                {list.planned ? (
                  <Calendar className="mr-2 h-4 w-4" />
                ) : (
                  <ListChecks className="mr-2 h-4 w-4" />
                )}
                {list.name}
              </>
            ),
            onClick: () => onTabChange("list", list._id),
            className: `w-full text-xs justify-start text-muted-foreground ${
              listId === list._id ? "bg-primary/10 text-foreground/80" : ""
            }`,
          })),
          {
            children: (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create New Goal
              </>
            ),
            onClick: () =>
              onCreateList({
                name: "New Goal",
                planned: false,
                ignore: false,
              }),
            className: "w-full text-xs justify-start text-muted-foreground",
          },
        ],
      },
    ],
    [lists, currentTab, listId, onTabChange, onCreateList]
  );

  const openRenameDialog = (list: List) => {
    setListToRename(list);
    setNewListName(list.name);
    setIsRenameDialogOpen(true);
  };

  // Add null check for selectedTask and ensure proper loading state handling
  if (taskLoading) {
    return (
      <TodoDetailSkeleton
        classNames={{
          container: "bg-transparent",
          textArea: "bg-transparent",
        }}
      />
    );
  }

  if (!selectedTask && !taskLoading)
    return (
      <>
        {!headerOff && (
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-3 flex-1">
              <ZSidebarDropdown
                type="AlignJustify"
                title="Tasks"
                items={buttonItems.map((item) => ({
                  itemChild: {
                    children: (
                      <>
                        {item.icon}
                        {item.name}
                      </>
                    ),
                    title: item.tab,
                    className: item.className,
                    subItems: item.subItems,
                  },
                  onClick: item.onClick,
                }))}
                classNames={{
                  button: "p-0",
                  content: "w-48",
                  subContent: "w-48",
                }}
              />
              <h2 className="text-base font-medium text-foreground">{title}</h2>
            </div>
            {currentTab.includes("list") && listId && (
              <ZSidebarDropdown
                title="Action"
                showDialog={showDropdown}
                setShowDialog={setShowDropdown}
                items={[
                  {
                    itemChild: {
                      children: (
                        <>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename list
                        </>
                      ),
                      className: "hover:bg-primary/20 text-foreground",
                    },
                    onClick: () => {
                      const list = lists.find((list) => list._id === listId);
                      if (list) {
                        setShowDropdown(false);
                        openRenameDialog(list);
                      }
                    },
                  },
                  {
                    itemChild: {
                      children: (
                        <div
                          className="flex flex-row items-center w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDropdown(false);
                            setDeleteDialogOpen(true);
                            setDeleteListId(listId);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                        </div>
                      ),
                      className:
                        "text-red-400 hover:bg-primary/20 hover:text-red-400",
                    },
                  },
                ]}
                classNames={{
                  button: "p-0",
                  content: "w-48",
                  subContent: "w-48",
                }}
                align="end"
              />
            )}
          </div>
        )}
        <div className="flex-1 overflow-hidden">{children}</div>
      </>
    );

  if (!selectedTask) {
    return null;
  }

  return (
    <div className="flex-1 overflow-hidden overflow-y-auto customScrollbar2">
      <TaskDetails
        task={selectedTask}
        classNames={{
          container: "bg-transparent p-0",
          textArea: "bg-transparent",
          button: "bg-transparent",
        }}
      />
    </div>
  );
};
