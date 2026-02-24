import { useReducer, useCallback, useRef, useEffect } from "react";

// Action Types
export enum ActionType {
  IDLE = "idle",
  TALKING = "talking",
  LISTENING = "listening",
  THINKING = "thinking",
  SPEAKING = "speaking",
  DANCING = "dancing",
  WALKING = "walking",
  HAPPY = "happy",
  EXCITED = "excited",
  CONFUSED = "confused",
  SURPRISED = "surprised",
  CONCENTRATED = "concentrated",
  ANGRY = "angry",
  MOTION = "motion",
  LOOPING = "looping",
  FLICK = "Flick",
  FLICK_DOWN = "FlickDown",
  FLICK_UP = "FlickUp",
  TAP = "Tap",
  TAP_BODY = "Tap@Body",
  FLICK_BODY = "Flick@Body",
  SHY = "shy",
  SAD = "sad",
}

// Action Execution Data
export interface ActionExecution {
  id: string;
  action: {
    type: ActionType;
    motionGroup?: string;
    motionIndex?: number;
    expression?: string;
    sound?: string;
    duration?: number;
    priority?: number;
    loopInterval?: number; // For looping motions
  };
  timestamp: number;
  status: "pending" | "active" | "completed" | "cancelled";
}

// State Interface
export interface ActionState {
  currentAction: ActionExecution | null;
  actionQueue: ActionExecution[];
  isIdle: boolean;
  // Multiple concurrent action states
  activeActions: {
    talking: boolean;
    dancing: boolean;
    walking: boolean;
    thinking: boolean;
    listening: boolean;
    // Add more as needed
  };
  lastActionTime: number;
  actionHistory: ActionExecution[];
  maxHistorySize: number;
}

// Action Types for Reducer
type ActionReducerAction =
  | { type: "START_ACTION"; payload: ActionExecution }
  | { type: "END_ACTION"; payload: { id: string } }
  | { type: "QUEUE_ACTION"; payload: ActionExecution }
  | { type: "CANCEL_ACTION"; payload: { id: string } }
  | { type: "CLEAR_QUEUE" }
  | { type: "SET_IDLE" }
  | { type: "SET_TALKING"; payload: { isTalking: boolean } }
  | { type: "SET_DANCING"; payload: { isDancing: boolean } }
  | { type: "SET_WALKING"; payload: { isWalking: boolean } }
  | { type: "SET_THINKING"; payload: { isThinking: boolean } }
  | { type: "SET_LISTENING"; payload: { isListening: boolean } }
  | {
      type: "UPDATE_ACTION_STATUS";
      payload: { id: string; status: ActionExecution["status"] };
    }
  | { type: "CLEAR_HISTORY" };

// Initial State
const initialState: ActionState = {
  currentAction: null,
  actionQueue: [],
  isIdle: true,
  activeActions: {
    talking: false,
    dancing: false,
    walking: false,
    thinking: false,
    listening: false,
  },
  lastActionTime: 0,
  actionHistory: [],
  maxHistorySize: 50,
};

// Helper function to map ActionType to activeActions state
const getActiveActionsFromActionType = (actionType: ActionType) => {
  const activeActions = {
    talking: false,
    dancing: false,
    walking: false,
    thinking: false,
    listening: false,
  };

  switch (actionType) {
    case ActionType.TALKING:
    case ActionType.SPEAKING:
      activeActions.talking = true;
      break;
    case ActionType.DANCING:
      activeActions.dancing = true;
      break;
    case ActionType.WALKING:
      activeActions.walking = true;
      break;
    case ActionType.THINKING:
      activeActions.thinking = true;
      break;
    case ActionType.LISTENING:
      activeActions.listening = true;
      break;
    // Add new action types here - no need to update multiple places!
    default:
      // For other action types, keep all false (idle state)
      break;
  }

  return activeActions;
};

// Helper function to get reset active actions (all false)
const getResetActiveActions = () => ({
  talking: false,
  dancing: false,
  walking: false,
  thinking: false,
  listening: false,
});

// Helper function to execute Live2D actions
const executeLive2DAction = (
  action: ActionExecution,
  live2DModel?: Live2DModel | null
) => {
  if (!live2DModel) return;

  const { action: actionData } = action;
  const model = live2DModel;

  try {
    // Execute motion if available
    if (actionData.motionGroup && model.executeMotion) {
      let success = false;

      // Handle looping motions
      if (actionData.type === ActionType.LOOPING && model.executeMotionLoop) {
        const intervalMs = actionData.loopInterval || 2000; // Default 2 seconds
        success = model.executeMotionLoop(
          actionData.motionGroup,
          actionData.motionIndex || 0,
          intervalMs
        );
      } else {
        // Regular motion execution
        success = model.executeMotion(
          actionData.motionGroup,
          actionData.motionIndex || 0
        );
      }

      if (!success) {
        console.warn(
          `Failed to execute motion: ${actionData.motionGroup}[${
            actionData.motionIndex || 0
          }]`
        );
      }
    }

    // Change expression if available
    if (actionData.expression && model.changeExpression) {
      const success = model.changeExpression(actionData.expression);
      if (!success) {
        console.warn(`Failed to change expression: ${actionData.expression}`);
      }
    }

    // Play sound if available
    if (actionData.sound && model.playSound) {
      const success = model.playSound(actionData.sound);
      if (!success) {
        console.warn(`Failed to play sound: ${actionData.sound}`);
      }
    }
  } catch (error) {
    console.error("🎭 Live2D Action execution failed:", error);
  }
};

// Reducer Function with Live2D Model
function actionReducer(
  state: ActionState,
  action: ActionReducerAction,
  live2DModel?: Live2DModel | null
): ActionState {
  switch (action.type) {
    case "START_ACTION": {
      const { payload } = action;
      const now = Date.now();

      // Don't execute Live2D action here - it will be handled in useEffect
      // executeLive2DAction(payload, live2DModel);

      // Add to history
      const newHistory = [
        { ...payload, status: "active" as const },
        ...state.actionHistory.slice(0, state.maxHistorySize - 1),
      ];

      // Update active actions based on action type
      const newActiveActions = getActiveActionsFromActionType(
        payload.action.type
      );
      const updatedActiveActions = {
        ...state.activeActions,
        ...newActiveActions,
      };

      return {
        ...state,
        currentAction: { ...payload, status: "active" },
        isIdle: false,
        activeActions: updatedActiveActions,
        lastActionTime: now,
        actionHistory: newHistory,
      };
    }

    case "END_ACTION": {
      const { id } = action.payload;

      // Update current action if it matches
      if (state.currentAction?.id === id) {
        // Get next action from queue
        const nextAction =
          state.actionQueue.length > 0 ? state.actionQueue[0] : null;
        const remainingQueue = state.actionQueue.slice(1);

        // Determine new state based on next action
        const updatedActiveActions = nextAction
          ? getActiveActionsFromActionType(nextAction.action.type)
          : getResetActiveActions();

        return {
          ...state,
          currentAction: nextAction
            ? { ...nextAction, status: "active" }
            : null,
          actionQueue: remainingQueue,
          isIdle: !nextAction,
          activeActions: updatedActiveActions,
          lastActionTime: Date.now(),
        };
      }

      // Remove from queue if it exists there
      const updatedQueue = state.actionQueue.filter(
        (action) => action.id !== id
      );

      return {
        ...state,
        actionQueue: updatedQueue,
      };
    }

    case "QUEUE_ACTION": {
      const { payload } = action;

      // Add to queue with pending status
      const queuedAction = { ...payload, status: "pending" as const };

      return {
        ...state,
        actionQueue: [...state.actionQueue, queuedAction],
      };
    }

    case "CANCEL_ACTION": {
      const { id } = action.payload;

      // Cancel current action if it matches
      if (state.currentAction?.id === id) {
        // Get next action from queue
        const nextAction =
          state.actionQueue.length > 0 ? state.actionQueue[0] : null;
        const remainingQueue = state.actionQueue.slice(1);

        const updatedActiveActions = nextAction
          ? getActiveActionsFromActionType(nextAction.action.type)
          : getResetActiveActions();

        return {
          ...state,
          currentAction: nextAction
            ? { ...nextAction, status: "active" }
            : null,
          actionQueue: remainingQueue,
          isIdle: !nextAction,
          activeActions: updatedActiveActions,
        };
      }

      // Remove from queue
      const updatedQueue = state.actionQueue.filter(
        (action) => action.id !== id
      );

      return {
        ...state,
        actionQueue: updatedQueue,
      };
    }

    case "CLEAR_QUEUE": {
      return {
        ...state,
        actionQueue: [],
      };
    }

    case "SET_IDLE": {
      return {
        ...state,
        currentAction: null,
        actionQueue: [],
        isIdle: true,
        activeActions: getResetActiveActions(),
        lastActionTime: Date.now(),
      };
    }

    case "SET_TALKING": {
      const { isTalking } = action.payload;

      // Only update Live2D model if the state actually changed to prevent excessive updates during streaming
      if (live2DModel && state.activeActions.talking !== isTalking) {
        if (isTalking) {
          // Defer talking start to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.startTalking &&
              typeof live2DModel.startTalking === "function"
            ) {
              live2DModel.startTalking();
            }
          }, 0);
        } else {
          // Defer talking stop to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.stopTalking &&
              typeof live2DModel.stopTalking === "function"
            ) {
              live2DModel.stopTalking();
            }
          }, 0);
        }
      }

      return {
        ...state,
        activeActions: { ...state.activeActions, talking: isTalking },
        isIdle: !isTalking && !state.currentAction,
      };
    }

    case "SET_DANCING": {
      const { isDancing } = action.payload;

      // Handle Live2D dancing state directly in reducer
      if (live2DModel) {
        if (isDancing) {
          // Defer dancing motion to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("dance", 0);
            }
          }, 0);
        } else {
          // Defer stop dancing motion to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("idle", 0);
            }
          }, 0);
        }
      }

      return {
        ...state,
        activeActions: { ...state.activeActions, dancing: isDancing },
        isIdle: !isDancing && !state.currentAction,
      };
    }

    case "SET_WALKING": {
      const { isWalking } = action.payload;

      // Handle Live2D walking state directly in reducer
      if (live2DModel) {
        if (isWalking) {
          // Defer walking motion to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("walk", 0);
            }
          }, 0);
        } else {
          // Defer stop walking motion to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("idle", 0);
            }
          }, 0);
        }
      }

      return {
        ...state,
        activeActions: { ...state.activeActions, walking: isWalking },
        isIdle: !isWalking && !state.currentAction,
      };
    }

    case "SET_THINKING": {
      const { isThinking } = action.payload;

      // Only update Live2D model if the state actually changed to prevent excessive updates during streaming
      if (live2DModel && state.activeActions.thinking !== isThinking) {
        if (isThinking) {
          // Defer thinking motion to avoid render-time state updates
          setTimeout(() => {
            /*             if (
              live2DModel.executeMotionLoop &&
              typeof live2DModel.executeMotionLoop === "function"
            ) {
              // Start thinking motion in loop (every 3 seconds)
              live2DModel.executeMotionLoop("Flick", 0, 3000);
            } else  */
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              // Fallback to single motion if loop not available
              live2DModel.executeMotion("Flick", 0);
            }
          }, 0);
        } else {
          // Stop thinking
          setTimeout(() => {
            if (
              live2DModel.stopMotionLoop &&
              typeof live2DModel.stopMotionLoop === "function"
            ) {
              // Stop the thinking loop
              live2DModel.stopMotionLoop();
            }
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("idle", 0);
            }
          }, 0);
        }
      }

      return {
        ...state,
        activeActions: { ...state.activeActions, thinking: isThinking },
        isIdle: !isThinking && !state.currentAction,
      };
    }

    case "SET_LISTENING": {
      const { isListening } = action.payload;

      // Handle Live2D listening state directly in reducer
      if (live2DModel) {
        if (isListening) {
          // Defer motion and expression changes to avoid render-time state updates
          setTimeout(() => {
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("listen", 0);
            }
            if (
              live2DModel.changeExpression &&
              typeof live2DModel.changeExpression === "function"
            ) {
              live2DModel.changeExpression("listening");
            }
          }, 0);
        } else {
          // Stop listening
          setTimeout(() => {
            if (
              live2DModel.executeMotion &&
              typeof live2DModel.executeMotion === "function"
            ) {
              live2DModel.executeMotion("idle", 0);
            }
          }, 0);
        }
      }

      return {
        ...state,
        activeActions: { ...state.activeActions, listening: isListening },
        isIdle: !isListening && !state.currentAction,
      };
    }

    case "UPDATE_ACTION_STATUS": {
      const { id, status } = action.payload;

      // Update current action
      if (state.currentAction?.id === id) {
        return {
          ...state,
          currentAction: { ...state.currentAction, status },
        };
      }

      // Update action in queue
      const updatedQueue = state.actionQueue.map((action) =>
        action.id === id ? { ...action, status } : action
      );

      return {
        ...state,
        actionQueue: updatedQueue,
      };
    }

    case "CLEAR_HISTORY": {
      return {
        ...state,
        actionHistory: [],
      };
    }

    default:
      return state;
  }
}

// Live2D Model Interface
export interface Live2DModel {
  executeMotion?: (motionGroup: string, motionIndex?: number) => boolean;
  executeMotionLoop?: (
    motionGroup: string,
    motionIndex?: number,
    intervalMs?: number
  ) => boolean;
  stopMotionLoop?: () => void;
  isMotionLooping?: () => boolean;
  changeExpression?: (expression: string) => boolean;
  playSound?: (soundId: string) => boolean;
  startTalking?: () => void;
  stopTalking?: () => void;
  isCurrentlyTalking?: () => boolean;
  getAvailableMotions?: () => string[];
  getAvailableExpressions?: () => string[];
}

// Hook Interface
export interface UseActionControllerProps {
  onActionStart?: (action: ActionExecution) => void;
  onActionEnd?: (action: ActionExecution) => void;
  onStateChange?: (state: ActionState) => void;
  autoProcessQueue?: boolean;
  maxQueueSize?: number;
  live2DModel?: Live2DModel | null;
}

// Main Hook
export const useActionController = ({
  onActionStart,
  onActionEnd,
  onStateChange,
  autoProcessQueue = true,
  maxQueueSize = 10,
  live2DModel = null,
}: UseActionControllerProps = {}) => {
  const actionIdCounter = useRef(0);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Create a reducer that has access to Live2D model
  const reducerWithLive2D = useCallback(
    (state: ActionState, action: ActionReducerAction) => {
      return actionReducer(state, action, live2DModel);
    },
    [live2DModel]
  );

  const [state, dispatch] = useReducer(reducerWithLive2D, initialState);

  // Generate unique action ID
  const generateActionId = useCallback(() => {
    return `action_${++actionIdCounter.current}_${Date.now()}`;
  }, []);

  // Helper function to clear all active states
  const clearAllActiveStates = useCallback(() => {
    if (state.activeActions.talking) {
      dispatch({ type: "SET_TALKING", payload: { isTalking: false } });
    }
    if (state.activeActions.dancing) {
      dispatch({ type: "SET_DANCING", payload: { isDancing: false } });
    }
    if (state.activeActions.walking) {
      dispatch({ type: "SET_WALKING", payload: { isWalking: false } });
    }
    if (state.activeActions.thinking) {
      dispatch({ type: "SET_THINKING", payload: { isThinking: false } });
    }
    if (state.activeActions.listening) {
      dispatch({ type: "SET_LISTENING", payload: { isListening: false } });
    }
  }, [state.activeActions]);

  // End an action
  const endAction = useCallback(
    (actionId: string) => {
      const action =
        state.currentAction?.id === actionId
          ? state.currentAction
          : state.actionQueue.find((a) => a.id === actionId);

      if (action) {
        dispatch({ type: "END_ACTION", payload: { id: actionId } });
        onActionEnd?.(action);

        // Clear timeout if exists
        const timeout = timeoutRefs.current.get(actionId);
        if (timeout) {
          clearTimeout(timeout);
          timeoutRefs.current.delete(actionId);
        }
      }
    },
    [state.currentAction, state.actionQueue, onActionEnd]
  );

  // Start an action immediately
  const startAction = useCallback(
    (
      actionType: ActionType,
      options: Partial<ActionExecution["action"]> = {}
    ) => {
      // If there's a current action running, stop it first
      if (state.currentAction) {
        endAction(state.currentAction.id);
      }

      // Clear all active states
      clearAllActiveStates();

      const actionId = generateActionId();
      const execution: ActionExecution = {
        id: actionId,
        action: {
          type: actionType,
          duration: 3000, // Default 3 seconds
          priority: 1,
          ...options,
        },
        timestamp: Date.now(),
        status: "pending",
      };

      // Update state first
      dispatch({ type: "START_ACTION", payload: execution });
      onActionStart?.(execution);

      // Execute Live2D action after state update (using setTimeout to avoid render-phase issues)
      if (live2DModel) {
        setTimeout(() => {
          executeLive2DAction(execution, live2DModel);
        }, 0);
      }

      // Auto-end action after duration if specified
      if (execution.action.duration && execution.action.duration > 0) {
        const timeout = setTimeout(() => {
          endAction(actionId);
        }, execution.action.duration);

        timeoutRefs.current.set(actionId, timeout);
      }

      return actionId;
    },
    [
      generateActionId,
      onActionStart,
      live2DModel,
      state.currentAction,
      clearAllActiveStates,
      endAction,
    ]
  );

  // Queue an action for later execution
  const queueAction = useCallback(
    (
      actionType: ActionType,
      options: Partial<ActionExecution["action"]> = {}
    ) => {
      if (state.actionQueue.length >= maxQueueSize) {
        console.warn("Action queue is full, dropping action");
        return null;
      }

      const actionId = generateActionId();
      const execution: ActionExecution = {
        id: actionId,
        action: {
          type: actionType,
          duration: 3000,
          priority: 1,
          ...options,
        },
        timestamp: Date.now(),
        status: "pending",
      };

      dispatch({ type: "QUEUE_ACTION", payload: execution });
      return actionId;
    },
    [generateActionId, maxQueueSize, state.actionQueue.length]
  );

  // Cancel an action
  const cancelAction = useCallback((actionId: string) => {
    dispatch({ type: "CANCEL_ACTION", payload: { id: actionId } });

    // Clear timeout if exists
    const timeout = timeoutRefs.current.get(actionId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(actionId);
    }
  }, []);

  // Set idle state
  const setIdle = useCallback(() => {
    // Stop any current action first
    if (state.currentAction) {
      endAction(state.currentAction.id);
    }

    // Clear all active states
    clearAllActiveStates();

    dispatch({ type: "SET_IDLE" });
  }, [state.currentAction, clearAllActiveStates, endAction]);

  // Set talking state
  const setTalking = useCallback((isTalking: boolean) => {
    dispatch({ type: "SET_TALKING", payload: { isTalking } });
  }, []);

  // Clear action queue
  const clearQueue = useCallback(() => {
    dispatch({ type: "CLEAR_QUEUE" });
  }, []);

  // Clear action history
  const clearHistory = useCallback(() => {
    dispatch({ type: "CLEAR_HISTORY" });
  }, []);

  // Convenience methods for common actions
  const startIdle = useCallback(
    (duration?: number) => {
      return startAction(ActionType.IDLE, { duration });
    },
    [startAction]
  );

  const startTalking = useCallback(
    (duration?: number, options?: Partial<ActionExecution["action"]>) => {
      // Stop any current action first
      if (state.currentAction) {
        endAction(state.currentAction.id);
      }

      // Clear all other active states
      clearAllActiveStates();

      // Use SET_TALKING directly for immediate state change
      dispatch({ type: "SET_TALKING", payload: { isTalking: true } });

      // If duration is specified, auto-stop after duration
      if (duration) {
        setTimeout(() => {
          dispatch({ type: "SET_TALKING", payload: { isTalking: false } });
        }, duration);
      }

      // Return a dummy action ID for compatibility
      return `talking_${Date.now()}`;
    },
    [state.currentAction, clearAllActiveStates, endAction]
  );

  const stopTalking = useCallback(() => {
    if (state.activeActions.talking) {
      setTalking(false);
      if (state.currentAction?.action.type === ActionType.TALKING) {
        endAction(state.currentAction.id);
      }
    }
  }, [state.activeActions.talking, state.currentAction, setTalking, endAction]);

  // Note: Use dispatch directly for action states instead of wrapper functions
  // Example: dispatch({ type: "SET_DANCING", payload: { isDancing: true } })

  const startDancing = useCallback(
    (duration?: number) => {
      // Stop any current action first
      if (state.currentAction) {
        endAction(state.currentAction.id);
      }

      // Clear all other active states
      clearAllActiveStates();

      dispatch({ type: "SET_DANCING", payload: { isDancing: true } });
      if (duration) {
        setTimeout(
          () =>
            dispatch({ type: "SET_DANCING", payload: { isDancing: false } }),
          duration
        );
      }
      return `dancing_${Date.now()}`;
    },
    [state.currentAction, clearAllActiveStates, endAction]
  );

  const startWalking = useCallback(
    (duration?: number) => {
      // Stop any current action first
      if (state.currentAction) {
        endAction(state.currentAction.id);
      }

      // Clear all other active states
      clearAllActiveStates();

      dispatch({ type: "SET_WALKING", payload: { isWalking: true } });
      if (duration) {
        setTimeout(
          () =>
            dispatch({ type: "SET_WALKING", payload: { isWalking: false } }),
          duration
        );
      }
      return `walking_${Date.now()}`;
    },
    [state.currentAction, clearAllActiveStates, endAction]
  );

  const startThinking = useCallback(
    (intervalMs: number = 3000) => {
      // Stop any current action first
      if (state.currentAction) {
        endAction(state.currentAction.id);
      }

      // Clear all other active states
      clearAllActiveStates();

      // Start thinking loop that continues until manually stopped
      dispatch({ type: "SET_THINKING", payload: { isThinking: true } });
      return `thinking_${Date.now()}`;
    },
    [state.currentAction, clearAllActiveStates, endAction]
  );

  const stopThinking = useCallback(() => {
    if (state.activeActions.thinking) {
      dispatch({ type: "SET_THINKING", payload: { isThinking: false } });
    }
  }, [state.activeActions.thinking]);

  const startListening = useCallback(
    (duration?: number) => {
      // Stop any current action first
      if (state.currentAction) {
        endAction(state.currentAction.id);
      }

      // Clear all other active states
      clearAllActiveStates();

      dispatch({ type: "SET_LISTENING", payload: { isListening: true } });
      if (duration) {
        setTimeout(
          () =>
            dispatch({
              type: "SET_LISTENING",
              payload: { isListening: false },
            }),
          duration
        );
      }
      return `listening_${Date.now()}`;
    },
    [state.currentAction, clearAllActiveStates, endAction]
  );

  // Live2D-specific convenience methods
  const executeMotion = useCallback(
    (motionGroup: string, motionIndex: number = 0, duration?: number) => {
      return startAction(ActionType.MOTION, {
        motionGroup,
        motionIndex,
        duration: duration || 3000,
      });
    },
    [startAction]
  );

  const changeExpression = useCallback(
    (expression: string, duration?: number) => {
      return startAction(ActionType.IDLE, {
        expression,
        duration: duration || 2000,
      });
    },
    [startAction]
  );

  const playSound = useCallback(
    (soundId: string, duration?: number) => {
      return startAction(ActionType.IDLE, {
        sound: soundId,
        duration: duration || 2000,
      });
    },
    [startAction]
  );

  // Auto-process queue when current action ends
  useEffect(() => {
    if (
      autoProcessQueue &&
      !state.currentAction &&
      state.actionQueue.length > 0
    ) {
      const nextAction = state.actionQueue[0];
      dispatch({ type: "START_ACTION", payload: nextAction });
      onActionStart?.(nextAction);

      // Execute Live2D action for queued action
      if (live2DModel) {
        setTimeout(() => {
          executeLive2DAction(nextAction, live2DModel);
        }, 0);
      }

      // Auto-end action after duration
      if (nextAction.action.duration && nextAction.action.duration > 0) {
        const timeout = setTimeout(() => {
          endAction(nextAction.id);
        }, nextAction.action.duration);

        timeoutRefs.current.set(nextAction.id, timeout);
      }
    }
  }, [
    state.currentAction,
    state.actionQueue,
    autoProcessQueue,
    onActionStart,
    endAction,
    live2DModel,
  ]);

  // Notify state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  return {
    // State
    state,
    currentAction: state.currentAction,
    actionQueue: state.actionQueue,
    isIdle: state.isIdle,
    activeActions: state.activeActions,
    // Legacy compatibility
    isTalking: state.activeActions.talking,
    actionHistory: state.actionHistory,

    // Direct dispatch access for advanced users
    dispatch,

    // Actions
    startAction,
    queueAction,
    endAction,
    cancelAction,
    setIdle,
    setTalking,
    clearQueue,
    clearHistory,

    // Convenience methods
    startIdle,
    startTalking,
    stopTalking,
    startDancing,
    startWalking,
    startThinking,
    stopThinking,
    startListening,

    // Live2D-specific methods
    executeMotion,
    changeExpression,
    playSound,

    // Utilities
    generateActionId,
  };
};
