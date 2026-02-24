import { Skeleton } from "@/components/ui/skeleton";

export default function TodoListSkeleton() {
  return (
    <div className="min-h-[300px] mb-6 flex flex-col gap-3">
      <ul className="space-y-3">
        {[1, 2, 3, 4, 5].map((item) => (
          <li
            className="bg-secondary transition-colors rounded-lg"
            key={`skeletonTodoList-${item}`}
          >
            <Skeleton className="flex items-center gap-2 px-3 shadow-sm h-12" />
          </li>
        ))}
      </ul>
    </div>
  );
}
