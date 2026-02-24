import React, { memo, useMemo } from "react";
import AppLayout from "$/layouts/AppLayout";
import { useDocsFloatingOS } from "@OS/Provider/OSProv";
import { FloatingDocViewer } from "./FloatingDocViewer";

const DocsAppLayout = memo(() => {
  const { showState, isMounted } = useDocsFloatingOS();

  const initialSize = useMemo(
    () => ({
      min: {
        width: 320,
        height: 200,
      },
      max: {
        width: 800,
        height: 560,
      },
      default: {
        width: 480,
        height: 320,
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
      uniqueKey="floating-doc"
      className="p-0 flex flex-col overflow-hidden"
      variant="default"
      initialSize={initialSize}
    >
      <FloatingDocViewer />
    </AppLayout>
  );
});

DocsAppLayout.displayName = "DocsAppLayout";

export default DocsAppLayout;
