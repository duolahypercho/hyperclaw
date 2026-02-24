import React, { useMemo } from "react";
import { TaskDetails as TaskDetailsType } from "./types";
import { useTodoList } from "./provider/todolistProvider";
import { AddTaskForm } from "./AddTaskForm";
import { TASK_PLACEHOLDERS } from "./hooks/useAddTaskForm";

interface AddTaskInputProps {
  activeListId?: string;
  classNames?: {
    form?: string;
    textarea?: string;
    select?: string;
    button?: string;
    functionContainer?: string;
  };
  onTaskCreated?: (task: TaskDetailsType) => void;
  onWorkflowStart?: (taskTitle: string) => void;
  workflow?: boolean;
}

const AddTaskInput = ({
  activeListId,
  classNames,
  onTaskCreated,
  onWorkflowStart,
  workflow = false,
}: AddTaskInputProps) => {
  const { lists, handleAddTask: onAddTask, handleTaskWorkflow } = useTodoList();
  const placeholder = useMemo(
    () =>
      TASK_PLACEHOLDERS[Math.floor(Math.random() * TASK_PLACEHOLDERS.length)],
    []
  );

  const handleSubmit = async (params: {
    title: string;
    description?: string;
    date?: Date;
    starred: boolean;
    myDay: boolean;
    listId?: string;
  }) => {
    if (workflow) {
      // Notify parent that workflow is starting (so it can show loading state)
      onWorkflowStart?.(params.title);
      const result = await handleTaskWorkflow({
        title: params.title,
        listId: params.listId,
        description: params.description,
        date: params.date,
        starred: params.starred,
        myDay: params.myDay,
      });
      return result;
    } else {
      const result = await onAddTask({
        title: params.title,
        listId: params.listId,
        description: params.description,
        date: params.date,
        starred: params.starred,
        myDay: params.myDay,
      });
      return result;
    }
  };

  return (
    <AddTaskForm
      lists={lists}
      onSubmit={handleSubmit}
      activeListId={activeListId}
      onTaskCreated={onTaskCreated}
      onWorkflowStart={onWorkflowStart}
      workflow={workflow}
      variant="inline"
      classNames={classNames}
      placeholder={placeholder}
    />
  );
};

export default AddTaskInput;
