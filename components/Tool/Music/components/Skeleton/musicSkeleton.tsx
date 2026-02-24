import { MoreVertical } from "lucide-react";
import { cn } from "../../../../../utils";
import { Button } from "@/components/ui/button";

export const MusicSkeleton = ({
  num,
  grip,
}: {
  num: number;
  grip?: boolean;
}) => {
  return (
    <div className="w-full space-y-2">
      {[...Array(num)].map((_, i) => (
        <div
          key={i}
          className={cn(
            `grid grid-cols-[48px_1fr_80px_80px_80px_80px_40px] gap-4 p-2 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer active:bg-primary/10 items-center`,
            grip && "grid-cols-[40px_48px_1fr_80px_80px_80px_40px]"
          )}
        >
          {grip && <div></div>}
          {/* Image skeleton */}
          <div className="h-12 rounded bg-primary/5 animate-pulse" />

          {/* Title and artist skeleton */}
          <div className="flex flex-col justify-center">
            <div className="h-5 bg-primary/5 rounded animate-pulse mb-1" />
            <div className="h-3 bg-primary/5 rounded animate-pulse" />
          </div>

          {/* Play count skeleton */}
          <div className="h-3 bg-primary/5 rounded animate-pulse" />

          {/* Duration skeleton */}
          <div className="h-3 bg-primary/5 rounded animate-pulse" />

          {/* Added date skeleton */}
          <div className="h-3 bg-primary/5 rounded animate-pulse" />

          {/* Heart button skeleton */}
          <div className="h-3 bg-primary/5 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
};
