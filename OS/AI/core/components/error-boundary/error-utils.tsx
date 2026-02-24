import React, { useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { ExclamationMarkIcon } from "@OS/AI/core/components/toast/exclamation-mark-icon";
import ReactMarkdown from "react-markdown";

interface OriginalError {
  message?: string;
  stack?: string;
}

type ErrorWithExtensions = Error & {
  extensions?: {
    code?: string;
    originalError?: OriginalError;
  };
};

function hasExtensions(e: unknown): e is ErrorWithExtensions {
  return typeof e === "object" && e !== null && "extensions" in e;
}

export function ErrorToast({ errors }: { errors: Error[] }) {
  const errorsToRender = errors.map((error, idx) => {
    const originalError = hasExtensions(error)
      ? error.extensions?.originalError
      : undefined;

    const message = originalError?.message ?? error.message;
    const code = hasExtensions(error) ? error.extensions?.code ?? null : null;

    return (
      <div
        key={idx}
        style={{
          marginTop: idx === 0 ? 0 : 10,
          marginBottom: 14,
        }}
      >
        <ExclamationMarkIcon style={{ marginBottom: 4 }} />

        {code && (
          <div
            style={{
              fontWeight: "600",
              marginBottom: 4,
            }}
          >
            Copilot Runtime Error:{" "}
            <span style={{ fontFamily: "monospace", fontWeight: "normal" }}>
              {code}
            </span>
          </div>
        )}
        <ReactMarkdown>{message}</ReactMarkdown>
      </div>
    );
  });
  return (
    <div
      style={{
        fontSize: "13px",
        maxWidth: "600px",
      }}
    >
      {errorsToRender}
      <div style={{ fontSize: "11px", opacity: 0.75 }}>
        NOTE: This error only displays during local development.
      </div>
    </div>
  );
}

export function useErrorToast() {
  const { toast } = useToast();

  return useCallback(
    (error: Error[]) => {
      const errorId = error
        .map((err) => {
          const message = hasExtensions(err)
            ? err.extensions?.originalError?.message || err.message
            : err.message;
          const stack = err.stack || "";
          return btoa(message + stack).slice(0, 32); // Create hash from message + stack
        })
        .join("|");

      toast({
        variant: "destructive",
        title: "Error",
        description: <ErrorToast errors={error} />,
      });
    },
    [toast]
  );
}

// Circuit breaker to prevent infinite retries
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly maxFailures = 3;
  private readonly timeout = 30000; // 30 seconds
  private readonly retryDelay = 5000; // 5 seconds

  isOpen(): boolean {
    if (this.failures >= this.maxFailures) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      return timeSinceLastFailure < this.timeout;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  getRetryDelay(): number {
    return this.retryDelay;
  }
}

// Global circuit breaker instance
const globalCircuitBreaker = new CircuitBreaker();

// Check if error is a network error that should trigger circuit breaker
function isNetworkError(error: any): boolean {
  if (!error) return false;

  const message = error.message?.toLowerCase() || "";
  const networkErrorPatterns = [
    "failed to fetch",
    "network error",
    "connection refused",
    "timeout",
    "err_connection_refused",
    "net::err_connection_refused",
  ];

  return networkErrorPatterns.some((pattern) => message.includes(pattern));
}

export function useAsyncCallback<T extends (...args: any[]) => Promise<any>>(
  callback: T,
  deps: Parameters<typeof useCallback>[1]
) {
  const addErrorToast = useErrorToast();
  return useCallback(async (...args: Parameters<T>) => {
    try {
      // Check circuit breaker before making request
      if (globalCircuitBreaker.isOpen()) {
        const error = new Error(
          "Service temporarily unavailable. Please try again later."
        );
        console.warn("🚫 Circuit breaker is open, blocking request");
        throw error;
      }

      const result = await callback(...args);

      // Record success to reset circuit breaker
      globalCircuitBreaker.recordSuccess();

      return result;
    } catch (error) {
      console.error("Error in async callback:", error);

      // Check if this is a network error that should trigger circuit breaker
      if (isNetworkError(error)) {
        globalCircuitBreaker.recordFailure();
        console.warn(
          `🔴 Network error detected. Failures: ${globalCircuitBreaker["failures"]}`
        );
      }

      // Only show toast for non-circuit-breaker errors
      if (!globalCircuitBreaker.isOpen()) {
        // @ts-ignore
        addErrorToast([error]);
      }

      throw error;
    }
  }, deps);
}
