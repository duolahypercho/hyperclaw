"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useConnectorStatus,
  type ConnectorState,
  type DeviceStatus,
} from "$/hooks/useConnectorStatus";

// Color + label tokens aligned with components/Tool/Devices/index.tsx STATUS_CONFIG.
const STATE_DOT: Record<ConnectorState["state"], string> = {
  unauthenticated: "bg-red-500",
  "no-device": "bg-zinc-500",
  connecting: "bg-blue-500",
  "permanently-failed": "bg-red-500",
  "hub-disconnected": "bg-red-500",
  "connector-offline": "bg-yellow-500",
  revoked: "bg-red-500",
  connected: "bg-emerald-500",
};

// Only the "connecting" state animates — matches existing widget conventions
// (animate-ping is reserved for agents-running per AgentOverviewTab).
const STATE_ANIMATE: Record<ConnectorState["state"], boolean> = {
  unauthenticated: false,
  "no-device": false,
  connecting: true,
  "permanently-failed": false,
  "hub-disconnected": true,
  "connector-offline": false,
  revoked: false,
  connected: false,
};

const DEVICE_STATUS_BADGE: Record<DeviceStatus, { color: string; label: string }> = {
  provisioning: { color: "bg-yellow-500", label: "Provisioning" },
  connecting: { color: "bg-blue-500", label: "Connecting" },
  online: { color: "bg-emerald-500", label: "Online" },
  offline: { color: "bg-zinc-500", label: "Offline" },
  revoked: { color: "bg-red-500", label: "Revoked" },
};

function tooltipText(status: ConnectorState): string {
  switch (status.state) {
    case "unauthenticated":
      return "Session expired — please sign in again";
    case "no-device":
      return "No connector paired";
    case "connecting":
      return "Connecting to hub…";
    case "permanently-failed":
      return "Connection failed — click to retry";
    case "hub-disconnected":
      return "Reconnecting to hub…";
    case "connector-offline":
      return `Connector offline on ${status.deviceName}`;
    case "revoked":
      return `Device revoked: ${status.deviceName}`;
    case "connected":
      return `Connected to ${status.deviceName}`;
  }
}

interface ConnectorStatusIndicatorProps {
  className?: string;
}

export const ConnectorStatusIndicator: React.FC<ConnectorStatusIndicatorProps> = ({
  className,
}) => {
  const { status, refresh, retry } = useConnectorStatus();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const dotColor = STATE_DOT[status.state];
  const animate = STATE_ANIMATE[status.state];
  const tip = tooltipText(status);

  const { actionLabel, onAction } = useMemo(() => {
    switch (status.state) {
      case "no-device":
      case "unauthenticated":
        return {
          actionLabel: "Pair a device",
          onAction: () => {
            setOpen(false);
            router.push("/devices");
          },
        };
      case "permanently-failed":
      case "hub-disconnected":
        return {
          actionLabel: "Retry connection",
          onAction: () => {
            retry();
          },
        };
      case "connector-offline":
      case "revoked":
        return {
          actionLabel: "Open Devices",
          onAction: () => {
            setOpen(false);
            router.push("/devices");
          },
        };
      default:
        return {
          actionLabel: "Refresh",
          onAction: () => refresh(),
        };
    }
  }, [status.state, refresh, retry, router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={tip}
                className={cn(
                  "relative flex h-3.5 w-3.5 items-center justify-center rounded-full shrink-0",
                  "hover:bg-muted/40 transition-colors",
                  className
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    dotColor,
                    animate && "animate-pulse"
                  )}
                />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {tip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent align="end" className="w-64 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            Connector status
          </span>
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              dotColor,
              animate && "animate-pulse"
            )}
          />
        </div>

        <StatusRow label="Hub" value={<HubValue status={status} />} />
        <StatusRow label="Device" value={<DeviceValue status={status} />} />
        <StatusRow label="Probe" value={<ProbeValue status={status} />} />

        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
};

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}

function HubValue({ status }: { status: ConnectorState }) {
  const hubUp =
    status.state === "connected" ||
    status.state === "connector-offline" ||
    status.state === "revoked";
  const label = hubUp
    ? "Online"
    : status.state === "unauthenticated"
    ? "Session expired"
    : status.state === "permanently-failed"
    ? "Failed"
    : status.state === "connecting"
    ? "Connecting…"
    : "Reconnecting…";
  const color = hubUp
    ? "bg-emerald-500"
    : status.state === "connecting"
    ? "bg-blue-500"
    : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-1.5 h-1.5 rounded-full", color)} />
      <span className="text-foreground">{label}</span>
    </span>
  );
}

function DeviceValue({ status }: { status: ConnectorState }) {
  if (status.state === "no-device") {
    return <span className="text-muted-foreground">Not paired</span>;
  }
  if (status.state === "unauthenticated") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (
    status.state === "connecting" ||
    status.state === "permanently-failed" ||
    status.state === "hub-disconnected"
  ) {
    return <span className="text-muted-foreground">—</span>;
  }

  const deviceStatus: DeviceStatus =
    status.state === "connected"
      ? "online"
      : status.state === "revoked"
      ? "revoked"
      : status.deviceStatus;
  const badge = DEVICE_STATUS_BADGE[deviceStatus];

  return (
    <span className="inline-flex items-center gap-1.5 max-w-full">
      <span className="truncate text-foreground">{status.deviceName}</span>
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white shrink-0",
          badge.color
        )}
      >
        {badge.label}
      </span>
    </span>
  );
}

function ProbeValue({ status }: { status: ConnectorState }) {
  if (status.state === "connected") {
    return (
      <span className="text-foreground">
        {status.lastProbeMs > 0 ? `${status.lastProbeMs} ms` : "ok"}
      </span>
    );
  }
  if (status.state === "connector-offline") {
    return <span className="text-yellow-600 dark:text-yellow-400">timeout</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}
