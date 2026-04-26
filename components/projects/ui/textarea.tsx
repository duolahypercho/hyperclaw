"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2",
      "text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-4)]",
      "transition-colors resize-y",
      "focus-visible:outline-none focus-visible:border-[var(--ink)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
