/**
 * Unified todo service — all reads and writes go through the local bridge
 * store (Hub → Connector → SQLite at ~/.hyperclaw/connector.db).
 *
 * No remote MongoDB (UserManager) calls are made.
 *
 * The exported function names and signatures are identical to `local.ts` /
 * `index.ts` so consuming components can swap imports without any other
 * changes.
 */

export {
  getTodoAPI,
  getTodoTaskAPI,
  getTodoTaskByListAPI,
  getTodoTaskByIdAPI,
  searchTaskAPI,
  fetchActiveTasksAPI,
  addTodoTaskAPI,
  addTodoListAPI,
  addTodoStepAPI,
  promoteToTaskAPI,
  updateTodoTaskAPI,
  updateTodoListAPI,
  editTodoTaskStepAPI,
  editTodoTaskDetailsAPI,
  deleteTodoTaskAPI,
  deleteTodoListAPI,
  deleteTodoStepAPI,
  reorderTasksAPI,
  reorderListsAPI,
  reorderStepsAPI,
  reorderCalanderAPI,
  toggleActiveTaskAPI,
  suggestStepAPI,
  suggestDescriptionAPI,
} from "./local";
