import { forwardRef, ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-normal ring-offset-background/10 transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 active:bg-primary/60 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_8px_-1px_rgba(0,0,0,0.12),0_3px_6px_-1px_rgba(0,0,0,0.08)] active:shadow-[0_2px_4px_-1px_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.04)] border border-solid border-primary/10",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/70 active:bg-destructive/80 border border-solid border-primary/10",
        outline:
          "border-[1px] border-solid bg-background hover:bg-primary/5 active:bg-primary/10 text-muted-foreground rounded-lg bg-transparent border-primary/20 hover:border-primary/30",
        secondary:
          "bg-secondary/30 text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/90 border border-solid border-primary/10",
        ghost:
          "hover:text-foreground active:text-foreground/70 text-muted-foreground transition-all duration-300 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-primary/5 active:bg-primary/10",
        link: "text-primary underline-offset-4 hover:underline",
        background:
          "bg-transparent text-muted-foreground hover:text-foreground/90 active:text-foreground/60 hover:bg-primary/5 active:bg-primary/10",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/70 active:bg-primary/30",
        accent:
          "bg-accent/80 text-accent-foreground hover:bg-accent/70 active:bg-accent/30",
        active:
          "bg-primary/30 text-primary-foreground hover:bg-primary/20 active:bg-primary/40",
        loading:
          "bg-primary text-primary-foreground hover:bg-primary/70 active:bg-primary/30",
        icon: "bg-transparent text-muted-foreground hover:text-foreground transition-colors active:scale-[0.99]",
        success:
          "bg-success text-success-foreground hover:bg-primary/70 active:bg-primary/30 shadow-[0_4px_6px_-1px_rgba(18,76,0,0.1)] hover:shadow-[0_6px_8px_-1px_rgba(18,76,0,0.15)] active:shadow-[0_2px_4px_-1px_rgba(18,76,0,0.1)] transition-all duration-200",
        input:
          "flex w-full rounded-md border border-solid border-primary/10 bg-secondary/30 px-3 py-2 text-sm font-normal ring-offset-ring-input-ring-focus placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1px] focus-visible:ring-primary/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 text-primary-foreground",
        selectItem:
          "relative flex w-full rounded-md select-none items-center py-2 pl-8 pr-2 text-sm outline-none text-foreground hover:bg-secondary/70 active:bg-secondary/30 active:scale-[0.99] transition-colors cursor-pointer data-[state=checked]:bg-primary/30",
      },

      size: {
        default: "h-10 px-4 py-2",
        xs: "h-8 px-2 py-1 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5",
        sm: "h-9 rounded-md px-3 text-sm [&_svg]:w-4 [&_svg]:h-4",
        lg: "h-11 rounded-md px-8",
        icon: "h-9 w-9",
        iconSm:
          "h-6 w-6 relative overflow-hidden transition-all !rounded-sm duration-300",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText = "Loading...",
      type = "button",
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          loading && "animate-pulse pointer-events-none"
        )}
        type={type}
        ref={ref}
        {...props}
      >
        {loading ? (
          <div className="flex gap-2 items-center">
            <svg
              className="animate-spin h-5 w-5 text-current"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                fill="currentColor"
              />
            </svg>
            {loadingText}
          </div>
        ) : (
          props.children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
