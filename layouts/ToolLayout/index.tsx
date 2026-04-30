"use client";

import React, { memo, useRef, useEffect, useCallback, useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolLayoutProps {
  children: React.ReactNode;
  showState: boolean;
  title: string;
  icon?: React.ReactNode;
  status?: React.ReactNode;
  uniqueKey: string;
  onClose?: () => void;
  closeDisabled?: boolean;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  zIndex?: number;
}

function loadLayout(key: string) {
  try {
    const raw = localStorage.getItem(`tool-layout-${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLayout(key: string, x: number, y: number, w: number, h: number) {
  try { localStorage.setItem(`tool-layout-${key}`, JSON.stringify({ x, y, w, h })); } catch {}
}

const ToolLayout = memo(({
  children, showState, title, icon, status, uniqueKey,
  onClose, closeDisabled,
  initialWidth = 520, initialHeight = 340,
  minWidth = 360, minHeight = 200,
  className, zIndex = 20,
}: ToolLayoutProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const size = useRef({ w: initialWidth, h: initialHeight });
  const drag = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const resize = useRef({ active: false, dir: "", sx: 0, sy: 0, ow: 0, oh: 0, ox: 0, oy: 0 });
  const rafId = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const preExpand = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const initDone = useRef(false);

  // Position-only update (compositing only, no layout reflow)
  const applyPos = useCallback(() => {
    const el = panelRef.current;
    if (el) el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  }, []);

  // Size update (triggers layout — only call when size actually changes)
  const applySize = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.width = `${size.current.w}px`;
    el.style.height = `${size.current.h}px`;
  }, []);

  const applyAll = useCallback(() => { applyPos(); applySize(); }, [applyPos, applySize]);

  const save = useCallback(() => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveLayout(uniqueKey, pos.current.x, pos.current.y, size.current.w, size.current.h);
    }, 500);
  }, [uniqueKey]);

  // Init position
  useEffect(() => {
    if (!showState) {
      setVisible(false);
      initDone.current = false;
      return;
    }
    if (initDone.current) return;
    initDone.current = true;
    const saved = loadLayout(uniqueKey);
    if (saved) {
      pos.current = { x: saved.x, y: saved.y };
      size.current = { w: saved.w || initialWidth, h: saved.h || initialHeight };
    } else {
      pos.current = {
        x: Math.max(40, (window.innerWidth - initialWidth) / 2),
        y: Math.max(40, (window.innerHeight - initialHeight) / 2),
      };
      size.current = { w: initialWidth, h: initialHeight };
    }
    applyAll();
    requestAnimationFrame(() => setVisible(true));
  }, [showState, uniqueKey, initialWidth, initialHeight, applyAll]);

  // Global mousemove/mouseup
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current.active) {
        e.preventDefault();
        pos.current = {
          x: drag.current.ox + (e.clientX - drag.current.sx),
          y: drag.current.oy + (e.clientY - drag.current.sy),
        };
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(applyPos);
        return;
      }
      const rs = resize.current;
      if (rs.active) {
        e.preventDefault();
        const dx = e.clientX - rs.sx;
        const dy = e.clientY - rs.sy;
        const d = rs.dir;
        let w = rs.ow, h = rs.oh, x = rs.ox, y = rs.oy;
        if (d.includes("e")) w = Math.max(minWidth, rs.ow + dx);
        if (d.includes("w")) { w = Math.max(minWidth, rs.ow - dx); x = rs.ox + (rs.ow - w); }
        if (d.includes("s")) h = Math.max(minHeight, rs.oh + dy);
        if (d.includes("n")) { h = Math.max(minHeight, rs.oh - dy); y = rs.oy + (rs.oh - h); }
        size.current = { w, h };
        pos.current = { x, y };
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(applyAll);
      }
    };

    const onUp = () => {
      if (drag.current.active || resize.current.active) {
        drag.current.active = false;
        resize.current.active = false;
        save();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(rafId.current);
    };
  }, [applyPos, applyAll, save, minWidth, minHeight]);

  const onTitlebarMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (expanded) return;
    e.preventDefault();
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: pos.current.x, oy: pos.current.y };
  }, [expanded]);

  const onResizeMouseDown = useCallback((e: React.MouseEvent, dir: string) => {
    if (expanded) return;
    e.preventDefault();
    e.stopPropagation();
    resize.current = {
      active: true, dir,
      sx: e.clientX, sy: e.clientY,
      ow: size.current.w, oh: size.current.h,
      ox: pos.current.x, oy: pos.current.y,
    };
  }, [expanded]);

  const toggleExpand = useCallback(() => {
    if (expanded) {
      pos.current = { x: preExpand.current.x, y: preExpand.current.y };
      size.current = { w: preExpand.current.w, h: preExpand.current.h };
    } else {
      preExpand.current = { x: pos.current.x, y: pos.current.y, w: size.current.w, h: size.current.h };
      pos.current = { x: 0, y: 0 };
      size.current = { w: window.innerWidth, h: window.innerHeight };
    }
    setExpanded((v) => !v);
    applyAll();
    save();
  }, [expanded, applyAll, save]);

  if (!showState) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed top-0 left-0 select-none",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ zIndex, willChange: "transform", contain: "layout style paint" }}
    >
      <div className={cn(
        "relative w-full h-full rounded-lg border border-border/60 shadow-xl overflow-hidden bg-background flex flex-col",
        className,
      )}>
        {/* macOS-style titlebar */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30 shrink-0 cursor-grab active:cursor-grabbing"
          onMouseDown={onTitlebarMouseDown}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onClose?.(); }}
              disabled={closeDisabled}
              className="group w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors disabled:bg-muted-foreground/20 flex items-center justify-center"
              title="Close"
            >
              <X className="w-2 h-2 text-[#4d0000] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
              className="group w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 transition-colors flex items-center justify-center"
              title={expanded ? "Restore" : "Expand"}
            >
              {expanded ? (
                <Minimize2 className="w-2 h-2 text-[#003300] opacity-0 group-hover:opacity-100 transition-opacity" />
              ) : (
                <Maximize2 className="w-2 h-2 text-[#003300] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-none">
            {icon && <span className="shrink-0 text-primary">{icon}</span>}
            <span className="text-xs font-medium text-foreground truncate">{title}</span>
            {status}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>

      {!expanded && (
        <>
          {[
            { dir: "n",  cursor: "n-resize",  cls: "top-0 left-3 right-3 h-1.5" },
            { dir: "s",  cursor: "s-resize",  cls: "bottom-0 left-3 right-3 h-1.5" },
            { dir: "w",  cursor: "w-resize",  cls: "left-0 top-3 bottom-3 w-1.5" },
            { dir: "e",  cursor: "e-resize",  cls: "right-0 top-3 bottom-3 w-1.5" },
            { dir: "nw", cursor: "nw-resize", cls: "top-0 left-0 w-3 h-3" },
            { dir: "ne", cursor: "ne-resize", cls: "top-0 right-0 w-3 h-3" },
            { dir: "sw", cursor: "sw-resize", cls: "bottom-0 left-0 w-3 h-3" },
            { dir: "se", cursor: "se-resize", cls: "bottom-0 right-0 w-3 h-3" },
          ].map(({ dir, cursor, cls }) => (
            <div
              key={dir}
              className={cn("absolute z-50", cls)}
              style={{ cursor }}
              onMouseDown={(e) => onResizeMouseDown(e, dir)}
            />
          ))}
        </>
      )}
    </div>
  );
});

ToolLayout.displayName = "ToolLayout";

export default ToolLayout;
