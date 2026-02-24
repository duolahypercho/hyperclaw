import React from "react";
import { motion } from "framer-motion";
import { TabsContainer } from "./Zlisting";
import { cn } from "@/lib/utils";

interface TodoListContainerProps {
  className?: string;
  headerOff?: boolean;
}

const TodoListContainer = (props: TodoListContainerProps) => {
  return (
    <motion.div
      className={cn("h-full", props.className)}
      animate={{ width: "100%" }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <TabsContainer headerOff={props.headerOff} />
    </motion.div>
  );
};

export default TodoListContainer;
