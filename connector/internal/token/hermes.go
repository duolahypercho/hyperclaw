package token

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// SyncHermesTokenUsage reads a Hermes state.db and upserts token_usage rows.
// agentID is the Hyperclaw agent identifier to attribute these rows to;
// pass "hermes" for the root agent, or the profile name for isolated agents.
// Opens the DB read-only to avoid interfering with the Hermes process.
// Returns the number of rows successfully upserted.
func SyncHermesTokenUsage(hermesStateDB string, agentID string, s *store.Store) (int, error) {
	db, err := sql.Open("sqlite", hermesStateDB+"?mode=ro&_journal_mode=WAL&_busy_timeout=200")
	if err != nil {
		return 0, fmt.Errorf("open hermes state.db: %w", err)
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, model, estimated_cost_usd, started_at,
		       COALESCE(input_tokens, 0), COALESCE(output_tokens, 0)
		FROM sessions
		ORDER BY started_at DESC
		LIMIT 500
	`)
	if err != nil {
		return 0, fmt.Errorf("query hermes sessions: %w", err)
	}
	defer rows.Close()

	if agentID == "" {
		agentID = "hermes"
	}

	var inserted int
	for rows.Next() {
		var (
			sessionID    sql.NullString
			model        sql.NullString
			costUSD      sql.NullFloat64 // can be NULL before session ends
			startedAt    sql.NullFloat64 // stored as real (Unix seconds) in Hermes
			inputTokens  sql.NullInt64
			outputTokens sql.NullInt64
		)
		if err := rows.Scan(&sessionID, &model, &costUSD, &startedAt, &inputTokens, &outputTokens); err != nil {
			log.Printf("[token] hermes scan error: %v", err)
			continue
		}
		// Convert seconds → milliseconds; fall back to current time if missing
		var recordedAtMs int64
		if startedAt.Valid && startedAt.Float64 > 0 {
			recordedAtMs = int64(startedAt.Float64 * 1000)
		}
		row := store.TokenUsageRow{
			DedupKey:     "hermes:" + agentID + ":" + sessionID.String,
			Runtime:      "hermes",
			AgentID:      agentID,
			SessionID:    sessionID.String,
			Model:        model.String,
			CostUSD:      costUSD.Float64,
			InputTokens:  inputTokens.Int64,
			OutputTokens: outputTokens.Int64,
			RecordedAt:   recordedAtMs,
		}
		if err := s.UpsertHermesTokenUsage(row); err != nil {
			log.Printf("[token] hermes insert error: %v", err)
		} else {
			inserted++
		}
	}
	return inserted, rows.Err()
}
