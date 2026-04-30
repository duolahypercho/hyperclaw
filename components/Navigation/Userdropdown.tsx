import React, { useState, useEffect } from "react";
import { useUser } from "$/Providers/UserProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { useSharedDevices } from "$/Providers/DevicesProv";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut, Sparkles, CreditCard, RefreshCw, Wrench, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/router";
import { getMediaUrl } from "$/utils";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { usePricingModal } from "$/Providers/PricingModalProv";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { useDoctorTerminal } from "$/components/Tool/DoctorTerminal/DoctorTerminalContext";
import { useConnectorStatus, type ConnectorState } from "$/hooks/useConnectorStatus";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UserdropdownProps {
  connectorStatus?: ConnectorState;
}

function getConnectorHealthLabel(status: ConnectorState): string {
  switch (status.state) {
    case "connected":
      return `Connector online: ${status.deviceName}`;
    case "unauthenticated":
      return "Connector offline: session expired";
    case "no-device":
      return "Connector offline: no device paired";
    case "connecting":
      return "Connector offline: connecting";
    case "permanently-failed":
      return "Connector offline: connection failed";
    case "hub-disconnected":
      return "Connector offline: hub disconnected";
    case "connector-offline":
      return `Connector offline: ${status.deviceName}`;
    case "gateway-unhealthy":
      return `Connector online, gateway ${status.gatewayState}: ${status.deviceName}`;
    case "revoked":
      return `Connector offline: ${status.deviceName} revoked`;
  }
}

const Userdropdown = ({ connectorStatus }: UserdropdownProps) => {
  if (!connectorStatus) {
    return <LiveUserdropdown />;
  }

  return <UserdropdownContent connectorStatus={connectorStatus} />;
};

const LiveUserdropdown = () => {
  const { status } = useConnectorStatus();
  return <UserdropdownContent connectorStatus={status} />;
};

const UserdropdownContent = ({ connectorStatus }: { connectorStatus: ConnectorState }) => {
  const { userInfo, membership, logout } = useUser();
  const { gatewayHealthy, gatewayHealthError, refreshAll } = useHyperclawContext();
  const { refetch: refetchDevices } = useSharedDevices();
  const [reconnecting, setReconnecting] = useState(false);
  const [restartingGateway, setRestartingGateway] = useState(false);
  const { runDoctorFix, isRunning: fixingOpenClaw } = useDoctorTerminal();
  const router = useRouter();
  const { openModal } = usePricingModal();
  const { toast } = useToast();

  const handleGatewayRestart = async () => {
    setRestartingGateway(true);
    try {
      const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
      const result = await bridgeInvoke("gateway-restart") as Record<string, any>;
      if (result?.success === false) {
        toast({ title: "Gateway restart failed", description: result.error || "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Gateway restarted", description: "OpenClaw gateway has been restarted." });
        refreshAll();
        refetchDevices();
      }
    } catch (err: any) {
      toast({ title: "Gateway restart failed", description: err?.message || "Could not reach connector.", variant: "destructive" });
    } finally {
      setRestartingGateway(false);
    }
  };

  // Listen for doctor fix completion to refresh gateway status
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.success) {
        refreshAll();
        refetchDevices();
      }
    };
    window.addEventListener("openclaw-doctor-done", handler);
    return () => window.removeEventListener("openclaw-doctor-done", handler);
  }, [refreshAll, refetchDevices]);

  // Check if user has an active paid membership
  const hasActiveMembership = membership && !membership.isFreePlan;

  const getInitials = (firstname?: string, lastname?: string) => {
    if (!firstname) return "U";
    return `${firstname.charAt(0)}${lastname?.charAt(0) || ""}`.toUpperCase();
  };

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  // Billing portal is a Cloud-only feature. In Community Edition we surface
  // the same upgrade prompt instead of trying to open a Stripe portal that
  // doesn't exist.
  const handleManagePlan = () => {
    openModal();
  };

  // Connector health is driven by the live hub WS + device/probe status.
  const connectorConnected = connectorStatus.state === "connected";
  const healthDot = connectorConnected
    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
    : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)] animate-pulse";
  const healthLabel = getConnectorHealthLabel(connectorStatus);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative flex items-center justify-center px-0 py-0 rounded-md hover:bg-primary/10 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <Avatar className="h-9 w-9 rounded-md">
            <AvatarImage
              src={getMediaUrl(userInfo.profilePic)}
              alt={userInfo.username || "User"}
              className="object-cover object-center"
            />
            <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-medium rounded-md">
              {getInitials(userInfo.Firstname, userInfo.Lastname)}
            </AvatarFallback>
          </Avatar>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center rounded-full bg-secondary shadow-sm"
                  aria-label={healthLabel}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full transition-all duration-300",
                      healthDot
                    )}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {healthLabel}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        className="w-56 bg-card/95 backdrop-blur-sm"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-row items-center gap-2">
            <Avatar className="h-8 w-8 rounded-md">
              <AvatarImage
                src={getMediaUrl(userInfo.profilePic)}
                alt={userInfo.username || "User"}
                className="object-cover object-center"
              />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-medium rounded-md">
                {getInitials(userInfo.Firstname, userInfo.Lastname)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-none text-foreground truncate">
                  {userInfo.Firstname} {userInfo.Lastname}
                </p>
                <Badge
                  variant={hasActiveMembership ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0 h-4 font-medium shrink-0"
                >
                  {hasActiveMembership ? "Pro" : "Free"}
                </Badge>
              </div>
              <p className="text-xs leading-none text-muted-foreground truncate">
                {userInfo.email}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleNavigation("/Settings")}
          className="cursor-pointer"
        >
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleNavigation("/Settings")}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        {hasActiveMembership ? (
          <DropdownMenuItem onClick={handleManagePlan} className="cursor-pointer">
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Manage Plan</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={openModal}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Upgrade Plan</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            runDoctorFix();
          }}
          disabled={fixingOpenClaw}
          className="cursor-pointer"
        >
          {fixingOpenClaw ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wrench className="mr-2 h-4 w-4" />
          )}
          <span>{fixingOpenClaw ? "Fixing..." : "Fix OpenClaw"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            handleGatewayRestart();
          }}
          disabled={restartingGateway}
          className="cursor-pointer"
        >
          {restartingGateway ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          <span>{restartingGateway ? "Restarting..." : "Restart Gateway"}</span>
        </DropdownMenuItem>
        {gatewayHealthy === false && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async (e) => {
                e.preventDefault();
                setReconnecting(true);
                try { await refreshAll(); refetchDevices(); } finally { setReconnecting(false); }
              }}
              disabled={reconnecting}
              className="cursor-pointer text-amber-600 focus:text-amber-600"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", reconnecting && "animate-spin")} />
              <span>{reconnecting ? "Reconnecting..." : "Reconnect"}</span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
};

export default Userdropdown;
