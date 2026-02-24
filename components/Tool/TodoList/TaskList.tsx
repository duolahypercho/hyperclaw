import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { IoMdCheckbox } from "react-icons/io";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AddTaskInput from "./AddTaskInput";
import SortableTask from "./SortableTask";
import { useTodoList } from "./provider/todolistProvider";
import { List, Task } from "./types";
import { AlertDelete } from "$/components/UI/AlertDelete";

interface TaskListProps {
  list: List;
  title: string;
  unfinishedTasks: Task[];
  finishedTasks: Task[];
}

export function TaskList({
  title,
  list,
  unfinishedTasks,
  finishedTasks,
}: TaskListProps) {
  const [showFinishedTasks, setShowFinishedTasks] = useState(false);

  return (
    <div className="min-h-[300px] mb-6 flex flex-col gap-3 relative">
      <AddTaskInput activeListId={list._id} />
      <ul className="space-y-3 overflow-x-clip">
        {unfinishedTasks.map((task) => (
          <SortableTask
            key={task._id}
            task={task}
            classNames={{
              functionButton: "px-3 py-1.5 h-fit text-xs",
            }}
            size="sm"
          />
        ))}
      </ul>
      {finishedTasks.length > 0 && (
        <>
          <div className="mb-1 space-y-3">
            <Button
              variant="background"
              className="w-full justify-between text-[#9ba1ae] hover:text-[#BBC3E5] hover:bg-secondary"
              onClick={() => setShowFinishedTasks(!showFinishedTasks)}
            >
              <span className="flex items-center">
                <IoMdCheckbox className="mr-2 h-4 w-4" />
                Completed tasks ({finishedTasks.length})
              </span>
              <ChevronDown
                className={`h-4 w-4 transform transition-transform ${
                  showFinishedTasks ? "" : "rotate-180"
                }`}
              />
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {showFinishedTasks && (
              <motion.ul
                className="space-y-3 overflow-x-clip overflow-y-visible"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {finishedTasks.map((task, index) => (
                  <motion.div
                    key={"completed-" + task._id}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.1,
                    }}
                  >
                    <SortableTask
                      task={task}
                      hideGrip={true}
                      classNames={{
                        functionButton: "px-3 py-1.5 h-fit text-xs",
                      }}
                      size="sm"
                    />
                  </motion.div>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
