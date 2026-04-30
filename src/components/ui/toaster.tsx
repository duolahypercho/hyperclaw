"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { useEffect, useRef } from "react";
import { HyperchoError, Severity } from "@OS/AI/shared";

// Helper functions for error banner styling
type ErrorSeverity = "critical" | "warning" | "info";

interface ErrorColors {
  background: string;
  border: string;
  text: string;
  icon: string;
}

function getErrorSeverity(error: HyperchoError): ErrorSeverity {
  // Use structured error severity if available
  if (error.severity) {
    switch (error.severity) {
      case Severity.CRITICAL:
        return "critical";
      case Severity.WARNING:
        return "warning";
      case Severity.INFO:
        return "info";
      default:
        return "info";
    }
  }

  // Fallback: Check for API key errors which should always be critical
  const message = error.message.toLowerCase();
  if (
    message.includes("api key") ||
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("authentication") ||
    message.includes("incorrect api key")
  ) {
    return "critical";
  }

  // Default to info level
  return "info";
}

function getErrorColors(severity: ErrorSeverity): ErrorColors {
  switch (severity) {
    case "critical":
      return {
        background: "#fee2e2",
        border: "#dc2626",
        text: "#7f1d1d",
        icon: "#dc2626",
      };
    case "warning":
      return {
        background: "#fef3c7",
        border: "#d97706",
        text: "#78350f",
        icon: "#d97706",
      };
    case "info":
      return {
        background: "#dbeafe",
        border: "#2563eb",
        text: "#1e3a8a",
        icon: "#2563eb",
      };
  }
}

function ToastProgress({ duration }: { duration: number }) {
  const { dismiss } = useToast();
  const dismissRef = useRef(dismiss);

  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  // Dismiss after duration — single timer instead of 10 state updates/sec
  useEffect(() => {
    const timer = setTimeout(() => {
      dismissRef.current();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div className="h-1 w-full bg-secondary overflow-hidden rounded-full">
      <div
        className="h-full bg-primary rounded-full"
        style={{
          width: "100%",
          animation: `toast-progress ${duration}ms linear forwards`,
        }}
      />
      <style jsx>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export function Toaster() {
  const { toasts, bannerError, setBannerError } = useToast();
  return (
    <ToastProvider>
      {/* Banner Error Display */}
      {bannerError &&
        (() => {
          const severity = getErrorSeverity(bannerError);
          const colors = getErrorColors(severity);

          return (
            <div
              style={{
                position: "fixed",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 9999,
                backgroundColor: colors.background,
                border: `1px solid ${colors.border}`,
                borderLeft: `4px solid ${colors.border}`,
                borderRadius: "8px",
                padding: "12px 16px",
                fontSize: "13px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                backdropFilter: "blur(8px)",
                maxWidth: "min(90vw, 700px)",
                width: "100%",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: colors.border,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        color: colors.text,
                        lineHeight: "1.4",
                        fontWeight: "400",
                        fontSize: "13px",
                        flex: 1,
                        wordBreak: "break-all",
                        overflowWrap: "break-word",
                        maxWidth: "550px",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 10,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {(() => {
                        let message = bannerError.message;

                        // Try to extract the useful message from JSON first
                        const jsonMatch = message.match(
                          /'message':\s*'([^']+)'/
                        );
                        if (jsonMatch) {
                          return jsonMatch[1]; // Return the actual error message
                        }

                        // Strip technical garbage but keep the meaningful message
                        message = message.split(" - ")[0]; // Remove everything after " - {"
                        message = message.split(": Error code")[0]; // Remove ": Error code: 401"
                        message = message.replace(/:\s*\d{3}$/, ""); // Remove trailing ": 401"
                        message = message.replace(/See more:.*$/g, ""); // Remove "See more" links
                        message = message.trim();

                        return message || "Configuration error occurred.";
                      })()}
                    </div>

                    {(() => {
                      const message = bannerError.message;
                      const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                      const plainUrlRegex = /(https?:\/\/[^\s)]+)/g;

                      // Extract the first URL found
                      let url = null;
                      let buttonText = "See More";

                      // Check for markdown links first
                      const markdownMatch = markdownLinkRegex.exec(message);
                      if (markdownMatch) {
                        url = markdownMatch[2];
                        buttonText = "See More";
                      } else {
                        // Check for plain URLs
                        const urlMatch = plainUrlRegex.exec(message);
                        if (urlMatch) {
                          url = urlMatch[0].replace(/[.,;:'"]*$/, ""); // Remove trailing punctuation
                          buttonText = "See More";
                        }
                      }

                      if (!url) return null;

                      return (
                        <button
                          onClick={() =>
                            window.open(url, "_blank", "noopener,noreferrer")
                          }
                          style={{
                            background: colors.border,
                            color: "white",
                            border: "none",
                            borderRadius: "5px",
                            padding: "4px 10px",
                            fontSize: "11px",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.9";
                            e.currentTarget.style.transform =
                              "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                            e.currentTarget.style.transform = "translateY(0)";
                          }}
                        >
                          {buttonText}
                        </button>
                      );
                    })()}
                  </div>
                </div>
                <button
                  onClick={() => setBannerError(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: colors.text,
                    cursor: "pointer",
                    padding: "2px",
                    borderRadius: "3px",
                    fontSize: "14px",
                    lineHeight: "1",
                    opacity: 0.6,
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                  }}
                  title="Dismiss"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "0.6";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })()}

      {toasts.map(function ({
        id,
        title,
        description,
        action,
        variant,
        duration = 1000,
        ...props
      }) {
        if (variant === "loading") {
          return (
            <Toast key={id} {...props} variant={variant}>
              <div className="grid gap-1">
                <div className="flex flex-row gap-3">
                  <svg
                    className="animate-spin h-5 w-5 text-current"
                    fill="none"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      fill="currentColor"
                    />
                  </svg>
                  {title && <ToastTitle>{title}</ToastTitle>}
                </div>
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
              {action}
              <ToastClose />
            </Toast>
          );
        }
        if (variant === "destructive") {
          return (
            <Toast key={id} {...props} variant={variant} className="relative">
              <div className="grid gap-1">
                <div className="flex flex-row gap-3">
                  {title && <ToastTitle>{title}</ToastTitle>}
                </div>
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
              {action}
              <ToastClose />
            </Toast>
          );
        }
        return (
          <Toast key={id} {...props} className="relative" variant={variant}>
            <div className="grid gap-1">
              <div className="flex flex-row gap-3">
                {title && <ToastTitle>{title}</ToastTitle>}
              </div>
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 w-full !ml-0">
              <ToastProgress duration={duration} />
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
