package store

import (
	"database/sql"
	"fmt"
	"time"
)

// TokenUsageRow is one usage record.
type TokenUsageRow struct {
	ID              int64   `json:"id"`
	DedupKey        string  `json:"dedupKey"`
	AgentID         string  `json:"agentId"`   // empty = unattributed
	Runtime         string  `json:"runtime"`
	SessionID       string  `json:"sessionId"` // empty if unknown
	Model           string  `json:"model"`
	InputTokens     int64   `json:"inputTokens"`
	OutputTokens    int64   `json:"outputTokens"`
	CacheReadTokens int64   `json:"cacheReadTokens"`
	CostUSD         float64 `json:"costUsd"`
	RecordedAt      int64   `json:"recordedAt"`
}

// InsertTokenUsage inserts a usage row using INSERT OR IGNORE to prevent
// duplicates on re-parse (dedup_key is unique).
func (s *Store) InsertTokenUsage(row TokenUsageRow) error {
	if row.RecordedAt == 0 {
		row.RecordedAt = time.Now().UnixMilli()
	}
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO token_usage
			(dedup_key, agent_id, runtime, session_id, model,
			 input_tokens, output_tokens, cache_read_tokens, cost_usd, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, row.DedupKey, nullStr(row.AgentID), row.Runtime, nullStr(row.SessionID),
		row.Model, row.InputTokens, row.OutputTokens, row.CacheReadTokens,
		row.CostUSD, row.RecordedAt)
	return err
}


// UpsertHermesTokenUsage inserts a Hermes session row and updates cost_usd + model
// when the existing row has cost_usd = 0. This handles the case where Hermes records
// a session with zero cost while it is running, then sets the real cost at session end.
// Regular InsertTokenUsage (INSERT OR IGNORE) would permanently freeze the zero-cost row.
func (s *Store) UpsertHermesTokenUsage(row TokenUsageRow) error {
	if row.RecordedAt == 0 {
		row.RecordedAt = time.Now().UnixMilli()
	}
	_, err := s.db.Exec(`
		INSERT INTO token_usage
			(dedup_key, agent_id, runtime, session_id, model,
			 input_tokens, output_tokens, cache_read_tokens, cost_usd, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(dedup_key) DO UPDATE SET
			cost_usd      = excluded.cost_usd,
			model         = excluded.model,
			input_tokens  = CASE WHEN excluded.input_tokens  > 0 THEN excluded.input_tokens  ELSE input_tokens  END,
			output_tokens = CASE WHEN excluded.output_tokens > 0 THEN excluded.output_tokens ELSE output_tokens END
		WHERE cost_usd = 0 OR input_tokens = 0 OR output_tokens = 0
	`, row.DedupKey, nullStr(row.AgentID), row.Runtime, nullStr(row.SessionID),
		row.Model, row.InputTokens, row.OutputTokens, row.CacheReadTokens,
		row.CostUSD, row.RecordedAt)
	return err
}

// TokenUsageSummary holds aggregated cost + tokens for one group.
type TokenUsageSummary struct {
	GroupKey        string  `json:"groupKey"`
	TotalCostUSD    float64 `json:"totalCostUsd"`
	InputTokens     int64   `json:"inputTokens"`
	OutputTokens    int64   `json:"outputTokens"`
	CacheReadTokens int64   `json:"cacheReadTokens"`
	LastActivityMs  int64   `json:"lastActivityMs"`
}

// GetTokenUsage returns aggregated usage filtered by optional agent, runtime,
// and time range. groupBy must be "agent", "runtime", or "session".
func (s *Store) GetTokenUsage(agentID, runtime string, from, to int64, groupBy string) ([]TokenUsageSummary, error) {
	// groupCol is always one of exactly three hardcoded SQL expression strings,
	// never derived from user input — safe to splice directly into the query.
	groupCol := "COALESCE(agent_id, 'unattributed')"
	orderCol := "SUM(cost_usd) DESC"
	if groupBy == "runtime" {
		groupCol = "runtime"
	} else if groupBy == "session" {
		groupCol = "COALESCE(session_id, 'unknown')"
		orderCol = "MAX(recorded_at) DESC"
	}

	args := []interface{}{}
	where := "1=1"
	if agentID != "" {
		where += " AND agent_id = ?"
		args = append(args, agentID)
	}
	if runtime != "" {
		where += " AND runtime = ?"
		args = append(args, runtime)
	}
	if from > 0 {
		where += " AND recorded_at >= ?"
		args = append(args, from)
	}
	if to > 0 {
		where += " AND recorded_at <= ?"
		args = append(args, to)
	}

	query := `
		SELECT ` + groupCol + ` as grp,
		       SUM(cost_usd), SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens),
		       MAX(recorded_at)
		FROM token_usage
		WHERE ` + where + `
		GROUP BY grp
		ORDER BY ` + orderCol + `
	`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TokenUsageSummary
	for rows.Next() {
		var r TokenUsageSummary
		var grp sql.NullString
		var lastMs sql.NullInt64
		if err := rows.Scan(&grp, &r.TotalCostUSD, &r.InputTokens, &r.OutputTokens, &r.CacheReadTokens, &lastMs); err != nil {
			return nil, fmt.Errorf("scan token_usage row: %w", err)
		}
		r.GroupKey = grp.String
		if lastMs.Valid {
			r.LastActivityMs = lastMs.Int64
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate token_usage rows: %w", err)
	}
	if result == nil {
		result = []TokenUsageSummary{}
	}
	return result, nil
}

// AgentStatsRuntimeBreakdown is per-runtime cost + session data for one agent.
type AgentStatsRuntimeBreakdown struct {
	Runtime      string  `json:"runtime"`
	TotalCostUSD float64 `json:"totalCostUsd"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	SessionCount int64   `json:"sessionCount"`
	LastActiveMs int64   `json:"lastActiveMs"`
}

// AgentStats is the full stats payload for one agent.
type AgentStats struct {
	TotalCostUSD    float64                      `json:"totalCostUsd"`
	InputTokens     int64                        `json:"inputTokens"`
	OutputTokens    int64                        `json:"outputTokens"`
	CacheReadTokens int64                        `json:"cacheReadTokens"`
	SessionCount    int64                        `json:"sessionCount"`
	LastActiveMs    int64                        `json:"lastActiveMs"`
	Runtimes        []AgentStatsRuntimeBreakdown `json:"runtimes"`
}

// runtimeOnlyAgents are agents whose token_usage rows carry no agent_id —
// they are identified purely by their runtime name. Querying stats for these
// agents must filter by runtime rather than agent_id.
var runtimeOnlyAgents = map[string]bool{
	"claude-code": true,
	"codex":       true,
	"hermes":      true,
}

// GetAgentStats returns aggregated cost/token/session data for one agent,
// split by runtime. from/to are Unix milliseconds (0 = no filter).
func (s *Store) GetAgentStats(agentID string, from, to int64) (*AgentStats, error) {
	// Runtime-named agents (claude-code, codex, hermes) store no agent_id in
	// their token_usage rows; filter by runtime instead of agent_id.
	filterByRuntime := runtimeOnlyAgents[agentID]

	// ── Token usage totals ──────────────────────────────────────────────────
	whereArgs := []interface{}{}
	where := "1=1"
	if agentID != "" {
		if filterByRuntime {
			where += " AND runtime = ?"
		} else {
			where += " AND agent_id = ?"
		}
		whereArgs = append(whereArgs, agentID)
	}
	if from > 0 {
		where += " AND recorded_at >= ?"
		whereArgs = append(whereArgs, from)
	}
	if to > 0 {
		where += " AND recorded_at <= ?"
		whereArgs = append(whereArgs, to)
	}

	// Overall totals
	var stats AgentStats
	row := s.db.QueryRow(`
		SELECT COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens),0),
		       COALESCE(SUM(output_tokens),0), COALESCE(SUM(cache_read_tokens),0)
		FROM token_usage WHERE `+where, whereArgs...)
	if err := row.Scan(&stats.TotalCostUSD, &stats.InputTokens, &stats.OutputTokens, &stats.CacheReadTokens); err != nil {
		return nil, fmt.Errorf("GetAgentStats totals: %w", err)
	}

	// Per-runtime breakdown from token_usage
	runtimeRows, err := s.db.Query(`
		SELECT runtime,
		       COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
		FROM token_usage WHERE `+where+`
		GROUP BY runtime ORDER BY SUM(cost_usd) DESC`, whereArgs...)
	if err != nil {
		return nil, fmt.Errorf("GetAgentStats runtime breakdown: %w", err)
	}
	defer runtimeRows.Close()

	runtimeMap := map[string]*AgentStatsRuntimeBreakdown{}
	for runtimeRows.Next() {
		var r AgentStatsRuntimeBreakdown
		if err := runtimeRows.Scan(&r.Runtime, &r.TotalCostUSD, &r.InputTokens, &r.OutputTokens); err != nil {
			return nil, fmt.Errorf("GetAgentStats runtime scan: %w", err)
		}
		runtimeMap[r.Runtime] = &r
	}
	if err := runtimeRows.Err(); err != nil {
		return nil, fmt.Errorf("GetAgentStats runtime rows: %w", err)
	}

	// ── Session counts from sessions table ─────────────────────────────────
	sessWhere := "1=1"
	sessArgs := []interface{}{}
	if agentID != "" {
		if filterByRuntime {
			sessWhere += " AND runtime = ?"
		} else {
			sessWhere += " AND agent_id = ?"
		}
		sessArgs = append(sessArgs, agentID)
	}
	if from > 0 {
		sessWhere += " AND updated_at >= ?"
		sessArgs = append(sessArgs, from)
	}
	if to > 0 {
		sessWhere += " AND updated_at <= ?"
		sessArgs = append(sessArgs, to)
	}

	sessTotalRow := s.db.QueryRow(`
		SELECT COUNT(*), COALESCE(MAX(updated_at),0)
		FROM sessions WHERE `+sessWhere, sessArgs...)
	if err := sessTotalRow.Scan(&stats.SessionCount, &stats.LastActiveMs); err != nil {
		// sessions table may not exist yet on old installs — treat as zero
		stats.SessionCount = 0
		stats.LastActiveMs = 0
	}

	// Fallback: when the sessions table has no data for this agent (common for
	// claude-code, codex, hermes which are not live-tracked), derive lastActiveMs
	// from the most recent recorded_at in token_usage and count distinct session_ids.
	if stats.LastActiveMs == 0 {
		var lastRecordedAt sql.NullInt64
		_ = s.db.QueryRow(`SELECT MAX(recorded_at) FROM token_usage WHERE `+where,
			whereArgs...).Scan(&lastRecordedAt)
		if lastRecordedAt.Valid {
			stats.LastActiveMs = lastRecordedAt.Int64
		}
	}
	if stats.SessionCount == 0 {
		var distinctSessions sql.NullInt64
		_ = s.db.QueryRow(
			`SELECT COUNT(DISTINCT session_id) FROM token_usage WHERE session_id IS NOT NULL AND session_id != '' AND `+where,
			whereArgs...).Scan(&distinctSessions)
		if distinctSessions.Valid {
			stats.SessionCount = distinctSessions.Int64
		}
	}

	// Per-runtime session counts
	sessRuntimeRows, err := s.db.Query(`
		SELECT runtime, COUNT(*), COALESCE(MAX(updated_at),0)
		FROM sessions WHERE `+sessWhere+`
		GROUP BY runtime`, sessArgs...)
	if err == nil {
		defer sessRuntimeRows.Close()
		for sessRuntimeRows.Next() {
			var rt string
			var cnt, lastMs int64
			if err := sessRuntimeRows.Scan(&rt, &cnt, &lastMs); err != nil {
				continue
			}
			if r, ok := runtimeMap[rt]; ok {
				r.SessionCount = cnt
				r.LastActiveMs = lastMs
			} else {
				runtimeMap[rt] = &AgentStatsRuntimeBreakdown{
					Runtime:      rt,
					SessionCount: cnt,
					LastActiveMs: lastMs,
				}
			}
		}
	}

	// Per-runtime fallback: fill lastActiveMs from token_usage.recorded_at and
	// session count from distinct session_ids for runtimes not tracked in sessions table.
	for rt, r := range runtimeMap {
		if r.LastActiveMs == 0 {
			var lastMs sql.NullInt64
			_ = s.db.QueryRow(
				`SELECT MAX(recorded_at) FROM token_usage WHERE `+where+` AND runtime = ?`,
				append(whereArgs, rt)...).Scan(&lastMs)
			if lastMs.Valid {
				r.LastActiveMs = lastMs.Int64
			}
		}
		if r.SessionCount == 0 {
			var cnt sql.NullInt64
			_ = s.db.QueryRow(
				`SELECT COUNT(DISTINCT session_id) FROM token_usage WHERE session_id IS NOT NULL AND session_id != '' AND `+where+` AND runtime = ?`,
				append(whereArgs, rt)...).Scan(&cnt)
			if cnt.Valid {
				r.SessionCount = cnt.Int64
			}
		}
	}

	// Flatten map → slice in cost-desc order (already ordered from first query)
	for _, r := range runtimeMap {
		stats.Runtimes = append(stats.Runtimes, *r)
	}

	return &stats, nil
}

// BackfillAgentID updates existing token_usage rows that have no agent_id set,
// matching by dedup_key prefix (runtime + ":" + pathKey + ":").
// Called during cold sync to retroactively attribute sessions to named agents.
func (s *Store) BackfillAgentID(agentID, runtime, pathKey string) (int64, error) {
	prefix := runtime + ":" + pathKey + ":"
	res, err := s.db.Exec(
		`UPDATE token_usage SET agent_id = ? WHERE dedup_key LIKE ? AND agent_id IS NULL`,
		agentID, prefix+"%",
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// PruneTokenUsage deletes rows older than the given Unix ms timestamp.
// Called from the maintenance loop to enforce 90-day retention.
func (s *Store) PruneTokenUsage(olderThanMs int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM token_usage WHERE recorded_at < ?`, olderThanMs)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// DeleteTokenUsageByAgent removes all token usage records for an agent.
func (s *Store) DeleteTokenUsageByAgent(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM token_usage WHERE agent_id = ?`, agentID)
	return err
}
