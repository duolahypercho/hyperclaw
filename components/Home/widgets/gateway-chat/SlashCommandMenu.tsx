"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Square,
  Download,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlashCommand } from "./slashCommands";
import { SLASH_COMMANDS } from "./slashCommands";

/** Map icon name strings to actual Lucide components */
const ICON_MAP: Record<string, LucideIcon> = {
  Plus,
  Trash2,
  Square,
  Download,
  RefreshCw,
};

interface SlashCommandMenuProps {
  query: string;
  onSelect: (command: SlashCommand) => void;
  visible: boolean;
  onClose: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  query,
  onSelect,
  visible,
  onClose,
}) => {
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter commands by prefix match against the query
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(q));
  }, [query]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered.length, query]);

  // Keyboard navigation — attached to window so it works while textarea has focus
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev <= 0 ? filtered.length - 1 : prev - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSelect(filtered[highlightedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        // Tab also selects the highlighted item
        e.preventDefault();
        onSelect(filtered[highlightedIndex]);
      }
    },
    [visible, filtered, highlightedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (visible) {
      window.addEventListener("keydown", handleKeyDown, true);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [visible, handleKeyDown]);

  // Scroll the highlighted item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const items = menuRef.current.querySelectorAll("[data-slash-item]");
    const item = items[highlightedIndex];
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  return (
    <AnimatePresence>
      {visible && filtered.length > 0 && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full left-0 mb-2 w-64 max-h-56 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg z-50"
        >
          <div className="py-1">
            {filtered.map((cmd, index) => {
              const Icon = ICON_MAP[cmd.icon];
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={cmd.name}
                  data-slash-item
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                    isHighlighted
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground/80 hover:bg-primary/5"
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(e) => {
                    // Prevent textarea blur
                    e.preventDefault();
                    onSelect(cmd);
                  }}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        "w-4 h-4 flex-shrink-0",
                        isHighlighted
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-xs">{cmd.name}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {cmd.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SlashCommandMenu;
