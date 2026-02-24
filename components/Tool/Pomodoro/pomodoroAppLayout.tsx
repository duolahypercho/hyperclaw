import React, { memo, useMemo } from "react";
import AppLayout from "$/layouts/AppLayout";
import { usePomodoroOS } from "@OS/Provider/OSProv";
import Pomodoro from "$/components/Tool/Pomodoro";

const PomodoroAppLayout = memo(() => {
  const { showState, isMounted } = usePomodoroOS();

  // Memoize the initial size configuration to prevent unnecessary re-renders
  const initialSize = useMemo(
    () => ({
      min: {
        width: 400,
        height: 150,
      },
      max: {
        width: 600,
        height: 200,
      },
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
      uniqueKey="pomodoro"
      className="p-0 pb-3 px-6"
      variant="minimal"
      initialSize={initialSize}
    >
      <Pomodoro />
    </AppLayout>
  );
});

PomodoroAppLayout.displayName = "PomodoroAppLayout";

export default PomodoroAppLayout;
