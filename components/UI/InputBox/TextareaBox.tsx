import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-[1px] border-solid border-primary/10 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none ring-offset-ring-input-ring-focus focus-visible:ring-[1px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm shadow-sm text-foreground font-medium ring-offset-ring-input-ring-focus file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-offset-ring-input-ring-focus focus-visible:ring-offset-0",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
