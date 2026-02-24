"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AddTaskForm } from "$/components/Tool/TodoList/AddTaskForm";
import { PLACEHOLDER_SUGGESTIONS } from "$/components/Tool/TodoList/hooks/useAddTaskForm";

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: { _id: string; name: string }[];
  handleAddTask: (params: {
    title: string;
    description?: string;
    date?: Date;
    starred: boolean;
    myDay: boolean;
    listId?: string;
  }) => Promise<any>;
  zIndex?: number;
}

const AddTaskDialog = ({
  open,
  onOpenChange,
  lists,
  handleAddTask,
  zIndex = 100,
}: AddTaskDialogProps) => {
  // Generate random placeholder when dialog opens
  const placeholder = useMemo(() => {
    if (!open) return PLACEHOLDER_SUGGESTIONS[0];
    return PLACEHOLDER_SUGGESTIONS[
      Math.floor(Math.random() * PLACEHOLDER_SUGGESTIONS.length)
    ];
  }, [open]);

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          handleCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-md p-0 gap-0 bg-card rounded-lg shadow-lg top-[30%]"
        variant="secondary"
        style={{ zIndex }}
        onPointerDownOutside={(e) => {
          // Prevent the Dialog from closing when clicking inside the dropdown portal
          const target = e.target as HTMLElement;
          if (
            target.closest('[data-radix-popper-content-wrapper]') ||
            target.closest('[data-radix-dropdown-menu-content]')
          ) {
            e.preventDefault();
          }
        }}
      >
        <AddTaskForm
          lists={lists}
          onSubmit={handleAddTask}
          variant="dialog"
          zIndex={zIndex}
          placeholder={placeholder}
          showCancelButton={true}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AddTaskDialog;
