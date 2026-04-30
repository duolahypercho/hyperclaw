package store

import (
	"database/sql"
	"fmt"
)

// StripeRevenueSnapshotMaxKeep is the maximum number of Stripe revenue snapshots
// retained locally. Older rows are deleted after each insert.
const StripeRevenueSnapshotMaxKeep = 500

// StripeRevenueSnapshotRow is one persisted ARR/MRR snapshot (JSON payload).
type StripeRevenueSnapshotRow struct {
	ID           int64  `json:"id"`
	ComputedAtMs int64  `json:"computed_at_ms"`
	Data         string `json:"data"`
}

// StripeRevenueSnapshotInsert appends a snapshot and prunes to at most
// StripeRevenueSnapshotMaxKeep rows (oldest first).
func (s *Store) StripeRevenueSnapshotInsert(computedAtMs int64, dataJSON string) error {
	if dataJSON == "" {
		return fmt.Errorf("stripe snapshot: empty data")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := s.stripeRevenueSnapshotInsertTx(tx, computedAtMs, dataJSON); err != nil {
		return err
	}
	return tx.Commit()
}

// StripeRevenueSnapshotStoreLatest atomically updates the latest cache value and
// appends the same payload to the historical snapshots table.
func (s *Store) StripeRevenueSnapshotStoreLatest(cacheKey string, computedAtMs int64, dataJSON string) error {
	if cacheKey == "" {
		return fmt.Errorf("stripe snapshot: empty cache key")
	}
	if dataJSON == "" {
		return fmt.Errorf("stripe snapshot: empty data")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := s.kvSetTx(tx, cacheKey, dataJSON); err != nil {
		return err
	}
	if err := s.stripeRevenueSnapshotInsertTx(tx, computedAtMs, dataJSON); err != nil {
		return err
	}
	return tx.Commit()
}

// StripeRevenueSnapshotsList returns the most recent snapshots, newest first.
func (s *Store) StripeRevenueSnapshotsList(limit int) ([]StripeRevenueSnapshotRow, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, computed_at_ms, data
		FROM stripe_revenue_snapshots
		ORDER BY computed_at_ms DESC, id DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []StripeRevenueSnapshotRow
	for rows.Next() {
		var r StripeRevenueSnapshotRow
		if err := rows.Scan(&r.ID, &r.ComputedAtMs, &r.Data); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// StripeRevenueSnapshotsDeleteAll removes all Stripe revenue snapshots (e.g. on disconnect).
func (s *Store) StripeRevenueSnapshotsDeleteAll() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM stripe_revenue_snapshots`)
	return err
}

// StripeRevenueSnapshotsCount returns how many snapshot rows exist.
func (s *Store) StripeRevenueSnapshotsCount() (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM stripe_revenue_snapshots`).Scan(&n)
	return n, err
}

func (s *Store) stripeRevenueSnapshotInsertTx(tx *sql.Tx, computedAtMs int64, dataJSON string) error {
	if _, err := tx.Exec(
		`INSERT INTO stripe_revenue_snapshots (computed_at_ms, data) VALUES (?, ?)`,
		computedAtMs, dataJSON,
	); err != nil {
		return err
	}

	var n int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM stripe_revenue_snapshots`).Scan(&n); err != nil {
		return err
	}
	if n <= StripeRevenueSnapshotMaxKeep {
		return nil
	}
	del := n - StripeRevenueSnapshotMaxKeep
	_, err := tx.Exec(`
		DELETE FROM stripe_revenue_snapshots WHERE id IN (
			SELECT id FROM stripe_revenue_snapshots
			ORDER BY computed_at_ms ASC, id ASC
			LIMIT ?
		)`, del)
	return err
}
