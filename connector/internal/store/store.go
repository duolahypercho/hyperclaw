// Package store provides a SQLite-backed local data store for the connector.
// Uses modernc.org/sqlite (pure Go) — no CGo, compiles on all platforms.
package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

// Store is the central SQLite-backed data store.
type Store struct {
	db   *sql.DB
	path string
	mu   sync.RWMutex
}

// New opens (or creates) the SQLite database at ~/.hyperclaw/data/connector.db
// and runs all schema migrations.
func New(hyperclawDir string) (*Store, error) {
	dataDir := filepath.Join(hyperclawDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("store: create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "connector.db")

	// SQLite pragmas for performance and reliability
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(wal)&_pragma=busy_timeout(5000)&_pragma=synchronous(normal)&_pragma=foreign_keys(on)", dbPath)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open db: %w", err)
	}

	// WAL permits concurrent readers while a writer is active. Keep the pool
	// bounded so chat lifecycle writes do not starve session/history reads.
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)

	s := &Store{db: db, path: dbPath}

	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: migrate: %w", err)
	}
	if err := s.EnsureInitialProject(); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: seed initial project: %w", err)
	}

	log.Printf("Store: opened %s", dbPath)
	return s, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// DB returns the raw *sql.DB for advanced queries.
func (s *Store) DB() *sql.DB {
	return s.db
}

// migrate runs all schema migrations in order.
func (s *Store) migrate() error {
	// Create migrations table
	if _, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id    INTEGER PRIMARY KEY,
			name  TEXT NOT NULL,
			applied_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`); err != nil {
		return err
	}

	for _, m := range migrations {
		applied, err := s.isMigrationApplied(m.id)
		if err != nil {
			return err
		}
		if applied {
			continue
		}

		log.Printf("Store: applying migration %d: %s", m.id, m.name)
		if err := s.execMigrationSQL(m.id, m.name, m.sql); err != nil {
			return err
		}
		if _, err := s.db.Exec(
			`INSERT INTO _migrations (id, name) VALUES (?, ?)`,
			m.id, m.name,
		); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) isMigrationApplied(id int) (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM _migrations WHERE id = ?`, id).Scan(&count)
	return count > 0, err
}

// execMigrationSQL splits a migration's SQL into individual statements and
// executes them one by one so that a "duplicate column name" error on an
// ALTER TABLE can be treated as a non-fatal warning.
//
// Splitting is done by a simple tokeniser that respects single-quoted string
// literals and -- line comments, so semicolons inside strings (e.g. in
// _schema_doc description values) are not treated as statement delimiters.
func (s *Store) execMigrationSQL(id int, name, sqlBlock string) error {
	for _, stmt := range splitSQLStatements(sqlBlock) {
		if _, err := s.db.Exec(stmt); err != nil {
			errMsg := strings.ToLower(err.Error())
			if strings.Contains(errMsg, "duplicate column name") {
				log.Printf("Store: migration %d (%s): skipping already-present column (%v)", id, name, err)
				continue
			}
			return fmt.Errorf("migration %d (%s): %w", id, name, err)
		}
	}
	return nil
}

// splitSQLStatements splits a block of SQL into individual non-empty statements.
// It honours single-quoted string literals and -- line comments so that
// semicolons embedded in strings or comments are not treated as delimiters.
func splitSQLStatements(sql string) []string {
	var stmts []string
	var cur strings.Builder
	inStr := false  // inside a single-quoted string literal
	inLine := false // inside a -- line comment

	for i := 0; i < len(sql); i++ {
		ch := sql[i]

		if inLine {
			if ch == '\n' {
				inLine = false
				cur.WriteByte(ch)
			} else {
				cur.WriteByte(ch)
			}
			continue
		}

		if inStr {
			cur.WriteByte(ch)
			if ch == '\'' {
				// Handle escaped quote '' inside a string
				if i+1 < len(sql) && sql[i+1] == '\'' {
					cur.WriteByte(sql[i+1])
					i++
				} else {
					inStr = false
				}
			}
			continue
		}

		// Outside string and comment
		if ch == '\'' {
			inStr = true
			cur.WriteByte(ch)
			continue
		}
		if ch == '-' && i+1 < len(sql) && sql[i+1] == '-' {
			inLine = true
			cur.WriteByte(ch)
			continue
		}
		if ch == ';' {
			stmt := strings.TrimSpace(cur.String())
			if stmt != "" {
				stmts = append(stmts, stmt)
			}
			cur.Reset()
			continue
		}
		cur.WriteByte(ch)
	}
	// Trailing statement without trailing semicolon
	if stmt := strings.TrimSpace(cur.String()); stmt != "" {
		stmts = append(stmts, stmt)
	}
	return stmts
}

// migration holds a numbered schema migration.
type migration struct {
	id   int
	name string
	sql  string
}

// migrations — append-only, never modify existing entries.
var migrations = []migration{
	{
		id:   1,
		name: "initial schema",
		sql: `
			-- Tasks (replaces todo.json)
			CREATE TABLE IF NOT EXISTS tasks (
				id         TEXT PRIMARY KEY,
				list_id    TEXT,
				data       TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
			CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);

			-- Task lists
			CREATE TABLE IF NOT EXISTS task_lists (
				id         TEXT PRIMARY KEY,
				data       TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);

			-- Events (replaces events.jsonl)
			CREATE TABLE IF NOT EXISTS events (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				type       TEXT,
				data       TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
			CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

			-- Commands (replaces commands.jsonl)
			CREATE TABLE IF NOT EXISTS commands (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				type       TEXT,
				data       TEXT NOT NULL DEFAULT '{}',
				processed  INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_commands_processed ON commands(processed);

			-- Actions / activity log
			CREATE TABLE IF NOT EXISTS actions (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				action_type TEXT NOT NULL,
				agent_id    TEXT,
				status      TEXT NOT NULL DEFAULT 'pending',
				request     TEXT DEFAULT '{}',
				response    TEXT,
				error_msg   TEXT,
				duration_ms INTEGER,
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_actions_agent ON actions(agent_id);
			CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
			CREATE INDEX IF NOT EXISTS idx_actions_created ON actions(created_at);

			-- Key-value store for misc data (usage, channels, office layout, etc.)
			CREATE TABLE IF NOT EXISTS kv (
				key        TEXT PRIMARY KEY,
				value      TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`,
	},
	{
		id:   2,
		name: "agents table and schema docs",
		sql: `
			-- Agents registry (seeded from openclaw agents list on first run)
			CREATE TABLE IF NOT EXISTS agents (
				id         TEXT PRIMARY KEY,
				name       TEXT NOT NULL,
				role       TEXT NOT NULL DEFAULT '',
				status     TEXT NOT NULL DEFAULT 'idle',
				department TEXT NOT NULL DEFAULT '',
				config     TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
			CREATE INDEX IF NOT EXISTS idx_agents_dept ON agents(department);

			-- Schema documentation table: AI-readable metadata describing every table and column.
			-- Query "SELECT * FROM _schema_doc ORDER BY table_name, sort_order" to understand the DB.
			CREATE TABLE IF NOT EXISTS _schema_doc (
				table_name  TEXT NOT NULL,
				column_name TEXT NOT NULL DEFAULT '',
				description TEXT NOT NULL,
				sort_order  INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (table_name, column_name)
			);

			-- Populate schema docs
			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				-- _migrations
				('_migrations', '', 'Tracks applied schema migrations. Append-only, never delete.', 0),
				('_migrations', 'id', 'Sequential migration number (1, 2, 3...)', 1),
				('_migrations', 'name', 'Human-readable migration description', 2),
				('_migrations', 'applied_at', 'Unix epoch when migration was applied', 3),
				-- _schema_doc
				('_schema_doc', '', 'Self-describing metadata table. Query this first to understand all tables and columns.', 0),
				('_schema_doc', 'table_name', 'Name of the table being described', 1),
				('_schema_doc', 'column_name', 'Column name (empty string = table-level description)', 2),
				('_schema_doc', 'description', 'Human-readable description of the table or column', 3),
				('_schema_doc', 'sort_order', 'Display ordering (0 = table description, 1+ = columns)', 4),
				-- tasks
				('tasks', '', 'Todo/task items assigned to the user or agents. Replaces legacy todo.json.', 0),
				('tasks', 'id', 'Unique 24-char hex ID (8 timestamp + 16 random)', 1),
				('tasks', 'list_id', 'FK to task_lists.id — which list this task belongs to (nullable)', 2),
				('tasks', 'data', 'JSON blob with task fields: title, description, status, priority, tags, etc.', 3),
				('tasks', 'created_at', 'Unix milliseconds when task was created', 4),
				('tasks', 'updated_at', 'Unix milliseconds of last update', 5),
				-- task_lists
				('task_lists', '', 'Named groupings of tasks (e.g. "Work", "Personal").', 0),
				('task_lists', 'id', 'Unique list ID', 1),
				('task_lists', 'data', 'JSON blob with list metadata: name, color, icon, etc.', 2),
				('task_lists', 'created_at', 'Unix milliseconds', 3),
				('task_lists', 'updated_at', 'Unix milliseconds', 4),
				-- events
				('events', '', 'System events log (agent actions, status changes, errors). Replaces events.jsonl. Append-only, periodically cleaned up.', 0),
				('events', 'id', 'Auto-incrementing event ID', 1),
				('events', 'type', 'Event type string (e.g. "agent.started", "task.completed")', 2),
				('events', 'data', 'JSON blob with event-specific payload', 3),
				('events', 'created_at', 'Unix milliseconds', 4),
				-- commands
				('commands', '', 'Command queue for agent instructions (e.g. generate_daily_summary). Replaces commands.jsonl.', 0),
				('commands', 'id', 'Auto-incrementing command ID', 1),
				('commands', 'type', 'Command type (e.g. "generate_daily_summary")', 2),
				('commands', 'data', 'JSON blob with command payload', 3),
				('commands', 'processed', '0 = pending, 1 = processed', 4),
				('commands', 'created_at', 'Unix milliseconds', 5),
				-- actions
				('actions', '', 'Activity log tracking bridge action execution. Used for debugging, usage analytics, and performance monitoring.', 0),
				('actions', 'id', 'Auto-incrementing action ID', 1),
				('actions', 'action_type', 'Bridge action name (e.g. "get-team", "cron-run")', 2),
				('actions', 'agent_id', 'Which agent triggered this action (nullable)', 3),
				('actions', 'status', 'Execution status: pending, running, completed, error', 4),
				('actions', 'request', 'JSON blob of the original request params', 5),
				('actions', 'response', 'JSON blob of the action response (nullable)', 6),
				('actions', 'error_msg', 'Error message if status=error (nullable)', 7),
				('actions', 'duration_ms', 'Execution time in milliseconds', 8),
				('actions', 'created_at', 'Unix milliseconds', 9),
				('actions', 'updated_at', 'Unix milliseconds', 10),
				-- kv
				('kv', '', 'General-purpose key-value store for misc data. Keys: local-usage, channels, office-layout, office-seats, orgchart, todo.activeTaskId.', 0),
				('kv', 'key', 'Unique key string', 1),
				('kv', 'value', 'JSON-encoded value', 2),
				('kv', 'updated_at', 'Unix milliseconds of last update', 3),
				-- agents
				('agents', '', 'Registry of OpenClaw AI agents on this device. Seeded from "openclaw agents list" on first run, updated on each startup.', 0),
				('agents', 'id', 'Agent ID (lowercase, e.g. "atlas", "main")', 1),
				('agents', 'name', 'Display name (e.g. "Atlas", "Main")', 2),
				('agents', 'role', 'Agent role/description', 3),
				('agents', 'status', 'Current status: idle, active, busy, offline', 4),
				('agents', 'department', 'Department assignment (engineering, marketing, operations, research)', 5),
				('agents', 'config', 'JSON blob for extra agent metadata (model, workspace path, capabilities)', 6),
				('agents', 'created_at', 'Unix milliseconds when first seen', 7),
				('agents', 'updated_at', 'Unix milliseconds of last update', 8);

			-- View: quick agent activity summary for AI queries
			CREATE VIEW IF NOT EXISTS v_agent_activity AS
			SELECT
				a.id AS agent_id,
				a.name,
				a.status,
				a.department,
				COUNT(act.id) AS total_actions,
				SUM(CASE WHEN act.status = 'completed' THEN 1 ELSE 0 END) AS completed_actions,
				SUM(CASE WHEN act.status = 'error' THEN 1 ELSE 0 END) AS error_actions,
				MAX(act.created_at) AS last_action_at,
				AVG(act.duration_ms) AS avg_duration_ms
			FROM agents a
			LEFT JOIN actions act ON act.agent_id = a.id
			GROUP BY a.id;
		`,
	},
	{
		id:   3,
		name: "cron announces",
		sql: `
			CREATE TABLE IF NOT EXISTS cron_announces (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				cron_id     TEXT NOT NULL,
				agent_id    TEXT,
				session_key TEXT,
				event_type  TEXT NOT NULL,
				category    TEXT NOT NULL DEFAULT 'cron',
				source      TEXT,
				message     TEXT NOT NULL,
				metadata    TEXT,
				created_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_cron_announces_cron ON cron_announces(cron_id);
			CREATE INDEX IF NOT EXISTS idx_cron_announces_agent ON cron_announces(agent_id);
			CREATE INDEX IF NOT EXISTS idx_cron_announces_created ON cron_announces(created_at);
		`,
	},
	{
		id:   4,
		name: "cron announces run_id",
		sql: `
			ALTER TABLE cron_announces ADD COLUMN run_id TEXT;
			CREATE INDEX IF NOT EXISTS idx_cron_announces_run ON cron_announces(run_id);
		`,
	},
	{
		id:   5,
		name: "cron announces full_log and action_count",
		sql: `
			ALTER TABLE cron_announces ADD COLUMN full_log TEXT;
			ALTER TABLE cron_announces ADD COLUMN action_count INTEGER NOT NULL DEFAULT 0;
		`,
	},
	{
		id:   6,
		name: "unified runtime store",
		sql: `
			-- Add runtime column to agents (default 'openclaw' for existing rows)
			ALTER TABLE agents ADD COLUMN runtime TEXT NOT NULL DEFAULT 'openclaw';

			-- Cron job definitions (mirrored from OpenClaw jobs.json and Hermes)
			CREATE TABLE IF NOT EXISTS cron_jobs (
				id         TEXT PRIMARY KEY,
				runtime    TEXT NOT NULL DEFAULT 'openclaw',
				agent_id   TEXT,
				name       TEXT NOT NULL,
				enabled    INTEGER NOT NULL DEFAULT 1,
				raw_json   TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_cron_jobs_runtime ON cron_jobs(runtime);
			CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent ON cron_jobs(agent_id);

			-- Chat sessions across all runtimes
			CREATE TABLE IF NOT EXISTS sessions (
				id         TEXT PRIMARY KEY,
				runtime    TEXT NOT NULL,
				agent_id   TEXT,
				model      TEXT,
				status     TEXT NOT NULL DEFAULT 'active',
				started_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_runtime ON sessions(runtime);
			CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);

			-- Chat messages within sessions
			CREATE TABLE IF NOT EXISTS messages (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL,
				role       TEXT NOT NULL,
				content    TEXT NOT NULL,
				metadata   TEXT DEFAULT '{}',
				created_at INTEGER NOT NULL,
				FOREIGN KEY (session_id) REFERENCES sessions(id)
			);
			CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
			CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

			-- Building sections / configs from OpenClaw and Hermes
			CREATE TABLE IF NOT EXISTS buildings (
				id         TEXT PRIMARY KEY,
				runtime    TEXT NOT NULL,
				type       TEXT NOT NULL,
				name       TEXT NOT NULL,
				raw_json   TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_buildings_runtime ON buildings(runtime);

			-- Runtime health status
			CREATE TABLE IF NOT EXISTS runtime_status (
				runtime    TEXT PRIMARY KEY,
				status     TEXT NOT NULL DEFAULT 'unknown',
				version    TEXT,
				metadata   TEXT DEFAULT '{}',
				checked_at INTEGER NOT NULL
			);

			-- Schema docs for new tables
			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('agents', 'runtime', 'Which runtime this agent belongs to: openclaw, hermes', 9),
				('cron_jobs', '', 'Cron job definitions mirrored from all runtimes. Source of truth remains with each runtime; this is the unified read cache.', 0),
				('cron_jobs', 'id', 'Cron job UUID from the runtime', 1),
				('cron_jobs', 'runtime', 'Source runtime: openclaw, hermes', 2),
				('cron_jobs', 'agent_id', 'Agent assigned to this cron job (nullable)', 3),
				('cron_jobs', 'name', 'Human-readable cron job name', 4),
				('cron_jobs', 'enabled', '1 = enabled, 0 = disabled', 5),
				('cron_jobs', 'raw_json', 'Full JSON object from the runtime (schedule, payload, delivery, state)', 6),
				('cron_jobs', 'created_at', 'Unix milliseconds', 7),
				('cron_jobs', 'updated_at', 'Unix milliseconds', 8),
				('sessions', '', 'Chat sessions across all 4 runtimes (OpenClaw, Claude Code, Codex, Hermes).', 0),
				('sessions', 'id', 'Session ID from the runtime', 1),
				('sessions', 'runtime', 'Source runtime: openclaw, claude-code, codex, hermes', 2),
				('sessions', 'agent_id', 'Agent ID if applicable (nullable)', 3),
				('sessions', 'model', 'Model used for this session (nullable)', 4),
				('sessions', 'status', 'Session status: active, completed, aborted', 5),
				('sessions', 'started_at', 'Unix milliseconds', 6),
				('sessions', 'updated_at', 'Unix milliseconds', 7),
				('messages', '', 'Chat messages within sessions. Ordered by created_at.', 0),
				('messages', 'id', 'Auto-incrementing message ID', 1),
				('messages', 'session_id', 'FK to sessions.id', 2),
				('messages', 'role', 'Message role: user, assistant, system, tool', 3),
				('messages', 'content', 'Message text content', 4),
				('messages', 'metadata', 'JSON blob for extra data (tool calls, token usage, etc.)', 5),
				('messages', 'created_at', 'Unix milliseconds', 6),
				('buildings', '', 'Building sections and configs from OpenClaw and Hermes runtimes.', 0),
				('buildings', 'id', 'Unique building ID', 1),
				('buildings', 'runtime', 'Source runtime: openclaw, hermes', 2),
				('buildings', 'type', 'Building type: skill, config, workspace, etc.', 3),
				('buildings', 'name', 'Human-readable name', 4),
				('buildings', 'raw_json', 'Full JSON config from the runtime', 5),
				('buildings', 'created_at', 'Unix milliseconds', 6),
				('buildings', 'updated_at', 'Unix milliseconds', 7),
				('runtime_status', '', 'Health status of each runtime. Updated by periodic health checks.', 0),
				('runtime_status', 'runtime', 'Runtime name: openclaw, claude-code, codex, hermes', 1),
				('runtime_status', 'status', 'Current status: online, offline, unknown, error', 2),
				('runtime_status', 'version', 'Runtime version string (nullable)', 3),
				('runtime_status', 'metadata', 'JSON blob for extra health info', 4),
				('runtime_status', 'checked_at', 'Unix milliseconds of last health check', 5);
		`,
	},
	{
		id:   8,
		name: "inbox items",
		sql: `
			-- Inbox items: anything requiring a human decision (agent action approvals,
			-- work review requests, etc.). Single place for all human-action-required items.
			CREATE TABLE IF NOT EXISTS inbox_items (
				id              INTEGER PRIMARY KEY AUTOINCREMENT,
				agent_id        TEXT NOT NULL,
				kind            TEXT NOT NULL DEFAULT 'info',
				title           TEXT NOT NULL,
				body            TEXT,
				context_json    TEXT,
				task_id         TEXT,
				status          TEXT NOT NULL DEFAULT 'pending',
				resolution_note TEXT,
				created_at      INTEGER NOT NULL,
				updated_at      INTEGER NOT NULL,
				resolved_at     INTEGER,
				FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
			);
			CREATE INDEX IF NOT EXISTS idx_inbox_status   ON inbox_items(status);
			CREATE INDEX IF NOT EXISTS idx_inbox_agent    ON inbox_items(agent_id);
			CREATE INDEX IF NOT EXISTS idx_inbox_task     ON inbox_items(task_id);
			CREATE INDEX IF NOT EXISTS idx_inbox_created  ON inbox_items(created_at);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('inbox_items', '', 'Unified human-action queue. Agents write here when they need approval or a human to review work. Resolving an item with status=approved and a task_id automatically moves that task to completed.', 0),
				('inbox_items', 'id', 'Auto-incrementing item ID', 1),
				('inbox_items', 'agent_id', 'Agent that created this item', 2),
				('inbox_items', 'kind', 'Item type: approval, review, info, alert', 3),
				('inbox_items', 'title', 'Short summary shown in the inbox list', 4),
				('inbox_items', 'body', 'Full description / message body (markdown ok)', 5),
				('inbox_items', 'context_json', 'JSON blob with extra context (file paths, diffs, URLs, etc.)', 6),
				('inbox_items', 'task_id', 'FK to tasks.id — if set, approving this item moves the task to completed', 7),
				('inbox_items', 'status', 'Current status: pending, approved, rejected, dismissed', 8),
				('inbox_items', 'resolution_note', 'Human note written when resolving', 9),
				('inbox_items', 'created_at', 'Unix milliseconds', 10),
				('inbox_items', 'updated_at', 'Unix milliseconds', 11),
				('inbox_items', 'resolved_at', 'Unix milliseconds when resolved (nullable)', 12);
		`,
	},
	{
		id:   7,
		name: "agent events",
		sql: `
			CREATE TABLE IF NOT EXISTS agent_events (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				agent_id    TEXT NOT NULL,
				run_id      TEXT NOT NULL DEFAULT '',
				session_key TEXT NOT NULL DEFAULT '',
				event_type  TEXT NOT NULL,
				status      TEXT NOT NULL DEFAULT '',
				data        TEXT NOT NULL DEFAULT '{}',
				created_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id);
			CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);
			CREATE INDEX IF NOT EXISTS idx_agent_events_created ON agent_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_agent_events_run ON agent_events(run_id);

			-- Schema docs for agent_events
			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('agent_events', '', 'Agent lifecycle events (started, stopped, error, heartbeat, etc.). Append-only, periodically cleaned up.', 0),
				('agent_events', 'id', 'Auto-incrementing event ID', 1),
				('agent_events', 'agent_id', 'Agent that produced this event', 2),
				('agent_events', 'run_id', 'Run/execution ID grouping related events (empty if not part of a run)', 3),
				('agent_events', 'session_key', 'Session key linking to a chat session (empty if not session-related)', 4),
				('agent_events', 'event_type', 'Event type string (e.g. "started", "completed", "error", "heartbeat")', 5),
				('agent_events', 'status', 'Optional status qualifier (e.g. "success", "failed")', 6),
				('agent_events', 'data', 'JSON blob with event-specific payload', 7),
				('agent_events', 'created_at', 'Unix milliseconds when event was recorded', 8);
		`,
	},
	{
		id:   9,
		name: "agent identity",
		sql: `
			CREATE TABLE IF NOT EXISTS agent_identity (
				id           TEXT PRIMARY KEY,
				name         TEXT NOT NULL DEFAULT '',
				avatar_data  TEXT NOT NULL DEFAULT '',
				emoji        TEXT NOT NULL DEFAULT '',
				runtime      TEXT NOT NULL DEFAULT 'openclaw',
				updated_at   INTEGER NOT NULL
			);
		`,
	},
	{
		id:   10,
		name: "agent files",
		sql: `
			CREATE TABLE IF NOT EXISTS agent_files (
				agent_id     TEXT NOT NULL,
				file_key     TEXT NOT NULL,
				content      TEXT NOT NULL DEFAULT '',
				content_hash TEXT NOT NULL DEFAULT '',
				updated_at   INTEGER NOT NULL,
				PRIMARY KEY (agent_id, file_key)
			);
			CREATE INDEX IF NOT EXISTS idx_agent_files_agent ON agent_files(agent_id);
		`,
	},
	{
		id:   11,
		name: "agent tools",
		sql: `
			CREATE TABLE IF NOT EXISTS agent_tools (
				agent_id               TEXT PRIMARY KEY,
				tools_json             TEXT NOT NULL DEFAULT '[]',
				runtime_overrides_json TEXT NOT NULL DEFAULT '{}',
				updated_at             INTEGER NOT NULL
			);
		`,
	},
	{
		id:   12,
		name: "token usage",
		sql: `
			CREATE TABLE IF NOT EXISTS token_usage (
				id                INTEGER PRIMARY KEY AUTOINCREMENT,
				dedup_key         TEXT NOT NULL,
				agent_id          TEXT,
				runtime           TEXT NOT NULL,
				session_id        TEXT,
				model             TEXT NOT NULL DEFAULT '',
				input_tokens      INTEGER NOT NULL DEFAULT 0,
				output_tokens     INTEGER NOT NULL DEFAULT 0,
				cache_read_tokens INTEGER NOT NULL DEFAULT 0,
				cost_usd          REAL NOT NULL DEFAULT 0,
				recorded_at       INTEGER NOT NULL
			);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_dedup   ON token_usage(dedup_key);
			CREATE INDEX        IF NOT EXISTS idx_token_usage_agent   ON token_usage(agent_id);
			CREATE INDEX        IF NOT EXISTS idx_token_usage_runtime ON token_usage(runtime);
			CREATE INDEX        IF NOT EXISTS idx_token_usage_time    ON token_usage(recorded_at);
		`,
	},
	{
		id:   13,
		name: "model prices",
		sql: `
			CREATE TABLE IF NOT EXISTS model_prices (
				model              TEXT NOT NULL,
				input_per_1m       REAL NOT NULL,
				output_per_1m      REAL NOT NULL,
				cache_read_per_1m  REAL NOT NULL DEFAULT 0,
				effective_from     INTEGER NOT NULL,
				PRIMARY KEY (model, effective_from)
			);
		`,
	},
	{
		id:   15,
		name: "agent last seen",
		sql: `
			-- Tracks which agent messages the user has already read.
			-- One row per agent, updated each time the user clicks an agent row.
			CREATE TABLE IF NOT EXISTS agent_last_seen (
				agent_id TEXT PRIMARY KEY,
				ts       INTEGER NOT NULL,       -- unix ms when user last viewed
				msg_text TEXT NOT NULL DEFAULT '' -- text of the last message they saw
			);
		`,
	},
	{
		id:   16,
		name: "agent skills and mcps",
		sql: `
			-- Agent skills (local, per-agent, replaces localStorage in the dashboard)
			CREATE TABLE IF NOT EXISTS agent_skills (
				id          TEXT PRIMARY KEY,
				agent_id    TEXT NOT NULL,
				name        TEXT NOT NULL,
				description TEXT,
				content     TEXT NOT NULL DEFAULT '',
				enabled     INTEGER NOT NULL DEFAULT 1,
				source      TEXT NOT NULL DEFAULT 'custom', -- custom | cloud
				cloud_id    TEXT,
				author      TEXT,
				version     TEXT,
				tags        TEXT NOT NULL DEFAULT '[]',
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_agent_skills_agent   ON agent_skills(agent_id);
			CREATE INDEX IF NOT EXISTS idx_agent_skills_enabled ON agent_skills(enabled);

			-- Agent MCP servers (local, per-agent)
			CREATE TABLE IF NOT EXISTS agent_mcps (
				id             TEXT PRIMARY KEY,
				agent_id       TEXT NOT NULL,
				name           TEXT NOT NULL,
				transport_type TEXT NOT NULL DEFAULT 'stdio',
				command        TEXT,
				args           TEXT NOT NULL DEFAULT '[]',
				url            TEXT,
				headers        TEXT NOT NULL DEFAULT '{}',
				env            TEXT NOT NULL DEFAULT '{}',
				enabled        INTEGER NOT NULL DEFAULT 1,
				created_at     INTEGER NOT NULL,
				updated_at     INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_agent_mcps_agent   ON agent_mcps(agent_id);
			CREATE INDEX IF NOT EXISTS idx_agent_mcps_enabled ON agent_mcps(enabled);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('agent_skills', '', 'Per-agent custom skills stored locally. Replaces dashboard localStorage. source=custom for user-created; source=cloud for marketplace installs.', 0),
				('agent_skills', 'id', 'UUID identifier', 1),
				('agent_skills', 'agent_id', 'Agent this skill belongs to', 2),
				('agent_skills', 'name', 'Human-readable skill name', 3),
				('agent_skills', 'description', 'Short description of what the skill does', 4),
				('agent_skills', 'content', 'Full skill markdown/text content', 5),
				('agent_skills', 'enabled', '1 = active (injected into chats), 0 = disabled', 6),
				('agent_skills', 'source', 'Origin: custom (user-created) or cloud (installed from Hypercho marketplace)', 7),
				('agent_skills', 'cloud_id', 'Hypercho CloudSkill._id if source=cloud', 8),
				('agent_skills', 'author', 'Skill author', 9),
				('agent_skills', 'version', 'Skill version string', 10),
				('agent_skills', 'tags', 'JSON array of tag strings', 11),
				('agent_skills', 'created_at', 'Unix milliseconds', 12),
				('agent_skills', 'updated_at', 'Unix milliseconds', 13),
				('agent_mcps', '', 'Per-agent MCP (Model Context Protocol) server configurations stored locally.', 0),
				('agent_mcps', 'id', 'UUID identifier', 1),
				('agent_mcps', 'agent_id', 'Agent this MCP belongs to', 2),
				('agent_mcps', 'name', 'Human-readable server name', 3),
				('agent_mcps', 'transport_type', 'Transport: stdio | sse | streamable_http', 4),
				('agent_mcps', 'command', 'Executable path for stdio transport', 5),
				('agent_mcps', 'args', 'JSON array of CLI arguments for stdio transport', 6),
				('agent_mcps', 'url', 'Endpoint URL for sse/streamable_http transport', 7),
				('agent_mcps', 'headers', 'JSON object of HTTP headers (sse/http transports)', 8),
				('agent_mcps', 'env', 'JSON object of environment variables', 9),
				('agent_mcps', 'enabled', '1 = active, 0 = disabled', 10),
				('agent_mcps', 'created_at', 'Unix milliseconds', 11),
				('agent_mcps', 'updated_at', 'Unix milliseconds', 12);
		`,
	},
	{
		id:   14,
		name: "projects",
		sql: `
			-- Projects: shared workspaces grouping agents around a goal
			CREATE TABLE IF NOT EXISTS projects (
				id          TEXT PRIMARY KEY,
				name        TEXT NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				emoji       TEXT NOT NULL DEFAULT '📁',
				status      TEXT NOT NULL DEFAULT 'active',
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects(status);
			CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);

			-- Many-to-many: agents ↔ projects
			CREATE TABLE IF NOT EXISTS project_members (
				project_id  TEXT NOT NULL,
				agent_id    TEXT NOT NULL,
				role        TEXT NOT NULL DEFAULT 'contributor',
				added_at    INTEGER NOT NULL,
				PRIMARY KEY (project_id, agent_id),
				FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
			CREATE INDEX IF NOT EXISTS idx_project_members_agent   ON project_members(agent_id);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('projects', '', 'Shared workspaces that group agents around a goal. Agents can belong to many projects; projects can have many agents.', 0),
				('projects', 'id', 'Unique project ID (16-char hex)', 1),
				('projects', 'name', 'Human-readable project name', 2),
				('projects', 'description', 'Optional project description', 3),
				('projects', 'emoji', 'Emoji icon for the project', 4),
				('projects', 'status', 'Project status: active, archived, completed', 5),
				('projects', 'created_at', 'Unix milliseconds', 6),
				('projects', 'updated_at', 'Unix milliseconds', 7),
				('project_members', '', 'Many-to-many join between projects and agents. An agent can belong to multiple projects; a project can have agents from any runtime.', 0),
				('project_members', 'project_id', 'FK to projects.id (CASCADE DELETE)', 1),
				('project_members', 'agent_id', 'Agent ID from agent_identity table (any runtime)', 2),
				('project_members', 'role', 'Member role: owner, contributor, viewer', 3),
				('project_members', 'added_at', 'Unix milliseconds when member was added', 4);
		`,
	},
	{
		id:   17,
		name: "team mode bootstrap and workflows",
		sql: `
			ALTER TABLE projects ADD COLUMN lead_agent_id TEXT;
			ALTER TABLE projects ADD COLUMN team_mode_enabled INTEGER NOT NULL DEFAULT 0;
			ALTER TABLE projects ADD COLUMN default_workflow_template_id TEXT;

			-- Connector-owned runtime bootstrap/sync state
			CREATE TABLE IF NOT EXISTS team_runtime_bootstrap (
				runtime       TEXT PRIMARY KEY,
				status        TEXT NOT NULL,
				detected      INTEGER NOT NULL DEFAULT 0,
				auth_status   TEXT NOT NULL DEFAULT 'unknown',
				sync_status   TEXT NOT NULL DEFAULT 'pending',
				tool_mode     TEXT NOT NULL DEFAULT 'mcp',
				message       TEXT NOT NULL DEFAULT '',
				config_path   TEXT NOT NULL DEFAULT '',
				metadata      TEXT NOT NULL DEFAULT '{}',
				checked_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_team_runtime_bootstrap_status ON team_runtime_bootstrap(status);

			-- Reusable per-project workflow templates
			CREATE TABLE IF NOT EXISTS workflow_templates (
				id            TEXT PRIMARY KEY,
				project_id    TEXT NOT NULL,
				name          TEXT NOT NULL,
				description   TEXT NOT NULL DEFAULT '',
				trigger_examples TEXT NOT NULL DEFAULT '[]',
				status        TEXT NOT NULL DEFAULT 'active',
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL,
				FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_templates_project ON workflow_templates(project_id);

			CREATE TABLE IF NOT EXISTS workflow_template_steps (
				id                 TEXT PRIMARY KEY,
				template_id        TEXT NOT NULL,
				name               TEXT NOT NULL,
				step_type          TEXT NOT NULL,
				depends_on         TEXT NOT NULL DEFAULT '[]',
				preferred_agent_id TEXT,
				preferred_role     TEXT,
				input_schema       TEXT NOT NULL DEFAULT '{}',
				output_schema      TEXT NOT NULL DEFAULT '{}',
				position           INTEGER NOT NULL DEFAULT 0,
				metadata           TEXT NOT NULL DEFAULT '{}',
				FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_template_steps_template ON workflow_template_steps(template_id, position);

			CREATE TABLE IF NOT EXISTS workflow_runs (
				id                  TEXT PRIMARY KEY,
				template_id         TEXT NOT NULL,
				project_id          TEXT NOT NULL,
				status              TEXT NOT NULL,
				started_by          TEXT NOT NULL DEFAULT '',
				current_gate_step_id TEXT,
				input_payload       TEXT NOT NULL DEFAULT '{}',
				created_at          INTEGER NOT NULL,
				updated_at          INTEGER NOT NULL,
				FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE,
				FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id, updated_at);
			CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);

			CREATE TABLE IF NOT EXISTS workflow_step_runs (
				id                  TEXT PRIMARY KEY,
				workflow_run_id     TEXT NOT NULL,
				step_template_id    TEXT NOT NULL,
				name                TEXT NOT NULL,
				step_type           TEXT NOT NULL,
				status              TEXT NOT NULL,
				assigned_agent_id   TEXT NOT NULL DEFAULT '',
				task_id             TEXT NOT NULL DEFAULT '',
				result_json         TEXT NOT NULL DEFAULT '{}',
				error               TEXT NOT NULL DEFAULT '',
				depends_on          TEXT NOT NULL DEFAULT '[]',
				position            INTEGER NOT NULL DEFAULT 0,
				started_at          INTEGER,
				finished_at         INTEGER,
				updated_at          INTEGER NOT NULL,
				FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
				FOREIGN KEY (step_template_id) REFERENCES workflow_template_steps(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run ON workflow_step_runs(workflow_run_id, position);
			CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_status ON workflow_step_runs(status);

			CREATE TABLE IF NOT EXISTS workflow_reports (
				id               TEXT PRIMARY KEY,
				workflow_run_id  TEXT NOT NULL,
				step_run_id      TEXT NOT NULL DEFAULT '',
				agent_id         TEXT NOT NULL DEFAULT '',
				report_kind      TEXT NOT NULL DEFAULT 'status',
				body             TEXT NOT NULL DEFAULT '',
				payload          TEXT NOT NULL DEFAULT '{}',
				created_at       INTEGER NOT NULL,
				FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_reports_run ON workflow_reports(workflow_run_id, created_at);
		`,
	},
	{
		id:   18,
		name: "cron run history and announce channel",
		sql: `
			-- Unified cron run history
			CREATE TABLE IF NOT EXISTS cron_runs (
				id              TEXT PRIMARY KEY,
				cron_id         TEXT NOT NULL,
				runtime         TEXT NOT NULL,
				run_id          TEXT NOT NULL,
				status          TEXT NOT NULL DEFAULT 'pending',
				started_at_ms   INTEGER NOT NULL,
				finished_at_ms  INTEGER,
				duration_ms     INTEGER,
				summary         TEXT,
				full_log        TEXT,
				error_msg       TEXT,
				trigger_source  TEXT NOT NULL DEFAULT 'scheduler'
			);
			CREATE INDEX IF NOT EXISTS idx_cron_runs_cron_id ON cron_runs(cron_id);
			CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON cron_runs(started_at_ms DESC);
			ALTER TABLE cron_jobs ADD COLUMN announce_channel TEXT;
		`,
	},
	{
		id:   19,
		name: "sessions cwd column for project scoping",
		sql: `
			ALTER TABLE sessions ADD COLUMN cwd TEXT NOT NULL DEFAULT '';
			CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('sessions', 'cwd', 'Working directory (project path) the session was spawned from. Empty for pre-migration rows; lazy-backfilled on read for Codex.', 8);
		`,
	},
	{
		id:   20,
		name: "agent primary sessions",
		sql: `
			CREATE TABLE IF NOT EXISTS agent_primary_sessions (
				agent_id    TEXT NOT NULL,
				runtime     TEXT NOT NULL,
				session_key TEXT NOT NULL,
				updated_at  INTEGER NOT NULL,
				PRIMARY KEY (agent_id, runtime)
			);
		`,
	},
	{
		id:   21,
		name: "ensemble rooms",
		sql: `
			CREATE TABLE IF NOT EXISTS ensemble_rooms (
				id         TEXT PRIMARY KEY,
				name       TEXT NOT NULL,
				emoji      TEXT NOT NULL DEFAULT '💬',
				member_ids TEXT NOT NULL DEFAULT '[]',
				created_at INTEGER NOT NULL
			);
		`,
	},
	{
		id:   22,
		name: "room messages",
		sql: `
			CREATE TABLE IF NOT EXISTS room_messages (
				id         TEXT PRIMARY KEY,
				room_id    TEXT NOT NULL,
				role       TEXT NOT NULL,
				agent_id   TEXT NOT NULL DEFAULT '',
				agent_name TEXT NOT NULL DEFAULT '',
				runtime    TEXT NOT NULL DEFAULT '',
				content    TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_room_messages_room_ts
				ON room_messages(room_id, created_at);
		`,
	},
	{
		id:   23,
		name: "stripe revenue snapshots",
		sql: `
			CREATE TABLE IF NOT EXISTS stripe_revenue_snapshots (
				id              INTEGER PRIMARY KEY AUTOINCREMENT,
				computed_at_ms  INTEGER NOT NULL,
				data            TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_stripe_rev_snap_computed
				ON stripe_revenue_snapshots(computed_at_ms);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('stripe_revenue_snapshots', '', 'Historical snapshots of Stripe ARR/MRR (from subscription pull). One row per successful refresh; JSON in data matches kv stripe:arr:cache shape. Used for dashboards and agent context.', 0),
				('stripe_revenue_snapshots', 'id', 'Auto-increment snapshot id', 1),
				('stripe_revenue_snapshots', 'computed_at_ms', 'Unix ms when this snapshot was computed', 2),
				('stripe_revenue_snapshots', 'data', 'JSON: by_currency (annual minor units), by_currency_mrr (monthly minor units), subscriptions, computed_at, stripe_account, live_mode, ttl_seconds', 3);
		`,
	},
	{
		id:   24,
		name: "project issue task metadata and activity",
		sql: `
			ALTER TABLE tasks ADD COLUMN project_id TEXT;
			ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
			ALTER TABLE tasks ADD COLUMN assignee_id TEXT;
			ALTER TABLE tasks ADD COLUMN due_at INTEGER;

			UPDATE tasks
			SET
				project_id = COALESCE(
					NULLIF(json_extract(data, '$.projectId'), ''),
					NULLIF(json_extract(data, '$.project_id'), '')
				),
				status = COALESCE(NULLIF(json_extract(data, '$.status'), ''), 'pending'),
				assignee_id = COALESCE(
					NULLIF(json_extract(data, '$.assignedAgentId'), ''),
					NULLIF(json_extract(data, '$.agentId'), ''),
					NULLIF(json_extract(data, '$.assignee_id'), '')
				),
				due_at = COALESCE(
					CAST(NULLIF(json_extract(data, '$.dueAt'), '') AS INTEGER),
					CAST(NULLIF(json_extract(data, '$.due_at'), '') AS INTEGER),
					unixepoch(NULLIF(json_extract(data, '$.dueDate'), '')) * 1000
				);

			CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
			CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
			CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
			CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);

			CREATE TABLE IF NOT EXISTS task_logs (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				task_id    TEXT NOT NULL,
				agent_id   TEXT,
				type       TEXT NOT NULL DEFAULT 'comment',
				content    TEXT NOT NULL DEFAULT '',
				metadata   TEXT NOT NULL DEFAULT '{}',
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id, created_at);
			CREATE INDEX IF NOT EXISTS idx_task_logs_agent ON task_logs(agent_id, created_at);

			CREATE TABLE IF NOT EXISTS task_sessions (
				task_id     TEXT NOT NULL,
				session_key TEXT NOT NULL,
				linked_at   INTEGER NOT NULL,
				PRIMARY KEY (task_id, session_key)
			);
			CREATE INDEX IF NOT EXISTS idx_task_sessions_task ON task_sessions(task_id, linked_at);
			CREATE INDEX IF NOT EXISTS idx_task_sessions_session ON task_sessions(session_key);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('tasks', 'project_id', 'Optional project id for project-scoped issue boards. Backfilled from data.projectId/project_id.', 10),
				('tasks', 'status', 'Task status indexed for board/list grouping: pending, in_progress, blocked, completed, cancelled.', 11),
				('tasks', 'assignee_id', 'Canonical agent/user assignee id mirrored from task JSON.', 12),
				('tasks', 'due_at', 'Unix milliseconds due date mirrored from task JSON when available.', 13),
				('task_logs', '', 'Durable activity/comment timeline for Todo tasks and project issues.', 0),
				('task_sessions', '', 'Many-to-many links between tasks and runtime sessions.', 0);
		`,
	},
	{
		id:   25,
		name: "sql backed workflow graphs components and charts",
		sql: `
			ALTER TABLE workflow_templates ADD COLUMN category TEXT NOT NULL DEFAULT 'custom';
			ALTER TABLE workflow_templates ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
			ALTER TABLE workflow_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
			ALTER TABLE workflow_templates ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
			ALTER TABLE workflow_templates ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
			ALTER TABLE workflow_templates ADD COLUMN prompt TEXT NOT NULL DEFAULT '';
			ALTER TABLE workflow_templates ADD COLUMN preview TEXT NOT NULL DEFAULT '{}';
			ALTER TABLE workflow_templates ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';

			CREATE TABLE IF NOT EXISTS workflow_graphs (
				id          TEXT PRIMARY KEY,
				project_id  TEXT NOT NULL DEFAULT '',
				template_id TEXT NOT NULL DEFAULT '',
				graph_json  TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
				version     INTEGER NOT NULL DEFAULT 1,
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_graphs_project ON workflow_graphs(project_id, updated_at);
			CREATE INDEX IF NOT EXISTS idx_workflow_graphs_template ON workflow_graphs(template_id);

			CREATE TABLE IF NOT EXISTS workflow_components (
				id          TEXT PRIMARY KEY,
				kind        TEXT NOT NULL,
				name        TEXT NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				icon        TEXT NOT NULL DEFAULT '',
				category    TEXT NOT NULL DEFAULT 'general',
				spec_json   TEXT NOT NULL DEFAULT '{}',
				tags        TEXT NOT NULL DEFAULT '[]',
				source      TEXT NOT NULL DEFAULT 'system',
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_components_kind ON workflow_components(kind);
			CREATE INDEX IF NOT EXISTS idx_workflow_components_category ON workflow_components(category);

			CREATE TABLE IF NOT EXISTS workflow_chart_specs (
				id          TEXT PRIMARY KEY,
				project_id  TEXT NOT NULL DEFAULT '',
				template_id TEXT NOT NULL DEFAULT '',
				step_id     TEXT NOT NULL DEFAULT '',
				name        TEXT NOT NULL,
				chart_type  TEXT NOT NULL DEFAULT 'bar',
				data_source TEXT NOT NULL DEFAULT '{}',
				config_json TEXT NOT NULL DEFAULT '{}',
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_chart_specs_project ON workflow_chart_specs(project_id, updated_at);
			CREATE INDEX IF NOT EXISTS idx_workflow_chart_specs_template ON workflow_chart_specs(template_id);

			CREATE TABLE IF NOT EXISTS workflow_drafts (
				id          TEXT PRIMARY KEY,
				project_id  TEXT NOT NULL DEFAULT '',
				template_id TEXT NOT NULL DEFAULT '',
				name        TEXT NOT NULL,
				source      TEXT NOT NULL DEFAULT 'agent_json',
				draft_json  TEXT NOT NULL DEFAULT '{}',
				warnings    TEXT NOT NULL DEFAULT '[]',
				status      TEXT NOT NULL DEFAULT 'draft',
				created_at  INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_workflow_drafts_project ON workflow_drafts(project_id, updated_at);
			CREATE INDEX IF NOT EXISTS idx_workflow_drafts_status ON workflow_drafts(status);

			INSERT OR IGNORE INTO workflow_components
				(id, kind, name, description, icon, category, spec_json, tags, source, created_at, updated_at)
			VALUES
				('component-trigger-manual', 'trigger', 'Manual trigger', 'Start a workflow by hand from Mission Control or an agent.', 'Zap', 'trigger', '{"stepType":"manual_trigger"}', '["starter","manual"]', 'system', unixepoch() * 1000, unixepoch() * 1000),
				('component-agent-task', 'agent_task', 'Agent task', 'Assign a step to Claude, Codex, OpenClaw, Hermes, or another runtime agent.', 'Bot', 'agent', '{"stepType":"agent_task"}', '["agent","runtime"]', 'system', unixepoch() * 1000, unixepoch() * 1000),
				('component-human-approval', 'human_approval', 'Human approval', 'Pause execution until a user approves or rejects the step.', 'CheckCircle', 'control', '{"stepType":"human_approval"}', '["approval","gate"]', 'system', unixepoch() * 1000, unixepoch() * 1000),
				('component-sql-query', 'sql_query', 'SQL query', 'Read connector SQLite data and pass rows into later steps or chart specs.', 'Database', 'data', '{"stepType":"sql_query"}', '["sql","data"]', 'system', unixepoch() * 1000, unixepoch() * 1000),
				('component-chart', 'chart', 'Chart preview', 'Render a reusable chart spec from SQL or table data.', 'BarChart3', 'visual', '{"stepType":"chart"}', '["chart","visual"]', 'system', unixepoch() * 1000, unixepoch() * 1000),
				('component-notification', 'notification', 'Notification', 'Send the final result to a channel, room, or inbox.', 'Send', 'delivery', '{"stepType":"notification"}', '["delivery","notification"]', 'system', unixepoch() * 1000, unixepoch() * 1000);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('workflow_graphs', '', 'Editable workflow canvas graphs persisted from Mission Control WireBuilder. graph_json stores nodes, edges, positions, and node configs.', 0),
				('workflow_components', '', 'Reusable palette components agents and humans can browse when composing workflows.', 0),
				('workflow_chart_specs', '', 'Reusable chart render specs stored as data and linked to projects, templates, or steps.', 0),
				('workflow_drafts', '', 'Agent or human workflow drafts before they are promoted to executable templates.', 0),
				('workflow_templates', 'category', 'Template category for browsing and filtering.', 20),
				('workflow_templates', 'tags', 'JSON array of template tags.', 21),
				('workflow_templates', 'version', 'Integer version incremented by edits.', 22),
				('workflow_templates', 'visibility', 'Visibility scope: private, team, system.', 23),
				('workflow_templates', 'source', 'Creation source: manual, agent_json, prompt, static_seed.', 24),
				('workflow_templates', 'prompt', 'Prompt used to generate this template when source=prompt.', 25),
				('workflow_templates', 'preview', 'JSON preview data for gallery cards.', 26),
				('workflow_templates', 'metadata', 'JSON metadata for future workflow features.', 27);
		`,
	},
	{
		id:   26,
		name: "workflow template creator attribution",
		sql: `
			ALTER TABLE workflow_templates ADD COLUMN created_by TEXT NOT NULL DEFAULT '';

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('workflow_templates', 'created_by', 'Agent or user identifier that created the workflow template.', 28);
		`,
	},
	{
		id:   27,
		name: "project kind for workflow pages",
		sql: `
			ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'project';
			CREATE INDEX IF NOT EXISTS idx_projects_kind ON projects(kind);

			INSERT OR REPLACE INTO _schema_doc (table_name, column_name, description, sort_order) VALUES
				('projects', 'kind', 'Project kind: project for issue workspaces, workflow for reusable automations.', 8);
		`,
	},
}
