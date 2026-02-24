/**
 * Professional Live2D model loader with proper async imports
 * This ensures all Live2D dependencies are loaded client-side only
 */

import { getMediaUrl } from "$/utils";

const isDev = process.env.NODE_ENV === "development";

interface Live2DLibraries {
  Live2DModel: any;
  MotionPreloadStrategy: any;
}

/**
 * Ensure Cubism core is present (loaded via next/script in _app.tsx)
 * Waits for the script to load if it's not immediately available
 */
async function ensureCubismRuntime(): Promise<void> {
  if (typeof window === "undefined") return;
  
  // Check if already loaded
  if ((window as any).Live2DCubismCore) return;
  
  // Wait for script to load (max 10 seconds)
  const maxWaitTime = 10000;
  const startTime = Date.now();
  const checkInterval = 100;
  
  while (!(window as any).Live2DCubismCore && Date.now() - startTime < maxWaitTime) {
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  
  if (!(window as any).Live2DCubismCore) {
    throw new Error(
      "Live2D Cubism runtime not found. Ensure live2dcubismcore.min.js is loaded in _app.tsx via next/script."
    );
  }
}

/**
 * Dynamically import Live2D libraries (client-side only)
 * This is the proper way to handle SSR with external libraries
 */
async function importLive2DLibraries(): Promise<Live2DLibraries> {
  if (typeof window === "undefined") {
    throw new Error("Live2D can only be loaded in browser environment");
  }

  try {
    // Ensure runtime has been loaded globally
    await ensureCubismRuntime();

    // Load Pixi first and expose globally for plugin compatibility
    const PIXI = await import("pixi.js");
    (globalThis as any).PIXI = PIXI;

    // Load the Live2D plugin (use default import that matches installed version)
    const pixiLive2d: any = await import("pixi-live2d-display");

    return {
      Live2DModel: pixiLive2d.Live2DModel,
      MotionPreloadStrategy: pixiLive2d.MotionPreloadStrategy,
    };
  } catch (error) {
    console.error("Failed to import Live2D libraries:", error);
    throw new Error("Failed to load Live2D dependencies");
  }
}

/**
 * Load a Live2D model from a source path or blob
 * @param modelSrc - Path to model.json or blob URL
 * @returns Promise resolving to the loaded Live2D model
 */
export async function loadLive2DModel(modelSrc: string): Promise<any> {
  try {
    const { Live2DModel, MotionPreloadStrategy } =
      await importLive2DLibraries();

    let finalModelSrc = modelSrc;
    if (!isDev) {
      finalModelSrc = getMediaUrl(modelSrc);
    }

    // Load model with proper configuration
    const model = await Live2DModel.from(finalModelSrc, {
      motionPreload: MotionPreloadStrategy.ALL, // Preload all motions
      // Note: expressionPreload might not be a valid option in this version
      // Expressions should be loaded automatically if defined in model.json
    });

    return model;
  } catch (error) {
    console.error("❌ Failed to load Live2D model:", error);

    // Provide more helpful error messages
    if (error instanceof Error) {
      if (error.message.includes("Cubism")) {
        throw new Error(
          "Failed to load Live2D runtime. Please check your internet connection and try again."
        );
      } else if (error.message.includes("model")) {
        throw new Error(
          "Failed to load Live2D model. Please check if the model file exists and is accessible."
        );
      }
    }

    throw error;
  }
}
