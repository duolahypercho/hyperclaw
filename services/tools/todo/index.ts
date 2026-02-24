import { entrepriseApi } from "../../http.config";
import {
  AddTodoTaskRequest,
  AddTodoListRequest,
  AddTodoStepRequest,
  PromoteToTaskRequest,
  UpdateTodoTaskRequest,
  UpdateTodoListRequest,
  UpdateTodoTaskStepRequest,
  UpdateTodoTaskDetailsRequest,
  DeleteTodoTaskRequest,
  DeleteTodoListRequest,
  DeleteTodoStepRequest,
  ReorderListRequest,
  ReorderTaskRequest,
  ReorderStepRequest,
  TabType,
  SuggestStepRequest,
  GetTodoTaskQueryParams,
  ReorderCalendarRequest,
  SearchTaskRequest,
  SuggestDescriptionRequest,
} from "./type";

export const addTodoTaskAPI = async (data: AddTodoTaskRequest) => {
  return entrepriseApi.post("/Tools/todo/addTask", data);
};

export const addTodoListAPI = async (data: AddTodoListRequest) => {
  return entrepriseApi.post("/Tools/todo/addList", data);
};

export const addTodoStepAPI = async (data: AddTodoStepRequest) => {
  return entrepriseApi.post("/Tools/todo/addStep", data);
};

export const promoteToTaskAPI = async (data: PromoteToTaskRequest) => {
  return entrepriseApi.post("/Tools/todo/addTaskFromStep", data);
};

export const getTodoAPI = async () => {
  return entrepriseApi.get(`/Tools/todo/fetchTodo`);
};

export const getTodoTaskByListAPI = async (listId: string) => {
  return entrepriseApi.get(`/Tools/todo/fetchTasksByList/${listId}`);
};

export const getTodoTaskAPI = async (
  tab: TabType,
  queryParams?: GetTodoTaskQueryParams
) => {
  const params = new URLSearchParams();

  if (queryParams?.limit) params.append("limit", queryParams.limit.toString());
  if (queryParams?.skip) params.append("skip", queryParams.skip.toString());
  if (queryParams?.startDate) params.append("startDate", queryParams.startDate);
  if (queryParams?.endDate) params.append("endDate", queryParams.endDate);

  const queryString = params.toString();
  const url = `/Tools/todo/fetchTasks/${tab}${
    queryString ? `?${queryString}` : ""
  }`;

  return entrepriseApi.get(url);
};

export const getTodoTaskByIdAPI = async (taskId: string) => {
  return entrepriseApi.get(`/Tools/todo/fetchTaskDetails/${taskId}`);
};

export const updateTodoTaskAPI = async (data: UpdateTodoTaskRequest) => {
  return entrepriseApi.post("/Tools/todo/editTask", data);
};

export const updateTodoListAPI = async (data: UpdateTodoListRequest) => {
  return entrepriseApi.post("/Tools/todo/editList", data);
};

export const editTodoTaskStepAPI = async (data: UpdateTodoTaskStepRequest) => {
  return entrepriseApi.post("/Tools/todo/editStep", data);
};

export const editTodoTaskDetailsAPI = async (
  data: UpdateTodoTaskDetailsRequest
) => {
  return entrepriseApi.post("/Tools/todo/editTaskDetails", data);
};

export const deleteTodoTaskAPI = async (data: DeleteTodoTaskRequest) => {
  return entrepriseApi.post("/Tools/todo/deleteTask", data);
};

export const deleteTodoListAPI = async (data: DeleteTodoListRequest) => {
  return entrepriseApi.post("/Tools/todo/deleteList", data);
};

export const deleteTodoStepAPI = async (data: DeleteTodoStepRequest) => {
  return entrepriseApi.post("/Tools/todo/deleteStep", data);
};

export const reorderListsAPI = async (data: ReorderListRequest) => {
  return entrepriseApi.post("/Tools/todo/reorderLists", data);
};

export const reorderTasksAPI = async (data: ReorderTaskRequest) => {
  return entrepriseApi.post("/Tools/todo/reorderTasks", data);
};

export const reorderStepsAPI = async (data: ReorderStepRequest) => {
  return entrepriseApi.post("/Tools/todo/reorderSteps", data);
};

export const reorderCalanderAPI = async (data: ReorderCalendarRequest) => {
  return entrepriseApi.post("/Tools/todo/reorderCalendar", data);
};

export const suggestStepAPI = async (data: SuggestStepRequest) => {
  // AI might need more time: set 2min timeout for this request (default ~12s)
  return entrepriseApi.post("/Tools/todo/suggestStep", data, {
    timeout: 120000,
  });
};

export const suggestDescriptionAPI = async (data: SuggestDescriptionRequest) => {
  return entrepriseApi.post("/Tools/todo/suggestDescription", data, {
    timeout: 120000,
  });
};


export const searchTaskAPI = async (data: SearchTaskRequest) => {
  return entrepriseApi.post("/Tools/todo/searchTask", data);
};

export const toggleActiveTaskAPI = async (taskId: string) => {
  return entrepriseApi.patch(`/Tools/todo/toggleStatus/${taskId}`);
};

export const fetchActiveTasksAPI = async () => {
  return entrepriseApi.get("/Tools/todo/fetchActiveTask");
};
