"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import {
  useActionController,
  Live2DModel,
  ActionExecution,
} from "@OS/AI/components/models/action/ActionController";

export type CharacterState = "idle" | "talking" | "thinking" | "listening";

// Chat context interface
export interface CopanionInterfaceContextType {
  // ActionController state
  isIdle: boolean;
  isTalking: boolean;
  activeActions: {
    talking: boolean;
    dancing: boolean;
    walking: boolean;
    thinking: boolean;
    listening: boolean;
  };
  currentAction: ActionExecution | null;
  actionQueue: ActionExecution[];
  actionHistory: ActionExecution[];

  // ActionController methods
  startIdle: (duration?: number) => string | null;
  startTalking: (
    duration?: number,
    options?: Partial<ActionExecution["action"]>
  ) => string | null;
  stopTalking: () => void;
  startDancing: (duration?: number) => void;
  startWalking: (duration?: number) => void;
  startThinking: (intervalMs?: number) => string | null;
  stopThinking: () => void;
  startListening: (duration?: number) => void;
  executeMotion: (
    motionGroup: string,
    motionIndex?: number,
    duration?: number
  ) => string | null;
  changeExpression: (expression: string, duration?: number) => string | null;
  playSound: (soundId: string, duration?: number) => string | null;
  clearQueue: () => void;
  clearHistory: () => void;
  dispatch: React.Dispatch<any>;

  // Live2D model management
  live2DModelRef: React.RefObject<Live2DModel>;
  setLive2DModel: (model: Live2DModel | null) => void;
}

// Create context
const CopanionInterfaceContext = createContext<
  CopanionInterfaceContextType | undefined
>(undefined);

// Chat context provider
export const CopanionInterfaceProvider = ({
  children,
  characterState,
}: {
  children: ReactNode;
  characterState: CharacterState;
}) => {
  const live2DModelRef = useRef<Live2DModel>(null);
  const previousCharacterStateRef = useRef<CharacterState | null>(null);

  // Use ActionController for managing character actions
  const {
    isIdle,
    isTalking,
    activeActions,
    currentAction,
    actionQueue,
    actionHistory,
    startIdle,
    startTalking,
    stopTalking,
    startDancing,
    startWalking,
    startThinking,
    stopThinking,
    startListening,
    executeMotion,
    changeExpression,
    playSound,
    clearQueue,
    clearHistory,
    dispatch,
  } = useActionController({
    live2DModel: live2DModelRef.current,
  });

  const setLive2DModel = (model: Live2DModel | null) => {
    (live2DModelRef as React.MutableRefObject<Live2DModel | null>).current =
      model;
  };

  // Stable function to handle character state changes with proper state clearing
  const handleCharacterStateChange = useCallback(
    (newState: CharacterState) => {
      // Only proceed if the state actually changed
      if (previousCharacterStateRef.current === newState) {
        return;
      }

      // Only clear states that are actually active (more efficient)
      if (activeActions.talking && newState !== "talking") {
        dispatch({ type: "SET_TALKING", payload: { isTalking: false } });
      }
      if (activeActions.thinking && newState !== "thinking") {
        dispatch({ type: "SET_THINKING", payload: { isThinking: false } });
      }
      if (activeActions.listening && newState !== "listening") {
        dispatch({ type: "SET_LISTENING", payload: { isListening: false } });
      }

      // Set the new state
      switch (newState) {
        case "idle":
          dispatch({ type: "SET_IDLE" });
          break;
        case "talking":
          dispatch({ type: "SET_TALKING", payload: { isTalking: true } });
          break;
        case "thinking":
          dispatch({ type: "SET_THINKING", payload: { isThinking: true } });
          break;
      }

      // Update the previous state ref
      previousCharacterStateRef.current = newState;
    },
    [dispatch, activeActions]
  );

  // Use useLayoutEffect to ensure state updates happen synchronously before paint
  useLayoutEffect(() => {
    handleCharacterStateChange(characterState);
  }, [characterState, handleCharacterStateChange]);

  const value: CopanionInterfaceContextType = {
    // ActionController state
    isIdle,
    isTalking,
    activeActions,
    currentAction,
    actionQueue,
    actionHistory,

    // ActionController methods
    startIdle,
    startTalking,
    stopTalking,
    startDancing,
    startWalking,
    startThinking,
    stopThinking,
    startListening,
    executeMotion,
    changeExpression,
    playSound,
    clearQueue,
    clearHistory,
    dispatch,

    // Live2D model management
    live2DModelRef,
    setLive2DModel,
  };

  return (
    <CopanionInterfaceContext.Provider value={value}>
      {children}
    </CopanionInterfaceContext.Provider>
  );
};

// Hook to use chat context
export const useCopanionInterface = (): CopanionInterfaceContextType => {
  const context = useContext(CopanionInterfaceContext);
  if (context === undefined) {
    throw new Error(
      "useCopanionInterface must be used within a CopanionInterfaceContextProvider"
    );
  }
  return context;
};

// Export the context for direct access if needed
export { CopanionInterfaceContext };
