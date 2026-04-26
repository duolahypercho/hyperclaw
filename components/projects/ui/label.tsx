"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    style={{ fontFamily: "var(--mono)" }}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;
