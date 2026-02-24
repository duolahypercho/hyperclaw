import React from "react";
import { cn } from "@/lib/utils";
import { Folder, ChevronRight } from "lucide-react";

interface TodoSidebarSkeletonProps {
  className?: string;
}

const TodoSidebarSkeleton = ({ className }: TodoSidebarSkeletonProps) => {
  return (
    <div className={cn("h-full flex flex-col overflow-hidden", className)}>
      {/* New Task & Search Buttons Skeleton */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-0.5">
        <div className="h-8 bg-muted/40 rounded-lg animate-pulse" />
        <div className="h-8 bg-muted/40 rounded-lg animate-pulse" />
      </div>

      {/* Task Lists Skeleton */}
      <div className="flex-1 overflow-y-auto customScrollbar2 px-2 py-2">
        <div className="space-y-1">
          {/* List Sections Skeleton */}
          {[...Array(3)].map((_, listIndex) => (
            <div key={listIndex} className="mb-1">
              {/* List Header Skeleton */}
              <div className="w-full flex items-center justify-between px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Folder className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
                  <div className="h-4 w-20 bg-muted/40 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="h-4 w-6 bg-muted/40 rounded-full animate-pulse" />
                  <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
                </div>
              </div>

              {/* Tasks Skeleton */}
              <div className="pl-2 mt-0.5">
                <div className="space-y-0.5">
                  {[...Array(listIndex + 2)].map((_, taskIndex) => (
                    <div
                      key={taskIndex}
                      className="group flex items-center gap-2 px-3 py-2 rounded-lg"
                    >
                      {/* Indicators Skeleton */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-3.5 h-3.5 bg-muted/40 rounded animate-pulse" />
                      </div>

                      {/* Task Title Skeleton */}
                      <div className="flex-1">
                        <div
                          className={cn(
                            "h-4 bg-muted/40 rounded animate-pulse",
                            taskIndex % 3 === 0 && "w-32",
                            taskIndex % 3 === 1 && "w-24",
                            taskIndex % 3 === 2 && "w-28"
                          )}
                        />
                      </div>

                      {/* Action Buttons Skeleton */}
                      <div className="flex-shrink-0 flex items-center">
                        <div className="w-6 h-6 bg-muted/40 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TodoSidebarSkeleton;
