import { SidebarSection, SidebarItem } from "./SidebarSchema";
import { useState, useEffect, useMemo } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import SidebarNavItem from "./SidebarNavItem";
import { GripVertical, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RowOrderSectionProps {
  section: SidebarSection & { type: "rowOrder" | "rowOrder+collapsible" };
  isCollapsible?: boolean;
}

export const RowOrderSection: React.FC<RowOrderSectionProps> = ({
  section,
  isCollapsible = false,
}) => {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState(section.items);

  useEffect(() => {
    setItems(section.items);
  }, [section.items]);

  // Separate draggable and non-draggable items
  const draggableItems = useMemo(
    () => items.filter((item) => item.isDraggable !== false),
    [items]
  );
  const nonDraggableItems = useMemo(
    () => items.filter((item) => item.isDraggable === false),
    [items]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draggableItems.findIndex((item) => item.id === active.id);
    const newIndex = draggableItems.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newDraggableItems = arrayMove(draggableItems, oldIndex, newIndex);
    const newItems = [...newDraggableItems, ...nonDraggableItems];
    setItems(newItems);
    if (
      (section.type === "rowOrder" ||
        section.type === "rowOrder+collapsible") &&
      section.reorder
    )
      section.reorder(event);
  };

  const renderContent = () => (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={draggableItems.map((item) => item.id)}>
        <ul className="flex flex-col gap-1 overflow-x-hidden">
          {draggableItems.map((item, j) => (
            <SortableSidebarNavItem key={item.id} item={item} />
          ))}
          {nonDraggableItems.map((item, j) => (
            <SidebarNavItem key={item.id} item={item} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );

  return (
    <div className="overflow-x-hidden">
      {section.title && (
        <div
          className={cn(
            "flex items-center justify-between cursor-pointer select-none my-2 text-muted-foreground hover:text-foreground active:text-foreground/30 font-medium transition-all duration-200 text-xs ",
            isCollapsible && "cursor-pointer select-none"
          )}
          onClick={() => {
            if (isCollapsible) {
              setOpen((v) => !v);
            }
          }}
        >
          <div className="text-xs font-medium capitalize tracking-wide">
            {section.title}
          </div>
          {isCollapsible && (
            <ChevronRight
              className={cn(
                "ml-2 h-4 w-4 transition-transform",
                open ? "rotate-0" : "rotate-90"
              )}
            />
          )}
        </div>
      )}
      {(!isCollapsible || open) && renderContent()}
    </div>
  );
};

export const SortableSidebarNavItem: React.FC<{ item: SidebarItem }> = ({
  item,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center group overflow-x-hidden"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab opacity-0 group-hover:opacity-100 p-1 overflow-x-hidden"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </span>
      <SidebarNavItem item={item} />
    </div>
  );
};
