"use client";

import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useSession } from "next-auth/react";
import { useInView } from "react-intersection-observer";
import { PromptHistory } from "../types";
import { getPromptHistory } from "../api/PromptLibrary";

interface HistoryContextType {
  history: PromptHistory[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  ref: (node?: Element | null) => void;
}

const HistoryContext = createContext<HistoryContextType>({
  history: [],
  loading: false,
  hasMore: true,
  loadMore: async () => {},
  ref: () => {},
});

export const useHistory = () => React.useContext(HistoryContext);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<PromptHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextPageRef = useRef(2); // Start from page 2 since we load page 1 initially
  const { ref, inView } = useInView();

  const fetchHistory = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      const response = await getPromptHistory({ page: pageNum, limit: 10 });
      const data = response.data?.data;

      if (pageNum === 1) {
        setHistory(data || []);
        nextPageRef.current = 2; // Reset to page 2 after initial load
      } else {
        setHistory((prev) => [...prev, ...(data || [])]);
        nextPageRef.current = pageNum + 1; // Update next page
      }

      setHasMore((data?.length || 0) === 10);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {

    fetchHistory(1);
  }, [fetchHistory]);

  useEffect(() => {
    if (inView && hasMore && !loading) {
      fetchHistory(nextPageRef.current);
    }
  }, [inView, hasMore, loading, fetchHistory]);

  const loadMore = useCallback(async () => {
    if (!loading && hasMore) {
      await fetchHistory(nextPageRef.current);
    }
  }, [loading, hasMore, fetchHistory]);

  return (
    <HistoryContext.Provider
      value={{ history, loading, hasMore, loadMore, ref }}
    >
      {children}
    </HistoryContext.Provider>
  );
}
