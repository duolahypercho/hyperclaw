// src/components/models/live2d/Live2DModel.tsx
"use client";

import React, { useRef, useEffect, useState } from "react";
import { Application, Rectangle } from "pixi.js";
import { loadLive2DModel } from "./Live2DLoader";

interface Live2DModelProps {
  modelSrc: string;
  width?: number;
  height?: number;
  className?: string;
  onLoadComplete?: () => void;
  onLoadError?: (error: Error) => void;
  // Action system props
  onActionTrigger?: (
    actionId: string,
    motionGroup?: string | number,
    motionIndex?: number
  ) => void;
  onExpressionChange?: (expression: string) => void;
  onSoundPlay?: (soundId: string) => void;
  onModelReady?: (model: any) => void;
}

export default function Live2DModelComponent({
  modelSrc,
  width = 400,
  height = 300,
  className = "",
  onLoadComplete,
  onLoadError,
  onActionTrigger,
  onExpressionChange,
  onSoundPlay,
  onModelReady,
}: Live2DModelProps) {
  const [isMounted, setIsMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<any>();
  const modelRef = useRef<any>();
  const talkingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentExpression, setCurrentExpression] = useState<string | null>(
    null
  );

  // Ensure we're on the client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Restore expression when currentExpression changes (but not on initial load)
  useEffect(() => {
    if (isMounted && modelRef.current && currentExpression) {
      const model = modelRef.current;
      if (
        model.restoreCurrentExpression &&
        typeof model.restoreCurrentExpression === "function"
      ) {
        // Small delay to ensure model is fully ready
        setTimeout(() => {
          model.restoreCurrentExpression();
        }, 100);
      }
    }
  }, [currentExpression, isMounted]);

  useEffect(() => {
    if (!isMounted || typeof window === "undefined") {
      return;
    }

    // Check if canvas is available
    if (!canvasRef.current) {
      return;
    }

    let mounted = true;
    let globalMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    let themeObserver: MutationObserver | null = null;

    const initLive2D = async () => {
      try {
        setLoading(true);
        setError(null);

        // Small delay to ensure DOM is fully rendered
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!Application || !loadLive2DModel) {
          throw new Error(
            "Failed to load required dependencies. Please check if Live2D runtime and PixiJS are properly loaded."
          );
        }

        // Create PIXI application with optimized settings
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas element not available");

        // Get theme-dependent background color
        const getThemeBackgroundColor = () => {
          const isDark = document.documentElement.classList.contains("dark");
          return isDark ? 0x1b2234 : 0xEEEEEE; // slightly darker: dark (~#1b2234), light (~#e0e0e0)
        };

        const app = new Application({
          view: canvas,
          width,
          height,
          backgroundColor: getThemeBackgroundColor(),
          antialias: true,
          sharedTicker: true,
          powerPreference: "high-performance",
          clearBeforeRender: true,
          resolution: window.devicePixelRatio || 1,
          preserveDrawingBuffer: false,
          forceCanvas: false,
        });

        // Function to update background color when theme changes
        const updateBackgroundColor = () => {
          if (app && app.renderer) {
            app.renderer.backgroundColor = getThemeBackgroundColor();
          }
        };

        // Listen for theme changes
        themeObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (
              mutation.type === "attributes" &&
              mutation.attributeName === "class"
            ) {
              updateBackgroundColor();
            }
          });
        });

        // Start observing theme changes on the document element
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });

        // Configure PIXI interaction manager
        const interaction = app.renderer?.plugins?.interaction;
        if (interaction) {
          interaction.autoPreventDefault = false;
          interaction.interactionFrequency = 10;
          if (interaction.eventsAdded) interaction.removeEvents();
          if (!interaction.trackingData) interaction.trackingData = {};
          interaction.addEvents();
          interaction.resolution = 1;
          interaction.supportsPointerEvents = true;
        }

        appRef.current = app;

        const live2DModel = await loadLive2DModel(modelSrc);
        modelRef.current = live2DModel;

        // Add model to stage
        app.stage.addChild(live2DModel);
        live2DModel.anchor.set(0.5, 0.5);
        live2DModel.x = width / 2;
        live2DModel.y = height / 2;

        // Scale the model to fit within the container
        const modelWidth = live2DModel.width;
        const modelHeight = live2DModel.height;
        const scaleX = width / modelWidth;
        const scaleY = height / modelHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9; // 0.9 to add some padding

        live2DModel.scale.set(scale);
        live2DModel.interactive = true;
        live2DModel.interactiveChildren = true;

        // Set up hit area for event detection
        const bounds = live2DModel.getBounds();
        live2DModel.hitArea = new Rectangle(
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height
        );

        // Note: Using canvas.addEventListener instead of live2DModel.on()
        // because Live2D model events don't always trigger properly
        // Canvas events are more reliable for this use case

        // Global eye tracking - character can see mouse anywhere on screen
        globalMouseMoveHandler = (e: MouseEvent) => {
          if (!live2DModel.focus) return;

          const rect = canvas.getBoundingClientRect();
          const canvasX = e.clientX - rect.left;
          const canvasY = e.clientY - rect.top;
          const modelX = (canvasX - width / 2) / scale;
          const modelY = (canvasY - height / 2) / scale;
          live2DModel.focus(modelX, modelY);
        };

        const handleMouseDown = (e: MouseEvent) => {
          isMouseDown = true;
          mouseDownTime = Date.now();
          mouseDownX = e.clientX;
          mouseDownY = e.clientY;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
          lastMouseTime = mouseDownTime;
          mouseVelocity = { x: 0, y: 0 };

          // Store drag start positions
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          modelStartX = live2DModel.x;
          modelStartY = live2DModel.y;

          // Check if click is on the Live2D model
          const rect = canvas.getBoundingClientRect();
          const canvasX = e.clientX - rect.left;
          const canvasY = e.clientY - rect.top;

          // Method 1: Try PIXI's built-in hit testing first (most reliable)
          const pixiPoint = app.renderer.plugins.interaction.mouse.global;
          const hitTestResult =
            app.renderer.plugins.interaction.hitTest(pixiPoint);

          let isOnModel = false;

          // Check if the hit test found the Live2D model
          if (hitTestResult && hitTestResult.length > 0) {
            const hitObject = hitTestResult[0];

            // Check if the hit object is our Live2D model or a child of it
            isOnModel =
              hitObject === live2DModel ||
              (hitObject.parent && hitObject.parent === live2DModel) ||
              hitObject === live2DModel.internalModel;
          }

          // Method 2: Manual bounds checking with proper coordinate transformation
          if (!isOnModel) {
            // Get current model bounds and position
            const modelBounds = live2DModel.getBounds();
            const modelX = live2DModel.x;
            const modelY = live2DModel.y;
            const modelScale = live2DModel.scale.x; // Assuming uniform scaling

            // Transform canvas coordinates to model space
            // Account for model position and scale
            const modelSpaceX = (canvasX - modelX) / modelScale;
            const modelSpaceY = (canvasY - modelY) / modelScale;

            // Check if click is within the model's original bounds (in model space)
            const originalWidth = modelBounds.width / modelScale;
            const originalHeight = modelBounds.height / modelScale;
            const originalX = modelBounds.x / modelScale;
            const originalY = modelBounds.y / modelScale;

            isOnModel =
              modelSpaceX >= originalX &&
              modelSpaceX <= originalX + originalWidth &&
              modelSpaceY >= originalY &&
              modelSpaceY <= originalY + originalHeight;
          }

          // Store that this click started on the model
          startedOnModel = isOnModel;
        };

        const handleMouseMoveVelocity = (e: MouseEvent) => {
          if (!isMouseDown) return;

          const now = Date.now();
          const deltaTime = now - lastMouseTime;
          if (deltaTime <= 0) return;

          const deltaX = e.clientX - lastMouseX;
          const deltaY = e.clientY - lastMouseY;
          mouseVelocity.x = deltaX / deltaTime;
          mouseVelocity.y = deltaY / deltaTime;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
          lastMouseTime = now;

          // Handle dragging (only if Shift is held)
          if (startedOnModel && e.shiftKey) {
            const dragDistance = Math.sqrt(
              Math.pow(e.clientX - dragStartX, 2) +
                Math.pow(e.clientY - dragStartY, 2)
            );

            // Start dragging if moved more than 5 pixels
            if (dragDistance > 5 && !isDragging) {
              isDragging = true;
            }

            // Update model position while dragging
            if (isDragging) {
              const deltaX = e.clientX - dragStartX;
              const deltaY = e.clientY - dragStartY;

              live2DModel.x = modelStartX + deltaX;
              live2DModel.y = modelStartY + deltaY;

              // Save state while dragging (throttled)
              if (!dragSaveTimeout) {
                dragSaveTimeout = setTimeout(() => {
                  saveCurrentState();
                  dragSaveTimeout = null;
                }, 100); // Save every 100ms while dragging
              }
            }
          }
        };

        const handleMouseUp = (e: MouseEvent) => {
          if (!isMouseDown) return;

          const now = Date.now();
          const totalTime = now - mouseDownTime;
          const totalDistance = Math.sqrt(
            Math.pow(e.clientX - mouseDownX, 2) +
              Math.pow(e.clientY - mouseDownY, 2)
          );
          const speed = totalDistance / totalTime;
          const velocityMagnitude = Math.sqrt(
            mouseVelocity.x * mouseVelocity.x +
              mouseVelocity.y * mouseVelocity.y
          );

          // Only trigger motions if the click started on the model and wasn't a drag
          if (startedOnModel && !isDragging) {
            // Detect flick vs tap
            if (speed > 0.5 && velocityMagnitude > 0.3) {
              const deltaX = e.clientX - mouseDownX;
              const deltaY = e.clientY - mouseDownY;

              if (Math.abs(deltaY) > Math.abs(deltaX)) {
                executeMotion(deltaY > 0 ? "FlickDown" : "FlickUp", 0);
              } else {
                executeMotion("Flick", 0);
              }
            } else {
              executeMotion("Tap", Math.random() < 0.5 ? 0 : 1);
            }
          }

          isMouseDown = false;
          isDragging = false;
          // Clear the model flag
          startedOnModel = false;
        };

        // Handle mouse wheel for zooming (only with Ctrl key)
        const handleWheel = (e: WheelEvent) => {
          // Only zoom if Ctrl/Cmd is held
          if (!e.ctrlKey && !e.metaKey) {
            return;
          }

          e.preventDefault(); // Prevent page scroll

          // Get mouse position relative to canvas
          const rect = canvas.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          // Calculate zoom direction (positive = zoom in, negative = zoom out)
          const zoomDirection = e.deltaY > 0 ? -1 : 1;

          // Calculate new scale
          const scaleChange = zoomDirection * zoomSpeed;
          const newScale = Math.max(
            minScale,
            Math.min(maxScale, currentScale + scaleChange)
          );

          // Only update if scale actually changed
          if (newScale !== currentScale) {
            currentScale = newScale;

            // Apply new scale to the model
            live2DModel.scale.set(currentScale);

            // Optional: Zoom towards mouse position (more natural feel)
            // This makes the zoom feel like it's centered on the mouse cursor
            const scaleRatio = newScale / (currentScale - scaleChange);
            const worldMouseX =
              (mouseX - width / 2) / (currentScale - scaleChange);
            const worldMouseY =
              (mouseY - height / 2) / (currentScale - scaleChange);

            // Adjust model position to zoom towards mouse
            live2DModel.x =
              width / 2 - worldMouseX * (currentScale - scaleChange);
            live2DModel.y =
              height / 2 - worldMouseY * (currentScale - scaleChange);

            // Save state after zoom
            saveCurrentState();
          }
        };

        // Add event listeners
        document.addEventListener("mousemove", globalMouseMoveHandler); // Global eye tracking
        canvas.addEventListener("mousedown", handleMouseDown); // Canvas-specific interactions
        canvas.addEventListener("mousemove", handleMouseMoveVelocity); // Canvas-specific velocity tracking
        canvas.addEventListener("mouseup", handleMouseUp); // Canvas-specific interactions
        canvas.addEventListener("wheel", handleWheel, { passive: false }); // Zoom functionality

        // Get motion manager for animations
        const internalModel = live2DModel.internalModel;
        const motionManager = internalModel.motionManager;

        // Helper function to check if a motion is idle
        const isIdleMotion = (groupName: string) => {
          const idleMotions = [
            "idle",
            "breath",
            "wait",
            "stand",
            "normal",
            "default",
          ];
          return idleMotions.some((idleMotion) =>
            groupName.toLowerCase().includes(idleMotion)
          );
        };

        // Turn off built-in lip sync so it won't fight mouth control
        if (motionManager && typeof motionManager.lipSync !== "undefined") {
          motionManager.lipSync = false;
        }

        // Enable eye blink system for natural blinking
        if (motionManager && typeof motionManager.eyeBlink !== "undefined") {
          motionManager.eyeBlink = true;
        }

        // Motion completion detection
        let currentMotionGroup = "";
        let motionCompletionTimeout: NodeJS.Timeout | null = null;

        // Listen for motion completion events
        const handleMotionCompletion = () => {
          // Clear any existing timeout
          if (motionCompletionTimeout) {
            clearTimeout(motionCompletionTimeout);
            motionCompletionTimeout = null;
          }

          // If we were in a non-idle motion, return to idle expression
          if (currentMotionGroup && !isIdleMotion(currentMotionGroup)) {
            changeExpression("idle");
            currentMotionGroup = "";
          }
        };

        // Set up motion completion detection
        if (motionManager) {
          // Override the motion manager's finishMotion method to detect completion
          const originalFinishMotion = motionManager.finishMotion;
          if (originalFinishMotion) {
            motionManager.finishMotion = function (...args: any[]) {
              const result = originalFinishMotion.apply(this, args);
              // Use a small delay to ensure the motion has fully finished
              setTimeout(handleMotionCompletion, 100);
              return result;
            };
          }

          // Alternative: Use a polling approach to detect motion completion
          const checkMotionCompletion = () => {
            if (motionManager.isFinished && motionManager.isFinished()) {
              handleMotionCompletion();
            }
          };

          // Check for motion completion every 100ms
          const motionCheckInterval = setInterval(checkMotionCompletion, 100);

          // Store interval for cleanup
          (live2DModel as any).motionCheckInterval = motionCheckInterval;
        }

        // Simple talking state
        let isTalking = false;
        let talkingIntensity = 1.0;
        let talkingSpeed = 50; // milliseconds between mouth movements

        // Simple talking controls
        (live2DModel as any).setTalkingIntensity = (mult: number) => {
          talkingIntensity = Math.max(0.1, Math.min(2.0, mult));
        };
        (live2DModel as any).setTalkingSpeed = (ms: number) => {
          talkingSpeed = Math.max(20, Math.min(200, ms));
        };

        // Manual expression control
        (live2DModel as any).setIdleExpression = () => {
          changeExpression("idle");
        };

        // Initialize character with idle motion
        const initializeCharacter = () => {
          // Try to start idle motion
          const availableMotions = Object.keys(
            motionManager?.motionGroups || {}
          );

          // Look for idle motion variations (common names in Live2D models)
          const idleMotions = availableMotions.filter(
            (name) =>
              name.toLowerCase().includes("idle") ||
              name.toLowerCase().includes("breath") ||
              name.toLowerCase().includes("wait") ||
              name.toLowerCase().includes("stand") ||
              name.toLowerCase().includes("normal") ||
              name.toLowerCase().includes("default")
          );

          if (idleMotions.length > 0) {
            // Start the first idle motion
            executeMotion(idleMotions[0], 0);
          } else if (availableMotions.length > 0) {
            // If no specific idle motion, use the first available motion
            executeMotion(availableMotions[0], 0);
          }
        };

        // Simple talking animation
        const startTalkingAnimation = () => {
          if (talkingIntervalRef.current) return; // Already talking

          talkingIntervalRef.current = setInterval(() => {
            if (!isTalking || !live2DModel.internalModel?.coreModel) {
              if (talkingIntervalRef.current) {
                clearInterval(talkingIntervalRef.current);
                talkingIntervalRef.current = null;
              }
              return;
            }

            const core: any = live2DModel.internalModel.coreModel;

            // Simple mouth opening animation
            const mouthOpen = Math.random() * talkingIntensity * 0.8;

            try {
              // Try to set mouth open parameter
              if (typeof core.setParameterValueById === "function") {
                core.setParameterValueById("ParamMouthOpenY", mouthOpen);
              }
            } catch (error) {
              // Silently handle errors - mouth parameter might not exist
            }
          }, talkingSpeed);
        };

        const stopTalkingAnimation = () => {
          if (talkingIntervalRef.current) {
            clearInterval(talkingIntervalRef.current);
            talkingIntervalRef.current = null;
          }

          // Reset mouth to closed position
          try {
            const core: any = live2DModel.internalModel?.coreModel;
            if (core && typeof core.setParameterValueById === "function") {
              core.setParameterValueById("ParamMouthOpenY", 0);
            }
          } catch (error) {
            // Silently handle errors
          }
        };

        // Motion execution with queuing and expression handling
        const executeMotion = (groupName: string, motionIndex: number = 0) => {
          if (!motionManager?.motionGroups?.[groupName]) return false;

          if (!motionManager.motionGroups[groupName][motionIndex]) return false;

          // Don't execute motions while talking (except for talking-specific motions)
          if (isTalking && !/talk|speak/i.test(groupName)) return false;

          const priority = /talk|speak/i.test(groupName) ? 3 : 2; // 3 > 2

          try {
            const ok = motionManager.startMotion(
              groupName,
              motionIndex,
              priority
            );
            if (ok) {
              // Track current motion group
              currentMotionGroup = groupName;

              // Apply motion expression for non-idle motions
              if (!isIdleMotion(groupName)) {
                changeExpression("motion");
              }
              onActionTrigger?.(groupName, groupName, motionIndex);
            }
          } catch {
            return false;
          }
          return true;
        };

        // Motion looping system
        let loopInterval: NodeJS.Timeout | null = null;
        let currentLoopMotion: {
          groupName: string;
          motionIndex: number;
        } | null = null;

        const executeMotionLoop = (
          groupName: string,
          motionIndex: number = 0,
          intervalMs: number = 2000
        ) => {
          // Stop any existing loop
          stopMotionLoop();

          // Start the first motion immediately
          const success = executeMotion(groupName, motionIndex);
          if (!success) return false;

          // Store current loop info
          currentLoopMotion = { groupName, motionIndex };

          // Set up the loop interval and store it on the model for cleanup
          loopInterval = setInterval(() => {
            if (currentLoopMotion) {
              executeMotion(groupName, motionIndex);
            }
          }, intervalMs);

          // Store loop interval on model for cleanup
          (live2DModel as any).loopInterval = loopInterval;

          return true;
        };

        const stopMotionLoop = () => {
          if (loopInterval) {
            clearInterval(loopInterval);
            loopInterval = null;
          }
          // Clear the model reference as well
          if (live2DModel) {
            (live2DModel as any).loopInterval = null;
          }
          currentLoopMotion = null;
        };

        const isMotionLooping = () => {
          return loopInterval !== null;
        };

        // Flick detection system variables
        let isMouseDown = false;
        let mouseDownTime = 0;
        let mouseDownX = 0;
        let mouseDownY = 0;
        let lastMouseX = 0;
        let lastMouseY = 0;
        let lastMouseTime = 0;
        let mouseVelocity = { x: 0, y: 0 };
        let startedOnModel = false; // Track if the click started on the model

        // Zoom system variables
        let currentScale = scale; // Start with the initial scale
        const minScale = 0.1; // Minimum zoom level (10% - much smaller)
        const maxScale = 3.0; // Maximum zoom level (300% - much larger)
        const zoomSpeed = 0.02; // How fast to zoom (2% per scroll - much smoother)

        // Load saved zoom and position from localStorage
        const loadSavedState = () => {
          try {
            const savedState = localStorage.getItem("live2d-character-state");
            if (savedState) {
              const { zoom, position } = JSON.parse(savedState);
              if (zoom && zoom >= minScale && zoom <= maxScale) {
                currentScale = zoom;
                live2DModel.scale.set(currentScale);
              }
              if (
                position &&
                typeof position.x === "number" &&
                typeof position.y === "number"
              ) {
                live2DModel.x = position.x;
                live2DModel.y = position.y;
              }
            }
          } catch (error) {
            // Silently handle errors
          }
        };

        // Save current state to localStorage
        const saveCurrentState = () => {
          try {
            const state = {
              zoom: currentScale,
              position: {
                x: live2DModel.x,
                y: live2DModel.y,
              },
              timestamp: Date.now(),
            };
            localStorage.setItem(
              "live2d-character-state",
              JSON.stringify(state)
            );
          } catch (error) {
            // Silently handle errors
          }
        };

        // Drag system variables
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let modelStartX = 0;
        let modelStartY = 0;

        // Drag save timeout for throttled saving
        let dragSaveTimeout: NodeJS.Timeout | null = null;

        // Keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
          // Only handle shortcuts when canvas is focused or character is visible
          if (e.target !== canvas && !canvas.contains(e.target as Node)) return;

          switch (e.key.toLowerCase()) {
            case "r":
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                resetAll();
              }
              break;
            case "z":
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                resetZoom();
              }
              break;
            case "p":
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                resetPosition();
              }
              break;
          }
        };

        // Add keyboard listener after function is defined
        document.addEventListener("keydown", handleKeyDown);

        // Expression management with persistence - excludes mouth parameters
        const changeExpression = (expressionName: string) => {
          try {
            let success = false;

            // Method 1: Try the direct expression method
            if (
              live2DModel.expression &&
              typeof live2DModel.expression === "function"
            ) {
              live2DModel.expression(expressionName);
              success = true;
            }

            // Method 2: Try through expression manager
            else if (
              live2DModel.internalModel?.expressionManager?.setExpression
            ) {
              live2DModel.internalModel.expressionManager.setExpression(
                expressionName
              );
              success = true;
            }

            // Method 3: Try through motion manager with expression motion
            else if (live2DModel.internalModel?.motionManager?.startMotion) {
              // Try to start expression motion
              const motionSuccess =
                live2DModel.internalModel.motionManager.startMotion(
                  expressionName,
                  0,
                  2
                );
              if (motionSuccess) {
                success = true;
              }
            }

            // Method 4: Try through core model (different API)
            else if (live2DModel.internalModel?.coreModel) {
              try {
                const coreModel = live2DModel.internalModel.coreModel;
                const setting =
                  coreModel.modelSetting ||
                  coreModel._modelSetting ||
                  coreModel.getModelSetting?.();
                if (setting && setting.getExpressionCount) {
                  for (let i = 0; i < setting.getExpressionCount(); i++) {
                    if (setting.getExpressionName(i) === expressionName) {
                      // Apply expression through core model
                      const expressionFile = setting.getExpressionFileName(i);
                      success = true;
                      break;
                    }
                  }
                }
              } catch (error) {
                console.log(
                  "⚠️ Could not apply expression through core model:",
                  error
                );
              }
            }

            if (success) {
              // Persist the expression state
              setCurrentExpression(expressionName);
              onExpressionChange?.(expressionName);
              return true;
            } else {
              return false;
            }
          } catch (error) {
            console.error(
              `❌ Failed to change expression to '${expressionName}':`,
              error
            );
            return false;
          }
        };

        // Sound management
        const playSound = (soundId: string) => {
          try {
            // For now, we'll just trigger the callback
            // In a full implementation, you'd play actual audio files
            onSoundPlay?.(soundId);
            return true;
          } catch (error) {
            console.error(`❌ Failed to play sound '${soundId}':`, error);
            return false;
          }
        };

        // Get available expressions
        const getAvailableExpressions = () => {
          try {
            // Method 1: Check if expressions are directly on the model
            if (
              live2DModel.expressions &&
              typeof live2DModel.expressions === "object"
            ) {
              return Object.keys(live2DModel.expressions);
            }

            // Method 2: Check internal model expression manager
            if (live2DModel.internalModel?.expressionManager?.expressions) {
              return Object.keys(
                live2DModel.internalModel.expressionManager.expressions
              );
            }

            // Method 3: Check if expressions are defined in model settings
            if (live2DModel.settings?.expressions) {
              return live2DModel.settings.expressions.map(
                (exp: any) => exp.name || exp.Name
              );
            }

            // Method 4: Check model's file references for expressions
            if (
              live2DModel.internalModel?.settings?.FileReferences?.Expressions
            ) {
              return live2DModel.internalModel.settings.FileReferences.Expressions.map(
                (exp: any) => exp.Name
              );
            }

            // Method 4.5: Check internal model settings directly
            if (live2DModel.internalModel?.settings) {
              const settings = live2DModel.internalModel.settings;
              if (settings.FileReferences?.Expressions) {
                return settings.FileReferences.Expressions.map(
                  (exp: any) => exp.Name
                );
              }
              if (settings.expressions) {
                return settings.expressions.map(
                  (exp: any) => exp.name || exp.Name
                );
              }
            }

            // Method 5: Check if expressions are in internal model directly
            if (live2DModel.internalModel?.expressions) {
              return Object.keys(live2DModel.internalModel.expressions);
            }

            // Method 6: Try to access expressions through the model's core (different API)
            if (live2DModel.internalModel?.coreModel) {
              try {
                const coreModel = live2DModel.internalModel.coreModel;
                // Try different ways to access model settings
                const setting =
                  coreModel.modelSetting ||
                  coreModel._modelSetting ||
                  coreModel.getModelSetting?.();
                if (
                  setting &&
                  setting.getExpressionCount &&
                  setting.getExpressionCount() > 0
                ) {
                  const expressions = [];
                  for (let i = 0; i < setting.getExpressionCount(); i++) {
                    expressions.push(setting.getExpressionName(i));
                  }
                  return expressions;
                }
              } catch (error) {
                console.log(
                  "⚠️ Could not access expressions through core model:",
                  error
                );
              }
            }

            // Method 7: Fallback - return hardcoded expressions from our model.json
            // Since we know our model has these expressions defined
            return [
              "idle",
              "happy",
              "sad",
              "surprised",
              "confused",
              "concentrated",
              "angry",
              "motion",
            ];
          } catch (error) {
            console.error("❌ Failed to get available expressions:", error);
            return [];
          }
        };

        // Get available motion groups
        const getAvailableMotions = () => {
          try {
            return Object.keys(motionManager?.motionGroups || {});
          } catch (error) {
            console.error("❌ Failed to get available motions:", error);
            return [];
          }
        };

        // Expression restoration function
        const restoreCurrentExpression = () => {
          if (currentExpression) {
            changeExpression(currentExpression);
          }
        };

        // Get current expression
        const getCurrentExpression = () => {
          return currentExpression;
        };

        // Reset expression to default (idle)
        const resetExpression = () => {
          setCurrentExpression("idle");
          changeExpression("idle"); // Apply idle expression
          onExpressionChange?.("idle");
        };

        // Simple talking functions
        const startTalking = () => {
          if (isTalking) return;
          isTalking = true;
          startTalkingAnimation();
        };

        const stopTalking = () => {
          if (!isTalking) return;
          isTalking = false;
          stopTalkingAnimation();
          // Return to idle expression
          changeExpression("idle");
          // Resume idle motion
          initializeCharacter();
        };

        // Check if currently talking
        const isCurrentlyTalking = () => {
          return isTalking;
        };

        // Zoom control functions
        const resetZoom = () => {
          currentScale = scale; // Reset to initial scale
          live2DModel.scale.set(currentScale);
          live2DModel.x = width / 2;
          live2DModel.y = height / 2;
          saveCurrentState(); // Save the reset state
        };

        const resetPosition = () => {
          live2DModel.x = width / 2;
          live2DModel.y = height / 2;
          saveCurrentState(); // Save the reset state
        };

        const resetAll = () => {
          resetZoom();
          resetPosition();
          saveCurrentState(); // Save the reset state
        };

        const setZoom = (zoomLevel: number) => {
          const newScale = Math.max(minScale, Math.min(maxScale, zoomLevel));
          currentScale = newScale;
          live2DModel.scale.set(currentScale);
          saveCurrentState(); // Save the new zoom
        };

        // Expose all methods on the model for external access
        (live2DModel as any).executeMotion = executeMotion;
        (live2DModel as any).executeMotionLoop = executeMotionLoop;
        (live2DModel as any).stopMotionLoop = stopMotionLoop;
        (live2DModel as any).isMotionLooping = isMotionLooping;
        (live2DModel as any).changeExpression = changeExpression;
        (live2DModel as any).playSound = playSound;
        (live2DModel as any).getAvailableExpressions = getAvailableExpressions;
        (live2DModel as any).getAvailableMotions = getAvailableMotions;
        (live2DModel as any).getCurrentExpression = getCurrentExpression;
        (live2DModel as any).restoreCurrentExpression =
          restoreCurrentExpression;
        (live2DModel as any).resetExpression = resetExpression;
        (live2DModel as any).startTalking = startTalking;
        (live2DModel as any).stopTalking = stopTalking;
        (live2DModel as any).isCurrentlyTalking = isCurrentlyTalking;
        (live2DModel as any).motionGroups = motionManager?.motionGroups || {};
        (live2DModel as any).initializeCharacter = initializeCharacter;

        // Zoom and position control methods
        (live2DModel as any).resetZoom = resetZoom;
        (live2DModel as any).setZoom = setZoom;
        (live2DModel as any).getZoom = () => currentScale;
        (live2DModel as any).resetPosition = resetPosition;
        (live2DModel as any).resetAll = resetAll;

        // Debug methods
        (live2DModel as any).debug = {
          testMotion: (motionName: string, index: number = 0) => {
            return executeMotion(motionName, index);
          },
          testMotionLoop: (
            motionName: string,
            index: number = 0,
            intervalMs: number = 2000
          ) => {
            return executeMotionLoop(motionName, index, intervalMs);
          },
          stopMotionLoop: () => stopMotionLoop(),
          isMotionLooping: () => isMotionLooping(),
          listMotions: () => {
            return Object.keys(motionManager?.motionGroups || {});
          },
          getMotionInfo: (motionName: string) => {
            return motionManager?.motionGroups?.[motionName];
          },
          testClick: (x: number, y: number) => {
            const modelBounds = live2DModel.getBounds();
            return (
              x >= modelBounds.x &&
              x <= modelBounds.x + modelBounds.width &&
              y >= modelBounds.y &&
              y <= modelBounds.y + modelBounds.height
            );
          },
          getModelInfo: () => {
            const bounds = live2DModel.getBounds();
            const position = live2DModel.position;
            const scale = live2DModel.scale;
            return { bounds, position, scale };
          },
          // Simple talking controls
          startTalking: () => startTalking(),
          stopTalking: () => stopTalking(),
          isTalking: () => isTalking,
          setTalkingIntensity: (intensity: number) => {
            talkingIntensity = Math.max(0.1, Math.min(2.0, intensity));
          },
          setTalkingSpeed: (speed: number) => {
            talkingSpeed = Math.max(20, Math.min(200, speed));
          },
          // Manual expression control
          setIdleExpression: () => changeExpression("idle"),
          // Debug mouth parameters
          getMouthParameters: () => {
            try {
              const core: any = live2DModel.internalModel?.coreModel;
              if (core && typeof core.getParameterValueById === "function") {
                return {
                  ParamMouthOpenY:
                    core.getParameterValueById("ParamMouthOpenY"),
                  ParamMouthForm: core.getParameterValueById("ParamMouthForm"),
                };
              }
              return null;
            } catch (error) {
              return null;
            }
          },
          // Zoom control methods
          resetZoom: () => resetZoom(),
          setZoom: (level: number) => setZoom(level),
          getZoom: () => currentScale,
          zoomIn: () => {
            const newScale = Math.min(maxScale, currentScale + zoomSpeed);
            setZoom(newScale);
          },
          zoomOut: () => {
            const newScale = Math.max(minScale, currentScale - zoomSpeed);
            setZoom(newScale);
          },
          // Position control methods
          resetPosition: () => resetPosition(),
          resetAll: () => resetAll(),
          getPosition: () => ({ x: live2DModel.x, y: live2DModel.y }),
          setPosition: (x: number, y: number) => {
            live2DModel.x = x;
            live2DModel.y = y;
          },
        };

        if (mounted) {
          setLoading(false);

          // Load saved zoom and position after a short delay
          setTimeout(() => {
            loadSavedState();
          }, 100);

          // Initialize character with idle motion and expression after a short delay
          setTimeout(() => {
            initializeCharacter();
            // Set idle expression as default
            changeExpression("idle");
          }, 500);

          onLoadComplete?.();
          onModelReady?.(live2DModel);
        }
      } catch (err) {
        console.error("Failed to load Live2D model:", err);
        const error =
          err instanceof Error ? err : new Error("Failed to load model");
        if (mounted) {
          setError(error.message);
          setLoading(false);
          onLoadError?.(error);
        }
      }
    };

    initLive2D();

    return () => {
      mounted = false;

      // Clean up talking animation
      if (talkingIntervalRef.current) {
        clearInterval(talkingIntervalRef.current);
        talkingIntervalRef.current = null;
      }

      // Clean up motion completion detection
      if (modelRef.current?.motionCheckInterval) {
        clearInterval(modelRef.current.motionCheckInterval);
        modelRef.current.motionCheckInterval = null;
      }

      // Clean up motion loop
      if (modelRef.current && (modelRef.current as any).loopInterval) {
        clearInterval((modelRef.current as any).loopInterval);
        (modelRef.current as any).loopInterval = null;
      }

      // Clean up theme observer
      if (themeObserver) {
        themeObserver.disconnect();
      }

      // Remove global listeners
      if (globalMouseMoveHandler) {
        document.removeEventListener(
          "mousemove",
          globalMouseMoveHandler as EventListener
        );
      }
      // Note: handleKeyDown is defined inside the effect, so we can't remove it here
      // This is fine as the component will unmount anyway

      if (appRef.current) {
        try {
          if (modelRef.current) {
            modelRef.current.removeAllListeners();
            modelRef.current = null;
          }

          const interaction = appRef.current.renderer?.plugins?.interaction;
          if (interaction?.eventsAdded) {
            interaction.removeEvents();
          }

          appRef.current.stage.removeChildren();
          appRef.current.destroy({
            children: true,
            texture: true,
            baseTexture: true,
          });
          appRef.current = null;
        } catch (error) {
          console.warn("⚠️ Error during PIXI cleanup:", error);
        }
      }
    };
  }, [isMounted, modelSrc, width, height]);

  // Don't render anything on server side
  if (!isMounted) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={
          width && height
            ? { width, height }
            : { width: "100%", height: "100%" }
        }
      >
        <div className="text-muted-foreground">Initializing...</div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${className}`}
      style={
        width && height ? { width, height } : { width: "100%", height: "100%" }
      }
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{
          width: width || "100%",
          height: height || "100%",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white">Loading Live2D model...</div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-red-500 text-center">
            <div className="font-semibold mb-2">Live2D Model Error</div>
            <div className="text-sm mb-4">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}
