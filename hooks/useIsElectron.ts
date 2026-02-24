import { useState, useEffect } from "react";

/**
 * Custom hook to detect if the app is running in Electron
 * @returns {boolean} true if running in Electron, false if in web browser
 */
export function useIsElectron(): boolean {
  // Initialize with synchronous check to avoid flash of wrong content
  const [isElectron, setIsElectron] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!window.electronAPI;
  });

  useEffect(() => {
    // Double-check on mount to ensure we have the latest value
    if (typeof window !== "undefined" && window.electronAPI) {
      setIsElectron(true);
    }
  }, []);

  return isElectron;
}

/**
 * Utility function to check if running in Electron (can be used outside React components)
 * @returns {boolean} true if running in Electron, false if in web browser
 */
export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.electronAPI;
}
