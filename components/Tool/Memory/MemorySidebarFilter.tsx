"use client";

import React, { useMemo } from "react";
import { Filter, Search, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemoryTool } from "./provider/memoryProvider";

const ALL_TAGS_VALUE = "__all__";

export function MemorySidebarFilter() {
  const { files, searchTerm, setSearchTerm, tagFilter, setTagFilter } = useMemoryTool();

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const f of files) {
      const t = f.sourceTag?.trim();
      if (t) tags.add(t);
    }
    return Array.from(tags).sort();
  }, [files]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Filter className="h-3.5 w-3.5" />
        Filter
      </div>
      <div className="space-y-2">
        <label className="sr-only">Search memory</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name or content…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tag className="h-3 w-3" />
            Agent / source
          </label>
          <Select
            value={tagFilter || ALL_TAGS_VALUE}
            onValueChange={(v) => setTagFilter(v === ALL_TAGS_VALUE ? "" : v)}
          >
            <SelectTrigger className="h-9 text-xs w-full">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TAGS_VALUE} className="text-xs">
                All agents
              </SelectItem>
              {tagOptions.map((tag) => (
                <SelectItem key={tag} value={tag} className="text-xs">
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
