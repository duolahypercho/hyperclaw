# HyperClaw Plan
## Local OpenClaw Cockpit — From Copanion

---

## 📦 What Copanion Already Has (Reuse These!)

| Category | What Exists |
|----------|-------------|
| **Electron Shell** | `electron/main.js`, `preload.js`, build scripts for Mac/Windows |
| **UI Framework** | Next.js + React + Tailwind + shadcn/ui |
| **Animations** | Framer Motion, GSAP, Three.js/Pixi for Live2D |
| **Auth** | NextAuth setup |
| **Components** | 38 components ready — buttons, dialogs, tabs, etc. |
| **Tools System** | Tool registry, renderer, chat integration |
| **State** | OSProvider, context management |

---

## 🎯 HyperClaw Vision

**Turn Copanion from a "Conscious OS" into a local AI agent cockpit that controls OpenClaw.**

| Before (Copanion) | After (HyperClaw) |
|-------------------|-------------------|
| Web-based AI OS | Local desktop app |
| MongoDB backend | File-based (OpenClaw workspace) |
| Abstract "agents" | Real OpenClaw agents |
| Intent-based computing | OpenClaw command center |
| Ambitious 8-phase roadmap | Focused 3-phase MVP |

---

## 🏗️ Architecture

### Two-Way Relay (Current)

```
┌──────────────────────────────────────────────────────────────┐
│                      HyperClaw UI                            │
│  (Next.js + Electron + Tailwind + Framer Motion)            │
│  useHyperClawBridge hook ← fs.watch / polling               │
├───────────────────────┬──────────────────────────────────────┤
│  Electron Main Proc   │  Next.js API Route (dev fallback)   │
│  - IPC handlers       │  - /api/hyperclaw-bridge            │
│  - fs.watch watchers  │  - Same file I/O logic              │
│  - Bridge read/write  │                                     │
├───────────────────────┴──────────────────────────────────────┤
│             ~/.hyperclaw/  (shared file store)               │
│  tasks.json    — task list (both sides read/write)          │
│  events.jsonl  — OpenClaw → HyperClaw event stream          │
│  commands.jsonl — HyperClaw → OpenClaw command queue        │
├──────────────────────────────────────────────────────────────┤
│          OpenClaw Plugin: "hyperclaw"                        │
│  extensions/hyperclaw/index.ts  (linked into OpenClaw)      │
│  Tools: hyperclaw_add_task, hyperclaw_get_tasks,            │
│         hyperclaw_update_task, hyperclaw_delete_task,        │
│         hyperclaw_notify, hyperclaw_read_commands            │
├──────────────────────────────────────────────────────────────┤
│            OpenClaw Gateway + Agents                         │
│  - Agents call hyperclaw_* tools during agent runs          │
│  - Cron scheduler, memory, workspace                        │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

**Outbound (OpenClaw → HyperClaw):**
1. Agent calls `hyperclaw_add_task` / `hyperclaw_notify` during a run
2. Plugin writes to `~/.hyperclaw/todo.json` or `events.jsonl`
3. Electron `fs.watch` detects file change → sends IPC to renderer
4. React `useHyperClawBridge` hook updates UI in real-time

**Inbound (HyperClaw → OpenClaw):**
1. User creates task or sends command in HyperClaw UI
2. Hook calls Electron IPC → writes to `~/.hyperclaw/commands.jsonl`
3. Agent calls `hyperclaw_read_commands` to drain pending commands
4. Agent executes commands and reports back via `hyperclaw_notify`

### Legacy CLI Bridge (Still Available)

```
┌─────────────────────────────────────────────┐
│            OpenClaw CLI Bridge               │
│  - openclaw status / cron list / agents     │
│  - child_process.exec in main process       │
│  - Read-only monitoring                      │
└─────────────────────────────────────────────┘
```

---

## 📋 Features

### Phase 1: Terminal & Command Center

| Feature | Description |
|---------|-------------|
| **Embedded Terminal** | Real PTY via node-pty — run OpenClaw commands |
| **Command Palette** | Quick actions: spawn agent, check status, run cron |
| **Agent List View** | See all agents, status, last activity |
| **Output Stream** | Real-time streaming from agent executions |

### Phase 2: Agent Dashboard

| Feature | Description |
|---------|-------------|
| **Health Monitor** | Agent status, error counts, last run |
| **Memory Browser** | Read MEMORY.md, agent workspaces |
| **Cron Manager** | Enable/disable jobs, see next run |
| **Log Viewer** | Filterable logs from all agents |

### Phase 3: Control Center

| Feature | Description |
|---------|-------------|
| **Spawn Agents** | UI to start/stop/steer agents |
| **File Editor** | Edit workspace files directly |
| **Notifications** | Desktop notifications for alerts |
| **Settings** | Model selection, API keys, paths |

---

## 🗓️ Implementation Plan

### Phase 1: Terminal Shell (Week 1)

**Goal:** Replace Copanion's chat with a terminal that talks to OpenClaw CLI

| Task | Description |
|------|-------------|
| 1.1 | Add `node-pty` to electron/main.js for real terminal |
| 1.2 | Create Terminal component with xterm.js |
| 1.3 | Bridge: spawn OpenClaw CLI process in PTY |
| 1.4 | Stream stdout/stderr to UI in real-time |
| 1.5 | Basic command input + output display |

**Files to modify:**
- `electron/main.js` — add node-pty spawn
- `pages/index.tsx` — replace chat with terminal UI

**Files to create:**
- `components/Terminal.tsx`
- `lib/openclaw-bridge.ts`

---

### Phase 2: Agent Dashboard (Week 2)

**Goal:** Visual overview of all OpenClaw agents

| Task | Description |
|------|-------------|
| 2.1 | Parse `~/.openclaw/workspace/*/SOUL.md` for agent list |
| 2.2 | Fetch cron status via `openclaw cron list` |
| 2.3 | Display agent cards: name, status, last run |
| 2.4 | Health indicators (green/yellow/red) |
| 2.5 | Click to view agent details |

**Files to create:**
- `components/AgentDashboard.tsx`
- `components/AgentCard.tsx`
- `services/agent-service.ts`

---

### Phase 3: Control Panel (Week 3)

**Goal:** Full control over OpenClaw

| Task | Description |
|------|-------------|
| 3.1 | Spawn agent UI (select agent, enter task) |
| 3.2 | Cron enable/disable toggles |
| 3.3 | File browser for workspace |
| 3.4 | Settings panel (model, API key, paths) |
| 3.5 | Desktop notifications for alerts |

**Files to create:**
- `components/SpawnAgentModal.tsx`
- `components/CronManager.tsx`
- `components/FileBrowser.tsx`
- `components/Settings.tsx`

---

## 🔌 OpenClaw CLI Integration

```typescript
// lib/openclaw-bridge.ts
import { spawn } from 'node-pty';
import os from 'os';

export class OpenClawBridge {
  private pty: any;
  
  constructor() {
    this.pty = spawn('openclaw', [], {
      cwd: os.homedir() + '/.openclaw',
      env: process.env,
    });
  }
  
  onData(callback: (data: string) => void) {
    this.pty.onData(callback);
  }
  
  write(command: string) {
    this.pty.write(command + '\r');
  }
  
  resize(cols: number, rows: number) {
    this.pty.resize(cols, rows);
  }
  
  kill() {
    this.pty.kill();
  }
}
```

---

## 📁 File Structure

```
copanion/
├── electron/
│   ├── main.js          # Add node-pty
│   └── preload.js       # Expose bridge to renderer
├── components/
│   ├── Terminal/        # xterm.js terminal
│   ├── Dashboard/       # Agent overview
│   ├── AgentCard.tsx
│   ├── CronManager.tsx
│   ├── FileBrowser.tsx
│   └── Settings.tsx
├── lib/
│   ├── openclaw-bridge.ts   # CLI bridge
│   └── agent-service.ts     # Agent parsing
├── pages/
│   ├── index.tsx        # Terminal view
│   ├── dashboard.tsx   # Agent dashboard
│   └── settings.tsx    # Settings panel
└── package.json        # Add node-pty, xterm.js
```

---

## 🛠️ Dependencies to Add

| Package | Purpose |
|---------|---------|
| `node-pty` | Real terminal (native module) |
| `xterm` | Terminal UI |
| `xterm-addon-fit` | Auto-resize terminal |
| `xterm-addon-web-links` | Clickable links |

---

## ✅ Success Criteria

| Milestone | Metric |
|-----------|--------|
| Week 1 | Can run `openclaw status` in embedded terminal |
| Week 2 | See all agents with live status |
| Week 3 | Spawn agent from UI, see real-time output |

---

## 🚀 Next Steps

1. **Confirm plan** — Is this the right direction?
2. **Start Phase 1** — Add node-pty + terminal to Electron
3. **Iterate** — Ziwen tests, I fix

---

**Let's build HyperClaw.** 🤖
