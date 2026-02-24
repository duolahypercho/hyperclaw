import React from "react";
import UnifiedTaskView from "./UnifiedTaskView";

export const WeeklyView: React.FC = () => {
  return (
    <UnifiedTaskView
      showSpecialTasks={true}
    />
  );
};

export default WeeklyView;
