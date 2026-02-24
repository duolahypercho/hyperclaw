import { getLayout } from "$/layouts/MainLayout";
import React from "react";
import { useAurum } from "$/components/Tool/Aurum/provider/aurumProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import CompletedReport from "./completedReport";
import EmptyIdeasState from "$/components/Tool/Aurum/components/EmptyIdeasState";

const LoadingSkeleton = () => {
  return (
    <div className="bg-background w-full max-h-screen h-full mx-auto relative z-10 py-12 overflow-y-auto customScrollbar2">
      <div className="flex flex-col gap-8 max-w-5xl mx-auto overflow-x-hidden">
        {/* Header Card Skeleton */}
        <Card className="w-full animate-pulse">
          <div className="h-2 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600" />
          <CardHeader>
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div className="flex-1">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two Column Cards Skeleton */}
        <div className="grid md:grid-cols-2 gap-6 w-full">
          <Card className="h-full animate-pulse">
            <CardHeader>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
              </div>
            </CardContent>
          </Card>
          <Card className="h-full animate-pulse">
            <CardHeader>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Full Width Cards Skeleton */}
        {[1, 2, 3].map((i) => (
          <Card key={i} className="w-full animate-pulse">
            <CardHeader>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const IdeaValidator = () => {
  const { ideaReport, loadingIdeaReport } = useAurum();

  // Show loading skeleton while fetching
  if (loadingIdeaReport) {
    return <LoadingSkeleton />;
  }

  // Show empty state when no idea is selected
  if (!ideaReport) {
    return (
      <EmptyIdeasState
        title="No Idea Selected"
        description="Select an idea from the sidebar to view its detailed analysis report with AI-powered insights."
        showActionButton={false}
        variant="report"
      />
    );
  }

  // Show the full report
  return (
    <div className="bg-background max-w-5xl mx-auto space-y-3 py-4">
      <CompletedReport ideaData={ideaReport} />
    </div>
  );
};

IdeaValidator.getLayout = getLayout;
export default IdeaValidator;
