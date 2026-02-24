// src/hooks/useDebouncedReorder.ts
import { useMemo } from "react";
import debounce from "lodash/debounce";
import { reorderCalanderAPI } from "../../../services/tools/todo/local";

/** Returns a stable debounced function and flush utility */
export function useDebouncedReorder() {
  // Debounced function to reorder items
  const debouncedReorder = useMemo(
    () =>
      debounce((buckets: Record<string, string[]>) => {
        reorderCalanderAPI({ buckets });
      }, 100),
    []
  );

  return { debouncedReorder };
}
