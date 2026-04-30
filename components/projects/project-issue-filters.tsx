"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ProjectIssueFiltersValue {
  query: string;
  assignee: string;
  priority: string;
  label: string;
}

interface ProjectIssueFiltersProps {
  value: ProjectIssueFiltersValue;
  onChange: (next: ProjectIssueFiltersValue) => void;
  /** Distinct assignees discovered in the project's issues. */
  assignees: string[];
  /** Distinct labels discovered in the project's issues. */
  labels: string[];
  /** Number of issues currently shown after filtering. */
  shownCount: number;
  /** Total issues in the project (pre-filter). */
  totalCount: number;
  className?: string;
}

const PRIORITY_OPTIONS = ["Any", "P0", "P1", "P2", "P3"];

/**
 * The flat filter bar from the reference design — a single row with a
 * search field on the left, a few "Any"-style dropdowns next to it, and a
 * compact "x of y" counter on the right. Intentionally light on chrome
 * (no rounded pills, no chips) so the editorial feel of the rest of the
 * page carries through.
 */
export function ProjectIssueFilters({
  value,
  onChange,
  assignees,
  labels,
  shownCount,
  totalCount,
  className,
}: ProjectIssueFiltersProps) {
  const update = React.useCallback(
    (patch: Partial<ProjectIssueFiltersValue>) =>
      onChange({ ...value, ...patch }),
    [onChange, value]
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t-0 border-b-0 border-l-0 border-r-0 border-solid border-border/70 px-1 py-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value.query}
          onChange={(event) => update({ query: event.target.value })}
          placeholder="Filter issues..."
          className="h-8 w-[260px] border-border/70 bg-card/60 text-[12.5px]"
        />
        <FilterDropdown
          label="Assignee"
          value={value.assignee}
          options={["Any", ...assignees]}
          onChange={(next) => update({ assignee: next })}
        />
        <FilterDropdown
          label="Priority"
          value={value.priority}
          options={PRIORITY_OPTIONS}
          onChange={(next) => update({ priority: next })}
        />
        <FilterDropdown
          label="Label"
          value={value.label}
          options={["Any", ...labels]}
          onChange={(next) => update({ label: next })}
        />
      </div>

      <div
        className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70"
        style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
      >
        {shownCount} of {totalCount}
      </div>
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md border border-solid border-border/70",
            "bg-background px-2.5 text-[12px] text-muted-foreground transition-colors",
            "hover:border-foreground/30 hover:text-foreground",
            value !== "Any" && "border-foreground/40 text-foreground"
          )}
        >
          <span
            className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
            style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {label}
          </span>
          <span className="font-medium">{value}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              className="cursor-pointer"
            >
              <span className="flex w-full items-center justify-between gap-2 pl-2">
                <span className="text-[12.5px]">{option}</span>
                {option === value ? <Check className="h-3 w-3" /> : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
