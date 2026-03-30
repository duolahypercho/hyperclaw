import { useState, useEffect } from "react";

const FOCUS_MODE_EVENTS = {
  FOCUS_STARTED: "focusModeStarted",
  FOCUS_PAUSED: "focusModePaused",
  FOCUS_ENDED: "focusModeEnded",
};

interface FocusModeState {
  isFocusModeActive: boolean;
  focusTaskTitle?: string;
  focusTaskId?: string;
}

/**
 * Hook for widgets to detect and react to Focus Mode state
 * When Focus Mode is active, non-essential widgets should fade out
 * to minimize distractions and emphasize the Note Widget
 */
export const useFocusMode = () => {
  const [focusState, setFocusState] = useState<FocusModeState>({
    isFocusModeActive: false,
    focusTaskTitle: undefined,
    focusTaskId: undefined,
  });

  useEffect(() => {
    const handleFocusStarted = (
      event: CustomEvent<{ taskTitle?: string; taskId?: string }>
    ) => {
      setFocusState({
        isFocusModeActive: true,
        focusTaskTitle: event.detail?.taskTitle,
        focusTaskId: event.detail?.taskId,
      });
    };

    const handleFocusPaused = () => {
      setFocusState((prev) => ({
        ...prev,
        isFocusModeActive: false,
      }));
    };

    const handleFocusEnded = () => {
      setFocusState({
        isFocusModeActive: false,
        focusTaskTitle: undefined,
        focusTaskId: undefined,
      });
    };

    window.addEventListener(
      FOCUS_MODE_EVENTS.FOCUS_STARTED,
      handleFocusStarted as EventListener
    );
    window.addEventListener(
      FOCUS_MODE_EVENTS.FOCUS_PAUSED,
      handleFocusPaused as EventListener
    );
    window.addEventListener(
      FOCUS_MODE_EVENTS.FOCUS_ENDED,
      handleFocusEnded as EventListener
    );

    return () => {
      window.removeEventListener(
        FOCUS_MODE_EVENTS.FOCUS_STARTED,
        handleFocusStarted as EventListener
      );
      window.removeEventListener(
        FOCUS_MODE_EVENTS.FOCUS_PAUSED,
        handleFocusPaused as EventListener
      );
      window.removeEventListener(
        FOCUS_MODE_EVENTS.FOCUS_ENDED,
        handleFocusEnded as EventListener
      );
    };
  }, []);

  return focusState;
};

export default useFocusMode;
