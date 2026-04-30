"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Check, Loader2, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}

// Check if we're in Electron
function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

// Get the electron API safely
function getElectronAPI() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electronAPI?: unknown }).electronAPI;
}

export function ConnectionModal({ open, onOpenChange, onConnected }: ConnectionModalProps) {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(18789);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setErrorMessage("");
      // Load current config if available
      if (isElectron()) {
        const api = getElectronAPI() as unknown as {
          hyperClawBridge?: {
            getGatewayConfig?: () => Promise<{ host: string; port: number; token?: string }>;
          };
        };
        api?.hyperClawBridge?.getGatewayConfig?.().then((config) => {
          if (config) {
            setHost(config.host);
            setPort(config.port);
            setToken(config.token || "");
          }
        });
      }
    }
  }, [open]);

  const testConnection = async () => {
    setStatus("testing");
    setErrorMessage("");

    try {
      if (isElectron()) {
        const api = getElectronAPI() as unknown as {
          hyperClawBridge?: {
            testGatewayConnection?: (host: string, port: number, token?: string) => Promise<{ success: boolean; error?: string }>;
          };
        };
        const result = await api?.hyperClawBridge?.testGatewayConnection?.(host, port, token || undefined);
        if (result?.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(result?.error || "Connection failed");
        }
      } else {
        // Browser mode - try HTTP request
        try {
          const response = await fetch(`http://${host}:${port}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            setStatus("success");
          } else {
            setStatus("error");
            setErrorMessage(`Server returned ${response.status}`);
          }
        } catch (e) {
          setStatus("error");
          setErrorMessage(e instanceof Error ? e.message : "Connection failed");
        }
      }
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Connection failed");
    }
  };

  const handleConnect = async () => {
    setIsSaving(true);
    try {
      if (isElectron()) {
        const api = getElectronAPI() as unknown as {
          hyperClawBridge?: {
            setGatewayConfig?: (host: string, port: number, token?: string) => Promise<{ success: boolean; error?: string }>;
          };
        };
        const result = await api?.hyperClawBridge?.setGatewayConfig?.(host, port, token || undefined);
        if (result?.success) {
          onConnected?.();
          onOpenChange(false);
        } else {
          setErrorMessage(result?.error || "Failed to save configuration");
        }
      } else {
        // Browser mode - just close the modal
        onConnected?.();
        onOpenChange(false);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Connect to OpenClaw
          </DialogTitle>
          <DialogDescription>
            Enter the IP address or hostname of the computer running OpenClaw.
            If OpenClaw is on this computer, use &quot;localhost&quot; or &quot;127.0.0.1&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Host input */}
          <div className="space-y-2">
            <label htmlFor="host" className="text-sm font-medium">
              IP Address or Hostname
            </label>
            <Input
              id="host"
              placeholder="localhost or 192.168.1.100"
              value={host}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setHost(e.target.value);
                setStatus("idle");
              }}
              disabled={isSaving}
            />
          </div>

          {/* Port input */}
          <div className="space-y-2">
            <label htmlFor="port" className="text-sm font-medium">
              Port
            </label>
            <Input
              id="port"
              type="number"
              placeholder="18789"
              value={port}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setPort(parseInt(e.target.value) || 18789);
                setStatus("idle");
              }}
              disabled={isSaving}
            />
          </div>

          {/* Token input - optional, for VPS/public connections */}
          <div className="space-y-2">
            <label htmlFor="token" className="text-sm font-medium">
              Gateway Token <span className="text-muted-foreground">(optional, for VPS/public connections)</span>
            </label>
            <Input
              id="token"
              type="password"
              placeholder="Enter token if your gateway requires auth"
              value={token}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setToken(e.target.value);
                setStatus("idle");
              }}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Required for public IPs. Set in your OpenClaw config: gateway.auth.token
            </p>
          </div>

          {/* Status message */}
          {status !== "idle" && (
            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-md text-sm",
                status === "testing" && "bg-blue-50 text-blue-700",
                status === "success" && "bg-green-50 text-green-700",
                status === "error" && "bg-red-50 text-red-700"
              )}
            >
              {status === "testing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === "success" && <Check className="h-4 w-4" />}
              {status === "error" && <AlertCircle className="h-4 w-4" />}
              {status === "testing" && "Testing connection..."}
              {status === "success" && "Connection successful!"}
              {status === "error" && (errorMessage || "Connection failed")}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={status === "testing" || isSaving || !host.trim()}
            >
              {status === "testing" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Wifi className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isSaving || !host.trim() || status !== "success"}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage showing the connection modal on first launch
export function useConnectionModal() {
  const [showModal, setShowModal] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Check if we've already configured the gateway
    const checkGateway = async () => {
      if (!isElectron()) {
        setHasChecked(true);
        return;
      }

      try {
        const api = getElectronAPI() as unknown as {
          hyperClawBridge?: {
            getGatewayConfig?: () => Promise<{ host: string; port: number }>;
            testGatewayConnection?: (host: string, port: number) => Promise<{ success: boolean }>;
          };
        };

        const config = await api?.hyperClawBridge?.getGatewayConfig?.();
        if (config) {
          // Test if the current config works
          const result = await api?.hyperClawBridge?.testGatewayConnection?.(
            config.host,
            config.port
          );
          if (!result?.success) {
            // Current config doesn't work, show modal
            setShowModal(true);
          }
        }
      } catch {
        // Error checking config, show modal
        setShowModal(true);
      } finally {
        setHasChecked(true);
      }
    };

    checkGateway();
  }, []);

  return { showModal, setShowModal, hasChecked };
}
