import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, AlignJustify } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "$/utils";

interface ZSidebarDropdownProps {
  items: {
    itemChild: {
      children: React.ReactNode;
      className?: string;
      subItems?: {
        children: React.ReactNode;
        className?: string;
        onClick?: () => void;
      }[];
    };
    onClick?: () => void;
  }[];
  classNames?: {
    button?: string;
    content?: string;
    subContent?: string;
  };
  title?: string;
  type?: "EllipsisVertical" | "AlignJustify";
  align?: "start" | "end";
  showDialog?: boolean;
  setShowDialog?: (showDialog: boolean) => void;
}

const Icon = ({ type }: { type: "EllipsisVertical" | "AlignJustify" }) => {
  if (type === "EllipsisVertical")
    return <EllipsisVertical className="w-4 h-4" />;
  if (type === "AlignJustify") return <AlignJustify className="w-4 h-4" />;
  return null;
};

const ZSidebarDropdown: React.FC<ZSidebarDropdownProps> = ({
  type = "EllipsisVertical",
  items,
  classNames,
  title,
  align = "end",
  showDialog,
  setShowDialog,
}) => {
  return (
    <DropdownMenu open={showDialog} onOpenChange={setShowDialog}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("w-fit h-fit p-1 rounded-sm", classNames?.button)}
        >
          <Icon type={type} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className={cn("bg-background flex flex-col gap-1", classNames?.content)}
      >
        {title && (
          <DropdownMenuLabel className="text-sm font-medium text-foreground py-1 ">
            {title}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {item.itemChild.subItems ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  className={cn(item.itemChild.className)}
                >
                  {item.itemChild.children}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    className={cn(
                      "flex flex-col gap-1",
                      classNames?.subContent
                    )}
                  >
                    {item.itemChild.subItems.map((subItem, subIndex) => (
                      <DropdownMenuItem
                        key={subIndex}
                        className={cn(subItem.className)}
                        onClick={subItem.onClick}
                      >
                        {subItem.children}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem
                onClick={(e) => {
                  window.setTimeout(() => {
                    item.onClick?.();
                  }, 0);
                }}
                className={cn(item.itemChild.className)}
              >
                {item.itemChild.children}
              </DropdownMenuItem>
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ZSidebarDropdown;
