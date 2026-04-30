import { CopanionClient, CopanionClientOptions } from "@OS/AI/runtime-client";
import { useToast } from "@/components/ui/use-toast";
import { useMemo, useRef } from "react";
import {
  HyperchoError,
  HyperchoErrorCode,
  CopanionkitErrorHandler,
  CopanionkitErrorEvent,
} from "@OS/AI/shared";
import { shouldShowDevConsole } from "../utils/dev-console";

export interface CopanionRuntimeClientHookOptions
  extends CopanionClientOptions {
  showDevConsole?: boolean;
  onError?: CopanionkitErrorHandler;
}

export const useCopanionRuntimeClient = (
  options: CopanionRuntimeClientHookOptions
) => {
  const { setBannerError } = useToast();
  const { showDevConsole, onError, ...runtimeOptions } = options;

  // Deduplication state for structured errors
  const lastStructuredErrorRef = useRef<{
    message: string;
    timestamp: number;
  } | null>(null);

  // Helper function to trace UI errors
  const traceUIError = async (error: HyperchoError, originalError?: any) => {
    // Just check if onError and publicApiKey are defined
    if (!onError) return;

    try {
      const errorEvent: CopanionkitErrorEvent = {
        type: "error",
        timestamp: Date.now(),
        context: {
          source: "ui",
          request: {
            operation: "runtimeClient",
            url: runtimeOptions.url,
            startTime: Date.now(),
          },
          technical: {
            environment: "browser",
            userAgent:
              typeof navigator !== "undefined"
                ? navigator.userAgent
                : undefined,
            stackTrace:
              originalError instanceof Error ? originalError.stack : undefined,
          },
        },
        error,
      };
      await onError(errorEvent);
    } catch (error) {
      console.error("Error in onError handler:", error);
    }
  };

  const runtimeClient = useMemo(() => {
    return new CopanionClient({
      ...runtimeOptions,
      handleErrors: (error) => {
        const isDev = shouldShowDevConsole(showDevConsole ?? false);

        // Log error in development
        if (isDev) {
          console.error("CopanionClient Error:", error);
        }

        // Deduplicate to prevent spam
        const now = Date.now();
        const errorMessage = error?.message || String(error);
        if (
          lastStructuredErrorRef.current &&
          lastStructuredErrorRef.current.message === errorMessage &&
          now - lastStructuredErrorRef.current.timestamp < 150
        ) {
          return; // Skip duplicate
        }
        lastStructuredErrorRef.current = {
          message: errorMessage,
          timestamp: now,
        };

        // Create structured error and show as banner
        const structuredError = new HyperchoError({
          message: errorMessage,
          code: HyperchoErrorCode.UNKNOWN,
        });

        setBannerError(structuredError);
        // Trace the error
        traceUIError(structuredError, error);
      },
    });
  }, [runtimeOptions, setBannerError, showDevConsole, onError]);

  return runtimeClient;
};
