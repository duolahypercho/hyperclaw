import { useState } from "react";
import { SidebarSection } from "./SidebarSchema";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import SidebarNavItem from "./SidebarNavItem";

const CollapsibleSection: React.FC<{
  section: SidebarSection & { type: "collapsible" };
  dndEnabled?: boolean;
}> = ({ section, dndEnabled = false }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg bg-muted/40 border border-solid border-transparent hover:border-primary/30 transition-colors duration-200">
      {section.title && (
        <button
          type="button"
          className="flex w-full items-center justify-between cursor-pointer select-none py-2.5 px-2.5 text-left rounded-t-lg hover:bg-primary/5 transition-colors duration-200 group"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80 group-hover:text-foreground">
            {section.title}
          </span>
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
              open ? "rotate-90" : "rotate-0"
            )}
          />
        </button>
      )}
      {open && (
        <div className="relative flex flex-col gap-0.5 pb-2 pt-0.5 px-2">
          <ul className="flex flex-col gap-0.5 pl-1">
            {section.items.map((item, j) => (
              <SidebarNavItem key={item.id ?? j} item={item} dndEnabled={dndEnabled} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
