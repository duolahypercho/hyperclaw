import React, { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StreaksAndConsistency from "./StreaksAndConsistency";
import SessionAnalytics from "./SessionAnalytics";
import TimePeriodComparisons from "./TimePeriodComparisons";
import TimeDistribution from "./TimeDistribution";
import GoalTracking from "./GoalTracking";

// Dynamically import chart components with SSR disabled to prevent Recharts Redux Toolkit issues
const ContributionHeatmap = dynamic(() => import("./ContributionHeatmap"), {
  ssr: false,
  loading: () => (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <div className="h-[200px] flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading chart...</div>
      </div>
    </div>
  ),
});
const FocusTimerGraph = dynamic(() => import("./FocusTimerGraph"), {
  ssr: false,
  loading: () => (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <div className="h-[300px] flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading charts...</div>
      </div>
    </div>
  ),
});

interface StatisticsContainerProps {
  className?: string;
}

const StatisticsContainer = ({ className }: StatisticsContainerProps) => {
  const [activeTab, setActiveTab] = useState("overview");
  return (
    <motion.div
      className={cn(
        "h-full w-full overflow-y-auto overflow-x-hidden customScrollbar2",
        className
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full flex flex-col gap-6 max-w-3xl mx-auto p-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Statistics
          </h2>
          <p className="text-sm text-muted-foreground">
            Track your activity and contributions over time
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            {activeTab === "overview" && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Contributions
                  </h3>
                  <ContributionHeatmap />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Focus Time
                  </h3>
                  <FocusTimerGraph />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="performance" className="space-y-6 mt-6">
            {activeTab === "performance" && (
              <>
                <StreaksAndConsistency />
                <SessionAnalytics />
                <TimePeriodComparisons />
              </>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-6 mt-6">
            {activeTab === "insights" && (
              <>
                <TimeDistribution />
                <GoalTracking />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
};

export default StatisticsContainer;
