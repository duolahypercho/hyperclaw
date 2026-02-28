import AppLayout from "$/layouts/AppLayout";
import React, { memo, useMemo } from "react";
import { useCopanionChatOS } from "@OS/Provider/OSProv";
import { CopilotChat } from "@OS/AI/components/CopilotChat";

const CopanionChat = memo(() => {
  const { showState, isMounted } = useCopanionChatOS();

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

  // Only render if showState is true to prevent unnecessary renders
  if (!showState) {
    return null;
  }

  return (
    <AppLayout
      showState={showState}
      uniqueKey="hyperclaw"
      initialSize={initialSize}
      variant="default"
      className="p-0 bg-background/40 backdrop-blur-3xl"
    >
      <CopilotChat />
    </AppLayout>
  );
});

CopanionChat.displayName = "CopanionChat";

export default CopanionChat;
