"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import DeviceSetup from "$/components/Onboarding/DeviceSetup";

interface DeviceSetupDialogProps {
  /** Controlled open state */
  open: boolean;
  /** Called when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Called when device setup completes successfully */
  onComplete?: () => void;
  /** Optional title override */
  title?: string;
  /** Optional description override */
  description?: string;
}

/**
 * A reusable dialog wrapper around DeviceSetup.
 * Can be used inline from any component that needs to trigger device setup,
 * including OpenClawSetupPrompt and future onboarding flows.
 */
export function DeviceSetupDialog({
  open,
  onOpenChange,
  onComplete,
  title = "Connect OpenClaw",
  description = "Install the connector on your machine to enable OpenClaw features.",
}: DeviceSetupDialogProps) {
  const handleComplete = useCallback(() => {
    onComplete?.();
    onOpenChange(false);
  }, [onComplete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="px-2 pb-4">
          <DeviceSetup onComplete={handleComplete} embedded />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to manage DeviceSetupDialog state.
 * Returns [isOpen, open, close, DialogComponent]
 */
export function useDeviceSetupDialog(onComplete?: () => void) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const DialogComponent = useCallback(
    () => (
      <DeviceSetupDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onComplete={onComplete}
      />
    ),
    [isOpen, onComplete]
  );

  return { isOpen, open, close, Dialog: DialogComponent };
}

export default DeviceSetupDialog;
