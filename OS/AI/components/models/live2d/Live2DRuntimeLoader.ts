// Live2D Runtime Loader - Loads the local live2d.min.js file using dynamic script loading

export const loadLocalLive2DRuntime = async (): Promise<void> => {
  if (typeof window === "undefined") return;

  // Check if already loaded
  if (isLive2DRuntimeLoaded()) {
    return;
  }

  // Wait for runtime to be available (loaded by _app.tsx)
  const maxWaitTime = 10000; // 10 seconds
  const startTime = Date.now();

  while (!isLive2DRuntimeLoaded() && Date.now() - startTime < maxWaitTime) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!isLive2DRuntimeLoaded()) {
    throw new Error("Live2D runtime not available after waiting");
  }

};

export const isLive2DRuntimeLoaded = (): boolean => {
  if (typeof window === "undefined") return false;

  const global = window as any;

  // Check for Cubism 2 runtime (Live2D or live2d)
  const hasCubism2 = !!(global.Live2D || global.live2d);

  // Check for Cubism 4 runtime (Live2DCubismCore)
  const hasCubism4 = !!global.Live2DCubismCore;

  return hasCubism2 || hasCubism4;
};
