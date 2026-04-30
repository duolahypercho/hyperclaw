import { useMemo } from "react";
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

export function DialogConfirmation(
  schema: Extract<DialogSchema, { type?: "confirmation" }>
) {
  const { id, title, description, content, actions, className, onClose, type } =
    schema;

  const { isDialogOpen, closeDialog, getDialogData } = useDialog();

  const open = useMemo(() => isDialogOpen(id), [isDialogOpen, id]);
  const dialogData = getDialogData(id);

  const handleClose = () => {
    closeDialog(id);
    onClose?.();
  };

  return (
    <DialogPrimitive
      open={open}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className={cn("sm:max-w-[425px]", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">{content}</div>

        {(actions?.confirm || actions?.close) && (
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            {actions.close && (
              <Button
                key={actions.close.id}
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
            {actions.confirm && (
              <Button
                key={actions.confirm.id}
                variant={actions.confirm.variant?.variant || "default"}
                size={actions.confirm.variant?.size}
                onClick={() => {
                  actions.confirm?.onClick?.({
                    dialogData: dialogData,
                  });
                  handleClose();
                }}
                disabled={actions.confirm?.disabled}
                loading={actions.confirm?.loading}
                loadingText={actions.confirm?.loadingText}
                className="mt-2 sm:mt-0"
              >
                {actions.confirm.icon && (
                  <actions.confirm.icon className="mr-2 h-4 w-4" />
                )}
                {actions.confirm.label}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </DialogPrimitive>
  );
}
