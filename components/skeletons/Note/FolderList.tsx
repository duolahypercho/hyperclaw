import { Skeleton } from "@/components/ui/skeleton";

export default function FolderListSkeleton() {
  return (
    <div className="flex flex-col gap-2 h-full w-full">
      <Skeleton className="w-full h-full" />
    </div>
  );
}
