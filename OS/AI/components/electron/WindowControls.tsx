import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Square, X, Maximize2 } from "lucide-react";

// Window Controls Component (only shown in Electron)
const WindowControls = () => {
    const [isMaximized, setIsMaximized] = useState(false);
    const isElectron = typeof window !== "undefined" && window.electronAPI;
  
    useEffect(() => {
      if (!isElectron) return;
  
      // Check initial maximized state
      window.electronAPI?.isMaximized().then(setIsMaximized);
  
      // Listen for window state changes
      const checkMaximized = () => {
        window.electronAPI?.isMaximized().then(setIsMaximized);
      };
  
      // Check periodically (Electron doesn't have a direct event for this)
      const interval = setInterval(checkMaximized, 100);
  
      return () => clearInterval(interval);
    }, [isElectron]);
  
    if (!isElectron) return null;
  
    const handleMinimize = () => {
      window.electronAPI?.minimizeWindow();
    };
  
    const handleMaximize = () => {
      window.electronAPI?.maximizeWindow();
      // Update state after a short delay
      setTimeout(() => {
        window.electronAPI?.isMaximized().then(setIsMaximized);
      }, 100);
    };
  
    const handleClose = () => {
      window.electronAPI?.closeWindow();
    };
  
    return (
      <div className="flex items-center h-full gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMinimize}
          className="h-8 w-8 p-0 rounded-md hover:bg-muted/60 transition-colors"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMaximize}
          className="h-8 w-8 p-0 rounded-md hover:bg-muted/60 transition-colors"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Maximize2 className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-8 w-8 p-0 rounded-md hover:bg-destructive/60 hover:text-destructive-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  };

export default WindowControls;