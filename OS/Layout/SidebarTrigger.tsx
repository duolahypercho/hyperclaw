import { useInteractApp } from "@OS/Provider/InteractAppProv";
import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarTriggerProps {
  className?: string;
}

export function SidebarTrigger({ className }: SidebarTriggerProps) {
  const { sidebar, toggleSidebar } = useInteractApp();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            className,
            "transition-all duration-300 hover:scale-110 active:scale-95 w-fit h-fit p-1.5 rounded-sm"
          )}
          onClick={() => toggleSidebar()}
        >
          {!sidebar ? (
            <PanelRightClose className="h-4 w-4 transition-transform duration-300" />
          ) : (
            <PanelRightOpen className="h-4 w-4 transition-transform duration-300" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {sidebar ? "Close sidebar" : "Open sidebar"}
      </TooltipContent>
    </Tooltip>
  );
}
