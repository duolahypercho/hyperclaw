import React from "react";
import { cn } from "$/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";

const inputVariants = cva(
  "flex h-10 w-full rounded-md border-[1px] border-solid border-primary/10 bg-transparent text-foreground px-3 py-2 text-sm font-medium ring-offset-ring-input-ring-focus file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1px] focus-visible:ring-offset-ring-input-ring-focus focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm",
  {
    variants: {
      variant: {
        default: "bg-transparent text-foreground",
        secondary: "bg-transparent text-secondary-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
        hypercho:
          "bg-transparent border border-solid border-primary/10 hover:border-primary/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

const InputBox = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, type, maxLength, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    if (type === "password") {
      return (
        <div className="relative flex items-center">
          <input
            autoComplete="off"
            type={showPassword ? "text" : "password"}
            className={cn(inputVariants({ variant }), className)}
            ref={ref}
            {...props} // Spread the rest of the props
          />
          <button
            type="button"
            className="absolute right-[0.5rem] top-1/2 text-white translate-y-[-50%] cursor-pointer"
            onClick={() => {
              setShowPassword(!showPassword);
            }}
          >
            {!showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      );
    }

    if (maxLength) {
      return (
        <div className="flex flex-col justify-end items-end w-full">
          <input
            autoComplete="off"
            type={type}
            maxLength={maxLength}
            className={cn(inputVariants({ variant }), className)}
            ref={ref}
            {...props} // Spread the rest of the props
          />
          <span
            className={cn(
              "text-xs mt-1",
              (props.value?.toString().length || 0) >= maxLength
                ? "text-red-500"
                : "text-muted-foreground"
            )}
          >
            {props.value?.toString().length || 0}/{maxLength}
          </span>
        </div>
      );
    }

    return (
      <input
        autoComplete="off"
        type={type}
        className={cn(inputVariants({ variant }), className)}
        ref={ref}
        {...props} // Spread the rest of the props
      />
    );
  }
);

InputBox.displayName = "InputBox";

export default InputBox;
