import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Step } from "./types";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  GripVertical,
  Loader2,
} from "lucide-react";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface EditStepsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  taskTitle: string;
  onConfirm: (steps: Step[]) => void;
  onAddStep: (stepTitle: string) => void;
  onEditStep: (stepId: string, title: string) => void;
  onDeleteStep: (stepId: string) => void;
  onReorderSteps?: (activeId: string, overId: string) => void;
  isLoading?: boolean;
}

const StepItem = ({
  step,
  index,
  editingId,
  editValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  setEditValue,
}: {
  step: Step;
  index: number;
  editingId: string | null;
  editValue: string;
  onStartEdit: (step: Step) => void;
  onSaveEdit: (stepId: string) => void;
  onCancelEdit: () => void;
  onDelete: (stepId: string) => void;
  setEditValue: (value: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: step._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-1.5 rounded-md border border-border/50 bg-card/50 hover:bg-card transition-colors group"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab opacity-0 group-hover:opacity-100 p-1 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-primary/70" />
      </span>
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
        {index + 1}
      </div>

      {editingId === step._id ? (
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSaveEdit(step._id);
              } else if (e.key === "Escape") {
                onCancelEdit();
              }
            }}
            className="flex-1 h-8 text-xs"
            autoFocus
          />
          <Button
            size="xs"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onSaveEdit(step._id)}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onCancelEdit}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 text-xs text-foreground">{step.title}</div>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onStartEdit(step)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(step._id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export function EditStepsDialog({
  open,
  onOpenChange,
  steps: initialSteps,
  taskTitle,
  onConfirm,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onReorderSteps,
  isLoading = false,
}: EditStepsDialogProps) {
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newStepValue, setNewStepValue] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);

  // Update steps when initialSteps change
  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  const handleStartEdit = (step: Step) => {
    setEditingId(step._id);
    setEditValue(step.title);
  };

  const handleSaveEdit = (stepId: string) => {
    if (editValue.trim()) {
      onEditStep(stepId, editValue.trim());
      setEditingId(null);
      setEditValue("");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleAddNewStep = () => {
    if (newStepValue.trim()) {
      onAddStep(newStepValue.trim());
      setNewStepValue("");
      setShowAddInput(false);
    }
  };

  const handleDelete = (stepId: string) => {
    onDeleteStep(stepId);
  };

  const handleConfirm = () => {
    onConfirm(steps);
    onOpenChange(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIndex = steps.findIndex((step) => step._id === active.id);
    const overIndex = steps.findIndex((step) => step._id === over.id);

    if (activeIndex === -1 || overIndex === -1) return;

    const newSteps = [...steps];
    const [movedStep] = newSteps.splice(activeIndex, 1);
    newSteps.splice(overIndex, 0, movedStep);

    // Update local state
    setSteps(newSteps);

    // Call parent handler if provided
    if (onReorderSteps) {
      onReorderSteps(active.id as string, over.id as string);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Steps for "{taskTitle}"</DialogTitle>
          <DialogDescription>
            Review and customize the suggested steps. You can edit, delete, or
            add more steps.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto customScrollbar2 space-y-2 py-2 overflow-x-hidden">
          {isLoading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center justify-center gap-3 text-muted-foreground mb-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <p className="text-sm">
                  AI is generating steps for your task...
                </p>
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-1.5 rounded-md border border-border/50 bg-card/50 animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="w-5 h-5 rounded-full bg-primary/10" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">
                No steps yet. Add your first step below.
              </p>
            </div>
          ) : (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={steps.map((step) => step._id)}>
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <StepItem
                      key={step._id}
                      step={step}
                      index={index}
                      editingId={editingId}
                      editValue={editValue}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onDelete={handleDelete}
                      setEditValue={setEditValue}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {!isLoading &&
            (showAddInput ? (
              <div className="flex items-center gap-2 p-1.5 rounded-md border border-primary/50 bg-card">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <Input
                  value={newStepValue}
                  onChange={(e) => setNewStepValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddNewStep();
                    } else if (e.key === "Escape") {
                      setShowAddInput(false);
                      setNewStepValue("");
                    }
                  }}
                  placeholder="Enter step title..."
                  className="flex-1 h-8 text-xs"
                  autoFocus
                />
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleAddNewStep}
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setShowAddInput(false);
                    setNewStepValue("");
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="xs"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setShowAddInput(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                Add More Steps
              </Button>
            ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onOpenChange(false)}
          >
            {isLoading ? "Skip" : "Cancel"}
          </Button>
          <Button size="xs" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
