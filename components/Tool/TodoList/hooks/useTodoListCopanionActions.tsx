import { useCopanionAction } from "$/OS/AI/core";
import { ConfirmationDialog } from "$/OS/AI/components";
import { RecurrenceRule } from "@/components/recurrence_filter";
import { encode } from "@toon-format/toon";
import {
  getTodoTaskAPI,
  getTodoTaskByListAPI,
  getTodoTaskByIdAPI,
} from "../../../../services/tools/todo/local";
import { TabType } from "../../../../services/tools/todo/type";
import { Task, List, Step } from "../types";

interface UseTodoListCopanionActionsProps {
  tasks: Task[];
  lists: List[];
  inProgressTask: string | undefined;
  suggestStepLoading: boolean;
  handleAddTask: (params: {
    title: string;
    listId?: string;
    description?: string;
    starred?: boolean;
    myDay?: boolean;
    date?: Date;
    recurrence?: RecurrenceRule;
  }) => Promise<any>;
  handleEditTask: (
    id: string,
    fieldsToUpdate: Record<string, any>,
    ignore?: boolean
  ) => void;
  handleCreateList: ({
    name,
    planned,
    ignore,
  }: {
    name?: string;
    planned?: boolean;
    ignore?: boolean;
  }) => Promise<string | undefined>;
  getTodoAPI: () => Promise<any>;
  handleSuggestStep: (taskId: string) => Promise<Step[]>;
  handleAddNextStep: (
    taskId: string,
    nextStep: string,
    newId?: string
  ) => Promise<string | undefined>;
}

// Helper function to validate goalId format
function isValidGoalId(goalId: string): boolean {
  if (!goalId || typeof goalId !== "string" || goalId.trim().length === 0) {
    return false;
  }
  // MongoDB ObjectId format validation (24 hex characters)
  return /^[0-9a-fA-F]{24}$/.test(goalId.trim());
}

// Helper function to check if goal exists
async function validateGoalExists(
  goalId: string,
  getTodoTaskByIdAPI: (id: string) => Promise<any>
): Promise<{ exists: boolean; error?: string; data?: any }> {
  try {
    if (!isValidGoalId(goalId)) {
      return {
        exists: false,
        error: `Invalid goal ID format: "${goalId}". Goal IDs must be 24-character hexadecimal strings.`,
      };
    }

    const response = await getTodoTaskByIdAPI(goalId);
    
    if (response.status === 200 && response.data) {
      return { exists: true, data: response.data };
    }
    
    if (response.status === 404) {
      return {
        exists: false,
        error: `Goal with ID "${goalId}" not found. The goal may have been deleted or never existed.`,
      };
    }

    return {
      exists: false,
      error: `Failed to verify goal existence. Server returned status ${response.status}.`,
    };
  } catch (error: any) {
    // Handle rate limiting
    if (error?.response?.status === 429 || error?.message?.includes("rate limit")) {
      return {
        exists: false,
        error: `Rate limit exceeded. Please wait a moment before trying again. The goal ID "${goalId}" could not be verified due to rate limiting.`,
      };
    }

    // Handle network errors
    if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
      return {
        exists: false,
        error: `Request timeout while verifying goal "${goalId}". The server may be slow or unavailable. Please try again.`,
      };
    }

    return {
      exists: false,
      error: `Error verifying goal existence: ${
        error?.message || "Unknown error occurred"
      }`,
    };
  }
}

// Helper function to extract error message from various error types
function extractErrorMessage(error: any): string {
  if (error?.response?.status === 429 || error?.message?.includes("rate limit")) {
    return "Rate limit exceeded. Please wait a moment before trying again.";
  }
  if (error?.response?.status === 404) {
    return "Resource not found. It may have been deleted.";
  }
  if (error?.response?.status === 403) {
    return "Access forbidden. You may not have permission to perform this action.";
  }
  if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
    return "Request timeout. The server may be slow or unavailable. Please try again.";
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return "Unknown error occurred";
}

export function useTodoListCopanionActions({
  tasks,
  lists,
  inProgressTask,
  suggestStepLoading,
  handleAddTask,
  handleEditTask,
  handleCreateList,
  handleSuggestStep,
  getTodoAPI,
  handleAddNextStep,
}: UseTodoListCopanionActionsProps) {
  // Create a new listings
  useCopanionAction({
    name: "create_new_folder",
    description:
      "Create a new folder for the todo list. Use this to requests to create a new folder.",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "The name of the folder",
        example: "New Folder",
      },
      {
        name: "planned",
        type: "boolean",
        description: "Whether the goal is planned",
        example: "false",
      },
    ],
    handler: async ({ name, planned }) => {
      try {
        if (name && name.trim().length > 100) {
          return "Folder name cannot exceed 100 characters. Please provide a shorter name.";
        }

        const listId = await handleCreateList({
          name: name?.trim() || "New Folder",
          planned: planned || false,
          ignore: false,
        });

        if (!listId) {
          return "Failed to create folder. The operation may have been cancelled or the server encountered an error. Please try again.";
        }

        const todoList = await getTodoAPI();
        
        if (!todoList?.data?.TodoList) {
          return `Folder created successfully with ID: ${listId}. However, unable to retrieve the updated folder list.`;
        }

        return `The new folder has been created successfully. Here is the list of all the folders: ${encode(
          todoList.data.TodoList
        )}`;
      } catch (error: any) {
        const errorMessage = extractErrorMessage(error);
        return `Failed to create folder: ${errorMessage}. Please try again or contact support if the issue persists.`;
      }
    },
  });

  // Add Todo Task Action
  useCopanionAction({
    name: "add_todo_goal",
    description:
      "Request to add a goal. Only use this tool to requests to add a goal or if you think it's nessercary to create a goal.",
    parameters: [
      {
        name: "title",
        type: "string",
        description: "The title of the goal",
        example: "Buy groceries for the week",
        required: true,
      },
      {
        name: "listId",
        type: "string",
        description: "The list id of the goal",
        example: "123",
        required: false,
      },
      {
        name: "dueDate",
        type: "string",
        description:
          "The due date and time of the goal in YYYY-MM-DDTHH:mm:ss format. Will be converted to Date type. Reminder if goal needs to be completed before the end of the day, set the time to 23:59:59",
        example: "2025-01-01T14:30:00",
        required: false,
      },
      {
        name: "description",
        type: "string",
        description: "The description of the goal",
        example:
          "Pick up fresh vegetables and fruits from the local market for the week",
        required: false,
      },
      {
        name: "starred",
        type: "boolean",
        description:
          "Whether the goal is priority. (If it's goal is important, set this to true)",
        example: "true",
        required: false,
      },
      {
        name: "myDay",
        type: "boolean",
        description:
          "This will show the goal in Today's list. Whether the goal is set to today's list. (If you want to set the goal to today's list, set this to true)",
        example: "true",
        required: false,
      },
      {
        name: "recurrence",
        type: "object",
        description:
          "The recurrence of the goal, if you don't want to set a recurrence or one time recurrence, set this to null",
        attributes: [
          {
            name: "frequency",
            type: "string",
            description:
              "The frequency of the recurrence, daily means every day, weekly means every week, monthly means every month, yearly means every year, custom means custom recurrence, one_time means one time recurrence does not repeat",
            enum: [
              "daily",
              "weekly",
              "monthly",
              "yearly",
              "custom",
              "one_time",
            ],
          },
          {
            name: "interval",
            type: "number",
            description: "The interval of the recurrence",
          },
          {
            name: "months",
            type: "number[]",
            description: "The months of the recurrence",
          },
          {
            name: "days",
            type: "number[]",
            description: "The days of the recurrence",
          },
          {
            name: "time",
            type: "string",
            description: "The time of the recurrence",
          },
          {
            name: "startDate",
            type: "string",
            description: "The start date of the recurrence",
          },
          {
            name: "endDate",
            type: "string",
            description: "The end date of the recurrence",
          },
        ],
        required: false,
        example: JSON.stringify({
          frequency: "daily",
          interval: 1,
          months: [],
          days: [],
          startDate: "2025-01-01",
        }),
      },
    ],
    renderAndWaitForResponse: (props) => {
      return (
        <ConfirmationDialog
          {...props}
          title="Create a new Goal"
          description="Confirm to create a new goal with the following details:"
          confirmLabel="Create Goal"
          rejectLabel="Reject"
          onConfirm={async (args: any) => {
            try {
              const {
                title,
                listId,
                description,
                starred,
                myDay,
                dueDate,
                recurrence,
              } = args;

              // Validate title
              if (!title || typeof title !== "string" || title.trim().length === 0) {
                return "Title cannot be empty. Please provide a valid goal title.";
              }

              if (title.trim().length > 200) {
                return "Title is too long. Please provide a title that is 200 characters or less.";
              }

              // Validate listId if provided
              if (listId && listId.trim() !== "" && !isValidGoalId(listId)) {
                return `Invalid list ID format: "${listId}". List IDs must be 24-character hexadecimal strings.`;
              }

              // Validate dueDate if provided
              if (dueDate && dueDate.trim() !== "") {
                const date = new Date(dueDate);
                if (isNaN(date.getTime())) {
                  return `Invalid due date format: "${dueDate}". Please provide a date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD).`;
                }
              }

              // Validate recurrence if provided
              let parsedRecurrence = undefined;
              if (recurrence && recurrence.trim() !== "") {
                try {
                  parsedRecurrence = JSON.parse(recurrence);
                } catch (parseError) {
                  return `Invalid recurrence format: "${recurrence}". Please provide a valid JSON object for recurrence.`;
                }
              }

              const result = await handleAddTask({
                title: title.trim(),
                listId: listId?.trim() || undefined,
                description: description?.trim() || undefined,
                starred: starred || false,
                myDay: myDay || false,
                date: dueDate
                  ? new Date(new Date(dueDate).toISOString())
                  : undefined, // ✅ Convert string to UTC Date
                recurrence: parsedRecurrence,
              });

              if (!result) {
                return "Failed to create goal. The operation completed but no goal data was returned. Please try again.";
              }

              return `The goal has been created successfully. Here is the goal details: ${encode(
                result
              )}`;
            } catch (error: any) {
              const errorMessage = extractErrorMessage(error);
              return `Failed to create goal: ${errorMessage}. Please check your input and try again.`;
            }
          }}
          onReject="The goal was not added, and maintains its original contents."
        />
      );
    },
  });

  // Get Todo Task Listings Action
  useCopanionAction(
    {
      name: "get_todo_goal_listings",
      description:
        "Get all available user's todo goals's listing which is the parent of the goal. Use this when you needs to know the listings or wants to know the specific listing for the goal you are trying to add. This is a list of all the lists that the user has created.",
      handler: async () => {
        if (lists.length === 0) {
          return "No goals found. Please create a new goal to get started.";
        }

        return `Here is the list of goals: ${encode(lists)}`;
      },
    },
    [lists]
  );

  // Get All Tasks Action
  useCopanionAction({
    name: "get_all_goals",
    description:
      "Get all the goals with optional filtering. Use this when you need to see specific goals with the filters. If you want to know what other goal user has, use this tool. Only provide the filters that are relevant to the goal you are trying to get. Only use the filter In the parameter filters section else don't add any filters.",
    parameters: [
      {
        name: "filters",
        type: "object",
        attributes: [
          {
            name: "listId",
            type: "string",
            description: "Filter by specific goal ID",
          },
          {
            name: "status",
            type: "string",
            enum: ["pending", "completed", "in_progress", "blocked"],
          },
          { name: "overdue", type: "boolean" },
          { name: "dueToday", type: "boolean" },
          { name: "starred", type: "boolean" },
          { name: "myDay", type: "boolean" },
        ],
        required: false,
      },
      {
        name: "limit",
        type: "number",
        description: "Maximum number of goals to return",
        required: false,
      },
    ],
    handler: async ({ filters, limit }) => {
      try {
        // Validate limit if provided
        if (limit !== undefined) {
          if (typeof limit !== "number" || limit < 1 || limit > 10000) {
            return `Invalid limit value: ${limit}. Limit must be a number between 1 and 10000.`;
          }
        }

        // Validate listId if provided in filters
        if (filters?.listId) {
          if (!isValidGoalId(filters.listId)) {
            return `Invalid list ID format in filters: "${filters.listId}". List IDs must be 24-character hexadecimal strings.`;
          }
        }

        // Validate status if provided
        if (filters?.status) {
          const validStatuses = ["pending", "completed", "in_progress", "blocked"];
          if (!validStatuses.includes(filters.status)) {
            return `Invalid status filter: "${filters.status}". Status must be one of: ${validStatuses.join(", ")}.`;
          }
        }

        let tasksToFilter: Task[] = [];

        // Determine if we need to fetch from API or can use in-memory
        const needsApiFetch =
          !filters || // No filters = want all tasks
          filters.listId || // Specific list might not be in current view
          filters.status || // Status filter might need more data
          filters.overdue || // Overdue filter needs complete data
          filters.dueToday || // Due today needs complete data
          filters.starred !== undefined || // Starred filter needs complete data
          filters.myDay !== undefined; // MyDay filter needs complete data

        if (needsApiFetch) {
          // Fetch from API for complete data
          try {
            if (filters?.listId) {
              // Fetch tasks for specific list
              const response = await getTodoTaskByListAPI(filters.listId);
              if (response.status === 200) {
                tasksToFilter = response.data || [];
              } else if (response.status === 404) {
                return `List with ID "${filters.listId}" not found. The list may have been deleted or never existed.`;
              } else {
                const errorMessage = extractErrorMessage({ response });
                return `Failed to fetch tasks for list "${filters.listId}": ${errorMessage}. Please verify the list exists and try again.`;
              }
            } else {
              // Fetch all tasks (using "task" tab to get all tasks)
              const response = await getTodoTaskAPI("task" as TabType, {
                limit: limit || 1000, // Get more tasks if limit specified
              });
              if (response.status === 200) {
                tasksToFilter = response.data || [];
              } else {
                const errorMessage = extractErrorMessage({ response });
                return `Failed to fetch tasks: ${errorMessage}. Please try again.`;
              }
            }
          } catch (error: any) {
            const errorMessage = extractErrorMessage(error);
            console.error("Failed to fetch tasks from API:", error);
            
            // If we have in-memory tasks, use them as fallback
            if (tasks.length > 0) {
              tasksToFilter = tasks;
              // Return a warning that we're using cached data
              // Note: We'll continue processing but the AI should know data might be stale
            } else {
              return `Failed to fetch tasks: ${errorMessage}. No cached tasks available. Please try again or check your connection.`;
            }
          }
        } else {
          // Use in-memory tasks for fast queries
          tasksToFilter = tasks;
        }

        // Apply client-side filters
        let filteredTasks = tasksToFilter;

        if (filters) {
          if (filters.listId) {
            filteredTasks = filteredTasks.filter(
              (t) => t.listId === filters.listId
            );
          }
          if (filters.status) {
            filteredTasks = filteredTasks.filter(
              (t) => t.status === filters.status
            );
          }
          if (filters.overdue) {
            filteredTasks = filteredTasks.filter(
              (t) =>
                t.dueDate &&
                new Date(t.dueDate) < new Date() &&
                t.status !== "completed"
            );
          }
          if (filters.dueToday) {
            const today = new Date();
            filteredTasks = filteredTasks.filter((t) => {
              if (!t.dueDate) return false;
              return new Date(t.dueDate).toDateString() === today.toDateString();
            });
          }
          if (filters.starred !== undefined) {
            filteredTasks = filteredTasks.filter(
              (t) => t.starred === filters.starred
            );
          }
          if (filters.myDay !== undefined) {
            filteredTasks = filteredTasks.filter(
              (t) => t.myDay === filters.myDay
            );
          }
        }

        if (limit) {
          filteredTasks = filteredTasks.slice(0, limit);
        }

        if (filteredTasks.length === 0) {
          if (filters) {
            return `No tasks found matching the specified filters. Try adjusting your search criteria or check if tasks exist with different filters.`;
          }
          return "No tasks found. The task list is empty.";
        }

        if (!inProgressTask) {
          return `Found ${filteredTasks.length} task(s). Here is the list of tasks: ${encode(filteredTasks)}`;
        }

        // Mark all filteredTask status to "blocked" unless the task is the active task
        const activeTaskId = inProgressTask;
        const tasksWithBlockedStatus = filteredTasks.map(task => {
          if (activeTaskId && task._id !== activeTaskId) {
            return { ...task, status: "blocked" };
          }
          return task;
        });

        return `Found ${tasksWithBlockedStatus.length} task(s). Here is the list of tasks: ${encode(tasksWithBlockedStatus)}`;
      } catch (error: any) {
        const errorMessage = extractErrorMessage(error);
        console.error("Failed to get goals:", error);
        return `Failed to retrieve goals: ${errorMessage}. Please try again.`;
      }
    },
  });

  // Get Task Details Action
  useCopanionAction({
    name: "get_goal_details",
    description:
      "Retrieve full details for a specific goal by its ID, but only when the user specifically asks for these details. This will return the latest information for the requested goal, including description, steps, attachments, due date, and other details, always directly from the API.",
    parameters: [
      {
        name: "goalId",
        type: "string",
        description: "The ID of the goal to get details for",
        required: true,
      },
    ],
    handler: async ({ goalId }) => {
      try {
        // Validate goalId format
        if (!goalId || typeof goalId !== "string" || goalId.trim().length === 0) {
          return "Invalid goal ID provided. Goal ID cannot be empty. Please provide a valid goal ID.";
        }

        const response = await getTodoTaskByIdAPI(goalId.trim());

        if (response.status === 404) {
          return `Goal with ID "${goalId}" not found. The goal may have been deleted or never existed. Please verify the goal ID is correct.`;
        }

        if (response.status !== 200) {
          const errorMessage = (response.data as any)?.message || `Server returned status ${response.status}`;
          return `Failed to fetch goal details for goal "${goalId}": ${errorMessage}. Please verify the goal exists and try again.`;
        }

        if (!response.data) {
          return `Goal with ID "${goalId}" was found but contains no data. This may indicate the goal was deleted or corrupted.`;
        }

        // Return the goal details as-is from the API
        return `Here is the goal details: ${encode(response.data)}
        // Note: The response data may include a "steps" property. In this context, "steps" refers to the individual tasks or subtasks associated with the main goal. You can interpret "steps" as the goal's subtasks, actionable items, or checklist.
        `;
      } catch (error: any) {
        const errorMessage = extractErrorMessage(error);
        console.error("Failed to fetch goal details:", error);
        return `Failed to fetch goal details for goal "${goalId}": ${errorMessage}. Please verify the goal ID is correct and try again.`;
      }
    },
  });

  // Edit Todo Task Action
  useCopanionAction({
    name: "edit_todo_goal",
    description:
      "Edit an existing goal. Use this when update goal details like title, status, due date, priority, or move it to a different list. This will update the goal details in the todo list. Use this when you want to update the goal details or user made a progress to the goal.",
    parameters: [
      {
        name: "goalId",
        type: "string",
        description: "The ID of the goal to edit",
        required: true,
      },
      {
        name: "title",
        type: "string",
        description: "Update the goal title",
      },
      {
        name: "status",
        type: "string",
        enum: ["pending", "completed", "in_progress", "blocked"],
        description: "Update the goal status",
      },
      {
        name: "dueDate",
        type: "string",
        description:
          "Update the due date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD). Set to empty string to remove due date.",
      },
      {
        name: "description",
        type: "string",
        description: "Update the goal description",
      },
      {
        name: "starred",
        type: "boolean",
        description: "Mark task as priority (starred) or not",
      },
      {
        name: "myDay",
        type: "boolean",
        description: "Add or remove task from My Day (Focus)",
      },
      {
        name: "listId",
        type: "string",
        description:
          "Move task to a different list. Set to empty string to remove from list.",
      },
    ],
    renderAndWaitForResponse: (props) => {
      return (
        <ConfirmationDialog
          {...props}
          title="Update Goal"
          description="Confirm to update the goal with the following details:"
          confirmLabel="Update Goal"
          rejectLabel="Reject"
          onConfirm={async (args: any) => {
            try {
              const {
                goalId,
                title,
                status,
                dueDate,
                description,
                starred,
                myDay,
                listId,
              } = args;

              // Validate goalId
              if (!goalId || typeof goalId !== "string" || goalId.trim().length === 0) {
                return "Invalid goal ID provided. Goal ID cannot be empty. Please provide a valid goal ID.";
              }

              // Validate goal exists before attempting to edit
              const goalValidation = await validateGoalExists(goalId.trim(), getTodoTaskByIdAPI);
              if (!goalValidation.exists) {
                return goalValidation.error || `Cannot edit goal "${goalId}" because it does not exist or could not be accessed.`;
              }

              // Validate title if provided
              if (title !== undefined) {
                if (typeof title !== "string") {
                  return "Title must be a string. Please provide a valid title.";
                }
                if (title.trim().length === 0) {
                  return "Title cannot be empty. Please provide a valid title or omit this field.";
                }
                if (title.trim().length > 200) {
                  return "Title is too long. Please provide a title that is 200 characters or less.";
                }
              }

              // Validate status if provided
              if (status !== undefined) {
                const validStatuses = ["pending", "completed", "in_progress", "blocked"];
                if (!validStatuses.includes(status)) {
                  return `Invalid status "${status}". Status must be one of: ${validStatuses.join(", ")}.`;
                }
              }

              // Validate dueDate if provided
              if (dueDate !== undefined && dueDate !== "") {
                const date = new Date(dueDate);
                if (isNaN(date.getTime())) {
                  return `Invalid due date format: "${dueDate}". Please provide a date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD).`;
                }
              }

              // Validate listId if provided
              if (listId !== undefined && listId !== "") {
                if (!isValidGoalId(listId)) {
                  return `Invalid list ID format: "${listId}". List IDs must be 24-character hexadecimal strings.`;
                }
              }

              const fieldsToUpdate: Record<string, any> = {};

              if (title !== undefined) {
                fieldsToUpdate.title = title.trim();
              }
              if (status !== undefined) {
                fieldsToUpdate.status = status;
              }
              if (dueDate !== undefined) {
                // Handle empty string to remove due date
                fieldsToUpdate.dueDate =
                  dueDate === "" ? undefined : new Date(dueDate);
              }
              if (description !== undefined) {
                fieldsToUpdate.description = description;
              }
              if (starred !== undefined) {
                fieldsToUpdate.starred = starred;
              }
              if (myDay !== undefined) {
                fieldsToUpdate.myDay = myDay;
              }
              if (listId !== undefined) {
                // Handle empty string to remove from list
                fieldsToUpdate.listId = listId === "" ? undefined : listId;
              }

              if (Object.keys(fieldsToUpdate).length === 0) {
                return "No fields to update. Please specify at least one field to edit.";
              }

              await handleEditTask(goalId.trim(), fieldsToUpdate);

              return `Goal "${goalId}" updated successfully. Updated fields: ${encode(
                fieldsToUpdate
              )}`;
            } catch (error: any) {
              const errorMessage = extractErrorMessage(error);
              return `Failed to update goal: ${errorMessage}. Please verify the goal exists and try again.`;
            }
          }}
          onReject="The goal was not updated, and maintains its original contents."
        />
      );
    },
  });

  // Breakdown Task Action
  useCopanionAction({
    name: "breakdown_goal",
    description:
      "Breakdown a goal into smaller step by step tasks. Use this when the user requests or you think it's reasonable to breakdown a goal into smaller goals or help them keep in track their process. This will suggest the steps for the goal and update the goal details in the todo list.",
    available: suggestStepLoading ? "disabled" : "enabled",
    parameters: [
      {
        name: "goalId",
        type: "string",
        description: "The ID of the goal to breakdown",
        required: true,
      },
    ],
    handler: async ({ goalId }) => {
      try {
        // Validate goalId format
        if (!goalId || typeof goalId !== "string" || goalId.trim().length === 0) {
          return "Invalid goal ID provided. Goal ID cannot be empty. Please provide a valid goal ID.";
        }

        // Validate goal exists before attempting breakdown
        const goalValidation = await validateGoalExists(goalId, getTodoTaskByIdAPI);
        if (!goalValidation.exists) {
          return goalValidation.error || `Goal with ID "${goalId}" does not exist or could not be accessed.`;
        }

        // Attempt to suggest steps
        const result = await handleSuggestStep(goalId.trim());
        
        if (!result || !Array.isArray(result)) {
          return `Failed to generate steps for goal "${goalId}". The breakdown process did not return valid steps. This could be due to server issues or the goal may not be suitable for breakdown. Please try again or manually add steps.`;
        }

        if (result.length === 0) {
          return `The breakdown process completed but no steps were generated for goal "${goalId}". This may happen if the goal is too simple or if there was an issue with step generation. You may want to manually add steps or try again.`;
        }

        return `The goal has been successfully broken down into ${result.length} smaller steps. Here is the list of steps within the goal: ${encode(
          result
        )}. This is a list of steps that the user can follow to complete the goal. Use this to help the user keep track of their progress and keep them motivated to complete the goal.`;
      } catch (error: any) {
        const errorMessage = extractErrorMessage(error);
        console.error("Failed to breakdown goal:", error);
        return `Failed to breakdown goal "${goalId}": ${errorMessage}. Please verify the goal exists and try again. If the problem persists, the goal may need to be recreated or the server may be experiencing issues.`;
      }
    },
  }, [suggestStepLoading]);

  // Add Step to Goal Action
  useCopanionAction({
    name: "add_step_to_goal",
    description:
      "Add a single step to an existing goal. Use this when the user requests to add a specific step to a goal or when you need to add a step to help the user track their progress. This will add the step to the goal's step list.",
    parameters: [
      {
        name: "goalId",
        type: "string",
        description: "The ID of the goal to add a step to",
        required: true,
      },
      {
        name: "stepTitle",
        type: "string",
        description: "The title or description of the step to add",
        example: "Research market competitors",
        required: true,
      },
    ],
    handler: async ({ goalId, stepTitle }) => {
      try {
        // Validate goalId
        if (!goalId || typeof goalId !== "string" || goalId.trim().length === 0) {
          return "Invalid goal ID provided. Goal ID cannot be empty. Please provide a valid goal ID.";
        }

        // Validate stepTitle
        if (!stepTitle || typeof stepTitle !== "string" || stepTitle.trim().length === 0) {
          return "Step title cannot be empty. Please provide a valid step title with at least one character.";
        }

        if (stepTitle.trim().length > 500) {
          return "Step title is too long. Please provide a step title that is 500 characters or less.";
        }

        // Validate goal exists before attempting to add step
        const goalValidation = await validateGoalExists(goalId.trim(), getTodoTaskByIdAPI);
        if (!goalValidation.exists) {
          return goalValidation.error || `Cannot add step to goal "${goalId}" because the goal does not exist or could not be accessed.`;
        }

        // Attempt to add the step
        const stepId = await handleAddNextStep(goalId.trim(), stepTitle.trim());

        if (!stepId) {
          return `Failed to add step "${stepTitle}" to goal "${goalId}". The operation completed but no step ID was returned. This could indicate the step was not saved. Please verify the goal exists and try again.`;
        }

        return `Step "${stepTitle}" has been successfully added to the goal. The step has been assigned ID: ${stepId}.`;
      } catch (error: any) {
        const errorMessage = extractErrorMessage(error);
        console.error("Failed to add step to goal:", error);
        return `Failed to add step "${stepTitle}" to goal "${goalId}": ${errorMessage}. Please verify the goal exists and try again. If the problem persists, the goal may have been deleted or the server may be experiencing issues.`;
      }
    },
  });
}
