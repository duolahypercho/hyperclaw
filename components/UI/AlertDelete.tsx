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
      <AlertDialogContent className="bg-background/80 text-gray-300 border-[#3A4559] rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {dialogTitle}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            {dialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-[#3A4559] text-gray-300 hover:bg-[#4B5669] hover:text-white rounded-lg border-0">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 rounded-lg border-0"
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
