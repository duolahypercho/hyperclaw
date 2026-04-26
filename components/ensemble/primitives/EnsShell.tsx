"use client";

import React from "react";

interface EnsShellProps {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}

/**
 * Top-level wrapper that applies the Ensemble design tokens. Wrap any page
 * or view in this to get paper/ink colors, Inter typography, and shared
 * CSS variables.
 */
export function EnsShell({ children, className = "", padded = true }: EnsShellProps) {
  return (
    <div className={`ensemble-root h-full overflow-auto ${padded ? "px-8 py-8" : ""} ${className}`}>
      {children}
    </div>
  );
}
