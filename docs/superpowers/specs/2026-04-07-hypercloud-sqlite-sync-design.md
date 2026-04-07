# Hypercloud SQLite Sync — Design Spec
**Date:** 2026-04-07
**Status:** Approved

---

## Overview

Store all agent data (identity, personality files, tools, token usage, status) in the Hyperclaw connector's SQLite database as the source of truth. Implement two-way real-time sync between runtime files (OpenClaw, Hermes, Claude Code, Codex) and SQLite via a unified SyncEngine. The dashboard fetches everything from SQLite through bridge actions — no more direct OpenClaw gateway WS calls for data.

---

## Goals

- SQLite is the single source of truth for all agent data
- File changes in any runtime are reflected in SQLite within ~300ms
- Dashboard edits propagate back to the agent's assigned runtime file without looping
- Token usage and cost are tracked per agent, per runtime, per session
- Dashboard Analysis section shows cost breakdown by agent and runtime

---

## Architecture

### SyncEngine (`internal/sync/engine.go`)

A single goroutine-safe struct that owns all file ↔ SQLite coordination. Replaces the two existing watchers (`watchOpenClawConfig`, cron watcher) in `cmd/main.go`.

```
SyncEngine
├── store        *store.Store
├── hub          HubNotifier
├── watcher      *fsnotify.Watcher
├── watchRoots   map[string]Runtime     // dir → runtime tag
├── guard        map[string]guardEntry  // path → {hash, expiresAt}
├── guardMu      sync.Mutex
├── debounce     map[string]*time.Timer
└── debounceMu   sync.Mutex
```

**Boot sequence:**
1. Register watch roots: `~/.openclaw/`, `~/.hyperclaw/agents/`, `~/.hermes/profiles/`, `~/.claude/projects/`
2. Cold sync: walk all known agent dirs, hash each file, upsert rows that differ from SQLite
3. Start fsnotify event loop goroutine
4. Remove old standalone watchers from `cmd/main.go`

**Write path (dashboard → file → SQLite, no loop):**
```
bridgeInvoke("save-agent-file", {agentId, fileKey, content})
  → SyncEngine.WriteAgentFile(agentId, fileKey, content)
      → compute hash
      → guard.set(filePath, hash, TTL=3s)
      → write file to agent's assigned runtime path
      → store.UpsertAgentFile(agentId, fileKey, content, hash)
      → hub.Notify("agent.file.changed", {agentId, fileKey})
```

**Read path (fsnotify fires):**
```
fsnotify Write|Create event
  → debounce 300ms
  → SyncEngine.onFileChanged(path)
      → compute hash
      → guard.check(path, hash) → match? skip (our write) : continue
      → store.GetAgentFileHash(agentId, fileKey) → same? skip : continue
      → read file content
      → classify fileKey from path
      → store.UpsertAgentFile(...)
      → if IDENTITY.md → store.UpsertAgentIdentity(...)
      → hub.Notify("agent.file.changed", {agentId, fileKey})
```

**Write-back (SQLite → file):**
When a bridge action updates SQLite, the SyncEngine writes back ONLY to the file path for the agent's `runtime` field (openclaw / hermes / claude-code / codex). Write guard is set before writing to suppress the resulting fsnotify event.

**Infinite loop prevention:**
Write guard stores `{filePath → contentHash, expiresAt}`. When fsnotify fires, the engine hashes the file on disk and checks: if the hash matches the guard entry and the TTL hasn't expired, the event is from our own write — skip. TTL is 3s. Hash comparison is the key: if a human edits the same file within 3s and their content is different, the hash won't match and the update is processed normally.

---

## SQLite Schema Changes

### New table: `agent_identity`
```sql
CREATE TABLE agent_identity (
    id           TEXT PRIMARY KEY,   -- agent_id
    name         TEXT NOT NULL DEFAULT '',
    avatar_data  TEXT NOT NULL DEFAULT '',  -- base64 data URI or empty
    emoji        TEXT NOT NULL DEFAULT '',
    runtime      TEXT NOT NULL DEFAULT 'openclaw',
    updated_at   INTEGER NOT NULL
);
```

### New table: `agent_files`
```sql
CREATE TABLE agent_files (
    agent_id     TEXT NOT NULL,
    file_key     TEXT NOT NULL,   -- SOUL|USER|AGENTS|TOOLS|HEARTBEAT|IDENTITY|MEMORY
    content      TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (agent_id, file_key)
);
CREATE INDEX idx_agent_files_agent ON agent_files(agent_id);
```

### New table: `agent_tools`
```sql
CREATE TABLE agent_tools (
    agent_id               TEXT PRIMARY KEY,
    tools_json             TEXT NOT NULL DEFAULT '[]',
    runtime_overrides_json TEXT NOT NULL DEFAULT '{}',
    updated_at             INTEGER NOT NULL
);
```

### New table: `token_usage`
```sql
CREATE TABLE token_usage (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id          TEXT,      -- nullable: unattributed usage
    runtime           TEXT NOT NULL,
    session_id        TEXT,      -- FK → sessions.id (nullable)
    model             TEXT NOT NULL DEFAULT '',
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd          REAL NOT NULL DEFAULT 0,
    recorded_at       INTEGER NOT NULL
);
CREATE INDEX idx_token_usage_agent   ON token_usage(agent_id);
CREATE INDEX idx_token_usage_runtime ON token_usage(runtime);
CREATE INDEX idx_token_usage_time    ON token_usage(recorded_at);
```

### Model price table: `model_prices` (seeded, not user-editable)
```sql
CREATE TABLE model_prices (
    model            TEXT PRIMARY KEY,
    input_per_1m     REAL NOT NULL,   -- USD per 1M input tokens
    output_per_1m    REAL NOT NULL,
    cache_read_per_1m REAL NOT NULL DEFAULT 0
);
```
Seeded at startup with known model prices (claude-sonnet-4-6, claude-haiku-4-5, gpt-4o, gpt-4o-mini, etc.). Cost is pre-computed on insert into `token_usage`.

---

## Token Usage: Data Sources Per Runtime

| Runtime | Source | Capture method |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` session files — each response turn has a `usage` object | SyncEngine watches dir, parses JSONL on change, inserts token_usage rows for new turns |
| Hermes | `~/.hermes/state.db` — `sessions` table has `estimated_cost_usd`, `message_count` | Periodic sync (60s) reads Hermes state.db, upserts token_usage rows by session ID |
| OpenClaw | Gateway message responses include usage when model provider returns it | Connector intercepts outgoing message responses, extracts usage if present |
| Codex | Session JSONL files (similar to Claude Code) | SyncEngine watches session dir, same JSONL parse approach |

---

## Bridge API Changes

### New actions (connector)

| Action | Input | Returns |
|---|---|---|
| `get-agent-identity` | `{ agentId }` | `AgentIdentity` from `agent_identity` table |
| `get-agent-file` | `{ agentId, fileKey }` | `{ content, updatedAt }` from `agent_files` table |
| `get-agents-full` | `{}` | Agents list joined with identity + cost this month |
| `get-token-usage` | `{ agentId?, runtime?, from?, to?, groupBy? }` | Aggregated cost + token counts |

### Modified actions (connector)

| Action | Change |
|---|---|
| `save-agent-file` | Routes through `SyncEngine.WriteAgentFile()` — sets write guard, writes file, upserts SQLite, fires hub event |
| `save-agent-identity` | Updates `agent_identity` table + writes IDENTITY.md via SyncEngine |
| `delete-agent` | Already updated (previous session) to cascade-delete cron jobs. Now also deletes `agent_identity`, `agent_files`, `agent_tools` rows. |

---

## Dashboard Changes

### Hooks

| Hook | Change |
|---|---|
| `useAgentIdentity` | Replace `gatewayConnection.getAgentIdentity()` with `bridgeInvoke("get-agent-identity")`. Subscribe to `agent.file.changed` hub events to invalidate cache. |
| `useOpenClaw` (agents list) | No change — already reads from SQLite via hub |

### Components

| Component | Change |
|---|---|
| `FileEditorTab` | Replace `bridgeInvoke("get-openclaw-doc")` with `bridgeInvoke("get-agent-file")`. Save calls `save-agent-file`. |
| `AgentDetailDialog` (InfoTab) | Save identity via `save-agent-identity` |
| New: `AnalysisWidget` or Analysis tab | Calls `get-token-usage`, renders cost breakdown by agent + runtime + date range |

### Hub event subscriptions (new)
Dashboard listens for `agent.file.changed` events from the hub. On receipt, invalidates the relevant `useAgentIdentity` / `FileEditorTab` cache entry and re-fetches from SQLite.

---

## Decisions

- **Debounce:** 300ms for file content watchers (fast enough to feel real-time, safe for atomic writes). Existing `openclaw.json` agent-list watcher stays at 2s (heavier re-seed operation).
- **Write-back scope:** Only to the agent's assigned runtime. Cross-runtime writes are not supported.
- **Tools normalization:** One canonical `agent_tools` record per agent. Connector translates to runtime-specific format on write-back.
- **Cost computation:** Pre-computed at insert time from `model_prices` table. Not recomputed retroactively if prices change.
- **Token estimation:** When token counts are unavailable (e.g. Hermes only stores cost), tokens are estimated as `cost / price_per_token` using the stored model price.
- **Cold sync on boot:** Hash-diff only. Files unchanged since last run produce no DB writes.

---

## Out of Scope

- Cross-runtime agent migration (e.g. move an OpenClaw agent to Hermes)
- Budget alerts or cost limits (future feature)
- Retroactive cost recalculation when model prices change
