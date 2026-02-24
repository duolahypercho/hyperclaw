import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export const IdeasSkeleton = () => {
  return (
    <motion.div
      className="mt-16 overflow-hidden"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
    >
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex items-center space-x-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-6 px-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <motion.div
            key={index}
            className="group relative bg-gradient-to-br from-primary/5 to-primary/[0.02] rounded-2xl overflow-hidden border border-primary/5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <div className="p-6">
              {/* Title skeleton */}
              <Skeleton className="h-5 w-3/4 mb-2" />

              {/* Description skeleton */}
              <div className="space-y-2 mb-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>

              {/* Bottom section skeleton */}
              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  {/* Score skeleton */}
                  <Skeleton className="h-6 w-12 rounded-md" />

                  {/* Heart button skeleton */}
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            </div>

            {/* Gradient overlay skeleton */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-transparent opacity-0" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
