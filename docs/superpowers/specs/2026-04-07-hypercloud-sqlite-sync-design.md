# Hypercloud SQLite Sync — Design Spec
**Date:** 2026-04-07
**Status:** Approved (rev 2 — Codex review fixes applied)

---

## Overview

SQLite is the **query layer** for all agent data — not a second source of truth. Runtime files (OpenClaw, Hermes, Claude Code, Codex) remain the canonical store for each runtime. The connector's SyncEngine mirrors file state into SQLite so the dashboard can read everything through a single fast interface without hitting individual runtime APIs. Dashboard writes go through the SyncEngine which updates both the file and SQLite atomically.

---

## Goals

- Dashboard reads all agent data from SQLite via bridge actions (no direct gateway WS calls)
- File changes in any runtime are reflected in SQLite within ~300ms
- Dashboard edits propagate back to the agent's assigned runtime file without looping
- Token usage and cost are tracked per agent, per runtime, per session
- Dashboard Analysis section shows cost breakdown by agent and runtime
- Works on macOS, Linux, and Windows

---

## Architecture

### SyncEngine (`internal/sync/engine.go`)

A single goroutine-safe struct that owns all file ↔ SQLite coordination. Replaces the two existing watchers (`watchOpenClawConfig`, cron watcher) in `cmd/main.go`.

```
SyncEngine
├── store        *store.Store
├── hub          HubNotifier
├── watcher      *fsnotify.Watcher
├── watchRoots   map[string]Runtime      // absPath → runtime tag
├── guard        map[string]guardEntry   // absPath → {hash, expiresAt}
├── guardMu      sync.Mutex
├── pendingMu    sync.Mutex
├── pending      map[string]fsnotify.Event  // queued during cold sync
├── coldSyncing  atomic.Bool
├── debounce     map[string]*time.Timer
└── debounceMu   sync.Mutex
```

**Path resolution (cross-platform):**
All watch roots are resolved at startup using `os.UserHomeDir()` + `filepath.Join()`. Hardcoded `~/.openclaw/` style paths are never used in code — only in documentation. This ensures correct behaviour on macOS, Linux, and Windows.

```go
home, _ := os.UserHomeDir()
roots := map[string]Runtime{
    filepath.Join(home, ".openclaw"):         RuntimeOpenClaw,
    filepath.Join(home, ".hyperclaw", "agents"): RuntimeHyperclaw,
    filepath.Join(home, ".hermes", "profiles"):  RuntimeHermes,
    filepath.Join(home, ".claude", "projects"):  RuntimeClaudeCode,
}
```

Paths that do not exist at startup are skipped silently — they are registered when first created (connector polls for new root dirs every 60s and adds watches dynamically).

**Boot sequence (race-safe):**
1. Set `coldSyncing = true` — fsnotify events received during cold sync are queued in `pending` instead of processed
2. Register watch roots (existing dirs only)
3. Cold sync: walk all known agent dirs, hash each file with `sha256`, upsert rows that differ from SQLite
4. Set `coldSyncing = false`
5. Replay queued `pending` events through the normal read path
6. Start fsnotify event loop goroutine

**Serialization model:**
All SyncEngine operations (fsnotify callbacks, bridge write calls, token collection, pending replay) serialize through a single internal `workCh chan func()` processed by one dedicated goroutine. This eliminates the need for per-field mutexes on the hot path. The guard and debounce maps are only accessed from this goroutine. `guardMu` and `debounceMu` are retained for the rare cases where the bridge write path calls guard.set from outside the work goroutine.

**Write path (dashboard → file → SQLite, no loop):**
```
bridgeInvoke("save-agent-file", {agentId, fileKey, content})
  → SyncEngine.WriteAgentFile(agentId, fileKey, content)
      → compute sha256 hash of content (UTF-8 normalized)
      → guard.set(absFilePath, hash, TTL=3s)
      → write file to agent's assigned runtime path (os.WriteFile with 0600)
      → if write fails → remove guard entry → return error (no partial state)
      → store.UpsertAgentFile(agentId, fileKey, content, hash)
      → if DB upsert fails → log warning (file is written; next cold sync will re-sync)
      → hub.Notify("agent.file.changed", {agentId, fileKey, runtime})
```

**Recovery:** File write is the primary operation. If the DB upsert fails, the file is already updated and the next cold sync or fsnotify event will re-sync it. If the file write fails, the guard is removed and the error is returned — no DB write happens.

**Read path (fsnotify fires):**
```
fsnotify Write|Create|Rename event
  → if coldSyncing → queue in pending → return
  → debounce 300ms (reset on each event for same path)
  → SyncEngine.onFileChanged(absPath)
      → if path not in watchRoots subtree → skip
      → read file bytes (retry once on EBUSY/locked)
      → if read fails → log warning → skip (file may be mid-write)
      → compute sha256 hash (UTF-8 normalized)
      → guard.check(absPath, hash) → match + not expired? skip (our write) : continue
      → store.GetAgentFileHash(agentId, fileKey) → same hash? skip : continue
      → classify fileKey from path (basename → SOUL/USER/AGENTS/TOOLS/HEARTBEAT/IDENTITY/MEMORY)
      → store.UpsertAgentFile(agentId, fileKey, content, hash) in transaction
      → if IDENTITY.md → also store.UpsertAgentIdentity(...) in same transaction
      → hub.Notify("agent.file.changed", {agentId, fileKey, runtime})
```

**Write-back (SQLite → file):**
When a bridge action updates SQLite, the SyncEngine writes back ONLY to the file path for the agent's `runtime` field. Other runtimes are read-only mirrors of that agent — they do not receive write-backs. Guard is set before writing.

**Agent deletion — on-disk files:**
`delete-agent` removes DB rows (agent, identity, files, tools, cron jobs) AND moves on-disk workspace directories to a `.trash/` subfolder under the runtime root rather than deleting them immediately. This prevents resurrection on next cold sync and gives the user a recovery path. Trash is not automatically purged.

**Infinite loop guard:**
Guard stores `{absFilePath → sha256Hash, expiresAt}`. On fsnotify event, hash the file on disk. If the hash matches the guard entry and TTL has not expired, skip — this is our own write echo. TTL is 3s. A different hash means a real external edit happened within 3s of our write — process it normally.

**Hashing:**
All hashes use `sha256` on UTF-8 normalized content (LF line endings, no BOM). This ensures consistent hashes across macOS/Linux/Windows regardless of editor newline preferences.

---

## Cross-Platform Support

| Concern | Approach |
|---|---|
| Home directory paths | `os.UserHomeDir()` + `filepath.Join()` everywhere |
| Path separators | `filepath.Join()` / `filepath.ToSlash()` — no hardcoded `/` |
| fsnotify recursive watching | Explicitly walk and register subdirs on startup; watch for `Create` events on dirs to add new subdirs dynamically |
| Atomic save semantics | Handle `Rename` events in addition to `Write` — editors that rename temp → final trigger `Rename`, not `Write` |
| Hermes state.db concurrent read | Open with `?mode=ro&_journal_mode=WAL` and catch `SQLITE_BUSY` — retry once after 200ms |
| File locking on Windows | Retry file read once after 50ms on `ERROR_SHARING_VIOLATION` |
| Case-insensitive filesystems | Normalize all paths to lowercase for guard/debounce map keys on Windows (`strings.ToLower` on `filepath.Clean` result) |

---

## SQLite Schema Changes

### New table: `agent_identity`
```sql
CREATE TABLE agent_identity (
    id           TEXT PRIMARY KEY,   -- agent_id
    name         TEXT NOT NULL DEFAULT '',
    avatar_data  TEXT NOT NULL DEFAULT '',  -- base64 data URI or empty; max ~256KB enforced in Go
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
    content_hash TEXT NOT NULL DEFAULT '',  -- sha256 hex, UTF-8 normalized
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (agent_id, file_key)
);
CREATE INDEX idx_agent_files_agent ON agent_files(agent_id);
```

File content is stored as-is (markdown text). No size limit is enforced in the schema, but the bridge action rejects files over 512KB with a clear error. History/versioning is out of scope.

### New table: `agent_tools`
```sql
CREATE TABLE agent_tools (
    agent_id               TEXT PRIMARY KEY,
    tools_json             TEXT NOT NULL DEFAULT '[]',   -- canonical unified format
    runtime_overrides_json TEXT NOT NULL DEFAULT '{}',  -- per-runtime translated cache
    updated_at             INTEGER NOT NULL
);
```

### New table: `token_usage`
```sql
CREATE TABLE token_usage (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    dedup_key         TEXT NOT NULL UNIQUE,  -- prevents double-counting on re-parse
    agent_id          TEXT,                  -- nullable: unattributed usage
    runtime           TEXT NOT NULL,
    session_id        TEXT,                  -- FK → sessions.id (nullable)
    model             TEXT NOT NULL DEFAULT '',
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd          REAL NOT NULL DEFAULT 0,
    recorded_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_token_usage_dedup   ON token_usage(dedup_key);
CREATE INDEX        idx_token_usage_agent   ON token_usage(agent_id);
CREATE INDEX        idx_token_usage_runtime ON token_usage(runtime);
CREATE INDEX        idx_token_usage_time    ON token_usage(recorded_at);
```

`dedup_key` format per runtime:
- Claude Code / Codex: `{runtime}:{sessionFile}:{turnIndex}` — stable across re-parses
- Hermes: `hermes:{sessionId}` — one row per Hermes session
- OpenClaw: `openclaw:{messageId}` — message ID from gateway response

Inserts use `INSERT OR IGNORE` — re-parsing the same JSONL file never creates duplicates.

**Token usage retention:** Rows older than 90 days are pruned by the existing 6-hour maintenance loop. This prevents unbounded growth.

### Model price table: `model_prices`
```sql
CREATE TABLE model_prices (
    model             TEXT PRIMARY KEY,
    input_per_1m      REAL NOT NULL,
    output_per_1m     REAL NOT NULL,
    cache_read_per_1m REAL NOT NULL DEFAULT 0,
    effective_from    INTEGER NOT NULL  -- Unix ms; allows versioned pricing
);
```
Seeded at startup from an embedded Go map. Price lookups use the row with the highest `effective_from` that is <= `recorded_at`, so historical cost accuracy is preserved when prices change. Cost is pre-computed at insert time.

---

## Token Usage: Data Sources Per Runtime

| Runtime | Source | Dedup key | Notes |
|---|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` — `usage` object per response turn | `claude-code:{file}:{turnIndex}` | Skip turns with no `usage` field rather than estimating |
| Hermes | `~/.hermes/state.db` sessions table — `estimated_cost_usd` | `hermes:{sessionId}` | Open read-only WAL; retry on SQLITE_BUSY |
| OpenClaw | Gateway message response objects — `usage` field when present | `openclaw:{messageId}` | Only insert when usage present; no estimation |
| Codex | Session JSONL files — same format as Claude Code | `codex:{file}:{turnIndex}` | Skip turns with no `usage` field |

Token estimation (dividing cost by price) is explicitly **not used** — it produces misleading numbers. Rows with unknown token counts are inserted with `input_tokens=0, output_tokens=0` but correct `cost_usd` where available.

**Agent attribution:** session → agent mapping uses the existing `sessions` table (`agent_id` column). If `session_id` is present on a `token_usage` row, `agent_id` is back-filled from `sessions.agent_id`. Rows with no session linkage remain `agent_id=NULL` and appear as "Unattributed" in the dashboard.

---

## Bridge API Changes

### New actions (connector)

| Action | Input | Returns |
|---|---|---|
| `get-agent-identity` | `{ agentId }` | `AgentIdentity` from `agent_identity` table |
| `get-agent-file` | `{ agentId, fileKey }` | `{ content, updatedAt }` — error if not found |
| `get-agents-full` | `{}` | Agents list joined with identity + cost this month |
| `get-token-usage` | `{ agentId?, runtime?, from?, to?, groupBy? }` | Aggregated cost + token counts |

### Modified actions (connector)

| Action | Change |
|---|---|
| `save-agent-file` | Routes through `SyncEngine.WriteAgentFile()` — rejects files > 512KB; sets write guard; writes file; upserts SQLite in transaction; fires hub event |
| `save-agent-identity` | Updates `agent_identity` table + writes IDENTITY.md via SyncEngine |
| `delete-agent` | Cascade-deletes DB rows (identity, files, tools, cron jobs) + moves on-disk dirs to `.trash/` |

---

## Dashboard Changes

### Hooks

| Hook | Change |
|---|---|
| `useAgentIdentity` | Replace `gatewayConnection.getAgentIdentity()` with `bridgeInvoke("get-agent-identity")`. Subscribe to hub event `agent.file.changed` where `fileKey === "IDENTITY"` to invalidate and refetch. |
| `useOpenClaw` (agents list) | No change — already reads from SQLite via hub |

### Components

| Component | Change |
|---|---|
| `FileEditorTab` | Replace `bridgeInvoke("get-openclaw-doc")` with `bridgeInvoke("get-agent-file")`. Subscribe to `agent.file.changed` for this agentId + fileKey to show live updates. Save calls `save-agent-file`. |
| `AgentDetailDialog` (InfoTab) | Save identity via `save-agent-identity` |
| New: Analysis tab in AgentChatWidget | Calls `get-token-usage`, renders cost by agent + runtime + date range. Renders "Unattributed" row for NULL agent_id usage. |

### Hub event payload
`agent.file.changed` carries `{ agentId, fileKey, runtime }` so clients can invalidate precisely without broad cache flushes.

---

## Implementation Sequencing

Must be completed in this order to avoid shipping broken/partial data:

1. **Schema migrations** — add all 4 new tables with indexes
2. **SyncEngine core** — boot sequence (with cold sync race fix), fsnotify loop, write guard, serialization goroutine
3. **File → SQLite sync** — agent_files + agent_identity population
4. **Bridge read actions** — `get-agent-identity`, `get-agent-file`
5. **Bridge write actions** — `save-agent-file`, `save-agent-identity` (routes through SyncEngine)
6. **Dashboard hook migration** — `useAgentIdentity` + `FileEditorTab`
7. **Token collection** — Claude Code JSONL parser, Hermes state.db sync, OpenClaw interceptor
8. **token_usage schema + dedup** — only after collectors are working
9. **`get-token-usage` bridge action + Analysis tab** — last, after data is flowing correctly

---

## Decisions

- **SQLite role:** Query layer, not source of truth. Runtime files remain canonical per runtime.
- **Debounce:** 300ms for file content watchers. Agent-list watcher stays at 2s.
- **Write-back scope:** Only to agent's assigned runtime. Other runtimes are read-only mirrors.
- **Hashing:** sha256 on UTF-8-normalized content (LF endings, no BOM). Consistent cross-platform.
- **Cost computation:** Pre-computed at insert time using versioned `model_prices` rows. `effective_from` preserves historical accuracy.
- **Token estimation:** Not used. Unknown token counts stored as 0 rather than guessed.
- **Deletion:** DB cascade + on-disk dirs moved to `.trash/` (not deleted outright).
- **Cold sync race:** Events queued during cold sync, replayed after.
- **Serialization:** Single work goroutine processes all sync operations.
- **File size limit:** 512KB max enforced by bridge action before write.
- **Token retention:** 90-day pruning via existing maintenance loop.

---

## Out of Scope

- Cross-runtime agent migration
- Budget alerts or cost limits
- Retroactive cost recalculation (versioned pricing handles forward accuracy)
- Compression or history for `agent_files` content
- Access control or secret redaction on ingested files
