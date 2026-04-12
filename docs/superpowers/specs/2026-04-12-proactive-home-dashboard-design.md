# Proactive Home Dashboard

**Date:** 2026-04-12  
**Status:** Approved  
**Branch:** HyperClaw-V2

## Overview

Replace the current widget-grid dashboard with a proactive home screen inspired by ChatGPT 6.5. The new home provides a personalized greeting, project status cards, a unified chat input with quick actions, and a task feed showing items that need attention, background processes, and upcoming scheduled work.

The existing widget grid remains accessible via a "View widgets" link for power users.

## Architecture

### New Components

```
components/Home/
├── ProactiveHome.tsx              # Main container, replaces Home as default
├── ProactiveHomeHeader.tsx        # Greeting + status summary + "See full plan"
├── ProactiveProjectsCarousel.tsx  # Horizontal scrolling project cards
├── ProactiveChatInput.tsx         # Chat input with quick action buttons
├── ProactiveTaskFeed.tsx          # "Your day handled" container
│   ├── ApprovalCard.tsx           # Pending approval needing user input
│   ├── BackgroundTaskCard.tsx     # Running workflow with progress
│   └── UpcomingCard.tsx           # Scheduled cron or task
├── ProactiveAgendaSidebar.tsx     # Right sidebar with agenda + quick wins
└── QuickWinsSection.tsx           # Completed actions log
```

### Data Sources

| Section | Source | Hook/API |
|---------|--------|----------|
| Projects | Hub via connector | `useProjects()` from projectsProvider |
| Approvals/Inbox | Connector bridge | `bridgeInvoke("inbox-list", { status: "pending" })` |
| Background Tasks | Workflow runs | `useProjects().workflowRuns` |
| Crons/Upcoming | Connector bridge | `bridgeInvoke("get-crons")` |
| Quick Wins/Logs | Connector bridge | `bridgeInvoke("get-logs")` |
| User Info | Auth context | `useUser()` |

### Routing Changes

- `pages/dashboard.tsx` renders `ProactiveHome` by default
- Add `viewMode` state stored in `dashboardState`: `"proactive"` | `"widgets"`
- "View widgets" link switches to current `Home` component (widget grid)
- "Back to home" link in widget grid returns to proactive view

## Layout Specification

### Desktop (>1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header: Date                                        Search Bell Avatar │
├─────────────────────────────────────────────────────────────────────┤
│  Greeting Section (full width)                                      │
│  "Good [time], [Name]. I've got things moving."    [See full plan]  │
│  X tasks completed · Y updates · Z decisions needed                 │
├─────────────────────────────────────────────────────────────────────┤
│  Projects Carousel (full width, horizontal scroll)                  │
│  [IN PROGRESS] [DONE] [ACTIVE] [ACTIVE] →                          │
├─────────────────────────────────────────────────────────────────────┤
│  Chat Input (full width, centered)                                  │
│  [Schedule] [Research] [Analyze] [Create] [Automate] [More]        │
├────────────────────────────────────┬────────────────────────────────┤
│  Task Feed (left, ~65%)            │  Sidebar (right, ~35%)         │
│  - Needs Your Input                │  - Today's Agenda              │
│  - Running in Background           │  - Quick Wins                  │
│  - Coming Up                       │                                │
└────────────────────────────────────┴────────────────────────────────┘
```

### Tablet/Mobile (<1024px)

- Single column layout
- Sidebar content moves below task feed
- Projects carousel remains horizontal scrollable
- Chat input sticks to bottom on mobile

## Component Specifications

### ProactiveHomeHeader

**Props:** None (uses context)

**Behavior:**
- Displays greeting based on time: morning (<12), afternoon (<17), evening
- Shows user's first name from `useUser()`
- Aggregates today's stats:
  - `tasksCompleted`: logs with type `task_complete` from today
  - `updates`: projects updated today
  - `decisionsNeeded`: pending approvals count
- "See full plan" button navigates to widget grid view

### ProactiveProjectsCarousel

**Props:** None (uses `useProjects()`)

**Behavior:**
- Horizontal scroll container with snap points
- Shows projects sorted by `updatedAt` desc
- Status badge mapping:
  - `active` → "IN PROGRESS" (amber)
  - `completed` → "DONE" (emerald)
  - `archived` → "ARCHIVED" (muted)
- Each card shows: emoji, name, description snippet, last activity
- Click opens project detail panel (existing `dispatchOpenProjectPanel`)
- Arrow buttons for scroll navigation on desktop

### ProactiveChatInput

**Props:**
- `onSubmit: (message: string) => void`
- `onQuickAction: (actionId: string) => void`

**Behavior:**
- Large text input with placeholder "Ask anything. Or tell me what you want done."
- Quick action buttons below input:
  - Schedule & Plan → prefills "Help me schedule..."
  - Deep Research → prefills "Research..."
  - Analyze Data → prefills "Analyze..."
  - Create → prefills "Create..."
  - Automate → prefills "Automate..."
  - More → dropdown with additional actions
- Submit routes to agent chat (opens AgentChatWidget or navigates)
- Microphone button (future: voice input)
- Send button (arrow up icon)

### ProactiveTaskFeed

**Props:** None (fetches own data)

**Sections:**

1. **Needs Your Input** (ApprovalCard)
   - Uses `InboxItem` from `inbox-list` bridge action
   - Filters by `kind: "approval"` or `kind: "question"`
   - Shows kind icon, title, body preview
   - "Approve" / "Reject" buttons for approvals
   - "Dismiss" for temporary snooze (calls `inbox-resolve` bridge action)

2. **Running in Background** (BackgroundTaskCard)
   - Shows workflow runs with status "running"
   - Progress bar based on completed steps / total steps
   - "Next update" shows estimated time
   - "View progress" opens workflow detail

3. **Coming Up** (UpcomingCard)
   - Combines: scheduled crons (next run time), workflow runs with status "scheduled"
   - Shows scheduled time and brief description
   - Sorted by scheduled time ascending

### ProactiveAgendaSidebar

**Props:** None

**Sections:**

1. **Today's Agenda**
   - Placeholder for calendar integration (future)
   - For now, shows scheduled crons for today with times

2. **Quick Wins**
   - Recent completed actions from logs
   - Filter: `type === 'task_complete' || type === 'auto_action'`
   - Shows last 5 items with checkmark icon
   - Each item: brief description of what was done

## State Management

### New State

```typescript
// In dashboardState (SQLite-backed)
dashboardState.set("proactive-home-view", "proactive" | "widgets");
dashboardState.set("proactive-snoozed-approvals", JSON.stringify(string[])); // approval IDs
```

### Data Fetching

```typescript
// ProactiveHome.tsx
const { projects, loading: projectsLoading } = useProjects();
const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
const [crons, setCrons] = useState<CronJob[]>([]);
const [logs, setLogs] = useState<LogEntry[]>([]);

useEffect(() => {
  // Fetch inbox items (approvals, questions, etc.)
  bridgeInvoke("inbox-list", { status: "pending", limit: 50 }).then(res => {
    const items = (res as { items?: InboxItem[] })?.items || [];
    setInboxItems(items);
  });
  
  // Fetch crons
  bridgeInvoke("get-crons", {}).then(res => {
    if (res?.success) setCrons(res.data);
  });
  
  // Fetch recent logs
  bridgeInvoke("get-logs", { limit: 50 }).then(res => {
    if (res?.success) setLogs(res.data);
  });
}, []);
```

## Styling

- Uses existing Hyperclaw dark theme CSS variables
- Card backgrounds: `hsl(var(--card))` with `border: 1px solid hsl(var(--border))`
- Status badges use semantic colors:
  - Amber for in-progress/needs-attention
  - Emerald for completed/success
  - Red for urgent/overdue
- Glassmorphism on chat input container
- Smooth transitions (200ms) on hover states

## Migration Path

1. Create `ProactiveHome.tsx` as new component
2. Add view toggle to `pages/dashboard.tsx`
3. Default to proactive view for new users
4. Existing users see proactive view but can switch to widgets
5. Preserve all existing widget functionality in `Home.tsx`

## Testing Considerations

- Test with 0 projects, 0 approvals, 0 crons (empty states)
- Test with many items (>20 projects, >10 approvals)
- Test carousel scroll on touch devices
- Test responsive breakpoints
- Test real-time updates when approvals resolve

## Out of Scope

- Calendar integration (Google Calendar, etc.) - future feature
- Voice input - future feature
- Proactive AI suggestions - future feature
- Custom quick actions - future feature
