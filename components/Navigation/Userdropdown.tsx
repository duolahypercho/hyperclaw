import React, { useState, useEffect } from "react";
import { useUser } from "$/Providers/UserProv";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
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
import { getBillingPortalUrl } from "$/services/user";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { useDoctorTerminal } from "$/components/Tool/DoctorTerminal/DoctorTerminalContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Userdropdown = () => {
  const { userInfo, membership, logout } = useUser();
  const { gatewayHealthy, gatewayHealthError, refreshAll } = useOpenClawContext();
  const [reconnecting, setReconnecting] = useState(false);
  const [restartingGateway, setRestartingGateway] = useState(false);
  const { runDoctorFix, isRunning: fixingOpenClaw } = useDoctorTerminal();
  const router = useRouter();
  const { openModal } = usePricingModal();
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
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
      if (detail?.success) refreshAll();
    };
    window.addEventListener("openclaw-doctor-done", handler);
    return () => window.removeEventListener("openclaw-doctor-done", handler);
  }, [refreshAll]);

  // Check if user has an active paid membership
  const hasActiveMembership = membership && !membership.isFreePlan;

  const getInitials = (firstname?: string, lastname?: string) => {
    if (!firstname) return "U";
    return `${firstname.charAt(0)}${lastname?.charAt(0) || ""}`.toUpperCase();
  };

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const handleManagePlan = async () => {
    if (!membership) {
      toast({
        title: "Error",
        description: "Unable to access billing portal. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    const customerId = membership.customerId;

    if (!customerId) {
      toast({
        title: "Error",
        description: "Customer ID not found. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingBilling(true);
    try {
      const { url } = await getBillingPortalUrl({
        customerId: customerId,
      });

      window.open(url, "_blank");
    } catch (error: any) {
      console.error("Error opening billing portal:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to open billing portal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingBilling(false);
    }
  };

  useEffect(() => {
    console.log("[Userdropdown] mounted, userInfo:", userInfo?.email, "gatewayHealthy:", gatewayHealthy);
  }, []);

  // OpenClaw gateway health: true = green, false = red, null = unknown/loading (amber)
  const healthDot =
    gatewayHealthy === true ? (
      "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
    ) : gatewayHealthy === false ? (
      "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
    ) : (
      "bg-amber-500/80 animate-pulse"
    );
  const healthLabel =
    gatewayHealthy === true
      ? "OpenClaw gateway connected"
      : gatewayHealthy === false
        ? gatewayHealthError || "OpenClaw gateway disconnected"
        : "OpenClaw status checking...";

  return (
    <>
    <DropdownMenu onOpenChange={(open) => console.log("[Userdropdown] DropdownMenu onOpenChange:", open)}>
      <DropdownMenuTrigger
        onClick={() => console.log("[Userdropdown] trigger onClick")}
        onPointerDown={(e: React.PointerEvent) => console.log("[Userdropdown] trigger onPointerDown, defaultPrevented:", e.defaultPrevented, "button:", e.button)}
        className="relative flex items-center justify-center px-0 py-0 rounded-md hover:bg-primary/10 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 hover:scale-105 active:scale-95"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
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
        <span
          className="absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center rounded-full bg-secondary shadow-sm pointer-events-none"
          aria-label={healthLabel}
          title={healthLabel}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full transition-all duration-300",
              healthDot
            )}
          />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        className="w-56 bg-card/95 backdrop-blur-sm z-[9999]"
        onCloseAutoFocus={(e) => console.log("[Userdropdown] content onCloseAutoFocus")}
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
          <DropdownMenuItem
            onClick={handleManagePlan}
            disabled={isLoadingBilling}
            className="cursor-pointer"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            <span>{isLoadingBilling ? "Opening..." : "Manage Plan"}</span>
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
                try { await refreshAll(); } finally { setReconnecting(false); }
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
