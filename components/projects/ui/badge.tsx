"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "border-[var(--line)] bg-[var(--paper-2)] text-[var(--ink-2)]",
        live: "border-[var(--ok)]/40 bg-[var(--ok-wash)] text-[var(--ok)]",
        paused:
          "border-[var(--warn)]/40 bg-[var(--warn-wash)] text-[var(--warn)]",
        needs:
          "border-[var(--accent)]/50 bg-[var(--accent-wash)] text-[var(--ink)]",
        idle: "border-[var(--line)] bg-[var(--paper-3)] text-[var(--ink-3)]",
        outline: "border-[var(--line)] bg-transparent text-[var(--ink-2)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
