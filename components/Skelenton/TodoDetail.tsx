import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "$/utils";

interface TodoDetailSkeletonProps {
  classNames?: {
    container?: string;
    textArea?: string;
  };
}

export default function TodoDetailSkeleton({
  classNames,
}: TodoDetailSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full h-full max-w-md mx-auto bg-background rounded-lg shadow-sm flex flex-col",
        classNames?.container
      )}
    >
      <div className="p-4 space-y-4 flex-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div
          className={cn(
            "bg-background outline-none text-white placeholder-[#9ba1ae] text-sm resize-none min-h-[20px] leading-[20px] rounded p-3 transition-colors shadow-sm border-background border-1 border-solid overflow-x-hidden customScrollbar2",
            classNames?.textArea
          )}
        >
          <Skeleton className="h-10 w-full" />
          <div className="w-full flex justify-end items-center mt-3">
            <Skeleton className="w-fit px-4 py-1 text-sm h-9 relative" />
          </div>
        </div>
      </div>

      <div className="p-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <Skeleton className="w-fit px-4 py-1 text-sm h-9 relative" />
          <Skeleton className="w-fit px-4 py-1 text-sm h-9 relative" />
        </div>
      </div>
    </div>
  );
}
