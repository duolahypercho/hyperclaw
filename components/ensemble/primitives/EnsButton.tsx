"use client";

import React from "react";

type Variant = "default" | "accent" | "ghost" | "danger";

interface EnsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function EnsButton({ variant = "default", className = "", children, ...rest }: EnsButtonProps) {
  const variantClass =
    variant === "accent" ? "accent" :
    variant === "ghost" ? "ghost" :
    variant === "danger" ? "danger" : "";
  return (
    <button className={`ens-btn ${variantClass} ${className}`} {...rest}>
      {children}
    </button>
  );
}
