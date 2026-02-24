import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useState,
  useEffect,
} from "react";
import { AppSchema, defaultAppSchema } from "@OS/Layout/types";
import {
  getPomodoroHeatmap,
  ContributionData,
  getFocusTimer,
  DailyFocusData,
} from "$/services/statistics";

interface StatisticsContextValue {
  appSchema: AppSchema;
  heatmapData: ContributionData[];
  isLoadingHeatmap: boolean;
  error: Error | null;
  refetchHeatmap: (year?: number) => Promise<void>;
  focusTimerData: DailyFocusData[];
  isLoadingFocusTimer: boolean;
  focusTimerError: Error | null;
  refetchFocusTimer: () => Promise<void>;
}

const initialState: StatisticsContextValue = {
  appSchema: defaultAppSchema,
  heatmapData: [],
  isLoadingHeatmap: false,
  error: null,
  refetchHeatmap: async () => {},
  focusTimerData: [],
  isLoadingFocusTimer: false,
  focusTimerError: null,
  refetchFocusTimer: async () => {},
};

const StatisticsContext = createContext<StatisticsContextValue>(initialState);

export function StatisticsProvider({ children }: { children: ReactNode }) {
  const [heatmapData, setHeatmapData] = useState<ContributionData[]>([]);
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [focusTimerData, setFocusTimerData] = useState<DailyFocusData[]>([]);
  const [isLoadingFocusTimer, setIsLoadingFocusTimer] = useState(false);
  const [focusTimerError, setFocusTimerError] = useState<Error | null>(null);

  const fetchHeatmapData = async (year: number = new Date().getFullYear()) => {
    setIsLoadingHeatmap(true);
    setError(null);
    try {
      const response = await getPomodoroHeatmap(year);
      setHeatmapData(response.data.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch heatmap data")
      );
      setHeatmapData([]);
    } finally {
      setIsLoadingHeatmap(false);
    }
  };

  const fetchFocusTimerData = async () => {
    setIsLoadingFocusTimer(true);
    setFocusTimerError(null);
    try {
      const response = await getFocusTimer();
      setFocusTimerData(response.data.data || []);
    } catch (err) {
      setFocusTimerError(
        err instanceof Error
          ? err
          : new Error("Failed to fetch focus timer data")
      );
      setFocusTimerData([]);
    } finally {
      setIsLoadingFocusTimer(false);
    }
  };

  useEffect(() => {
    fetchHeatmapData();
    fetchFocusTimerData();
  }, []);

  const appSchema: AppSchema = useMemo(() => {
    return {
      sidebar: {
        sections: [],
      },
    };
  }, []);

  const value: StatisticsContextValue = {
    appSchema,
    heatmapData,
    isLoadingHeatmap,
    error,
    refetchHeatmap: fetchHeatmapData,
    focusTimerData,
    isLoadingFocusTimer,
    focusTimerError,
    refetchFocusTimer: fetchFocusTimerData,
  };

  return (
    <StatisticsContext.Provider value={value}>
      {children}
    </StatisticsContext.Provider>
  );
}

export function useStatistics() {
  const context = useContext(StatisticsContext);
  if (context === undefined) {
    throw new Error("useStatistics must be used within a StatisticsProvider");
  }
  return context;
}
