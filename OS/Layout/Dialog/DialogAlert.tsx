import { useMemo } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { DialogSchema } from "./DialogSchema";
import { useDialog } from "./DialogContext";

export function DialogAlert(schema: Extract<DialogSchema, { type?: "alert" }>) {
  const { id, title, description, content, actions, className, onClose } =
    schema;
  const { isDialogOpen, closeDialog, getDialogData } = useDialog();
  const open = useMemo(() => isDialogOpen(id), [isDialogOpen, id]);
  const dialogData = getDialogData(id);

  const handleClose = () => {
    closeDialog(id);
    onClose?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent
        className={cn(
          "sm:max-w-[425px] animate-in fade-in-0 zoom-in-95",
          className
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-6 text-base text-foreground">{content}</div>

        {(actions?.confirm || actions?.close) && (
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            {actions.close && (
              <AlertDialogCancel
                key={actions.close.id}
                onClick={() => {
                  handleClose();
                  actions.close?.onClick?.();
                }}
                disabled={actions.close?.disabled}
                className="mt-2 sm:mt-0"
              >
                {actions.close.label}
              </AlertDialogCancel>
            )}
            {actions.confirm && (
              <AlertDialogAction
                key={actions.confirm.id}
                onClick={() => {
                  actions.confirm?.onClick?.({
                    dialogData: dialogData,
                  });
                  handleClose();
                }}
                disabled={actions.confirm?.disabled}
                className="mt-2 sm:mt-0"
              >
                {actions.confirm.icon && (
                  <actions.confirm.icon className="mr-2 h-4 w-4" />
                )}
                {actions.confirm.label}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
