"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useOS } from "@OS/Provider/OSProv";
import WindowControls from "./WindowControls";

type Platform = "darwin" | "win32" | "linux";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/Settings": "Settings",
  "/pixel-office": "AI Agent Office",
  "/skill/connect": "Connect",
  "/skill/download": "Download",
};

function useTitle() {
  const { pathname } = useRouter();
  const { activeTool } = useOS();
  return activeTool?.name ?? ROUTE_TITLES[pathname] ?? "Hyperclaw";
}

const TitleBar = () => {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const isElectron = typeof window !== "undefined" && window.electronAPI;
  const title = useTitle();

  useEffect(() => {
    if (!isElectron) return;
    const p = window.electronAPI?.getPlatform?.();
    if (p) setPlatform(p as Platform);
  }, [isElectron]);

  // Listen for context subtitles from any section (e.g. selected agent name)
  useEffect(() => {
    const handler = (e: CustomEvent<{ subtitle: string | null }>) => {
      setSubtitle(e.detail.subtitle || null);
    };
    window.addEventListener("titlebar-context", handler as EventListener);
    return () => window.removeEventListener("titlebar-context", handler as EventListener);
  }, []);

  // Clear subtitle on route change
  const { pathname } = useRouter();
  useEffect(() => { setSubtitle(null); }, [pathname]);

  if (!isElectron) return null;

  const isMac = platform === "darwin";

  const titleNode = (
    <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide truncate max-w-xs">
      <span className="text-muted-foreground">{title}</span>
      {subtitle && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-foreground/70">{subtitle}</span>
        </>
      )}
    </span>
  );

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[60] flex items-center bg-secondary border-b border-border/50 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* macOS: traffic lights on the left */}
      {isMac && <WindowControls />}

      {/* Title: centered in whatever space remains between the controls */}
      <div className="flex-1 flex items-center justify-center pointer-events-none min-w-0">
        {titleNode}
      </div>

      {/* Windows/Linux: controls on the right */}
      {!isMac && <WindowControls />}
    </div>
  );
};

export default TitleBar;
