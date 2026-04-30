"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectCardMenuProps {
  /** Friendly label used by screen readers ("Manage <project name>"). */
  projectName: string;
  /** Fired when the user picks "Edit project". Stop propagation is handled here. */
  onEdit?: () => void;
  /** Fired when the user picks "Remove project". */
  onRemove?: () => void;
  className?: string;
}

/**
 * ProjectCardMenu — the discreet "···" affordance in the top-right of a card.
 *
 * The trigger lives inside the larger clickable card surface, so we have to
 * stop pointer / click events from bubbling up to the parent stretched link.
 * Without this the dropdown would open *and* immediately navigate, which feels
 * broken. Radix's DropdownMenu portals its content to the document body, so
 * item clicks never re-enter the card's link area.
 *
 * Density: the surrounding card sits on ~12.5px body text and a 24px (h-6)
 * trigger button, so we deliberately override the chunkier shadcn defaults
 * (`min-w-[8rem] p-1` content + `px-3 py-2 text-xs` items) with tighter
 * padding, smaller item rows, and a narrower content box that feels
 * proportional to the trigger.
 */
export function ProjectCardMenu({
  projectName,
  onEdit,
  onRemove,
  className,
}: ProjectCardMenuProps) {
  // Centralised guard: the trigger and items live above a stretched link, so
  // every interaction must opt out of the link's default activation.
  const stopActivation = React.useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const stopPropagation = React.useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  if (!onEdit && !onRemove) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Manage ${projectName}`}
          onClick={stopActivation}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-muted transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        // `min-w-0` clears the shadcn 128px floor; explicit width keeps the
        // panel snug against the longest label ("Remove project").
        className="min-w-0 w-[148px] p-0.5"
        onClick={stopPropagation}
      >
        {onEdit && (
          <DropdownMenuItem
            onSelect={() => {
              onEdit();
            }}
            className="cursor-pointer text-[12px] px-2 py-1.5 gap-2"
          >
            <Pencil size={12} className="text-muted-foreground" />
            Edit project
          </DropdownMenuItem>
        )}
        {onEdit && onRemove && <DropdownMenuSeparator className="my-0.5" />}
        {onRemove && (
          <DropdownMenuItem
            onSelect={() => {
              onRemove();
            }}
            className="cursor-pointer text-[12px] px-2 py-1.5 gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 size={12} />
            Remove project
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
