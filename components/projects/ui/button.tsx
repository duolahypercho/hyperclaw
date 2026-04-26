"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)]",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--line)] bg-[var(--paper-2)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
        accent:
          "bg-[var(--accent)] text-[var(--paper)] border border-[var(--accent)] hover:brightness-110",
        primary:
          "bg-[var(--ink)] text-[var(--paper)] border border-[var(--ink)] hover:bg-[var(--ink-2)]",
        ghost:
          "border border-transparent bg-transparent text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
        outline:
          "border border-[var(--line-strong)] bg-transparent text-[var(--ink)] hover:bg-[var(--paper-3)]",
        danger:
          "border border-[var(--line)] bg-[var(--paper-2)] text-[var(--ink-2)] hover:bg-[var(--ink)] hover:text-[var(--paper)]",
      },
      size: {
        default: "h-7 px-3 py-1",
        sm: "h-6 px-2 text-[11px]",
        lg: "h-9 px-4 text-[13px]",
        icon: "h-7 w-7 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
