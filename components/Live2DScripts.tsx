"use client";

import { useSession } from "next-auth/react";
import Script from "next/script";
import { useEffect, useState } from "react";

const Live2DScripts = () => {
  const { data: session, status } = useSession();
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Only load Live2D scripts if user is authenticated
    if (status === "authenticated" && session) {
      setShouldLoad(true);
    } else {
      setShouldLoad(false);
    }
  }, [status, session]);

  // Don't render anything during SSR or if not authenticated
  if (!shouldLoad) {
    return null;
  }

  return (
    <>
      {/* Live2D Cubism 2 Runtime - For older models */}
      <Script
        id="live2d-cubism2-runtime"
        src="/live2d.min.js"
        strategy="afterInteractive"
      />
      {/* Live2D Cubism 4 Runtime - For newer models */}
      <Script
        id="live2d-cubism4-runtime"
        src="/live2dcubismcore.min.js"
        strategy="afterInteractive"
      />
    </>
  );
};

export default Live2DScripts;
