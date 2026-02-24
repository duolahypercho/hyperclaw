"use client";

import { closestCenter, DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { TaskList } from "./TaskList";
import { SpecificList } from "./Specific";
import { useTodoList } from "./provider/todolistProvider";
import TodoListSkeleton from "../../Skelenton/TodoList";
import { InteractApp } from "@OS/InteractApp";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import { WeeklyView } from "./weeklyView";
import KanbanBoard from "./KanbanBoard";

export const TodoListContainerLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { handleDragEnd } = useTodoList();
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="max-w-3xl w-full mx-auto">{children}</div>
    </DndContext>
  );
};

export const TabsContainer = () => {
  const { tasks, loading, lists } = useTodoList();

  if (loading) {
    return (
      <TodoListContainerLayout>
        <TodoListSkeleton />
      </TodoListContainerLayout>
    );
  }

  return (
    <>
      {lists.map((list) => (
        <InteractContent value={`list:${list._id}`} key={list._id}>
          {(() => {
            const unfinishedTasks = tasks.filter(
              (task) => task.status !== "completed" && task.listId === list._id
            );
            const finishedTasks = tasks.filter(
              (task) => task.status === "completed" && task.listId === list._id
            );
            return (
              <TodoListContainerLayout>
                <SortableContext
                  items={unfinishedTasks.map((task) => task._id)}
                >
                  <TaskList
                    list={list}
                    title={list.name}
                    unfinishedTasks={unfinishedTasks}
                    finishedTasks={finishedTasks}
                  />
                </SortableContext>
              </TodoListContainerLayout>
            );
          })()}
        </InteractContent>
      ))}
      <InteractContent value="starred">
        {(() => {
          const unfinishedStarredTasks = tasks.filter(
            (task) => task.status !== "completed" && task.starred
          );
          const finishedStarredTasks = tasks.filter(
            (task) => task.status === "completed" && task.starred
          );
          return (
            <TodoListContainerLayout>
              <SortableContext
                items={unfinishedStarredTasks.map((task) => task._id)}
              >
                <SpecificList
                  key={"starred"}
                  title={"Priority"}
                  unfinishedTasks={unfinishedStarredTasks}
                  finishedTasks={finishedStarredTasks}
                />
              </SortableContext>
            </TodoListContainerLayout>
          );
        })()}
      </InteractContent>
      <InteractContent value="finished">
        <TodoListContainerLayout>
          <SpecificList
            key={"finished"}
            title={"Completed"}
            unfinishedTasks={[]}
            finishedTasks={tasks}
          />
        </TodoListContainerLayout>
      </InteractContent>
      <InteractContent value="myday">
        {(() => {
          const unfinishedMyDayTasks = tasks.filter(
            (task) => task.status !== "completed" && task.myDay
          );
          const finishedMyDayTasks = tasks.filter(
            (task) => task.status === "completed" && task.myDay
          );
          return (
            <TodoListContainerLayout>
              <SortableContext
                items={unfinishedMyDayTasks.map((task) => task._id)}
              >
                <SpecificList
                  key={"myday"}
                  title={"Today"}
                  unfinishedTasks={unfinishedMyDayTasks}
                  finishedTasks={finishedMyDayTasks}
                />
              </SortableContext>
            </TodoListContainerLayout>
          );
        })()}
      </InteractContent>
      <InteractContent value="task">
        {(() => {
          const unfinishedTasks = tasks.filter(
            (task) =>
              task.status !== "completed" && (!task.listId || task.listId === "")
          );
          const finishedTasks = tasks.filter(
            (task) =>
              task.status === "completed" &&
              (!task.listId || task.listId === "")
          );
          return (
            <TodoListContainerLayout>
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
        })()}
      </InteractContent>
    </>
  );
};

export default function Component() {
  const { appSchema, currentTab } = useTodoList();

  return (
    <InteractApp appSchema={appSchema} className="p-3">
      <InteractContent value="calendar">
        <WeeklyView />
      </InteractContent>
      <InteractContent value="kanban">
        <KanbanBoard />
      </InteractContent>
      {currentTab !== "calendar" && currentTab !== "kanban" && (
        <TabsContainer />
      )}
    </InteractApp>
  );
}
