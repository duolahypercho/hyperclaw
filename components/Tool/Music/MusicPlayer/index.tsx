import React, { memo, useMemo } from "react";
import AppLayout from "$/layouts/AppLayout";
import MusicPlayerContainer from "./components/PlayerContainer";
import { useMusicPlayerOS } from "@OS/Provider/OSProv";

const MusicPlayer = memo(() => {
  const { showState, isMounted } = useMusicPlayerOS();

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
      uniqueKey="music"
      className="p-0 pb-3 px-6"
      variant="minimal"
      initialSize={initialSize}
    >
      <MusicPlayerContainer />
    </AppLayout>
  );
});

MusicPlayer.displayName = "MusicPlayer";

export default MusicPlayer;
