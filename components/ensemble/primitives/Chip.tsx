"use client";

import React from "react";

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Chip({ active = false, onClick, children, className = "" }: ChipProps) {
  return (
    <span
      className={`ens-chip ${active ? "active" : ""} ${className} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {children}
    </span>
  );
}
