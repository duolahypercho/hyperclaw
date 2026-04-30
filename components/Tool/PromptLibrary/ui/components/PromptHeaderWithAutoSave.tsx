import React from "react";
import { usePromptLibrary } from "../../provider/PromptProv";
import { useOptimize } from "../../provider/OptimizeProv";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { cn } from "@/lib/utils";

interface PromptHeaderWithAutoSaveProps {
  className?: string;
}

export const PromptHeaderWithAutoSave: React.FC<
  PromptHeaderWithAutoSaveProps
> = ({ className }) => {
  const { currentTab, loading } = usePromptLibrary();
  const { hasUnsavedChanges, isAutoSaving, lastSavedTime } = useOptimize();

  // Only show auto-save indicator in optimize tab
  if (currentTab !== "playground") {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center px-4 py-2 border-b border-border/50 bg-background/50 backdrop-blur-sm",
        className
      )}
    >
      <AutoSaveIndicator
        hasUnsavedChanges={hasUnsavedChanges}
        isAutoSaving={isAutoSaving}
        isManualSaving={loading.isLoading("saving")}
        lastSavedTime={lastSavedTime || undefined}
        className="text-xs"
      />
    </div>
  );
};
