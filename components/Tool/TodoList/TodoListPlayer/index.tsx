import AppLayout from "$/layouts/AppLayout";
import React, { memo, useMemo } from "react";
import TodoListContainer from "./TodoListContainer";
import { TodoListProvider } from "../provider/todolistProvider";
import { useTodoListOS } from "@OS/Provider/OSProv";

const TodoListPlayer = memo(() => {
  const { showState, isMounted } = useTodoListOS();

  // Memoize the initial size configuration to prevent unnecessary re-renders
  const initialSize = useMemo(
    () => ({
      default: {
        width: 400,
        height: 150,
      },
    }),
    []
  );

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return null;
  }

  if (!showState) {
    return null;
  }

  return (
    <AppLayout
      showState={showState}
      uniqueKey="todo-list"
      initialSize={initialSize}
      className="p-0 px-3"
    >
      <TodoListProvider inMiniMode>
        <TodoListContainer />
      </TodoListProvider>
    </AppLayout>
  );
});

TodoListPlayer.displayName = "TodoListPlayer";

export default TodoListPlayer;
