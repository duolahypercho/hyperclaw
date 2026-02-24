import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { ChevronDownIcon } from "lucide-react";

interface MutiSelectProps {
  onValueChange: (value: string[]) => void;
  value: string[];
  placeholder?: string;
  selectedValue?: { key: string; value: string }[];
  maxSelect?: number;
}

const MutiSelect = (props: MutiSelectProps) => {
  const {
    onValueChange,
    value,
    placeholder: defaultPlaceholder,
    selectedValue: defaultSelectedValue,
    maxSelect,
  } = props;
  const [selectedKeys, setSelectedKeys] = useState(new Set(value));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedValue = useMemo(() => {
    return Array.from(selectedKeys).join(", ").replaceAll("_", " ");
  }, [selectedKeys]);
  useEffect(() => {
    onValueChange(Array.from(selectedKeys));
  }, [selectedKeys]);
  const placeholder = defaultPlaceholder || "Select items";
  const arrayText = defaultSelectedValue || [
    {
      key: "text",
      value: "Text",
    },
    {
      key: "number",
      value: "Number",
    },
    {
      key: "date",
      value: "Date",
    },
    {
      key: "single_date",
      value: "Single Date",
    },
    {
      key: "iteration",
      value: "Iteration",
    },
  ];
  return (
    <Dropdown
      classNames={{
        base: "bg-input-background rounded-md max-h-[300px] overflow-y-auto customScrollbar",
        content: "p-0 bg-input-background",
      }}
    >
      <DropdownTrigger className="bg-input-background w-full border-2 border-solid border-input-border hover:border-input-hover text-primary-foreground rounded-md justify-between">
        <Button variant="bordered" ref={triggerRef}>
          {selectedValue || (
            <span className="text-muted-foreground text-sm font-medium">
              {placeholder}
            </span>
          )}
          <ChevronDownIcon className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Multiple selection"
        closeOnSelect={false}
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        variant={"bordered"}
        disabledKeys={
          maxSelect && selectedKeys.size >= maxSelect
            ? // Disable all unselected keys when max selection is reached
              new Set(
                arrayText
                  .map((item) => item.key)
                  .filter((key) => !selectedKeys.has(key))
              )
            : // No keys are disabled if max selection hasn't been reached
              new Set()
        }
        onSelectionChange={(keys) => setSelectedKeys(keys as Set<string>)}
        classNames={{
          base: "rounded-md text-select-font font-medium bg-select-background shadow-sm",
        }}
        itemClasses={{
          base: "py-1.5 pl-8 pr-2 hover:bg-select-hover-background cursor-pointer hover:text-white",
        }}
      >
        {arrayText.map((item) => (
          <DropdownItem
            classNames={{
              title: "hover:bg-select-hover-background hover:text-white",
            }}
            key={item.key}
          >
            {item.value}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
};
export default MutiSelect;
/*
text-select-font relative flex w-full select-none items-center rounded py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-select-hover-background cursor-pointer hover:text-white aria-selected:text-select-active-font aria-selected:bg-select-active-background rounded-md*/
