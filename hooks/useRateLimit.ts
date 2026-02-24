import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchRateLimit,
  RateLimitInfo,
  RateLimitType,
} from "$/services/rate-limit-client";

interface UseRateLimitOptions {
  /** The type of rate limit to fetch */
  limitType: RateLimitType;
  /** Whether to automatically fetch on mount (default: true) */
  enabled?: boolean;
  /** Refetch interval in milliseconds (default: 0 = disabled, set to 60000 for 1 minute) */
  refetchInterval?: number;
  /** Whether to refetch when remaining reaches 0 (default: true) */
  refetchOnZero?: boolean;
  /** Whether to refetch when window regains focus (default: true) */
  refetchOnWindowFocus?: boolean;
  /** Callback when rate limit is updated */
  onUpdate?: (data: RateLimitInfo) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

interface UseRateLimitReturn {
  /** Current rate limit data */
  data: RateLimitInfo | null;
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Whether currently refetching in the background */
  isRefetching: boolean;
  /** Manually refetch the rate limit */
  refetch: () => Promise<void>;
  /** Time until reset in milliseconds */
  timeUntilReset: number;
  /** Whether the rate limit has been exceeded */
  isExceeded: boolean;
}

/**
 * Custom hook to fetch and manage rate limit information
 *
 * @example
 * ```tsx
 * const { data, isLoading, isExceeded, refetch } = useRateLimit({
 *   limitType: "generate_response_daily",
 *   refetchOnWindowFocus: true, // Refetch when tab regains focus (default)
 *   refetchOnZero: true, // Auto-refetch when limit resets (default)
 * });
 *
 * if (isLoading) return <Loader />;
 * if (isExceeded) return <div>Rate limit exceeded</div>;
 *
 * return <RateLimit {...data} />;
 * ```
 */
export function useRateLimit({
  limitType,
  enabled = true,
  refetchInterval = 0, // Disabled by default
  refetchOnZero = true,
  refetchOnWindowFocus = true,
  onUpdate,
  onError,
}: UseRateLimitOptions): UseRateLimitReturn {
  const [data, setData] = useState<RateLimitInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(
    async (isInitial = false) => {
      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsRefetching(true);
      }
      setError(null);

      try {
        const result = await fetchRateLimit(limitType);
        setData(result);
        onUpdate?.(result);

        // If rate limit is exceeded and refetchOnZero is true, schedule a refetch at reset time
        if (
          refetchOnZero &&
          result.remaining === 0 &&
          result.resetTime > Date.now()
        ) {
          const timeUntilReset = result.resetTime - Date.now();
          resetTimerRef.current = setTimeout(() => {
            fetchData(false);
          }, timeUntilReset + 1000); // Add 1 second buffer
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to fetch rate limit");
        setError(error);
        onError?.(error);
        console.error("Error fetching rate limit:", error);
      } finally {
        setIsLoading(false);
        setIsRefetching(false);
      }
    },
    [limitType, refetchOnZero, onUpdate, onError]
  );

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;

    fetchData(true);
  }, [enabled, fetchData]);

  // Set up polling interval
  useEffect(() => {
    if (!enabled || !refetchInterval) return;

    refetchIntervalRef.current = setInterval(() => {
      fetchData(false);
    }, refetchInterval);

    return () => {
      if (refetchIntervalRef.current) {
        clearInterval(refetchIntervalRef.current);
      }
    };
  }, [enabled, refetchInterval, fetchData]);

  // Refetch on window focus
  useEffect(() => {
    if (!enabled || !refetchOnWindowFocus) return;

    const handleFocus = () => {
      // Only refetch if we have existing data and it's been more than 10 seconds
      if (data && Date.now() - data.timestamp > 10000) {
        fetchData(false);
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, refetchOnWindowFocus, fetchData, data]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refetchIntervalRef.current) {
        clearInterval(refetchIntervalRef.current);
      }
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const refetch = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  // Calculate derived values
  const isExceeded = data ? data.remaining <= 0 : false;
  const timeUntilReset = data ? Math.max(0, data.resetTime - Date.now()) : 0;

  return {
    data,
    isLoading,
    error,
    isRefetching,
    refetch,
    timeUntilReset: timeUntilReset,
    isExceeded: isExceeded,
  };
}
