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
          "border-border bg-secondary text-secondary-foreground",
        live:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        paused:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        needs:
          "border-accent/50 bg-accent/10 text-foreground",
        idle: "border-border bg-muted text-muted-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
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
