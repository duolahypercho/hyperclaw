import React, { memo, useMemo } from "react";
import AppLayout from "$/layouts/AppLayout";
import { useFloatingChatOS } from "@OS/Provider/OSProv";
import { FloatingChatViewer } from "./FloatingChatViewer";

const FloatingChatAppLayout = memo(() => {
  const { showState, isMounted } = useFloatingChatOS();

  const initialSize = useMemo(
    () => ({
      min: {
        width: 360,
        height: 400,
      },
      max: {
        width: 700,
        height: 700,
      },
      default: {
        width: 420,
        height: 520,
      },
    }),
    []
  );

  if (!isMounted) {
    return null;
  }

  if (!showState) {
    return null;
  }

  return (
    <AppLayout
      showState={showState}
      uniqueKey="floating-chat"
      className="p-0 flex flex-col overflow-hidden"
      variant="default"
      initialSize={initialSize}
    >
      <FloatingChatViewer />
    </AppLayout>
  );
});

FloatingChatAppLayout.displayName = "FloatingChatAppLayout";

export default FloatingChatAppLayout;
