import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface AlertDeleteProps {
  children?: React.ReactNode;
  dialogTitle?: string;
  dialogDescription?: string;
  deleteButtonTitle?: string;
  showDialog?: boolean;
  onDelete?: () => void;
  setShowDialog?: (showDialog: boolean) => void;
}

export function AlertDelete({
  children = (
    <Button
      variant="outline"
      className="bg-red-500/20 text-red-400"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      Delete
    </Button>
  ),
  dialogTitle = "Are you absolutely sure?",
  dialogDescription = "This action cannot be undone. This will permanently delete your account and remove your data from our servers.",
  deleteButtonTitle = "Continue",
  onDelete = () => {},
  showDialog,
  setShowDialog,
}: AlertDeleteProps) {
  return (
    <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {dialogTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {dialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              onDelete();
            }}
          >
            {deleteButtonTitle}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
