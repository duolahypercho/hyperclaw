import { useMemo } from "react";
import { useCopanionReadable } from "$/OS/AI/core";
import { Task } from "../types";

interface UseTodoListCopanionReadableProps {
  tasks: Task[];
  loading: boolean;
}

export function useTodoListCopanionReadable({
  tasks,
  loading,
}: UseTodoListCopanionReadableProps) {
  useCopanionReadable({
    description:
      "Task summary for proactive assistance - Monitor this data and proactively offer help when you notice overdue tasks, blocked tasks, or tasks due today. Be helpful but not intrusive.",
    value: useMemo(() => {
      const overdueTasks = tasks.filter(
        (t) =>
          t.dueDate &&
          new Date(t.dueDate) < new Date() &&
          t.status !== "completed"
      );
      const blockedTasks = tasks.filter((t) => t.status === "blocked");
      const dueTodayTasks = tasks.filter((t) => {
        if (!t.dueDate || t.status === "completed") return false;
        const due = new Date(t.dueDate);
        return due.toDateString() === new Date().toDateString();
      });

      return {
        totalTasks: tasks.length,
        overdueCount: overdueTasks.length,
        blockedCount: blockedTasks.length,
        dueTodayCount: dueTodayTasks.length,
        needsAttention: overdueTasks.length > 0 || blockedTasks.length > 0,
        // Proactive hints for AI (no cost - just data)
        proactiveHints: {
          hasOverdue: overdueTasks.length > 0,
          hasBlocked: blockedTasks.length > 0,
          hasDueToday: dueTodayTasks.length > 0,
          shouldSuggestPrioritization: overdueTasks.length >= 3,
          shouldSuggestUnblocking: blockedTasks.length > 0,
          shouldSuggestPlanning: dueTodayTasks.length >= 3,
        },
      };
    }, [tasks]),
  });
}
