# Proactive Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing proactive dashboard with real-time polling, animations, error handling, visual polish, and interactive feedback so it feels alive and trustworthy.

**Architecture:** Extract shared data fetching into a custom `useProactiveData` hook with polling + window-focus refetch. Add framer-motion `AnimatePresence` for card enter/exit animations. Replace fake progress data with real workflow step info. Add loading states to all async action buttons. Lift error/loading state to feed level with distinct error vs empty UI.

**Tech Stack:** React 18, TypeScript, framer-motion (v11.11.17 — already installed), Tailwind CSS, lucide-react, bridgeInvoke (hub relay)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `components/Home/proactive/useProactiveData.ts` | **CREATE** — Custom hook: polling, refetch, error state, lastSynced timestamp |
| `components/Home/proactive/types.ts` | **MODIFY** — Add `FetchState` type, export `DataStatus` |
| `components/Home/ProactiveHome.tsx` | **MODIFY** — Use `useProactiveData`, pass data + controls down |
| `components/Home/ProactiveHomeHeader.tsx` | **MODIFY** — Contextual tagline colors, animated stat counters, last-synced + refresh |
| `components/Home/ProactiveTaskFeed.tsx` | **MODIFY** — Accept data via props, error/empty states, section headers, AnimatePresence |
| `components/Home/ProactiveAgendaSidebar.tsx` | **MODIFY** — Accept data via props (from shared hook), remove duplicate fetching |
| `components/Home/ProactiveChatInput.tsx` | **MODIFY** — Submitting state, visual feedback |
| `components/Home/ProactiveProjectsCarousel.tsx` | **MODIFY** — Hover/focus states on cards |
| `components/Home/proactive/ApprovalCard.tsx` | **MODIFY** — Loading buttons, hover state, AnimatePresence exit |
| `components/Home/proactive/BackgroundTaskCard.tsx` | **MODIFY** — Remove fake progress, show real step info, hover state |
| `components/Home/proactive/UpcomingCard.tsx` | **MODIFY** — Hover/focus state, status indicator |
| `components/Home/proactive/QuickWinsSection.tsx` | **MODIFY** — Entrance animation for items |
| `pages/dashboard.tsx` | **MODIFY** — Smooth transition between views |

---

### Task 1: Create `useProactiveData` Hook — Shared Data Fetching with Polling

**Files:**
- Create: `components/Home/proactive/useProactiveData.ts`
- Modify: `components/Home/proactive/types.ts`

This hook centralizes all bridge data fetching (inbox, crons, logs) with 30-second polling, window-focus refetch, manual refresh, and error tracking. Currently ProactiveHome, ProactiveTaskFeed, and ProactiveAgendaSidebar each fetch independently — this deduplicates all of it.

- [ ] **Step 1: Add `FetchState` type to types.ts**

Add after the `ProjectStatus` type at the bottom of `components/Home/proactive/types.ts`:

```typescript
export type DataStatus = "idle" | "loading" | "error" | "success";

export interface FetchState {
  inboxItems: InboxItem[];
  crons: CronJobParsed[];
  logs: LogEntry[];
  status: DataStatus;
  error: string | null;
  lastSyncedAt: number | null;
}
```

- [ ] **Step 2: Create the useProactiveData hook**

Create `components/Home/proactive/useProactiveData.ts`:

```typescript
// components/Home/proactive/useProactiveData.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { parseCronJobs } from "$/components/Tool/Crons/utils";
import type { InboxItem, CronJobParsed, LogEntry, DataStatus } from "./types";

const POLL_INTERVAL_MS = 30_000;

interface ProactiveData {
  inboxItems: InboxItem[];
  crons: CronJobParsed[];
  logs: LogEntry[];
  status: DataStatus;
  error: string | null;
  lastSyncedAt: number | null;
  refresh: () => void;
  resolveInboxItem: (id: number, resolution: "approved" | "rejected" | "dismissed") => Promise<void>;
}

export function useProactiveData(): ProactiveData {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [crons, setCrons] = useState<CronJobParsed[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<DataStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (isBackground = false) => {
    if (!isBackground) setStatus("loading");
    setError(null);

    try {
      const [inboxRes, cronsRes, logsRes] = await Promise.all([
        bridgeInvoke("inbox-list", { status: "pending", limit: 50 }),
        bridgeInvoke("get-crons", {}),
        bridgeInvoke("get-logs", { lines: 100 }),
      ]);

      const items = (inboxRes as { items?: InboxItem[] })?.items || [];
      setInboxItems(items);

      const cronsText = typeof cronsRes === "string"
        ? cronsRes
        : (cronsRes as { data?: string })?.data || "";
      setCrons(parseCronJobs(cronsText));

      const logsData = Array.isArray(logsRes)
        ? logsRes
        : ((logsRes as { data?: LogEntry[] })?.data || []);
      setLogs(logsData as LogEntry[]);

      setStatus("success");
      setLastSyncedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch data";
      setError(message);
      if (!isBackground) setStatus("error");
    }
  }, []);

  const refresh = useCallback(() => {
    fetchAll(false);
  }, [fetchAll]);

  const resolveInboxItem = useCallback(async (id: number, resolution: "approved" | "rejected" | "dismissed") => {
    await bridgeInvoke("inbox-resolve", { id, resolution });
    setInboxItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  // Polling every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchAll(true), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  // Refetch on window focus
  useEffect(() => {
    const handleFocus = () => fetchAll(true);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchAll]);

  return { inboxItems, crons, logs, status, error, lastSyncedAt, refresh, resolveInboxItem };
}
```

- [ ] **Step 3: Export the hook from the barrel**

Add to `components/Home/proactive/index.ts`:

```typescript
export { useProactiveData } from "./useProactiveData";
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "proactive/useProactiveData"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add components/Home/proactive/useProactiveData.ts components/Home/proactive/types.ts components/Home/proactive/index.ts
git commit -m "feat: add useProactiveData hook with 30s polling and window-focus refetch"
```

---

### Task 2: Wire ProactiveHome to Use Shared Hook

**Files:**
- Modify: `components/Home/ProactiveHome.tsx`

Replace the inline data fetching in ProactiveHomeInner with the shared `useProactiveData` hook. Pass data and controls down as props to children.

- [ ] **Step 1: Rewrite ProactiveHome.tsx**

Replace the entire content of `components/Home/ProactiveHome.tsx`:

```typescript
// components/Home/ProactiveHome.tsx
"use client";

import React, { useMemo } from "react";
import { useUser } from "$/Providers/UserProv";
import { useProjects, ProjectsProvider } from "$/components/Tool/Projects/provider/projectsProvider";
import { useProactiveData } from "./proactive/useProactiveData";
import { ProactiveHomeHeader } from "./ProactiveHomeHeader";
import { ProactiveProjectsCarousel } from "./ProactiveProjectsCarousel";
import { ProactiveChatInput } from "./ProactiveChatInput";
import { ProactiveTaskFeed } from "./ProactiveTaskFeed";
import { ProactiveAgendaSidebar } from "./ProactiveAgendaSidebar";
import type { ProactiveSummary } from "./proactive/types";

interface ProactiveHomeInnerProps {
  onViewWidgets: () => void;
  onChatSubmit: (message: string) => void;
}

function ProactiveHomeInner({ onViewWidgets, onChatSubmit }: ProactiveHomeInnerProps) {
  const { userInfo } = useUser();
  const { projects } = useProjects();
  const data = useProactiveData();

  const summary = useMemo<ProactiveSummary>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const tasksCompleted = data.logs.filter((log) => {
      const msg = (log.message || "").toLowerCase();
      const logTime = log.time ? new Date(log.time).getTime() : 0;
      return logTime >= todayTs && (
        msg.includes("completed") || msg.includes("success") || msg.includes("done")
      );
    }).length;

    const projectsUpdated = projects.filter(
      (p) => p.updatedAt && p.updatedAt >= todayTs
    ).length;

    const decisionsNeeded = data.inboxItems.filter(
      (item) => item.kind === "approval" || item.kind === "question"
    ).length;

    return { tasksCompleted, projectsUpdated, decisionsNeeded };
  }, [data.logs, data.inboxItems, projects]);

  const userName = userInfo?.Firstname || userInfo?.email?.split("@")[0] || "there";

  return (
    <div className="flex-1 w-full h-full overflow-auto customScrollbar2">
      <div className="max-w-7xl mx-auto pb-8">
        <ProactiveHomeHeader
          userName={userName}
          summary={summary}
          lastSyncedAt={data.lastSyncedAt}
          onRefresh={data.refresh}
          onViewWidgets={onViewWidgets}
        />

        <ProactiveProjectsCarousel />

        <ProactiveChatInput onSubmit={onChatSubmit} />

        <div className="px-4 md:px-8 py-4">
          <div className="flex items-start gap-2 mb-4">
            <h2 className="text-lg font-semibold text-foreground">Your day, handled</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
              Proactive
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <ProactiveTaskFeed
              inboxItems={data.inboxItems}
              crons={data.crons}
              status={data.status}
              error={data.error}
              onResolveInbox={data.resolveInboxItem}
              onRetry={data.refresh}
            />

            <div className="hidden lg:block">
              <ProactiveAgendaSidebar
                crons={data.crons}
                logs={data.logs}
                status={data.status}
              />
            </div>
          </div>

          <div className="lg:hidden mt-6">
            <ProactiveAgendaSidebar
              crons={data.crons}
              logs={data.logs}
              status={data.status}
            />
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

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "ProactiveHome"`
Expected: Errors about changed props on ProactiveTaskFeed, ProactiveAgendaSidebar, and ProactiveHomeHeader (these will be fixed in subsequent tasks)

- [ ] **Step 3: Commit**

```bash
git add components/Home/ProactiveHome.tsx
git commit -m "refactor: wire ProactiveHome to shared useProactiveData hook"
```

---

### Task 3: Enhance ProactiveHomeHeader — Contextual Colors, Refresh, Animated Stats

**Files:**
- Modify: `components/Home/ProactiveHomeHeader.tsx`

Add: contextual tagline color (green/amber/default), "last synced" timestamp with manual refresh button, and animated stat counter using framer-motion.

- [ ] **Step 1: Rewrite ProactiveHomeHeader.tsx**

Replace the entire content of `components/Home/ProactiveHomeHeader.tsx`:

```typescript
// components/Home/ProactiveHomeHeader.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProactiveSummary } from "./proactive/types";

interface ProactiveHomeHeaderProps {
  userName: string;
  summary: ProactiveSummary;
  lastSyncedAt: number | null;
  onRefresh: () => void;
  onViewWidgets: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTagline(summary: ProactiveSummary): { text: string; color: string } {
  const { tasksCompleted, projectsUpdated, decisionsNeeded } = summary;
  if (decisionsNeeded > 0) {
    return { text: "A few things need your attention.", color: "text-amber-400" };
  }
  if (tasksCompleted > 0 || projectsUpdated > 0) {
    return { text: "I've got things moving.", color: "text-emerald-400" };
  }
  return { text: "Ready when you are.", color: "text-primary" };
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatSyncTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Animated number that counts up/down when the value changes. */
function AnimatedCounter({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) => Math.round(v));
  const display = useTransform(rounded, (v) => String(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionVal, value, { duration: 0.6, ease: "easeOut" });
    return controls.stop;
  }, [value, motionVal]);

  useEffect(() => {
    const unsub = display.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [display]);

  return <span ref={ref}>{value}</span>;
}

export function ProactiveHomeHeader({
  userName,
  summary,
  lastSyncedAt,
  onRefresh,
  onViewWidgets,
}: ProactiveHomeHeaderProps) {
  const greeting = getGreeting();
  const { text: tagline, color: taglineColor } = getTagline(summary);
  const firstName = userName.split(" ")[0] || "there";

  const statParts: React.ReactNode[] = [];
  if (summary.tasksCompleted > 0) {
    statParts.push(
      <span key="tasks">
        <AnimatedCounter value={summary.tasksCompleted} /> task{summary.tasksCompleted !== 1 ? "s" : ""} completed
      </span>
    );
  }
  if (summary.projectsUpdated > 0) {
    statParts.push(
      <span key="updates">
        <AnimatedCounter value={summary.projectsUpdated} /> update{summary.projectsUpdated !== 1 ? "s" : ""}
      </span>
    );
  }
  if (summary.decisionsNeeded > 0) {
    statParts.push(
      <span key="decisions">
        <AnimatedCounter value={summary.decisionsNeeded} /> decision{summary.decisionsNeeded !== 1 ? "s" : ""} needed
      </span>
    );
  }

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm text-muted-foreground">{formatDate()}</p>
        {lastSyncedAt && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <RefreshCw className="w-3 h-3 group-hover:animate-spin" />
              {formatSyncTime(lastSyncedAt)}
            </button>
          </>
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl md:text-3xl font-semibold text-foreground"
          >
            {greeting}, {firstName}.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className={cn("text-xl md:text-2xl font-medium mt-1 transition-colors duration-500", taglineColor)}
          >
            {tagline}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5"
          >
            {statParts.length > 0
              ? statParts.reduce<React.ReactNode[]>((acc, part, i) => {
                  if (i > 0) acc.push(<span key={`sep-${i}`} className="text-muted-foreground/40">·</span>);
                  acc.push(part);
                  return acc;
                }, [])
              : "All caught up"}
          </motion.p>
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

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "ProactiveHomeHeader"`
Expected: No errors (this file is self-contained)

- [ ] **Step 3: Commit**

```bash
git add components/Home/ProactiveHomeHeader.tsx
git commit -m "feat: header with contextual tagline colors, animated stats, last-synced + refresh"
```

---

### Task 4: Enhance ProactiveTaskFeed — Props, Error States, Section Headers, AnimatePresence

**Files:**
- Modify: `components/Home/ProactiveTaskFeed.tsx`

Convert from self-fetching to props-driven. Add distinct error vs empty states with retry. Add section headers between card types. Wrap cards in `AnimatePresence` for enter/exit animations.

- [ ] **Step 1: Rewrite ProactiveTaskFeed.tsx**

Replace the entire content of `components/Home/ProactiveTaskFeed.tsx`:

```typescript
// components/Home/ProactiveTaskFeed.tsx
"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, RefreshCw, Inbox, Clock, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { ApprovalCard } from "./proactive/ApprovalCard";
import { BackgroundTaskCard } from "./proactive/BackgroundTaskCard";
import { UpcomingCard } from "./proactive/UpcomingCard";
import type { InboxItem, CronJobParsed, DataStatus } from "./proactive/types";

const CARD_VARIANTS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -60, transition: { duration: 0.25 } },
};

interface ProactiveTaskFeedProps {
  inboxItems: InboxItem[];
  crons: CronJobParsed[];
  status: DataStatus;
  error: string | null;
  onResolveInbox: (id: number, resolution: "approved" | "rejected" | "dismissed") => Promise<void>;
  onRetry: () => void;
}

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      {icon}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground/60">({count})</span>
    </div>
  );
}

export function ProactiveTaskFeed({
  inboxItems,
  crons,
  status,
  error,
  onResolveInbox,
  onRetry,
}: ProactiveTaskFeedProps) {
  const { projects } = useProjects();

  const runningWorkflows = useMemo(() =>
    projects.flatMap((p) =>
      (p.workflowRuns || [])
        .filter((r) => r.status === "running")
        .map((r) => ({
          run: r,
          template: p.workflowTemplates?.find((t) => t.id === r.templateId),
        }))
    ), [projects]);

  const upcomingCrons = useMemo(() =>
    crons
      .filter((c) => new Date(c.nextRun) > new Date())
      .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())
      .slice(0, 3),
    [crons]);

  const approvalItems = useMemo(() =>
    inboxItems.filter((item) => item.kind === "approval" || item.kind === "question"),
    [inboxItems]);

  // Loading skeleton
  if (status === "loading" && approvalItems.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  // Error state with retry
  if (status === "error" && approvalItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-10 h-10 text-destructive/60 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">Couldn't load tasks</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
          {error || "Something went wrong while fetching your tasks."}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  const hasContent = approvalItems.length > 0 || runningWorkflows.length > 0 || upcomingCrons.length > 0;

  // Empty state (distinct from error)
  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
          <Inbox className="w-6 h-6 text-emerald-500" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">All caught up!</p>
        <p className="text-xs text-muted-foreground">No tasks need your attention right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Needs Your Input */}
      <SectionHeader
        icon={<Inbox className="w-3.5 h-3.5 text-amber-500" />}
        label="Needs your input"
        count={approvalItems.length}
      />
      <AnimatePresence mode="popLayout">
        {approvalItems.map((item, i) => (
          <motion.div
            key={item.id}
            variants={CARD_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, delay: i * 0.05 }}
            layout
          >
            <ApprovalCard
              item={item}
              onApprove={() => onResolveInbox(item.id, "approved")}
              onReject={() => onResolveInbox(item.id, "rejected")}
              onDismiss={() => onResolveInbox(item.id, "dismissed")}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Running in Background */}
      <SectionHeader
        icon={<Cog className="w-3.5 h-3.5 text-blue-500" />}
        label="Running in background"
        count={runningWorkflows.length}
      />
      <AnimatePresence mode="popLayout">
        {runningWorkflows.map(({ run, template }, i) => (
          <motion.div
            key={run.id}
            variants={CARD_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, delay: i * 0.05 }}
            layout
          >
            <BackgroundTaskCard run={run} template={template} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Coming Up */}
      <SectionHeader
        icon={<Clock className="w-3.5 h-3.5 text-muted-foreground" />}
        label="Coming up"
        count={upcomingCrons.length}
      />
      <AnimatePresence mode="popLayout">
        {upcomingCrons.map((cron, i) => (
          <motion.div
            key={cron.id}
            variants={CARD_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, delay: i * 0.05 }}
            layout
          >
            <UpcomingCard cron={cron} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "ProactiveTaskFeed"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/Home/ProactiveTaskFeed.tsx
git commit -m "feat: task feed with error/empty states, section headers, AnimatePresence"
```

---

### Task 5: Enhance ProactiveAgendaSidebar — Props-Driven, Remove Duplicate Fetching

**Files:**
- Modify: `components/Home/ProactiveAgendaSidebar.tsx`

Convert from self-fetching to props-driven (receives crons, logs, status from parent). Show skeleton only during initial load.

- [ ] **Step 1: Rewrite ProactiveAgendaSidebar.tsx**

Replace the entire content of `components/Home/ProactiveAgendaSidebar.tsx`:

```typescript
// components/Home/ProactiveAgendaSidebar.tsx
"use client";

import React, { useMemo } from "react";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { QuickWinsSection } from "./proactive/QuickWinsSection";
import type { CronJobParsed, LogEntry, DataStatus } from "./proactive/types";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isToday(dateStr: string): boolean {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

interface ProactiveAgendaSidebarProps {
  crons: CronJobParsed[];
  logs: LogEntry[];
  status: DataStatus;
}

export function ProactiveAgendaSidebar({ crons, logs, status }: ProactiveAgendaSidebarProps) {
  const todayCrons = useMemo(() => crons.filter((c) => isToday(c.nextRun)), [crons]);

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (status === "loading" && crons.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="space-y-4"
    >
      {/* Today's Agenda */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Today's agenda</h3>
          {todayCrons.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">({todayCrons.length})</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">{formattedDate}</p>

        {todayCrons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled tasks today</p>
        ) : (
          <div className="space-y-2">
            {todayCrons.map((cron) => (
              <div
                key={cron.id}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors cursor-default"
              >
                <span className="text-xs text-muted-foreground w-16">
                  {formatTime(cron.nextRun)}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ${cron.status === "error" ? "bg-destructive" : "bg-primary"}`} />
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
    </motion.div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "ProactiveAgendaSidebar"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/Home/ProactiveAgendaSidebar.tsx
git commit -m "refactor: agenda sidebar props-driven, remove duplicate fetching, add hover states"
```

---

### Task 6: Enhance ApprovalCard — Loading Buttons, Hover State, Kind-Specific Labels

**Files:**
- Modify: `components/Home/proactive/ApprovalCard.tsx`

Add loading spinner on action buttons while resolving. Add card-level hover state. Make the "Needs your input" label vary by kind.

- [ ] **Step 1: Rewrite ApprovalCard.tsx**

Replace the entire content of `components/Home/proactive/ApprovalCard.tsx`:

```typescript
// components/Home/proactive/ApprovalCard.tsx
"use client";

import React, { useState } from "react";
import { Zap, HelpCircle, AlertTriangle, Info, X, Loader2 } from "lucide-react";
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

const KIND_LABELS: Record<string, { text: string; color: string }> = {
  approval: { text: "Needs approval", color: "text-amber-500" },
  question: { text: "Question for you", color: "text-blue-500" },
  error: { text: "Error — action needed", color: "text-destructive" },
  info: { text: "FYI", color: "text-muted-foreground" },
};

interface ApprovalCardProps {
  item: InboxItem;
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
  onDismiss: () => Promise<void> | void;
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
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const isApproval = item.kind === "approval";
  const icon = KIND_ICONS[item.kind] || KIND_ICONS.info;
  const colorClass = KIND_COLORS[item.kind] || KIND_COLORS.info;
  const label = KIND_LABELS[item.kind] || KIND_LABELS.info;

  const handleAction = async (action: string, handler?: () => Promise<void> | void) => {
    if (!handler || loadingAction) return;
    setLoadingAction(action);
    try {
      await handler();
    } finally {
      setLoadingAction(null);
    }
  };

  const isDisabled = loadingAction !== null;

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors duration-150",
      "hover:bg-accent/5",
      colorClass,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide", label.color)}>
                {label.text}
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
          onClick={() => handleAction("dismiss", onDismiss)}
          disabled={isDisabled}
        >
          {loadingAction === "dismiss" ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex items-center gap-2 mt-3 ml-7">
        {isApproval && onApprove && (
          <Button
            size="sm"
            onClick={() => handleAction("approve", onApprove)}
            disabled={isDisabled}
            className="h-7 text-xs gap-1"
          >
            {loadingAction === "approve" && <Loader2 className="w-3 h-3 animate-spin" />}
            Approve
          </Button>
        )}
        {isApproval && onReject && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("reject", onReject)}
            disabled={isDisabled}
            className="h-7 text-xs gap-1"
          >
            {loadingAction === "reject" && <Loader2 className="w-3 h-3 animate-spin" />}
            Reject
          </Button>
        )}
        {!isApproval && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("dismiss", onDismiss)}
            disabled={isDisabled}
            className="h-7 text-xs gap-1"
          >
            {loadingAction === "dismiss" && <Loader2 className="w-3 h-3 animate-spin" />}
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "ApprovalCard"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/Home/proactive/ApprovalCard.tsx
git commit -m "feat: approval card loading states, hover, kind-specific labels"
```

---

### Task 7: Fix BackgroundTaskCard — Remove Fake Progress, Show Real Data, Hover

**Files:**
- Modify: `components/Home/proactive/BackgroundTaskCard.tsx`

Remove the `formatNextUpdate()` that generates random times. Show the current step name when available. Add elapsed time since run started. Add hover state.

- [ ] **Step 1: Rewrite BackgroundTaskCard.tsx**

Replace the entire content of `components/Home/proactive/BackgroundTaskCard.tsx`:

```typescript
// components/Home/proactive/BackgroundTaskCard.tsx
"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import type { WorkflowRun, WorkflowTemplate } from "$/components/Tool/Projects/provider/projectsProvider";

interface BackgroundTaskCardProps {
  run: WorkflowRun;
  template?: WorkflowTemplate;
}

function calculateProgress(run: WorkflowRun, template?: WorkflowTemplate): { percent: number; stepLabel: string | null } {
  if (!template?.steps || template.steps.length === 0) {
    return { percent: 0, stepLabel: null };
  }
  const currentIndex = template.steps.findIndex((s) => s.id === run.currentGateStepId);
  if (currentIndex === -1) {
    return { percent: 0, stepLabel: null };
  }
  const percent = Math.round(((currentIndex + 1) / template.steps.length) * 100);
  const stepLabel = template.steps[currentIndex]?.name || null;
  return { percent, stepLabel };
}

function formatElapsed(startedAt?: number): string | null {
  if (!startedAt) return null;
  const diff = Date.now() - startedAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Started just now";
  if (minutes < 60) return `Running for ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Running for ${hours}h ${minutes % 60}m`;
  return `Running for ${Math.floor(hours / 24)}d`;
}

export function BackgroundTaskCard({ run, template }: BackgroundTaskCardProps) {
  const { percent, stepLabel } = calculateProgress(run, template);
  const name = template?.name || "Background task";
  const elapsed = formatElapsed(run.startedAt);
  const totalSteps = template?.steps?.length || 0;
  const currentStepIndex = template?.steps?.findIndex((s) => s.id === run.currentGateStepId) ?? -1;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 hover:bg-accent/5 transition-colors duration-150">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-500 border border-blue-500/30">
            Running in background
          </span>
          {elapsed && (
            <span className="text-[10px] text-muted-foreground">{elapsed}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        <h4 className="font-medium text-foreground">{name}</h4>
      </div>

      {stepLabel && (
        <p className="text-sm text-muted-foreground mb-3">
          Step {currentStepIndex + 1}/{totalSteps}: {stepLabel}
        </p>
      )}

      {totalSteps > 0 && (
        <div className="mb-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep "BackgroundTaskCard"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/Home/proactive/BackgroundTaskCard.tsx
git commit -m "fix: remove fake progress/random times, show real step data and elapsed time"
```

---

### Task 8: Enhance UpcomingCard — Hover State, Status Indicator

**Files:**
- Modify: `components/Home/proactive/UpcomingCard.tsx`

Add hover state on the card. Show a warning indicator if the cron has `status: "error"`.

- [ ] **Step 1: Rewrite UpcomingCard.tsx**

Replace the entire content of `components/Home/proactive/UpcomingCard.tsx`:

```typescript
// components/Home/proactive/UpcomingCard.tsx
"use client";

import React from "react";
import { Calendar, Clock, AlertTriangle } from "lucide-react";
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
  const isError = cron.status === "error";

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors duration-150",
      "hover:bg-accent/5",
      isError ? "border-destructive/30 bg-destructive/5" : "border-border bg-card/50",
    )}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
            isError ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}>
            {isError ? "Error — Coming up" : "Coming up"}
          </span>
          {isError && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
        </div>
        <span className="text-xs text-muted-foreground">
          {isToday ? `Today ${absolute}` : isTomorrow ? `Tomorrow ${absolute}` : relative}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Calendar className={cn("w-4 h-4", isError ? "text-destructive/60" : "text-muted-foreground")} />
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
git commit -m "feat: upcoming card hover state and error status indicator"
```

---

### Task 9: Enhance QuickWinsSection — Entrance Animation

**Files:**
- Modify: `components/Home/proactive/QuickWinsSection.tsx`

Add staggered fade-in animation for each quick win item.

- [ ] **Step 1: Rewrite QuickWinsSection.tsx**

Replace the entire content of `components/Home/proactive/QuickWinsSection.tsx`:

```typescript
// components/Home/proactive/QuickWinsSection.tsx
"use client";

import React from "react";
import { Check, Zap } from "lucide-react";
import { motion } from "framer-motion";
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
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            className="flex items-start gap-2"
          >
            <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {formatLogMessage(log)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/proactive/QuickWinsSection.tsx
git commit -m "feat: quick wins staggered entrance animation"
```

---

### Task 10: Enhance ProactiveChatInput — Submission Feedback

**Files:**
- Modify: `components/Home/ProactiveChatInput.tsx`

Add a `submitting` state that shows a brief "Sending..." indicator and disables the input while the view is transitioning to widgets.

- [ ] **Step 1: Rewrite ProactiveChatInput.tsx**

Replace the entire content of `components/Home/ProactiveChatInput.tsx`:

```typescript
// components/Home/ProactiveChatInput.tsx
"use client";

import React, { useState, useRef, useCallback } from "react";
import { Calendar, Search, BarChart3, Sparkles, Zap, ChevronDown, ArrowUp, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    onSubmit(trimmed);
    // Brief visual feedback before view switches
    setTimeout(() => {
      setValue("");
      setSubmitting(false);
    }, 600);
  }, [value, onSubmit, submitting]);

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
          <AnimatePresence mode="wait">
            {submitting ? (
              <motion.div
                key="submitting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-2 h-[76px] text-muted-foreground"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Opening chat...</span>
              </motion.div>
            ) : (
              <motion.div key="input" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                    size="icon"
                    onClick={handleSubmit}
                    disabled={!value.trim()}
                    className="rounded-full bg-primary hover:bg-primary/90"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!submitting && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center gap-2 mt-4 flex-wrap"
          >
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
          </motion.div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveChatInput.tsx
git commit -m "feat: chat input submission feedback with loading state and transition"
```

---

### Task 11: Enhance ProactiveProjectsCarousel — Focus States and Hover Polish

**Files:**
- Modify: `components/Home/ProactiveProjectsCarousel.tsx`

Add visible focus ring for keyboard navigation, subtle scale on hover, and entrance animation for cards.

- [ ] **Step 1: Update the ProjectCard className and carousel wrapper**

In `components/Home/ProactiveProjectsCarousel.tsx`, replace the `<button>` in `ProjectCard`:

Find:
```typescript
    <button
      onClick={handleClick}
      className={cn(
        "flex-shrink-0 w-64 p-4 rounded-xl border bg-card text-left",
        "hover:bg-card/80 transition-colors cursor-pointer",
        colors.border
      )}
    >
```

Replace with:
```typescript
    <button
      onClick={handleClick}
      className={cn(
        "flex-shrink-0 w-64 p-4 rounded-xl border bg-card text-left",
        "hover:bg-card/80 hover:scale-[1.02] active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "transition-all duration-150 cursor-pointer",
        colors.border
      )}
    >
```

Also update the scroll navigation buttons to always be visible for keyboard users. Find both instances of:
```typescript
className="absolute left-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
```
and
```typescript
className="absolute right-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
```

Replace the left button className with:
```typescript
className="absolute left-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
```

Replace the right button className with:
```typescript
className="absolute right-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
```

- [ ] **Step 2: Commit**

```bash
git add components/Home/ProactiveProjectsCarousel.tsx
git commit -m "feat: project cards focus ring, hover scale, accessible scroll buttons"
```

---

### Task 12: Smooth View Transition in Dashboard Page

**Files:**
- Modify: `pages/dashboard.tsx`

Wrap the view toggle in `AnimatePresence` so switching between proactive and widgets views has a smooth crossfade.

- [ ] **Step 1: Add framer-motion transition to pages/dashboard.tsx**

In `pages/dashboard.tsx`, add the import at the top:

```typescript
import { AnimatePresence, motion } from "framer-motion";
```

Then replace the conditional render block:

Find:
```typescript
      {viewMode === "proactive" ? (
        <ProactiveHome
          onViewWidgets={handleViewWidgets}
          onChatSubmit={handleChatSubmit}
        />
      ) : (
        <Home onBackToProactive={handleViewProactive} />
      )}
```

Replace with:
```typescript
      <AnimatePresence mode="wait">
        {viewMode === "proactive" ? (
          <motion.div
            key="proactive"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            <ProactiveHome
              onViewWidgets={handleViewWidgets}
              onChatSubmit={handleChatSubmit}
            />
          </motion.div>
        ) : (
          <motion.div
            key="widgets"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            <Home onBackToProactive={handleViewProactive} />
          </motion.div>
        )}
      </AnimatePresence>
```

- [ ] **Step 2: Commit**

```bash
git add pages/dashboard.tsx
git commit -m "feat: smooth crossfade transition between proactive and widget views"
```

---

### Task 13: Type Check and Integration Verification

**Files:**
- All modified files

Verify that all changes compile together and the app runs correctly.

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E "^components/Home/(Proactive|proactive)|^pages/dashboard"`
Expected: No errors from proactive components or dashboard page

- [ ] **Step 2: Start dev server and verify**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:1000/dashboard`
Expected: 200

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: proactive dashboard enhancements — polling, animations, error states, visual polish"
```

---

## Self-Review Checklist

1. **Enhancement coverage:**
   - [x] Real-time polling (Task 1 — 30s interval + window focus)
   - [x] Animations (Tasks 3, 4, 5, 9, 10, 12 — framer-motion throughout)
   - [x] Chat submission feedback (Task 10 — loading state + "Opening chat...")
   - [x] Error vs empty states (Task 4 — distinct UI with retry button)
   - [x] Fix fake progress (Task 7 — removed random times, show real step data)
   - [x] Loading states on action buttons (Task 6 — spinner on approve/reject/dismiss)
   - [x] "Last synced" + refresh button (Task 3 — header refresh + timestamp)
   - [x] Hover/focus states on all cards (Tasks 6, 7, 8, 11 — hover:bg-accent/5 + focus-visible rings)
   - [x] Section headers between card types (Task 4 — SectionHeader component with icons + counts)
   - [x] Contextual tagline colors (Task 3 — amber for attention, emerald for moving, primary for default)

2. **Placeholder scan:** No TBD/TODO/placeholder text found.

3. **Type consistency:** All types reference the same `types.ts` definitions. `DataStatus` is used consistently across hook → ProactiveHome → TaskFeed/Sidebar. `useProactiveData` return type matches what consumers destructure. `ApprovalCard` callbacks changed from `() => void` to `() => Promise<void> | void` to support async loading states.
