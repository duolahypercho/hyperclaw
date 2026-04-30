"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
} from "lucide-react";
import { useIsElectron } from "$/hooks/useIsElectron";
import type { UpdateStatus } from "$/types/electron";

export function UpdateNotification() {
  const isElectron = useIsElectron();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !isElectron || typeof window === "undefined" || !window.electronAPI) {
      return;
    }

    // Set up update status listener
    window.electronAPI.onUpdateStatus((data: UpdateStatus) => {
      setUpdateStatus(data);

      // Show notification for important statuses
      if (
        data.status === "available" ||
        data.status === "downloaded" ||
        data.status === "error"
      ) {
        setIsVisible(true);
      }
    });

    // Cleanup listener on unmount
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeUpdateStatusListener();
      }
    };
  }, [isMounted, isElectron]);

  // Don't render during SSR
  if (!isMounted || !isElectron || !updateStatus || !isVisible) {
    return null;
  }

  const handleDownload = () => {
    if (window.electronAPI && updateStatus.status === "available") {
      window.electronAPI.downloadUpdate();
      setIsVisible(true); // Keep visible during download
    }
  };

  const handleInstall = () => {
    if (window.electronAPI && updateStatus.status === "downloaded") {
      window.electronAPI.installUpdate();
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const handleCheckForUpdates = () => {
    if (window.electronAPI) {
      window.electronAPI.checkForUpdates();
      setIsVisible(true);
    }
  };

  // Don't show for dev-mode or not-available statuses
  if (
    updateStatus.status === "dev-mode" ||
    updateStatus.status === "not-available" ||
    updateStatus.status === "checking"
  ) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed top-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
        >
          <div className="bg-card border border-border rounded-lg shadow-lg p-4 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {updateStatus.status === "available" && (
                  <Download className="w-5 h-5 text-primary" />
                )}
                {updateStatus.status === "downloading" && (
                  <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                )}
                {updateStatus.status === "downloaded" && (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
                {updateStatus.status === "error" && (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                )}
                <h3 className="font-semibold text-foreground">
                  {updateStatus.status === "available" && "Update Available"}
                  {updateStatus.status === "downloading" &&
                    "Downloading Update"}
                  {updateStatus.status === "downloaded" && "Update Ready"}
                  {updateStatus.status === "error" && "Update Error"}
                </h3>
              </div>
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message */}
            <p className="text-sm text-muted-foreground mb-3">
              {updateStatus.message}
            </p>

            {/* Version info */}
            {updateStatus.version && (
              <p className="text-xs text-muted-foreground mb-3">
                Version {updateStatus.version}
              </p>
            )}

            {/* Download progress */}
            {updateStatus.status === "downloading" &&
              updateStatus.percent !== undefined && (
                <div className="mb-3">
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${updateStatus.percent}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {updateStatus.percent.toFixed(0)}% -{" "}
                    {updateStatus.bytesPerSecond
                      ? `${(updateStatus.bytesPerSecond / 1024 / 1024).toFixed(
                          2
                        )} MB/s`
                      : ""}
                  </p>
                </div>
              )}

            {/* Actions */}
            <div className="flex gap-2">
              {updateStatus.status === "available" && (
                <button
                  onClick={handleDownload}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Download Update
                </button>
              )}
              {updateStatus.status === "downloaded" && (
                <button
                  onClick={handleInstall}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Restart & Install
                </button>
              )}
              {updateStatus.status === "error" && (
                <button
                  onClick={handleCheckForUpdates}
                  className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Try Again
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
