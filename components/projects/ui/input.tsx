"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2",
      "text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-4)]",
      "transition-colors",
      "focus-visible:outline-none focus-visible:border-[var(--ink)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
