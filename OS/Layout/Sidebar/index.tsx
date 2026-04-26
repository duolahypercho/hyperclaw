// layouts/ToolLayout/SchemaSidebar.tsx
import React from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SidebarSection, SidebarSchema } from "./SidebarSchema";
import { RowOrderSection } from "./RowOrderSection";
import CollapsibleSection from "./CollapsibleSection";
import SidebarNavItem from "./SidebarNavItem";
import DropdownSection from "./DropdownSection";
import { Button } from "@/components/ui/button";

const SidebarSectionView: React.FC<{
  section: SidebarSection;
  dndEnabled?: boolean;
}> = ({ section, dndEnabled = false }) => {
  if (section.type === "rowOrder" || section.type === "rowOrder+collapsible") {
    return (
      <RowOrderSection
        section={
          section as SidebarSection & {
            type: "rowOrder" | "rowOrder+collapsible";
          }
        }
        isCollapsible={section.type === "rowOrder+collapsible"}
      />
    );
  }
  if (section.type === "collapsible") {
    return (
      <CollapsibleSection
        section={section as SidebarSection & { type: "collapsible" }}
        dndEnabled={dndEnabled}
      />
    );
  }

  if (section.type === "dropdownUser") {
    return (
      <DropdownSection
        section={section as SidebarSection & { type: "dropdownUser" }}
      />
    );
  }

  if (section.type === "custom") {
    return (
      <div className="shrink-0">
        {(section as SidebarSection & { type: "custom" }).content}
      </div>
    );
  }

  const items = section.items ?? [];
  return (
    <>
      {section.title && (
        <div className="flex items-center font-mono uppercase text-[9.5px] tracking-[0.08em] text-muted-foreground/80 px-2 pb-1 shrink-0">
          {section.title}
        </div>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((item, j) => (
            <SidebarNavItem key={item.id ?? j} item={item} dndEnabled={dndEnabled} />
          ))}
        </ul>
      )}
    </>
  );
};

const Sidebar: React.FC<{ schema: SidebarSchema }> = ({ schema }) => {
  const dndEnabled = !!schema.onDrop;
  const sections = schema.sections ?? [];
  const topCustom =
    sections[0]?.type === "custom"
      ? (sections[0] as SidebarSection & { type: "custom" })
      : null;
  const restSections = topCustom ? sections.slice(1) : sections;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && schema.onDrop) {
      schema.onDrop(String(active.id), String(over.id));
    }
  };

  const content = (
    <>
      {topCustom && (
        <div className="shrink-0 px-2.5 pt-3 pb-2 border-b border-border">
          {topCustom.content}
        </div>
      )}
      <div className="flex-1 overflow-y-auto customScrollbar2 px-2.5 py-3">
        <div className="flex flex-col gap-3.5">
          {restSections.map((section, i) => (
            <SidebarSectionView key={section.id ?? i} section={section} dndEnabled={dndEnabled} />
          ))}
        </div>
      </div>
      {schema.footer && (
        <div className="flex-none px-2.5 py-2.5 border-t border-border bg-muted/30">
          {schema.footer.map((section, i) => (
            <SidebarSectionView key={i} section={section} dndEnabled={dndEnabled} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <nav className="flex flex-col h-full w-64 border-r border-l-0 border-t-0 border-b-0 border-solid border-border bg-card">
      {dndEnabled ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {content}
        </DndContext>
      ) : (
        content
      )}
    </nav>
  );
};

export default Sidebar;
