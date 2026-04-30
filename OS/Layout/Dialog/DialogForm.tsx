import { useMemo, useRef, useCallback } from "react";
import {
  Dialog as DialogPrimitive,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DialogSchema } from "./DialogSchema";
import { useDialog } from "./DialogContext";
import HyperchoForm from "@OS/Layout/Form";

export function DialogForm(schema: Extract<DialogSchema, { type: "form" }>) {
  const { id, title, description, actions, className, onClose, formProps } =
    schema;

  const formRef = useRef<HTMLFormElement>(null);
  const { isDialogOpen, closeDialog, getDialogData } = useDialog();
  const open = useMemo(() => isDialogOpen(id), [isDialogOpen, id]);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const dialogData = getDialogData(id);

  const handleClose = useCallback(() => {
    // Handle form closure - save data if there are changes
    if (formRef.current?.handleFormClose) {
      formRef.current.handleFormClose();
    }

    closeDialog(id);
    onClose?.();
  }, [closeDialog, id, onClose]);

  const handleSubmit = useCallback(
    async (data: any) => {
      try {
        if (actions?.primary?.onClick) {
          await actions.primary.onClick({
            formData: data,
            dialogData,
          });
        }

        handleClose();
      } catch (error) {
        console.error("Dialog form submission error:", error);
        // Don't close dialog on error, let user retry
      }
    },
    [actions, dialogData, handleClose]
  );

  return (
    <DialogPrimitive
      open={open}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className={cn("sm:max-w-[600px]", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <HyperchoForm
            key={`${id}-${open}`}
            formRef={formRef}
            submitButtonRef={submitButtonRef}
            hideSubmit={true}
            {...formProps}
            onSubmitFunction={handleSubmit}
          />
        </div>

        {actions && (
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            {actions.close && (
              <Button
                key={`${actions.close.id}`}
                variant={actions.close.variant?.variant || "outline"}
                size={actions.close.variant?.size}
                onClick={() => {
                  handleClose();
                  actions.close?.onClick?.();
                }}
                disabled={actions.close?.disabled}
                loading={actions.close?.loading}
                loadingText={actions.close?.loadingText}
                className="mt-2 sm:mt-0"
              >
                {actions.close.label}
              </Button>
            )}
            {actions.primary && (
              <Button
                ref={submitButtonRef}
                key={`${actions.primary.id}`}
                variant={actions.primary.variant?.variant || "default"}
                size={actions.primary.variant?.size}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  formRef.current?.requestSubmit();
                }}
                disabled={actions.primary?.disabled}
                loading={actions.primary?.loading}
                loadingText={actions.primary?.loadingText}
                className="mt-2 sm:mt-0"
              >
                {actions.primary.icon && (
                  <actions.primary.icon className="mr-2 h-4 w-4" />
                )}
                {actions.primary.label}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </DialogPrimitive>
  );
}
