"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X, Archive, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Runtime display names
const RUNTIME_NAMES: Record<string, string> = {
  openclaw: "OpenClaw",
  hermes: "Hermes",
  "claude-code": "Claude Code",
  codex: "Codex",
};

interface OrphanedRuntime {
  runtime: string;
  agentCount: number;
}

export function OrphanedRuntimesBanner() {
  const [orphaned, setOrphaned] = useState<OrphanedRuntime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingRuntime, setProcessingRuntime] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Check for orphaned runtimes on mount
  useEffect(() => {
    const checkOrphaned = async () => {
      try {
        const result = (await bridgeInvoke("check-orphaned-runtimes")) as {
          success: boolean;
          data?: { orphaned: OrphanedRuntime[] };
        };
        if (result.success && result.data?.orphaned) {
          setOrphaned(result.data.orphaned);
        }
      } catch (error) {
        // Silently fail - not critical
      } finally {
        setIsLoading(false);
      }
    };

    checkOrphaned();

    // Also listen for runtime.uninstalled events
    const handleUninstall = (event: CustomEvent<{ runtime?: string; agentCount?: number }>) => {
      const runtime = event.detail?.runtime;
      const count = event.detail?.agentCount ?? 0;
      if (runtime && count > 0) {
        setOrphaned((prev) => {
          // Avoid duplicates
          if (prev.some((o) => o.runtime === runtime)) {
            return prev;
          }
          return [...prev, { runtime, agentCount: count }];
        });
      }
    };

    window.addEventListener("runtime.uninstalled", handleUninstall as EventListener);
    return () => {
      window.removeEventListener("runtime.uninstalled", handleUninstall as EventListener);
    };
  }, []);

  const handleExportAndDelete = useCallback(async (runtime: string) => {
    setProcessingRuntime(runtime);
    const runtimeName = RUNTIME_NAMES[runtime] || runtime;

    try {
      // Export first
      const exportResult = (await bridgeInvoke("runtime-cleanup-export", { runtime })) as {
        success: boolean;
        data?: { agents: unknown[]; count: number };
        error?: string;
      };

      if (!exportResult.success) {
        toast.error("Export failed", { description: exportResult.error });
        return;
      }

      // Download JSON
      const blob = new Blob([JSON.stringify(exportResult.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${runtime}-agents-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Then delete
      const deleteResult = (await bridgeInvoke("runtime-cleanup-delete", { runtime })) as {
        success: boolean;
        data?: { deleted: number };
        error?: string;
      };

      if (!deleteResult.success) {
        toast.error("Delete failed", { description: deleteResult.error });
        return;
      }

      toast.success(`${runtimeName} cleanup complete`, {
        description: `Exported and deleted ${deleteResult.data?.deleted ?? 0} agents`,
      });

      // Remove from list
      setOrphaned((prev) => prev.filter((o) => o.runtime !== runtime));
    } catch (error) {
      toast.error("Cleanup failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setProcessingRuntime(null);
    }
  }, []);

  const handleDeleteOnly = useCallback(async (runtime: string) => {
    setProcessingRuntime(runtime);
    const runtimeName = RUNTIME_NAMES[runtime] || runtime;

    try {
      const result = (await bridgeInvoke("runtime-cleanup-delete", { runtime })) as {
        success: boolean;
        data?: { deleted: number };
        error?: string;
      };

      if (!result.success) {
        toast.error("Delete failed", { description: result.error });
        return;
      }

      toast.success(`${runtimeName} cleanup complete`, {
        description: `Deleted ${result.data?.deleted ?? 0} agents`,
      });

      setOrphaned((prev) => prev.filter((o) => o.runtime !== runtime));
    } catch (error) {
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setProcessingRuntime(null);
    }
  }, []);

  const handleDismiss = useCallback((runtime: string) => {
    setDismissed((prev) => new Set([...prev, runtime]));
  }, []);

  // Filter out dismissed runtimes
  const visibleOrphaned = orphaned.filter((o) => !dismissed.has(o.runtime));

  if (isLoading || visibleOrphaned.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {visibleOrphaned.map((item) => {
        const runtimeName = RUNTIME_NAMES[item.runtime] || item.runtime;
        const isProcessing = processingRuntime === item.runtime;

        return (
          <div
            key={item.runtime}
            className={cn(
              "bg-amber-500/95 text-amber-950 px-4 py-3",
              "flex items-center justify-between gap-4",
              "border-b border-amber-600/50"
            )}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <span className="font-medium">{runtimeName} was uninstalled.</span>
                <span className="ml-1">
                  {item.agentCount} agent{item.agentCount !== 1 ? "s" : ""} found in database.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border-0"
                onClick={() => handleExportAndDelete(item.runtime)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Export & Delete
              </Button>

              <Button
                size="sm"
                variant="secondary"
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border-0"
                onClick={() => handleDeleteOnly(item.runtime)}
                disabled={isProcessing}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="text-amber-900 hover:bg-amber-400/50"
                onClick={() => handleDismiss(item.runtime)}
                disabled={isProcessing}
              >
                <Archive className="h-4 w-4 mr-1" />
                Keep
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-amber-900 hover:bg-amber-400/50"
                onClick={() => handleDismiss(item.runtime)}
                disabled={isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
