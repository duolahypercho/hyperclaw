import { useCallback, useEffect, useRef, useState } from "react";
import { MdExpandMore } from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { X } from "lucide-react";
import { cn } from "../../utils";
export type SelectOption = {
  label: string;
  value: string | number;
};

type MultipleSelectProps = {
  multiple: true;
  value: SelectOption[];
  onChange: (value: SelectOption[]) => void;
};

type SingleSelectProps = {
  multiple?: false;
  value?: SelectOption;
  onChange: (value: SelectOption | undefined) => void;
};

type SelectProps = {
  options: SelectOption[];
  className?: string;
} & (SingleSelectProps | MultipleSelectProps);

export function Select({
  multiple,
  value,
  onChange,
  options,
  className,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const clearOptions = useCallback(() => {
    multiple ? onChange([]) : onChange(undefined);
  }, [multiple, onChange]);

  const selectOption = useCallback(
    (option: SelectOption) => {
      if (multiple) {
        if (value.includes(option)) {
          onChange(value.filter((o) => o !== option));
        } else {
          onChange([...value, option]);
        }
      } else {
        if (option !== value) onChange(option);
      }
    },
    [multiple, onChange, value]
  );

  const isOptionSelected = useCallback(
    (option: SelectOption) => {
      if (multiple) {
        // {label: "test", value: "test"}, need to compare the value of the object
        return value.some((v) => v.value === option.value);
      }
      return option === value;
    },
    [multiple, value]
  );

  useEffect(() => {
    if (isOpen) setHighlightedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target != node) return;
      switch (e.code) {
        case "Enter":
        case "Space":
          setIsOpen((prev) => !prev);
          if (isOpen) selectOption(options[highlightedIndex]);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          if (!isOpen) {
            setIsOpen(true);
            break;
          }

          const newValue = highlightedIndex + (e.code === "ArrowDown" ? 1 : -1);
          if (newValue >= 0 && newValue < options.length) {
            setHighlightedIndex(newValue);
          }
          break;
        }
        case "Escape":
          setIsOpen(false);
          break;
      }
    };
    node.addEventListener("keydown", handler);

    return () => {
      node.removeEventListener("keydown", handler);
    };
  }, [isOpen, highlightedIndex, options, selectOption]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <div
          ref={containerRef}
          tabIndex={0}
          className={cn(
            "relative flex min-h-12 border border-solid border-primary/10 bg-background px-3 py-2 font-medium ring-offset-ring-input-ring-focus placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 text-foreground items-center rounded-md cursor-pointer focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:outline-none text-xs",
            isOpen && "ring-primary/30 ring-offset-1 outline-none ring-1",
            className
          )}
        >
          <span className="flex flex-wrap flex-1 w-full gap-2">
            {multiple
              ? value.map((v) => (
                  <div
                    key={v.value}
                    className="flex items-center gap-2 border border-solid border-primary/10 bg-background px-2 py-1 rounded-md"
                    onClick={(e) => e.preventDefault()}
                  >
                    {v.label}
                    <button
                      onPointerDown={(e) => {
                        // Stop the event here so it never triggers the DropdownMenuTrigger
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectOption(v); // Remove the selected option
                      }}
                      className="hover:bg-accent/10 rounded-full p-0.5 text-xs"
                    >
                      <X className="hover:text-red-500 text-sm text-muted-foreground h-3 w-3" />
                    </button>
                  </div>
                ))
              : value?.label || "Select..."}
          </span>

          <div className="flex items-center gap-1">
            {(multiple ? value.length > 0 : value) && (
              <button
                onPointerDown={(e) => {
                  // Stop the event here so it never triggers the DropdownMenuTrigger
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearOptions();
                }}
                className="hover:bg-accent/10 rounded-full p-1"
              >
                <X className="text-muted-foreground hover:text-red-500 h-3 w-3" />
              </button>
            )}
            <MdExpandMore className="text-muted-foreground" />
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-full min-w-[200px] z-[1000]">
        {options.map((option, index) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              selectOption(option);
              setIsOpen(false);
            }}
            onMouseEnter={() => setHighlightedIndex(index)}
            className={`${
              isOptionSelected(option) && "bg-select-hover-background/80"
            }`}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
