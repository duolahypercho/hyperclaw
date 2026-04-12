# Proactive Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the widget-grid dashboard with a ChatGPT 6.5-style proactive home featuring greeting, project cards, chat input with quick actions, task feed, and agenda sidebar.

**Architecture:** Single scrollable page with ProactiveHome as the new default view. Existing widget grid (Home.tsx) remains accessible via "View widgets" toggle. Data flows through existing providers (useProjects, bridgeInvoke for inbox/crons/logs).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion, existing Hyperclaw component patterns

---

## File Structure

```
components/Home/
├── ProactiveHome.tsx              # Main container with data fetching
├── ProactiveHomeHeader.tsx        # Greeting + stats + "See full plan"
├── ProactiveProjectsCarousel.tsx  # Horizontal project cards
├── ProactiveChatInput.tsx         # Chat input + quick action buttons
├── ProactiveTaskFeed.tsx          # Task feed container
├── proactive/                     # Subcomponents
│   ├── ApprovalCard.tsx           # Individual approval/question card
│   ├── BackgroundTaskCard.tsx     # Running workflow card
│   ├── UpcomingCard.tsx           # Scheduled cron/task card
│   ├── QuickWinsSection.tsx       # Completed actions list
│   └── types.ts                   # Shared types for proactive components
pages/
└── dashboard.tsx                  # Modified to toggle proactive/widgets view
```

---

## Task 1: Create Shared Types

**Files:**
- Create: `components/Home/proactive/types.ts`

- [ ] **Step 1: Create types file with shared interfaces**

```typescript
// components/Home/proactive/types.ts

export interface InboxItem {
  id: number;
  agent_id: string;
  kind: "approval" | "question" | "error" | "info";
  title: string;
  body?: string;
  status: "pending" | "approved" | "rejected" | "dismissed";
  created_at: number;
}

export interface CronJobParsed {
  id: string;
  name: string;
  schedule: string;
  scheduleType: "cron" | "every";
  nextRun: string;
  lastRun: string | null;
  status: "ok" | "error" | "idle";
  target: string;
  agent: string;
}

export interface LogEntry {
  time?: string | null;
  level?: string | null;
  subsystem?: string | null;
  message?: string | null;
}

export interface ProactiveSummary {
  tasksCompleted: number;
  projectsUpdated: number;
  decisionsNeeded: number;
}

export type ViewMode = "proactive" | "widgets";

export const STATUS_COLORS = {
  active: { label: "IN PROGRESS", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  completed: { label: "DONE", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  archived: { label: "ARCHIVED", color: "text-muted-foreground", bg: "bg-muted/50", border: "border-muted/30" },
} as const;

export type ProjectStatus = keyof typeof STATUS_COLORS;
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/types.ts
git commit -m "feat(proactive): add shared types for proactive dashboard"
```

---

## Task 2: Create ProactiveHomeHeader Component

**Files:**
- Create: `components/Home/ProactiveHomeHeader.tsx`

- [ ] **Step 1: Create header component with greeting and stats**

```typescript
// components/Home/ProactiveHomeHeader.tsx
"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProactiveSummary } from "./proactive/types";

interface ProactiveHomeHeaderProps {
  userName: string;
  summary: ProactiveSummary;
  onViewWidgets: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTagline(summary: ProactiveSummary): string {
  const { tasksCompleted, projectsUpdated, decisionsNeeded } = summary;
  if (tasksCompleted > 0 || projectsUpdated > 0) {
    return "I've got things moving.";
  }
  if (decisionsNeeded > 0) {
    return "A few things need your attention.";
  }
  return "Ready when you are.";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function ProactiveHomeHeader({
  userName,
  summary,
  onViewWidgets,
}: ProactiveHomeHeaderProps) {
  const greeting = getGreeting();
  const tagline = getTagline(summary);
  const firstName = userName.split(" ")[0] || "there";

  const statParts: string[] = [];
  if (summary.tasksCompleted > 0) {
    statParts.push(`${summary.tasksCompleted} task${summary.tasksCompleted !== 1 ? "s" : ""} completed`);
  }
  if (summary.projectsUpdated > 0) {
    statParts.push(`${summary.projectsUpdated} update${summary.projectsUpdated !== 1 ? "s" : ""}`);
  }
  if (summary.decisionsNeeded > 0) {
    statParts.push(`${summary.decisionsNeeded} decision${summary.decisionsNeeded !== 1 ? "s" : ""} needed`);
  }
  const statsLine = statParts.length > 0 ? statParts.join(" · ") : "All caught up";

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      <p className="text-sm text-muted-foreground mb-2">{formatDate()}</p>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
            {greeting}, {firstName}.
          </h1>
          <p className="text-xl md:text-2xl font-medium text-primary mt-1">
            {tagline}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{statsLine}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onViewWidgets}
          className="shrink-0 gap-1"
        >
          See full plan
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveHomeHeader.tsx
git commit -m "feat(proactive): add ProactiveHomeHeader with greeting and stats"
```

---

## Task 3: Create ProactiveProjectsCarousel Component

**Files:**
- Create: `components/Home/ProactiveProjectsCarousel.tsx`

- [ ] **Step 1: Create carousel component**

```typescript
// components/Home/ProactiveProjectsCarousel.tsx
"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjects, type Project } from "@/components/Tool/Projects/provider/projectsProvider";
import { dispatchOpenProjectPanel } from "./widgets/ProjectWidgetEvents";
import { STATUS_COLORS, type ProjectStatus } from "./proactive/types";

function ProjectCard({ project }: { project: Project }) {
  const status = (project.status || "active") as ProjectStatus;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.active;

  const handleClick = () => {
    dispatchOpenProjectPanel(project.id);
  };

  const lastActivity = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex-shrink-0 w-64 p-4 rounded-xl border bg-card text-left",
        "hover:bg-card/80 transition-colors cursor-pointer",
        colors.border
      )}
    >
      <div className={cn("inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide mb-2", colors.bg, colors.color)}>
        {colors.label}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{project.emoji || "📁"}</span>
        <h3 className="font-medium text-foreground truncate">{project.name}</h3>
      </div>
      {project.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {project.description}
        </p>
      )}
      {lastActivity && (
        <p className="text-[10px] text-muted-foreground">
          Updated {lastActivity}
        </p>
      )}
    </button>
  );
}

export function ProactiveProjectsCarousel() {
  const { projects, loading } = useProjects();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const sortedProjects = [...projects].sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );

  const updateScrollButtons = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    updateScrollButtons();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollButtons);
      return () => el.removeEventListener("scroll", updateScrollButtons);
    }
  }, [projects]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 280;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (loading) {
    return (
      <div className="w-full px-4 md:px-8 py-4">
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-64 h-32 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (sortedProjects.length === 0) {
    return null;
  }

  return (
    <div className="w-full px-4 md:px-8 py-4 relative group">
      {canScrollLeft && (
        <Button
          variant="outline"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {sortedProjects.map((project) => (
          <div key={project.id} className="snap-start">
            <ProjectCard project={project} />
          </div>
        ))}
      </div>

      {canScrollRight && (
        <Button
          variant="outline"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveProjectsCarousel.tsx
git commit -m "feat(proactive): add ProactiveProjectsCarousel with horizontal scroll"
```

---

## Task 4: Create ProactiveChatInput Component

**Files:**
- Create: `components/Home/ProactiveChatInput.tsx`

- [ ] **Step 1: Create chat input with quick action buttons**

```typescript
// components/Home/ProactiveChatInput.tsx
"use client";

import React, { useState, useRef, useCallback } from "react";
import { Calendar, Search, BarChart3, Sparkles, Zap, ChevronDown, ArrowUp, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prefill: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "schedule", label: "Schedule & Plan", icon: <Calendar className="w-4 h-4" />, prefill: "Help me schedule " },
  { id: "research", label: "Deep Research", icon: <Search className="w-4 h-4" />, prefill: "Research " },
  { id: "analyze", label: "Analyze Data", icon: <BarChart3 className="w-4 h-4" />, prefill: "Analyze " },
  { id: "create", label: "Create", icon: <Sparkles className="w-4 h-4" />, prefill: "Create " },
  { id: "automate", label: "Automate", icon: <Zap className="w-4 h-4" />, prefill: "Automate " },
];

const MORE_ACTIONS: QuickAction[] = [
  { id: "summarize", label: "Summarize", icon: null, prefill: "Summarize " },
  { id: "brainstorm", label: "Brainstorm", icon: null, prefill: "Brainstorm ideas for " },
  { id: "review", label: "Review", icon: null, prefill: "Review " },
  { id: "debug", label: "Debug", icon: null, prefill: "Debug " },
];

interface ProactiveChatInputProps {
  onSubmit: (message: string) => void;
}

export function ProactiveChatInput({ onSubmit }: ProactiveChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }, [value, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    setValue(action.prefill);
    inputRef.current?.focus();
  };

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="relative rounded-2xl border border-border bg-card/50 backdrop-blur-sm shadow-lg overflow-hidden">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything. Or tell me what you want done."
            rows={2}
            className={cn(
              "w-full px-4 py-4 pr-24 bg-transparent text-foreground placeholder:text-muted-foreground",
              "resize-none focus:outline-none text-base"
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              disabled
              title="Voice input (coming soon)"
            >
              <Mic className="w-5 h-5" />
            </Button>
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="rounded-full bg-primary hover:bg-primary/90"
            >
              <ArrowUp className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction(action)}
              className="gap-1.5 text-xs"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                More
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {MORE_ACTIONS.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveChatInput.tsx
git commit -m "feat(proactive): add ProactiveChatInput with quick action buttons"
```

---

## Task 5: Create ApprovalCard Component

**Files:**
- Create: `components/Home/proactive/ApprovalCard.tsx`

- [ ] **Step 1: Create approval card component**

```typescript
// components/Home/proactive/ApprovalCard.tsx
"use client";

import React from "react";
import { Zap, HelpCircle, AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InboxItem } from "./types";

const KIND_ICONS: Record<string, React.ReactNode> = {
  approval: <Zap className="w-4 h-4 text-amber-500" />,
  question: <HelpCircle className="w-4 h-4 text-blue-500" />,
  error: <AlertTriangle className="w-4 h-4 text-destructive" />,
  info: <Info className="w-4 h-4 text-muted-foreground" />,
};

const KIND_COLORS: Record<string, string> = {
  approval: "border-amber-500/30 bg-amber-500/5",
  question: "border-blue-500/30 bg-blue-500/5",
  error: "border-destructive/30 bg-destructive/5",
  info: "border-border bg-muted/20",
};

interface ApprovalCardProps {
  item: InboxItem;
  onApprove?: () => void;
  onReject?: () => void;
  onDismiss: () => void;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ApprovalCard({ item, onApprove, onReject, onDismiss }: ApprovalCardProps) {
  const isApproval = item.kind === "approval";
  const icon = KIND_ICONS[item.kind] || KIND_ICONS.info;
  const colorClass = KIND_COLORS[item.kind] || KIND_COLORS.info;

  return (
    <div className={cn("rounded-xl border p-4", colorClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                Needs your input
              </span>
              <span className="text-[10px] text-muted-foreground">
                {timeAgo(item.created_at)}
              </span>
            </div>
            <h4 className="font-medium text-foreground truncate">{item.title}</h4>
            {item.body && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {item.body}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 mt-3 ml-7">
        {isApproval && onApprove && (
          <Button size="sm" onClick={onApprove} className="h-7 text-xs">
            Approve
          </Button>
        )}
        {isApproval && onReject && (
          <Button size="sm" variant="outline" onClick={onReject} className="h-7 text-xs">
            Reject
          </Button>
        )}
        {!isApproval && (
          <Button size="sm" variant="outline" onClick={onDismiss} className="h-7 text-xs">
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/ApprovalCard.tsx
git commit -m "feat(proactive): add ApprovalCard for inbox items"
```

---

## Task 6: Create BackgroundTaskCard Component

**Files:**
- Create: `components/Home/proactive/BackgroundTaskCard.tsx`

- [ ] **Step 1: Create background task card component**

```typescript
// components/Home/proactive/BackgroundTaskCard.tsx
"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkflowRun, WorkflowTemplate } from "@/components/Tool/Projects/provider/projectsProvider";

interface BackgroundTaskCardProps {
  run: WorkflowRun;
  template?: WorkflowTemplate;
  onViewProgress?: () => void;
}

function calculateProgress(run: WorkflowRun, template?: WorkflowTemplate): number {
  if (!template?.steps || template.steps.length === 0) return 50;
  const currentIndex = template.steps.findIndex(s => s.id === run.currentGateStepId);
  if (currentIndex === -1) return 50;
  return Math.round((currentIndex / template.steps.length) * 100);
}

function formatNextUpdate(): string {
  const minutes = Math.floor(Math.random() * 30) + 5;
  const time = new Date(Date.now() + minutes * 60000);
  return time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function BackgroundTaskCard({ run, template, onViewProgress }: BackgroundTaskCardProps) {
  const progress = calculateProgress(run, template);
  const nextUpdate = formatNextUpdate();
  const name = template?.name || "Background task";

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-500 border border-blue-500/30">
            Running in background
          </span>
          <span className="text-[10px] text-muted-foreground">
            Next update {nextUpdate}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        <h4 className="font-medium text-foreground">{name}</h4>
      </div>

      {template?.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
          {template.description}
        </p>
      )}

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progress</span>
          <span>{progress}% complete</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {onViewProgress && (
        <Button size="sm" variant="outline" onClick={onViewProgress} className="h-7 text-xs">
          View progress
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/BackgroundTaskCard.tsx
git commit -m "feat(proactive): add BackgroundTaskCard with progress bar"
```

---

## Task 7: Create UpcomingCard Component

**Files:**
- Create: `components/Home/proactive/UpcomingCard.tsx`

- [ ] **Step 1: Create upcoming card component**

```typescript
// components/Home/proactive/UpcomingCard.tsx
"use client";

import React from "react";
import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CronJobParsed } from "./types";

interface UpcomingCardProps {
  cron: CronJobParsed;
}

function formatScheduledTime(nextRun: string): { relative: string; absolute: string } {
  const date = new Date(nextRun);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative: string;
  if (diffMins < 0) {
    relative = "Any moment";
  } else if (diffMins < 60) {
    relative = `In ${diffMins}m`;
  } else if (diffHours < 24) {
    relative = `In ${diffHours}h`;
  } else if (diffDays === 1) {
    relative = "Tomorrow";
  } else {
    relative = `In ${diffDays} days`;
  }

  const absolute = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return { relative, absolute };
}

export function UpcomingCard({ cron }: UpcomingCardProps) {
  const { relative, absolute } = formatScheduledTime(cron.nextRun);
  const isToday = new Date(cron.nextRun).toDateString() === new Date().toDateString();
  const isTomorrow = new Date(cron.nextRun).toDateString() === 
    new Date(Date.now() + 86400000).toDateString();

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
          Coming up
        </span>
        <span className="text-xs text-muted-foreground">
          {isToday ? `Today ${absolute}` : isTomorrow ? `Tomorrow ${absolute}` : relative}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h4 className="font-medium text-foreground">{cron.name}</h4>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>
          {cron.scheduleType === "cron" ? `Cron: ${cron.schedule}` : `Every ${cron.schedule}`}
        </span>
        {cron.agent && (
          <>
            <span>·</span>
            <span>Agent: {cron.agent}</span>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/UpcomingCard.tsx
git commit -m "feat(proactive): add UpcomingCard for scheduled tasks"
```

---

## Task 8: Create QuickWinsSection Component

**Files:**
- Create: `components/Home/proactive/QuickWinsSection.tsx`

- [ ] **Step 1: Create quick wins section component**

```typescript
// components/Home/proactive/QuickWinsSection.tsx
"use client";

import React from "react";
import { Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogEntry } from "./types";

interface QuickWinsSectionProps {
  logs: LogEntry[];
}

function isQuickWin(log: LogEntry): boolean {
  const msg = (log.message || "").toLowerCase();
  return (
    msg.includes("completed") ||
    msg.includes("success") ||
    msg.includes("done") ||
    msg.includes("fixed") ||
    msg.includes("updated") ||
    msg.includes("synced")
  );
}

function formatLogMessage(log: LogEntry): string {
  const msg = log.message || "";
  if (msg.length > 60) {
    return msg.substring(0, 57) + "...";
  }
  return msg;
}

export function QuickWinsSection({ logs }: QuickWinsSectionProps) {
  const quickWins = logs.filter(isQuickWin).slice(0, 5);

  if (quickWins.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-medium text-foreground">Quick wins</h3>
        <span className="text-xs text-muted-foreground">Handled for you</span>
      </div>

      <div className="space-y-2">
        {quickWins.map((log, i) => (
          <div key={i} className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {formatLogMessage(log)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/QuickWinsSection.tsx
git commit -m "feat(proactive): add QuickWinsSection for completed actions"
```

---

## Task 9: Create ProactiveTaskFeed Component

**Files:**
- Create: `components/Home/ProactiveTaskFeed.tsx`

- [ ] **Step 1: Create task feed container component**

```typescript
// components/Home/ProactiveTaskFeed.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { bridgeInvoke } from "@/lib/hyperclaw-bridge-client";
import { useProjects } from "@/components/Tool/Projects/provider/projectsProvider";
import { ApprovalCard } from "./proactive/ApprovalCard";
import { BackgroundTaskCard } from "./proactive/BackgroundTaskCard";
import { UpcomingCard } from "./proactive/UpcomingCard";
import { parseCronJobs } from "@/components/Tool/Crons/utils";
import type { InboxItem, CronJobParsed } from "./proactive/types";

export function ProactiveTaskFeed() {
  const { projects } = useProjects();
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [crons, setCrons] = useState<CronJobParsed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch inbox items
        const inboxRes = await bridgeInvoke("inbox-list", { status: "pending", limit: 10 });
        const items = (inboxRes as { items?: InboxItem[] })?.items || [];
        setInboxItems(items);

        // Fetch crons
        const cronsRes = await bridgeInvoke("get-crons", {});
        const cronsText = typeof cronsRes === "string" ? cronsRes : (cronsRes as { data?: string })?.data || "";
        const parsed = parseCronJobs(cronsText);
        setCrons(parsed);
      } catch (err) {
        console.error("Failed to fetch task feed data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleResolveInbox = useCallback(async (id: number, resolution: "approved" | "rejected" | "dismissed") => {
    try {
      await bridgeInvoke("inbox-resolve", { id, resolution });
      setInboxItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("Failed to resolve inbox item:", err);
    }
  }, []);

  // Get running workflow runs from projects
  const runningWorkflows = projects.flatMap((p) =>
    (p.workflowRuns || [])
      .filter((r) => r.status === "running")
      .map((r) => ({
        run: r,
        template: p.workflowTemplates?.find((t) => t.id === r.templateId),
      }))
  );

  // Filter upcoming crons (next run in future)
  const upcomingCrons = crons
    .filter((c) => {
      const nextRun = new Date(c.nextRun);
      return nextRun > new Date();
    })
    .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())
    .slice(0, 3);

  // Filter approval-type inbox items
  const approvalItems = inboxItems.filter(
    (item) => item.kind === "approval" || item.kind === "question"
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const hasContent = approvalItems.length > 0 || runningWorkflows.length > 0 || upcomingCrons.length > 0;

  if (!hasContent) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">All caught up! No tasks need your attention.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Needs Your Input */}
      {approvalItems.map((item) => (
        <ApprovalCard
          key={item.id}
          item={item}
          onApprove={() => handleResolveInbox(item.id, "approved")}
          onReject={() => handleResolveInbox(item.id, "rejected")}
          onDismiss={() => handleResolveInbox(item.id, "dismissed")}
        />
      ))}

      {/* Running in Background */}
      {runningWorkflows.map(({ run, template }) => (
        <BackgroundTaskCard
          key={run.id}
          run={run}
          template={template}
        />
      ))}

      {/* Coming Up */}
      {upcomingCrons.map((cron) => (
        <UpcomingCard key={cron.id} cron={cron} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveTaskFeed.tsx
git commit -m "feat(proactive): add ProactiveTaskFeed container"
```

---

## Task 10: Create ProactiveAgendaSidebar Component

**Files:**
- Create: `components/Home/ProactiveAgendaSidebar.tsx`

- [ ] **Step 1: Create agenda sidebar component**

```typescript
// components/Home/ProactiveAgendaSidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Clock } from "lucide-react";
import { bridgeInvoke } from "@/lib/hyperclaw-bridge-client";
import { QuickWinsSection } from "./proactive/QuickWinsSection";
import { parseCronJobs } from "@/components/Tool/Crons/utils";
import type { CronJobParsed, LogEntry } from "./proactive/types";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isToday(dateStr: string): boolean {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

export function ProactiveAgendaSidebar() {
  const [crons, setCrons] = useState<CronJobParsed[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch crons
        const cronsRes = await bridgeInvoke("get-crons", {});
        const cronsText = typeof cronsRes === "string" ? cronsRes : (cronsRes as { data?: string })?.data || "";
        const parsed = parseCronJobs(cronsText);
        setCrons(parsed);

        // Fetch logs
        const logsRes = await bridgeInvoke("get-logs", { lines: 50 });
        const logsData = Array.isArray(logsRes)
          ? logsRes
          : ((logsRes as { data?: LogEntry[] })?.data || []);
        setLogs(logsData as LogEntry[]);
      } catch (err) {
        console.error("Failed to fetch sidebar data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Filter crons scheduled for today
  const todayCrons = crons.filter((c) => isToday(c.nextRun));

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Today's Agenda */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Today's agenda</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{formattedDate}</p>

        {todayCrons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled tasks today</p>
        ) : (
          <div className="space-y-2">
            {todayCrons.map((cron) => (
              <div key={cron.id} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">
                  {formatTime(cron.nextRun)}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{cron.name}</p>
                  {cron.agent && (
                    <p className="text-[10px] text-muted-foreground">
                      Agent: {cron.agent}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Wins */}
      <QuickWinsSection logs={logs} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveAgendaSidebar.tsx
git commit -m "feat(proactive): add ProactiveAgendaSidebar with agenda and quick wins"
```

---

## Task 11: Create ProactiveHome Main Component

**Files:**
- Create: `components/Home/ProactiveHome.tsx`

- [ ] **Step 1: Create main proactive home container**

```typescript
// components/Home/ProactiveHome.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@/Providers/UserProv";
import { useProjects, ProjectsProvider } from "@/components/Tool/Projects/provider/projectsProvider";
import { bridgeInvoke } from "@/lib/hyperclaw-bridge-client";
import { ProactiveHomeHeader } from "./ProactiveHomeHeader";
import { ProactiveProjectsCarousel } from "./ProactiveProjectsCarousel";
import { ProactiveChatInput } from "./ProactiveChatInput";
import { ProactiveTaskFeed } from "./ProactiveTaskFeed";
import { ProactiveAgendaSidebar } from "./ProactiveAgendaSidebar";
import type { ProactiveSummary, InboxItem, LogEntry } from "./proactive/types";

interface ProactiveHomeInnerProps {
  onViewWidgets: () => void;
  onChatSubmit: (message: string) => void;
}

function ProactiveHomeInner({ onViewWidgets, onChatSubmit }: ProactiveHomeInnerProps) {
  const { user } = useUser();
  const { projects } = useProjects();
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    async function fetchSummaryData() {
      try {
        // Fetch inbox for decisions count
        const inboxRes = await bridgeInvoke("inbox-list", { status: "pending", limit: 50 });
        const items = (inboxRes as { items?: InboxItem[] })?.items || [];
        setInboxItems(items);

        // Fetch logs for tasks completed count
        const logsRes = await bridgeInvoke("get-logs", { lines: 100 });
        const logsData = Array.isArray(logsRes)
          ? logsRes
          : ((logsRes as { data?: LogEntry[] })?.data || []);
        setLogs(logsData as LogEntry[]);
      } catch (err) {
        console.error("Failed to fetch summary data:", err);
      }
    }
    fetchSummaryData();
  }, []);

  const summary = useMemo<ProactiveSummary>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    // Count tasks completed today (logs with success-like messages)
    const tasksCompleted = logs.filter((log) => {
      const msg = (log.message || "").toLowerCase();
      const logTime = log.time ? new Date(log.time).getTime() : 0;
      return logTime >= todayTs && (
        msg.includes("completed") || msg.includes("success") || msg.includes("done")
      );
    }).length;

    // Count projects updated today
    const projectsUpdated = projects.filter(
      (p) => p.updatedAt && p.updatedAt >= todayTs
    ).length;

    // Count decisions needed (pending inbox items)
    const decisionsNeeded = inboxItems.filter(
      (item) => item.kind === "approval" || item.kind === "question"
    ).length;

    return { tasksCompleted, projectsUpdated, decisionsNeeded };
  }, [logs, projects, inboxItems]);

  const userName = user?.name || user?.email?.split("@")[0] || "there";

  return (
    <div className="flex-1 w-full h-full overflow-auto customScrollbar2">
      <div className="max-w-7xl mx-auto pb-8">
        {/* Header */}
        <ProactiveHomeHeader
          userName={userName}
          summary={summary}
          onViewWidgets={onViewWidgets}
        />

        {/* Projects Carousel */}
        <ProactiveProjectsCarousel />

        {/* Chat Input */}
        <ProactiveChatInput onSubmit={onChatSubmit} />

        {/* Task Feed + Sidebar */}
        <div className="px-4 md:px-8 py-4">
          <div className="flex items-start gap-2 mb-4">
            <h2 className="text-lg font-semibold text-foreground">Your day, handled</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
              Proactive
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Task Feed */}
            <ProactiveTaskFeed />

            {/* Sidebar */}
            <div className="hidden lg:block">
              <ProactiveAgendaSidebar />
            </div>
          </div>

          {/* Mobile Sidebar */}
          <div className="lg:hidden mt-6">
            <ProactiveAgendaSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProactiveHomeProps {
  onViewWidgets: () => void;
  onChatSubmit: (message: string) => void;
}

export function ProactiveHome({ onViewWidgets, onChatSubmit }: ProactiveHomeProps) {
  return (
    <ProjectsProvider>
      <ProactiveHomeInner onViewWidgets={onViewWidgets} onChatSubmit={onChatSubmit} />
    </ProjectsProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveHome.tsx
git commit -m "feat(proactive): add ProactiveHome main container"
```

---

## Task 12: Update Dashboard Page with View Toggle

**Files:**
- Modify: `pages/dashboard.tsx`

- [ ] **Step 1: Read current dashboard.tsx**

Run: Review the existing file structure before modifying.

- [ ] **Step 2: Update dashboard.tsx with view toggle**

```typescript
// pages/dashboard.tsx
import { useState, useCallback, useEffect } from "react";
import { getLayout } from "@/layouts/MainLayout";
import Home from "@/components/Home";
import { ProactiveHome } from "@/components/Home/ProactiveHome";
import SEO from "@/components/SEO";
import { useUser } from "@/Providers/UserProv";
import Loading from "@/components/Loading";
import { SITE_URL } from "../lib/site-url";
import { dashboardState } from "@/lib/dashboard-state";
import type { ViewMode } from "@/components/Home/proactive/types";

const VIEW_MODE_KEY = "proactive-home-view";

const Index = () => {
  const { status } = useUser();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = dashboardState.get(VIEW_MODE_KEY) as ViewMode | null;
    return saved === "widgets" ? "widgets" : "proactive";
  });

  useEffect(() => {
    dashboardState.set(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const handleViewWidgets = useCallback(() => {
    setViewMode("widgets");
  }, []);

  const handleViewProactive = useCallback(() => {
    setViewMode("proactive");
  }, []);

  const handleChatSubmit = useCallback((message: string) => {
    // Dispatch event to open agent chat with the message
    window.dispatchEvent(
      new CustomEvent("proactive-chat-submit", { detail: { message } })
    );
    // Switch to widgets view to show the chat
    setViewMode("widgets");
  }, []);

  if (status !== "authenticated") {
    return <Loading text="Loading Hyperclaw..." />;
  }

  return (
    <>
      <SEO
        title="Hyperclaw OS - Your AI-Powered Workspace"
        description="Launch into your personal AI-first operating system. Access Todo List, Music Player, AI Chat, and productivity tools in one seamless interface. Start your intelligent workflow with Hyperclaw OS."
        url={`${SITE_URL}/`}
        image="https://hypercho.com/hypercho_banner.png"
        author="Hypercho"
        keywords="Hyperclaw OS, AI workspace, productivity app, todo list, AI chat, productivity tools, Hypercho, interactive OS, smart workspace, AI assistant, task management"
        type="software"
        siteName="Hypercho Hyperclaw"
        twitterHandle="@hypercho"
        additionalMeta={[
          { name: "application-name", content: "Hyperclaw OS" },
          { name: "apple-mobile-web-app-title", content: "Hyperclaw" },
          {
            name: "msapplication-tooltip",
            content: "Launch your AI-powered productivity workspace",
          },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { property: "og:image:type", content: "image/png" },
          {
            name: "apple-itunes-app",
            content: `app-argument=${SITE_URL}/`,
          },
        ]}
        additionalStructuredData={{
          "@type": "SoftwareApplication",
          name: "Hyperclaw OS",
          description:
            "AI-powered productivity workspace with integrated tools and applications",
          applicationCategory: "ProductivityApplication",
          operatingSystem: "Web Browser",
          softwareVersion: "1.0",
          releaseNotes:
            "Launch your personal AI workspace with integrated productivity tools",
          screenshot: "https://hypercho.com/hypercho_banner.png",
          featureList: [
            "Todo List & Task Management",
            "AI Chat Assistant (Hyperclaw)",
            "Prompt Library & Templates",
            "Settings & Customization",
            "Real-time Collaboration",
            "Cross-device Synchronization",
          ],
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/`,
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            ratingCount: "150",
            bestRating: "5",
            worstRating: "1",
          },
          creator: {
            "@type": "Organization",
            name: "Hypercho",
            url: "https://hypercho.com",
          },
          applicationSubCategory: "OfficeApplication",
          downloadUrl: `${SITE_URL}/`,
          installUrl: `${SITE_URL}/`,
          softwareRequirements: "Web Browser with JavaScript enabled",
          memoryRequirements: "Minimum 2GB RAM recommended",
          storageRequirements: "No local storage required - cloud-based",
          permissions: "Access to local storage for user preferences and data",
          browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
        }}
      />
      {viewMode === "proactive" ? (
        <ProactiveHome
          onViewWidgets={handleViewWidgets}
          onChatSubmit={handleChatSubmit}
        />
      ) : (
        <Home onBackToProactive={handleViewProactive} />
      )}
    </>
  );
};

Index.getLayout = getLayout;
export default Index;
```

- [ ] **Step 3: Commit**

```bash
git add pages/dashboard.tsx
git commit -m "feat(proactive): add view toggle between proactive and widgets"
```

---

## Task 13: Update Home Component with Back Button

**Files:**
- Modify: `components/Home/index.tsx`

- [ ] **Step 1: Add onBackToProactive prop to Home component**

Add the prop interface and a back button to the Home component header area.

```typescript
// Add to the Home component props
interface HomeProps {
  onBackToProactive?: () => void;
}

export default function Home({ onBackToProactive }: HomeProps = {}) {
  // ... existing code ...

  return (
    <div className="flex-1 w-full h-full flex flex-col overflow-hidden relative">
      {/* Add back button if callback provided */}
      {onBackToProactive && (
        <div className="absolute top-4 left-4 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToProactive}
            className="gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Button>
        </div>
      )}
      <div
        className="flex-1 overflow-auto customScrollbar2 bg-card/70 backdrop-blur-xl"
        data-dashboard="true"
      >
        <Dashboard key={resetKey} widgets={widgets} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add necessary imports**

```typescript
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 3: Commit**

```bash
git add components/Home/index.tsx
git commit -m "feat(proactive): add back button to widget grid view"
```

---

## Task 14: Create Index Export for Proactive Components

**Files:**
- Create: `components/Home/proactive/index.ts`

- [ ] **Step 1: Create barrel export file**

```typescript
// components/Home/proactive/index.ts
export * from "./types";
export { ApprovalCard } from "./ApprovalCard";
export { BackgroundTaskCard } from "./BackgroundTaskCard";
export { UpcomingCard } from "./UpcomingCard";
export { QuickWinsSection } from "./QuickWinsSection";
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/index.ts
git commit -m "chore(proactive): add barrel export for proactive components"
```

---

## Task 15: Integration Testing

**Files:**
- Test the full integration

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify proactive home loads**

Navigate to `http://localhost:1000/dashboard` and verify:
- Greeting shows with correct time of day
- Projects carousel displays (or empty state if no projects)
- Chat input is functional
- Task feed shows appropriate sections
- Sidebar displays agenda and quick wins

- [ ] **Step 3: Test view toggle**

Click "See full plan" button and verify:
- Switches to widget grid view
- "Back to home" button appears
- Clicking it returns to proactive view

- [ ] **Step 4: Test responsive layout**

Resize browser to mobile width (<1024px) and verify:
- Single column layout
- Sidebar moves below task feed
- Projects carousel still scrolls horizontally

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(proactive): complete proactive home dashboard implementation

- Add ProactiveHome as default dashboard view
- Add greeting header with dynamic stats
- Add horizontal projects carousel
- Add chat input with quick actions
- Add task feed (approvals, background tasks, upcoming)
- Add agenda sidebar with quick wins
- Add view toggle between proactive and widget grid"
```

---

## Summary

This plan implements the Proactive Home Dashboard in 15 tasks:

1. **Tasks 1-8**: Create individual components (types, header, carousel, chat input, cards)
2. **Tasks 9-10**: Create container components (task feed, sidebar)
3. **Task 11**: Create main ProactiveHome component
4. **Tasks 12-13**: Update routing with view toggle
5. **Task 14**: Add exports
6. **Task 15**: Integration testing

Each task is atomic and commits independently. The implementation follows existing Hyperclaw patterns and uses the established data providers.
