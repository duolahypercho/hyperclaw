/**
 * Sync adapter — pulls all todos from the UserManager MongoDB backend
 * and writes the result to the local bridge store (~/.hyperclaw/todo.json).
 */
import { entrepriseApi } from "../../http.config";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/**
 * Calls the UserManager sync endpoint and persists the response locally
 * via the bridge so that the app can work offline.
 */
export async function syncTodosToLocal(): Promise<void> {
  const response = await entrepriseApi.get("/Tools/todo/sync");
  await bridgeInvoke("save-todo-data", { todoData: response.data });
}
