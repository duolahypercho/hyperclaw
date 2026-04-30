"use client";
import { useState, useEffect } from "react";
import { Minus, X, Maximize2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type Platform = "darwin" | "win32" | "linux";

// ── macOS Traffic Lights ─────────────────────────────────────────────────────

const MacControls = ({ isMaximized }: { isMaximized: boolean }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-[7px] px-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {/* Close */}
      <button
        onClick={() => window.electronAPI?.closeWindow()}
        className="w-3 h-3 rounded-full flex items-center justify-center transition-all focus:outline-none"
        style={{ backgroundColor: "#FF5F57" }}
        aria-label="Close"
      >
        {hovered && <X className="w-2 h-2 text-[#820005] stroke-[2.5]" />}
      </button>

      {/* Minimize */}
      <button
        onClick={() => window.electronAPI?.minimizeWindow()}
        className="w-3 h-3 rounded-full flex items-center justify-center transition-all focus:outline-none"
        style={{ backgroundColor: "#FEBC2E" }}
        aria-label="Minimize"
      >
        {hovered && <Minus className="w-2 h-2 text-[#985700] stroke-[2.5]" />}
      </button>

      {/* Maximize / Restore */}
      <button
        onClick={() => window.electronAPI?.maximizeWindow()}
        className="w-3 h-3 rounded-full flex items-center justify-center transition-all focus:outline-none"
        style={{ backgroundColor: "#28C840" }}
        aria-label={isMaximized ? "Restore" : "Maximize"}
      >
        {hovered && (
          isMaximized
            ? <Maximize2 className="w-2 h-2 text-[#006400] stroke-[2.5]" />
            : <Maximize2 className="w-2 h-2 text-[#006400] stroke-[2.5]" />
        )}
      </button>
    </div>
  );
};

// ── Windows / Linux Controls ─────────────────────────────────────────────────

const WinControls = ({ isMaximized, platform }: { isMaximized: boolean; platform: Platform }) => {
  return (
    <div
      className="flex items-center h-full"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        onClick={() => window.electronAPI?.minimizeWindow()}
        className="h-full w-11 flex items-center justify-center text-foreground/70 hover:bg-muted/60 hover:text-foreground transition-colors focus:outline-none"
        aria-label="Minimize"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => window.electronAPI?.maximizeWindow()}
        className="h-full w-11 flex items-center justify-center text-foreground/70 hover:bg-muted/60 hover:text-foreground transition-colors focus:outline-none"
        aria-label={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized
          ? <Maximize2 className="w-3 h-3" />
          : <Square className="w-3 h-3" />
        }
      </button>

      <button
        onClick={() => window.electronAPI?.closeWindow()}
        className="h-full w-11 flex items-center justify-center text-foreground/70 hover:bg-destructive hover:text-white transition-colors focus:outline-none"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ── Main Export ──────────────────────────────────────────────────────────────

const WindowControls = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const isElectron = typeof window !== "undefined" && window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;

    // Detect platform
    const p = window.electronAPI?.getPlatform?.();
    if (p) setPlatform(p as Platform);

    // Track maximized state
    window.electronAPI?.isMaximized().then(setIsMaximized);
    const onResize = () => window.electronAPI?.isMaximized().then(setIsMaximized);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isElectron]);

  if (!isElectron || !platform) return null;

  if (platform === "darwin") return <MacControls isMaximized={isMaximized} />;
  return <WinControls isMaximized={isMaximized} platform={platform} />;
};

export default WindowControls;
