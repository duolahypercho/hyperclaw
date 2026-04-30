# Intelligence Layer Design Doc

Branch: main | Mode: SCOPE EXPANSION

## Vision

### 10x Check
Turn the intelligence layer from a "database agents write to" into an **AI Knowledge Platform**:
- Shared memory across agents with cross-agent queries
- Natural language query interface (agents don't need SQL — they generate SQL from schema context)
- Self-evolving schema — agents CREATE TABLE / ALTER TABLE freely on a sandboxed `intel.db`
- Schema evolution tracking with auto-backup before DDL
- Data freshness & attribution baked into every query result
- Real-time agent status via existing push event system
- FTS5-based fuzzy text dedup for research findings
- Dynamic dashboard that auto-discovers and renders any table agents create
- Full CRUD from dashboard (read, create, edit, delete) on any table
- Smart views auto-detected by column patterns (CRM pipeline, charts, etc.)

### Platonic Ideal
The user opens Hyperclaw and sees a living knowledge map. The sidebar lists every table agents have created — companies, contacts, research, content, campaigns, whatever the agents need. Click any table and see a full CRUD data grid. Tables with a `status` column automatically offer a CRM pipeline view. Tables with `metric`/`value`/`period` columns offer charts. Schema grows organically as agents encounter new entity types. No dashboard code changes needed when agents create new tables.

## Key Architectural Decisions
1. **Separate `intel.db`** (not `connector.db`) — isolates intelligence data from task infrastructure
2. **Full relay path** — Dashboard reads/writes intel.db through Hub relay chain (same as connector.db)
3. **Agent-side SQL generation** — no plugin-side LLM calls. Agents call `intel_schema` then generate SQL themselves
4. **Generic relay already works** — Hub/Connector forward arbitrary commands. No Hub/Connector code changes needed
5. **Parameterized insert/update/delete** — prevents SQL injection from agent-ingested external content
6. **FTS5 fuzzy text dedup** — built-in SQLite, no external API dependencies (graceful degradation if unavailable)
7. **Dynamic dashboard** — no hardcoded tabs. Sidebar lists all tables from `intel_schema`. Generic table renderer works for any table.
8. **Smart views** — auto-detected by column patterns (status column → CRM pipeline, metric/value → charts)
9. **Real-time data push** — intel writes fire `hyperclaw_notify` events so dashboard updates instantly
10. **`stmt.reader`** for SQL read-only enforcement (not string checking) — from eng review
11. **`PRAGMA foreign_keys=ON`** — actually enforce FK constraints
12. **Worker-thread query timeout** — true 5s timeout via Worker threads (better-sqlite3 is synchronous)
13. **Comprehensive SQL blocklist** — DROP *, CREATE/DROP TRIGGER, ATTACH/DETACH, PRAGMA writable_schema, VACUUM INTO, load_extension

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    HyperClaw App (Electron)                       │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Intelligence Page (dynamic)                    │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌──────────────────────────────────────┐ │  │
│  │  │ Sidebar     │  │ Main View                            │ │  │
│  │  │ (from       │  │                                      │ │  │
│  │  │  intel_     │  │ Default: Generic Data Grid (CRUD)    │ │  │
│  │  │  schema)    │  │   - sortable, filterable columns     │ │  │
│  │  │             │  │   - inline edit, add row, delete row  │ │  │
│  │  │ ○ companies │  │   - freshness badges per row         │ │  │
│  │  │ ○ contacts  │  │   - agent attribution                │ │  │
│  │  │ ○ research  │  │                                      │ │  │
│  │  │ ○ metrics   │  │ Smart Views (auto-detected):         │ │  │
│  │  │ ○ content*  │  │   - [Pipeline] if status column      │ │  │
│  │  │ ○ campaigns*│  │   - [Chart] if metric/value/period   │ │  │
│  │  │   (* agent  │  │   - [Timeline] if created_at heavy   │ │  │
│  │  │    created) │  │                                      │ │  │
│  │  │             │  │ Toggle: Grid | Smart View             │ │  │
│  │  │ ─────────── │  │                                      │ │  │
│  │  │ SQL Console │  │                                      │ │  │
│  │  └─────────────┘  └──────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Agent Status Strip (bottom bar, persistent)                   ││
│  │ 🟢 Elon — "Researching Genspark"  💤 Clio — idle  🔴 Echo   ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│                  bridgeInvoke() ←── notify events (real-time)     │
│                         │                                         │
└─────────────────────────┼─────────────────────────────────────────┘
                          │
                   hubCommand() [generic passthrough]
                          │
┌─────────────────────────┼─────────────────────────────────────────┐
│                    Hub (Go, :8080)                                 │
│            REST API + WebSocket relay                              │
│    Forwards all commands as opaque JSON — no changes needed       │
└─────────────────────────┼─────────────────────────────────────────┘
                          │ WebSocket
┌─────────────────────────┼─────────────────────────────────────────┐
│               Connector (Go daemon)                               │
│        Forwards all commands to gateway — no changes needed       │
└─────────────────────────┼─────────────────────────────────────────┘
                          │ local WS/HTTP
┌─────────────────────────┼─────────────────────────────────────────┐
│            OpenClaw Gateway (:18789)                               │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              HyperClaw Plugin                                 │ │
│  │                                                               │ │
│  │  Existing:               New:                                 │ │
│  │  ┌──────────────┐       ┌──────────────────────────────────┐ │ │
│  │  │ connector.db │       │ intel.db (separate)              │ │ │
│  │  │ tasks,       │       │ seeded: companies, contacts,     │ │ │
│  │  │ sessions,    │       │   interactions, research,        │ │ │
│  │  │ kv, logs     │       │   metrics, agent_status          │ │ │
│  │  └──────────────┘       │ system: _schema_history          │ │ │
│  │                         │ FTS5: research_fts + 3 triggers  │ │ │
│  │                         │ + any agent-created tables       │ │ │
│  │                         └──────────────────────────────────┘ │ │
│  │                                                               │ │
│  │  Tools (existing):       Tools (new — 7 total):               │ │
│  │  - hyperclaw_add_task    - hyperclaw_intel_query   (read)     │ │
│  │  - hyperclaw_get_tasks   - hyperclaw_intel_execute (write)    │ │
│  │  - hyperclaw_notify      - hyperclaw_intel_schema  (inspect)  │ │
│  │  - ...14 more            - hyperclaw_intel_insert  (safe)     │ │
│  │                          - hyperclaw_intel_update  (safe)     │ │
│  │                          - hyperclaw_intel_delete  (safe)     │ │
│  │                          - hyperclaw_update_agent_status      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
                          │ called by
          ┌───────────────┼───────────────┐
     ┌────┴────┐    ┌─────┴────┐   ┌──────┴─────┐
     │  Elon   │    │   Clio   │   │   Echo     │
     │ research│    │  reddit  │   │  x/twitter │
     │  + CRM  │    │ sentiment│   │  signals   │
     └─────────┘    └──────────┘   └────────────┘
```

## Tool Surface

| Tool | Type | Purpose |
|------|------|---------|
| `hyperclaw_intel_schema` | Read-only | Introspect schema: all tables, columns with types, row counts, freshness stats, indexes |
| `hyperclaw_intel_query` | Read-only | Execute SELECT via `stmt.reader` enforcement. Auto LIMIT 1000. Freshness badges. Markdown formatting. Worker-thread timeout (5s). |
| `hyperclaw_intel_execute` | Guarded write | Raw SQL for DDL + complex writes. Comprehensive blocklist. DDL triggers auto-backup (rotate last 5). Worker-thread timeout (5s). |
| `hyperclaw_intel_insert` | Parameterized | Safe INSERT with table/column validation. FTS5 fuzzy dedup check for research table. Fires notify event. |
| `hyperclaw_intel_update` | Parameterized | Safe UPDATE with table/column validation. Fires notify event. |
| `hyperclaw_intel_delete` | Parameterized | Safe DELETE with table/column validation. Requires `where` clause. Fires notify event. |
| `hyperclaw_update_agent_status` | Write + Push | Updates agent_status table + fires hyperclaw_notify event for real-time dashboard. |

## Safety Layer

### Read-only enforcement (`intel_query`)
Uses `stmt.reader` property from better-sqlite3 — a boolean that is true only if the prepared statement doesn't modify the database. This catches all bypass vectors (WITH, EXPLAIN, comments, multi-statement, CTEs) that string checking would miss.

```ts
const stmt = db.prepare(sql);
if (!stmt.reader) {
  return { error: "Blocked: only read-only queries allowed" };
}
```

### Write guardrails (`intel_execute`)
Comprehensive blocklist applied before execution:
- `DROP TABLE`, `DROP INDEX`, `DROP VIEW`, `DROP TRIGGER`
- `ATTACH DATABASE`, `DETACH DATABASE`
- `PRAGMA writable_schema`
- `VACUUM INTO` (can write files to arbitrary paths)
- `CREATE TRIGGER` (persistence — could add destructive side effects to future inserts)
- `load_extension` (arbitrary code execution)
- `DELETE` without `WHERE` clause (prevents accidental table wipes)

DDL statements (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`) are allowed but trigger:
1. Auto-backup of intel.db (rotate last 5 backups)
2. Log entry in `_schema_history` table

### Parameterized tools (`intel_insert`, `intel_update`, `intel_delete`)
- Table and column names are validated against the actual schema via `sqlite_master` + `PRAGMA table_info`
- Values are passed as parameters (never interpolated into SQL)
- Prevents SQL injection through both values AND identifiers
- `intel_delete` requires a `where` object (cannot delete without conditions)

### Worker-thread query timeout
All SQL execution runs in a Node.js Worker thread with a 5s kill timer. If the timer fires, the worker is terminated and a timeout error is returned. This is necessary because better-sqlite3 is synchronous and would otherwise block the event loop indefinitely on slow queries.

### Database-level safety
- `PRAGMA journal_mode = WAL` — concurrent reads + single writer
- `PRAGMA busy_timeout = 5000` — retry on lock contention
- `PRAGMA foreign_keys = ON` — enforce FK constraints (SQLite ignores them by default)

## Real-time Data Push

Every intel write (insert, update, delete) fires a `hyperclaw_notify` event with:
```json
{
  "type": "intel_change",
  "table": "companies",
  "action": "insert",
  "row_id": "genspark",
  "agent_id": "elon"
}
```

The dashboard subscribes to these events and refreshes the affected table view. This means:
- Agent writes → dashboard updates instantly (no polling)
- Agent status changes → status strip updates instantly (already planned)
- Dashboard loads full data on page open, then stays current via events

## Dynamic Dashboard

### No hardcoded tabs
The sidebar lists all tables returned by `hyperclaw_intel_schema`. When agents create new tables (content, campaigns, investors, etc.), they appear automatically. Zero dashboard code changes needed.

### Generic Data Grid (default view for all tables)
One reusable component that renders any table:
- Column headers from schema introspection
- Sortable, filterable columns
- Inline cell editing → calls `intel_update`
- Add row button → calls `intel_insert`
- Delete row button → calls `intel_delete`
- Freshness badges (fresh/aging/stale based on `updated_at` or `created_at`)
- Agent attribution badges (from `created_by` column, if present)

### Smart Views (auto-detected by column patterns)
When a table's schema matches certain patterns, offer an enhanced view as a toggle:

| Pattern | Smart View | Example |
|---------|-----------|---------|
| Has `status` column with enum-like values | CRM Pipeline (drag-and-drop Kanban) | contacts, leads |
| Has `metric` + `value` + `period` columns | Chart/Sparkline view | metrics |
| Has `created_at` + `content` columns | Timeline/Feed view | interactions |
| Has `company_id` FK | Grouped-by-company view | research, contacts |

Smart views are an overlay — the data grid is always available as fallback. Toggle between `Grid | Pipeline | Chart` etc.

### SQL Console
Always available in the sidebar. Raw SQL input with:
- Schema autocomplete (table/column names from `intel_schema`)
- Results as markdown table
- Query history (last 20 queries, stored in localStorage)

## Seeded Schema

### companies
```sql
CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,           -- slug: "genspark", "abbi-labs"
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'other', -- competitor | lead | partner | other
  industry    TEXT,
  url         TEXT,
  arr         TEXT,
  employee_count TEXT,
  stage       TEXT,
  notes       TEXT,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_type ON companies(type);
```

### contacts
```sql
CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,
  company_id  TEXT REFERENCES companies(id),
  name        TEXT NOT NULL,
  role        TEXT,
  channel     TEXT,
  handle      TEXT,
  status      TEXT DEFAULT 'lead',        -- lead | engaged | customer | churned
  notes       TEXT,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
```

### interactions
```sql
CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  TEXT REFERENCES contacts(id),
  company_id  TEXT REFERENCES companies(id),
  type        TEXT NOT NULL,               -- signal | outreach | reply | meeting | mention
  channel     TEXT,                        -- x | reddit | email | discord
  content     TEXT NOT NULL,
  source_url  TEXT,
  sentiment   TEXT,                        -- positive | neutral | negative
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_company ON interactions(company_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);
```

### research
```sql
CREATE TABLE IF NOT EXISTS research (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  TEXT REFERENCES companies(id),
  topic       TEXT NOT NULL,
  finding     TEXT NOT NULL,
  evidence    TEXT,
  source      TEXT,
  source_url  TEXT,
  confidence  TEXT DEFAULT 'medium',
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_company ON research(company_id);
CREATE INDEX IF NOT EXISTS idx_research_topic ON research(topic);
CREATE INDEX IF NOT EXISTS idx_research_agent ON research(created_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_dedup ON research(company_id, topic, finding);
```

### research FTS5 (fuzzy text dedup)
Created conditionally — graceful degradation if FTS5 is unavailable.
```sql
-- Only created if FTS5 is available (checked at init time)
CREATE VIRTUAL TABLE IF NOT EXISTS research_fts USING fts5(
  finding, content=research, content_rowid=id
);

-- Sync triggers (created during DB init, NOT by agents)
CREATE TRIGGER IF NOT EXISTS research_ai AFTER INSERT ON research BEGIN
  INSERT INTO research_fts(rowid, finding) VALUES (new.id, new.finding);
END;

CREATE TRIGGER IF NOT EXISTS research_ad AFTER DELETE ON research BEGIN
  INSERT INTO research_fts(research_fts, rowid, finding) VALUES('delete', old.id, old.finding);
END;

CREATE TRIGGER IF NOT EXISTS research_au AFTER UPDATE ON research BEGIN
  INSERT INTO research_fts(research_fts, rowid, finding) VALUES('delete', old.id, old.finding);
  INSERT INTO research_fts(rowid, finding) VALUES (new.id, new.finding);
END;
```

### metrics
```sql
CREATE TABLE IF NOT EXISTS metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  metric      TEXT NOT NULL,
  value       REAL NOT NULL,
  unit        TEXT,
  source      TEXT,
  period      TEXT,
  notes       TEXT,
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metrics_metric ON metrics(metric);
CREATE INDEX IF NOT EXISTS idx_metrics_period ON metrics(period);
```

### agent_status
```sql
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id    TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'idle',  -- idle | active | error | sleeping
  current_task TEXT,
  last_result  TEXT,
  error_msg    TEXT,
  started_at   INTEGER,
  updated_at   INTEGER NOT NULL
);
```

### _schema_history (system table)
```sql
CREATE TABLE IF NOT EXISTS _schema_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT,
  ddl         TEXT NOT NULL,
  table_name  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schema_history_table ON _schema_history(table_name);
```

## Implementation Files

**Plugin (extensions/hyperclaw/):**
- `bridge.ts` — shared `initDb()` helper, new `getIntelDb()`, intel CRUD methods, safety layer, FTS5 setup, worker-thread timeout wrapper
- `index.ts` — 7 new tool registrations

**Dashboard UI:**
- `pages/Tool/Intelligence.tsx` — Tool page (follows Docs.tsx pattern)
- `components/Tool/Intelligence/` — Dynamic intelligence view:
  - `IntelligencePage.tsx` — Main layout with sidebar + content area
  - `TableSidebar.tsx` — Dynamic table list from intel_schema
  - `DataGrid.tsx` — Generic CRUD table renderer (works for any table)
  - `SmartViewDetector.ts` — Pattern matching on column schemas
  - `PipelineView.tsx` — CRM drag-and-drop (for tables with status column)
  - `ChartView.tsx` — Sparkline/chart view (for tables with metric/value/period)
  - `SqlConsole.tsx` — Raw SQL query interface
- `components/Home/widgets/IntelWidget.tsx` — Dashboard widget (follows DocsWidget pattern)
- `components/AgentStatusStrip.tsx` — Persistent bottom bar, subscribes to notify events

**Agent configs (outside this repo):**
- SOUL.md updates for Elon, Clio, Echo
- `hyperclaw-os` skill update

## Implementation Order

| Step | What | Effort (CC) | Depends On |
|------|------|-------------|------------|
| 1 | Shared `initDb()` helper + `getIntelDb()` + seeded tables + FTS5 in bridge.ts | ~20 min | — |
| 2 | Worker-thread timeout wrapper in bridge.ts | ~20 min | Step 1 |
| 3 | Safety layer (stmt.reader, blocklist, LIMIT injection, backup) in bridge.ts | ~15 min | Step 1 |
| 4 | Intel CRUD methods (query, execute, insert, update, delete, schema, status) in bridge.ts | ~25 min | Steps 1-3 |
| 5 | 7 tool registrations in index.ts + notify events on writes | ~20 min | Step 4 |
| 6 | Verify tools work via OpenClaw gateway | ~10 min | Step 5 |
| 7 | Dashboard: Dynamic Intelligence page (sidebar + DataGrid + CRUD) | ~1 hour | Step 5 |
| 8 | Dashboard: Smart view detection + PipelineView (CRM drag-and-drop) | ~45 min | Step 7 |
| 9 | Dashboard: ChartView for metrics tables | ~20 min | Step 7 |
| 10 | Dashboard: SQL Console | ~20 min | Step 7 |
| 11 | Dashboard: IntelWidget for home page | ~15 min | Step 7 |
| 12 | Dashboard: Agent Status Strip + real-time notify subscription | ~20 min | Step 5 |
| 13 | Update agent SOUL.md files | ~30 min | Step 6 |
| 14 | Data migration (markdown → intel.db) | ~30 min | Step 6 |
| 15 | CSV/JSON export from DataGrid | ~10 min | Step 7 |

**Total CC estimate: ~5 hours**

## Error & Rescue Map

| Method | Failure | Rescue | Agent/User Sees |
|--------|---------|--------|-----------------|
| getIntelDb() | SQLite not available | Return null, tools return error | "Intel DB not available" |
| getIntelDb() | DB corrupted | Log, attempt restore from backup | Error + suggestion to check backups |
| getIntelDb() | FTS5 unavailable | Skip FTS5 creation, set flag | Research insert works (exact dedup only) |
| intel_query | Bad SQL | Catch SQLITE_ERROR | "SQL error: {message}" |
| intel_query | Non-read-only | stmt.reader=false | "Blocked: only read-only queries allowed" |
| intel_query | >1000 rows | Auto LIMIT | Truncated results + warning + total_count |
| intel_query | Slow query | Worker-thread 5s timeout | "Query timed out after 5s" |
| intel_execute | Blocked statement | Comprehensive blocklist | "Blocked: {statement_type} not allowed" |
| intel_execute | DELETE no WHERE | Safety check | "Blocked: DELETE requires WHERE clause" |
| intel_execute | DDL backup fails | Log warning, proceed | Warning in result |
| intel_insert | Invalid table name | Schema validation | "Table '{name}' does not exist" |
| intel_insert | Invalid column | Schema validation | "Column '{name}' not found in {table}" |
| intel_insert | UNIQUE violation | Catch SQLITE_CONSTRAINT | "Duplicate: {detail}" |
| intel_insert | FTS5 near-match | Return match info | "{similar_to: existing_row}" |
| intel_insert | FK violation | PRAGMA foreign_keys=ON | "Foreign key constraint failed: {detail}" |
| intel_delete | Missing where clause | Require where param | "Delete requires a where clause" |
| intel_delete | No rows matched | Return changes=0 | "No rows matched the condition" |
| update_agent_status | Notify fails | Log warning, DB write OK | Status updated (notify failed silently) |
| Dashboard | Relay timeout | Show error toast, retain last data | "Failed to load data. Retrying..." |
| CRM drag-drop | Update fails mid-drag | Optimistic revert | Revert card to original position + error toast |
