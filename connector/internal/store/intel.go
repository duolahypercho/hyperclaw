package store

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const maxJavaScriptSafeInteger = int64(1<<53 - 1)

// IntelStore manages the separate intel.db for the intelligence layer.
type IntelStore struct {
	db   *sql.DB
	path string
	dir  string // ~/.hyperclaw directory
	mu   sync.RWMutex
}

// NewIntelStore opens (or creates) intel.db with seeded tables.
// The database is stored at ~/.hyperclaw/data/intel.db.
func NewIntelStore(hyperclawDir string) (*IntelStore, error) {
	dataDir := filepath.Join(hyperclawDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("intel: create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "intel.db")
	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(wal)&_pragma=busy_timeout(5000)&_pragma=synchronous(normal)&_pragma=foreign_keys(on)",
		dbPath,
	)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("intel: open db: %w", err)
	}
	db.SetMaxOpenConns(1)

	s := &IntelStore{db: db, path: dbPath, dir: hyperclawDir}
	if err := s.seed(); err != nil {
		db.Close()
		return nil, fmt.Errorf("intel: seed: %w", err)
	}

	log.Printf("IntelStore: opened %s", dbPath)
	return s, nil
}

func (s *IntelStore) Close() error { return s.db.Close() }
func (s *IntelStore) DB() *sql.DB  { return s.db }

// seed creates all seeded tables and indexes.
func (s *IntelStore) seed() error {
	// Only contacts + research as starting tables;
	// agents can CREATE TABLE for anything else they need.
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS contacts (
			id          TEXT PRIMARY KEY,
			name        TEXT NOT NULL,
			role        TEXT,
			company     TEXT,
			channel     TEXT,
			handle      TEXT,
			status      TEXT DEFAULT 'lead',
			notes       TEXT,
			created_by  TEXT,
			created_at  INTEGER NOT NULL,
			updated_at  INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);

		CREATE TABLE IF NOT EXISTS research (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
		CREATE INDEX IF NOT EXISTS idx_research_topic ON research(topic);
		CREATE INDEX IF NOT EXISTS idx_research_agent ON research(created_by);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_research_dedup ON research(topic, finding);

		CREATE TABLE IF NOT EXISTS opportunities (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			research_id     INTEGER REFERENCES research(id),
			title           TEXT NOT NULL,
			description     TEXT,
			category        TEXT DEFAULT 'general',
			ai_score        INTEGER DEFAULT 0,
			human_score     INTEGER,
			status          TEXT DEFAULT 'new',
			assigned_agent  TEXT,
			created_by      TEXT,
			created_at      INTEGER NOT NULL,
			updated_at      INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
		CREATE INDEX IF NOT EXISTS idx_opportunities_score  ON opportunities(ai_score DESC);

`)
	return err
}

// ---------- Schema introspection ----------

type ColumnInfo struct {
	Name    string  `json:"name"`
	Type    string  `json:"type"`
	NotNull bool    `json:"notnull"`
	Default *string `json:"default"`
	PK      bool    `json:"pk"`
}

type TableInfo struct {
	Columns   []ColumnInfo             `json:"columns"`
	RowCount  int                      `json:"row_count"`
	Freshness map[string]interface{}   `json:"freshness"`
	Indexes   []map[string]interface{} `json:"indexes"`
}

func (s *IntelStore) Schema() (map[string]*TableInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tableNames []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		tableNames = append(tableNames, name)
	}

	result := make(map[string]*TableInfo)
	for _, name := range tableNames {
		info := &TableInfo{}

		// Columns
		colRows, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(\"%s\")", name))
		if err != nil {
			continue
		}
		var hasUpdatedAt, hasCreatedAt bool
		for colRows.Next() {
			var cid int
			var colName, colType string
			var notNull, pk int
			var dflt sql.NullString
			if err := colRows.Scan(&cid, &colName, &colType, &notNull, &dflt, &pk); err != nil {
				continue
			}
			var dfltPtr *string
			if dflt.Valid {
				dfltPtr = &dflt.String
			}
			info.Columns = append(info.Columns, ColumnInfo{
				Name: colName, Type: colType, NotNull: notNull != 0, Default: dfltPtr, PK: pk != 0,
			})
			if colName == "updated_at" {
				hasUpdatedAt = true
			}
			if colName == "created_at" {
				hasCreatedAt = true
			}
		}
		colRows.Close()

		// Row count
		var count int
		s.db.QueryRow(fmt.Sprintf("SELECT count(*) FROM \"%s\"", name)).Scan(&count)
		info.RowCount = count

		// Freshness
		timeCol := ""
		if hasUpdatedAt {
			timeCol = "updated_at"
		} else if hasCreatedAt {
			timeCol = "created_at"
		}
		if timeCol != "" && count > 0 {
			var oldest, newest sql.NullInt64
			s.db.QueryRow(
				fmt.Sprintf("SELECT MIN(\"%s\"), MAX(\"%s\") FROM \"%s\"", timeCol, timeCol, name),
			).Scan(&oldest, &newest)
			if oldest.Valid {
				info.Freshness = map[string]interface{}{
					"oldest": oldest.Int64, "newest": newest.Int64, "column": timeCol,
				}
			}
		}

		// Indexes
		idxRows, err := s.db.Query(fmt.Sprintf("PRAGMA index_list(\"%s\")", name))
		if err == nil {
			for idxRows.Next() {
				var seq int
				var idxName, origin string
				var unique, partial int
				if err := idxRows.Scan(&seq, &idxName, &unique, &origin, &partial); err != nil {
					continue
				}
				info.Indexes = append(info.Indexes, map[string]interface{}{
					"name": idxName, "unique": unique != 0,
				})
			}
			idxRows.Close()
		}

		result[name] = info
	}
	return result, nil
}

// ---------- Read-only query (SELECT only) ----------

func (s *IntelStore) Query(sqlStr string) (map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Auto-inject LIMIT if not present
	hasLimit := strings.Contains(strings.ToUpper(sqlStr), "LIMIT")
	execSQL := sqlStr
	if !hasLimit {
		execSQL = strings.TrimRight(strings.TrimSpace(sqlStr), ";") + " LIMIT 1000"
	}

	rows, err := s.db.Query(execSQL)
	if err != nil {
		return nil, fmt.Errorf("SQL error: %w", err)
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		row := make(map[string]interface{})
		for i, col := range cols {
			row[col] = normalizeIntelQueryValue(values[i])
		}
		results = append(results, row)
	}

	if results == nil {
		results = []map[string]interface{}{}
	}

	resp := map[string]interface{}{
		"rows":  results,
		"count": len(results),
	}

	// Check truncation
	if !hasLimit && len(results) >= 1000 {
		resp["truncated"] = true
		resp["warning"] = "Results truncated to 1000 rows. Use LIMIT/OFFSET for pagination."
	}
	return resp, nil
}

func normalizeIntelQueryValue(value interface{}) interface{} {
	switch v := value.(type) {
	case int64:
		if v > maxJavaScriptSafeInteger || v < -maxJavaScriptSafeInteger {
			return strconv.FormatInt(v, 10)
		}
	}
	return value
}

// ---------- Guarded write (DDL + complex writes) ----------

var sqlBlocklist = []string{
	"DROP TABLE", "DROP INDEX", "DROP VIEW", "DROP TRIGGER",
	"ATTACH DATABASE", "DETACH DATABASE",
	"PRAGMA WRITABLE_SCHEMA",
	"VACUUM INTO",
	"CREATE TRIGGER",
	"LOAD_EXTENSION",
}

func (s *IntelStore) Execute(sqlStr string, agentID string) (map[string]interface{}, error) {
	upper := strings.ToUpper(sqlStr)

	// Check blocklist
	for _, blocked := range sqlBlocklist {
		if strings.Contains(upper, blocked) {
			return nil, fmt.Errorf("Blocked: %s not allowed", blocked)
		}
	}

	// Check DELETE without WHERE
	if strings.Contains(upper, "DELETE") && strings.Contains(upper, "FROM") && !strings.Contains(upper, "WHERE") {
		return nil, fmt.Errorf("Blocked: DELETE requires WHERE clause")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	isDDL := strings.Contains(upper, "CREATE TABLE") || strings.Contains(upper, "ALTER TABLE") || strings.Contains(upper, "CREATE INDEX")

	// Auto-backup before DDL
	if isDDL {
		s.backup()
	}

	result, err := s.db.Exec(sqlStr)
	if err != nil {
		return nil, fmt.Errorf("SQL error: %w", err)
	}

	changes, _ := result.RowsAffected()
	lastID, _ := result.LastInsertId()
	return map[string]interface{}{
		"changes":         changes,
		"lastInsertRowid": normalizeIntelQueryValue(lastID),
		"ddl":             isDDL,
	}, nil
}

// ---------- Parameterized insert ----------

func (s *IntelStore) Insert(table string, data map[string]interface{}, agentID string) (map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Validate table exists
	validCols, err := s.getTableColumns(table)
	if err != nil {
		return nil, fmt.Errorf("Table '%s' does not exist", table)
	}

	// Validate columns
	for key := range data {
		if _, ok := validCols[key]; !ok {
			return nil, fmt.Errorf("Column '%s' not found in %s", key, table)
		}
	}

	// Auto-inject created_by, timestamps
	now := time.Now().UnixMilli()
	if _, ok := validCols["created_by"]; ok {
		if _, exists := data["created_by"]; !exists && agentID != "" {
			data["created_by"] = agentID
		}
	}
	if _, ok := validCols["created_at"]; ok {
		if _, exists := data["created_at"]; !exists {
			data["created_at"] = now
		}
	}
	if _, ok := validCols["updated_at"]; ok {
		if _, exists := data["updated_at"]; !exists {
			data["updated_at"] = now
		}
	}

	// Build INSERT
	cols := make([]string, 0, len(data))
	vals := make([]interface{}, 0, len(data))
	placeholders := make([]string, 0, len(data))
	for col, val := range data {
		cols = append(cols, fmt.Sprintf("\"%s\"", col))
		vals = append(vals, val)
		placeholders = append(placeholders, "?")
	}

	sqlStr := fmt.Sprintf(
		"INSERT INTO \"%s\" (%s) VALUES (%s)",
		table, strings.Join(cols, ", "), strings.Join(placeholders, ", "),
	)

	result, err := s.db.Exec(sqlStr, vals...)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "UNIQUE constraint") {
			return nil, fmt.Errorf("Duplicate: %s", msg)
		}
		if strings.Contains(msg, "FOREIGN KEY constraint") {
			return nil, fmt.Errorf("Foreign key constraint failed: %s", msg)
		}
		return nil, fmt.Errorf("Insert error: %s", msg)
	}

	lastID, _ := result.LastInsertId()
	changes, _ := result.RowsAffected()
	idVal := data["id"]
	if lastID > 0 {
		idVal = normalizeIntelQueryValue(lastID)
	}

	return map[string]interface{}{
		"inserted": true,
		"id":       idVal,
		"changes":  changes,
	}, nil
}

// ---------- Parameterized update ----------

func (s *IntelStore) Update(table string, data map[string]interface{}, where map[string]interface{}) (map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	validCols, err := s.getTableColumns(table)
	if err != nil {
		return nil, fmt.Errorf("Table '%s' does not exist", table)
	}

	for key := range data {
		if _, ok := validCols[key]; !ok {
			return nil, fmt.Errorf("Column '%s' not found in %s", key, table)
		}
	}
	for key := range where {
		if isInternalRowIDColumn(key) {
			continue
		}
		if _, ok := validCols[key]; !ok {
			return nil, fmt.Errorf("Column '%s' not found in %s", key, table)
		}
	}

	// Auto-inject updated_at
	if _, ok := validCols["updated_at"]; ok {
		if _, exists := data["updated_at"]; !exists {
			data["updated_at"] = time.Now().UnixMilli()
		}
	}

	setClauses := make([]string, 0, len(data))
	vals := make([]interface{}, 0, len(data)+len(where))
	for col, val := range data {
		setClauses = append(setClauses, fmt.Sprintf("\"%s\" = ?", col))
		vals = append(vals, val)
	}

	whereClauses := make([]string, 0, len(where))
	for col, val := range where {
		whereClauses = append(whereClauses, fmt.Sprintf("%s = ?", intelWhereColumnSQL(col)))
		vals = append(vals, val)
	}

	sqlStr := fmt.Sprintf(
		"UPDATE \"%s\" SET %s WHERE %s",
		table, strings.Join(setClauses, ", "), strings.Join(whereClauses, " AND "),
	)

	result, err := s.db.Exec(sqlStr, vals...)
	if err != nil {
		return nil, fmt.Errorf("Update error: %s", err.Error())
	}

	changes, _ := result.RowsAffected()
	return map[string]interface{}{
		"updated": true,
		"changes": changes,
	}, nil
}

// ---------- Parameterized delete ----------

func (s *IntelStore) Delete(table string, where map[string]interface{}) (map[string]interface{}, error) {
	if len(where) == 0 {
		return nil, fmt.Errorf("Delete requires a where clause")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	validCols, err := s.getTableColumns(table)
	if err != nil {
		return nil, fmt.Errorf("Table '%s' does not exist", table)
	}

	for key := range where {
		if isInternalRowIDColumn(key) {
			continue
		}
		if _, ok := validCols[key]; !ok {
			return nil, fmt.Errorf("Column '%s' not found in %s", key, table)
		}
	}

	whereClauses := make([]string, 0, len(where))
	vals := make([]interface{}, 0, len(where))
	for col, val := range where {
		whereClauses = append(whereClauses, fmt.Sprintf("%s = ?", intelWhereColumnSQL(col)))
		vals = append(vals, val)
	}

	sqlStr := fmt.Sprintf(
		"DELETE FROM \"%s\" WHERE %s",
		table, strings.Join(whereClauses, " AND "),
	)

	result, err := s.db.Exec(sqlStr, vals...)
	if err != nil {
		return nil, fmt.Errorf("Delete error: %s", err.Error())
	}

	changes, _ := result.RowsAffected()
	if changes == 0 {
		return map[string]interface{}{
			"deleted": false,
			"changes": 0,
			"warning": "No rows matched the condition",
		}, nil
	}
	return map[string]interface{}{
		"deleted": true,
		"changes": changes,
	}, nil
}

// ---------- Helpers ----------

func (s *IntelStore) getTableColumns(table string) (map[string]bool, error) {
	rows, err := s.db.Query(
		"SELECT name FROM sqlite_master WHERE type='table' AND name = ?", table,
	)
	if err != nil {
		return nil, err
	}
	hasTable := rows.Next()
	rows.Close()
	if !hasTable {
		return nil, fmt.Errorf("not found")
	}

	colRows, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(\"%s\")", table))
	if err != nil {
		return nil, err
	}
	defer colRows.Close()

	cols := make(map[string]bool)
	for colRows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var dflt sql.NullString
		if err := colRows.Scan(&cid, &name, &colType, &notNull, &dflt, &pk); err != nil {
			continue
		}
		cols[name] = true
	}
	return cols, nil
}

func isInternalRowIDColumn(column string) bool {
	return strings.EqualFold(column, "rowid")
}

func intelWhereColumnSQL(column string) string {
	if isInternalRowIDColumn(column) {
		return "_rowid_"
	}
	return fmt.Sprintf("\"%s\"", column)
}

func (s *IntelStore) backup() {
	backupDir := filepath.Join(s.dir, "data", "backups")
	os.MkdirAll(backupDir, 0755)

	ts := time.Now().UnixMilli()
	backupPath := filepath.Join(backupDir, fmt.Sprintf("intel_%d.db", ts))

	src, err := os.Open(s.path)
	if err != nil {
		return
	}
	defer src.Close()

	dst, err := os.Create(backupPath)
	if err != nil {
		return
	}
	defer dst.Close()
	io.Copy(dst, src)

	// Rotate: keep last 5
	entries, _ := os.ReadDir(backupDir)
	var backups []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "intel_") && strings.HasSuffix(e.Name(), ".db") {
			backups = append(backups, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(backups)))
	for _, old := range backups[min(5, len(backups)):] {
		os.Remove(filepath.Join(backupDir, old))
	}
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
