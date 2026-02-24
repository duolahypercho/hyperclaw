import { forwardRef, TextareaHTMLAttributes } from "react";

import { cn } from "$/utils";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-solid border-primary/10 bg-transparent px-3 py-2 text-sm font-medium ring-offset-ring-input-ring-focus placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1px] focus-visible:ring-primary/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 text-foreground shadow-none",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
