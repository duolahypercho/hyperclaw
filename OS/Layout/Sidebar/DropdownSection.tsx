import React from "react";
import { SidebarSection } from "./SidebarSchema";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "$/utils";
import { Check, Plus, ChevronsUpDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isSidebarUserItem } from "./SidebarSchema";
import SidebarNavItem from "./SidebarNavItem";

const DropdownSection: React.FC<{
  section: SidebarSection & { type: "dropdownUser" };
}> = ({ section }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          className={cn(
            "w-full flex justify-between items-center gap-2 px-2 py-2 rounded hover:bg-primary/5 transition text-base font-semibold text-foreground h-fit"
          )}
        >
          {section.activeItem ? (
            <div className="flex w-full items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={section.activeItem.logo} />
                <AvatarFallback>
                  {section.activeItem.title?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-left truncate text-sm font-semibold text-foreground tracking-wide">
                  {section.activeItem.title}
                </span>
                <span className="text-left truncate text-xs font-medium text-muted-foreground tracking-wide">
                  {section.activeItem.description}
                </span>
              </div>
              <Button
                variant="ghost"
                className="w-fit h-fit hover:bg-transparent justify-start p-0 ml-auto"
              >
                <ChevronsUpDown className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                className="w-fit h-fit hover:bg-transparent justify-start p-0"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <span className="text-left truncate text-xs font-medium text-muted-foreground tracking-wide capitalize">
                {section.placeholder}
              </span>
            </>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 mt-2 bg-background border border-primary/10 shadow-lg rounded-md p-1 space-y-1">
        {section.items?.map((item) => {
          if (isSidebarUserItem(item)) {
            return (
              <DropdownMenuItem
                key={item.id}
                onSelect={item.onClick}
                className={cn(
                  "flex items-center gap-2 px-2 py-2 rounded hover:bg-primary/10 transition cursor-pointer",
                  item.id === section.activeItem?.id &&
                    "bg-primary/10 text-primary"
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={item.logo} />
                  <AvatarFallback>{item.title?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="truncate line-clamp-1">{item.title}</span>
                  <span className="truncate line-clamp-1 text-xs font-semibold text-muted-foreground tracking-wide">
                    {item.description}
                  </span>
                </div>
                {item.id === section.activeItem?.id && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            );
          } else {
            return (
              <DropdownMenuItem
                className={cn(
                  "p-0",
                  item.variant === "destructive" &&
                    "text-destructive hover:text-destructive-foreground hover:bg-destructive/20 focus:text-destructive-foreground focus:bg-destructive/20 data-[highlighted]:text-destructive-foreground data-[highlighted]:bg-destructive/20"
                )}
                key={item.id}
                onSelect={item.onClick}
              >
                <SidebarNavItem item={item} />
              </DropdownMenuItem>
            );
          }
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DropdownSection;
