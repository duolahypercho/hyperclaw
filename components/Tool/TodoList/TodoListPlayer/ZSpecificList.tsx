import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AddTaskInput from "../AddTaskInput";
import SortableTask from "../SortableTask";
import { Task } from "../types";
import { IoMdCheckbox } from "react-icons/io";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface TaskListProps {
  title: string;
  unfinishedTasks: Task[];
  finishedTasks: Task[];
}

export function SpecificList({
  title,
  unfinishedTasks,
  finishedTasks,
}: TaskListProps) {
  const [showFinishedTasks, setShowFinishedTasks] = useState(false);

  if (title === "Completed" || title === "Finished") {
    return (
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
        </div>
        <ul className="space-y-3 overflow-x-clip">
          {finishedTasks.map((task) => (
            <SortableTask
              key={task._id}
              task={task}
              hideGrip={true}
              classNames={{
                list: "transition-colors w-full",
                textContainer: "px-0 py-1",
                functionContainer: "px-3 py-2",
                functionButton: "px-3 py-1.5 h-fit text-xs",
                titleText: "text-xs",
              }}
              size="sm"
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-3 h-full">
      <AddTaskInput
        classNames={{
          form: "p-2 rounded-lg shadow-sm",
          textarea: "p-0",
          functionContainer: "p-0 bg-transparent",
        }}
      />

      <div className="flex flex-col flex-1 overflow-hidden py-2">
        <div className="h-full overflow-y-auto customScrollbar2 overflow-x-hidden relative">
          <ul className="space-y-3 overflow-x-clip">
            {unfinishedTasks.map((task) => (
              <SortableTask
                key={task._id}
                task={task}
                classNames={{
                  list: "transition-colors w-full",
                  textContainer: "px-0 py-1",
                  functionContainer: "px-3 py-2",
                  functionButton: "px-3 py-1.5 h-fit text-xs",
                  titleText: "text-xs",
                }}
                size="sm"
              />
            ))}
          </ul>
          {finishedTasks.length > 0 && (
            <>
              <div className="sticky top-0 z-10 my-4 space-y-3">
                <Button
                  variant="background"
                  className="w-full justify-between backdrop-blur-md bg-background/70 h-fit py-1.5"
                  onClick={() => setShowFinishedTasks(!showFinishedTasks)}
                >
                  <span className="flex items-center text-xs">
                    <IoMdCheckbox className="mr-2 h-3 w-3" />
                    Completed tasks ({finishedTasks.length})
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 transform transition-transform ${
                      showFinishedTasks ? "" : "rotate-180"
                    }`}
                  />
                </Button>
              </div>
              <AnimatePresence initial={false} mode="wait">
                {showFinishedTasks && (
                  <motion.ul
                    className="space-y-3 overflow-x-clip overflow-y-visible"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{
                      duration: 0.1,
                      delay: 0.1,
                    }}
                  >
                    {finishedTasks.map((task, index) => (
                      <motion.div key={"completed-" + task._id}>
                        <SortableTask
                          task={task}
                          hideGrip={true}
                          classNames={{
                            list: "transition-colors w-full",
                            textContainer: "px-0 py-1",
                            functionContainer: "px-3 py-2",
                            functionButton: "px-3 py-1.5 h-fit text-xs",
                            titleText: "text-xs",
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
      </div>
    </div>
  );
}
