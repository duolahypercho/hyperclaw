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
import { User, Settings, LogOut, Sparkles, CreditCard, RefreshCw, Wrench } from "lucide-react";
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
  const { runDoctorFix, isRunning: fixingOpenClaw } = useDoctorTerminal();
  const router = useRouter();
  const { openModal } = usePricingModal();
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const { toast } = useToast();

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
          <Wrench className={cn("mr-2 h-4 w-4", fixingOpenClaw && "animate-spin")} />
          <span>{fixingOpenClaw ? "Fixing..." : "Fix OpenClaw"}</span>
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
