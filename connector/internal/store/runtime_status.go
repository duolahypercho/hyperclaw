package store

import "time"

// RuntimeStatus represents the health status of a runtime.
type RuntimeStatus struct {
	Runtime   string `json:"runtime"`
	Status    string `json:"status"`
	Version   string `json:"version,omitempty"`
	Metadata  string `json:"metadata,omitempty"`
	CheckedAt int64  `json:"checkedAt"`
}

// UpdateRuntimeStatus upserts the health status of a runtime.
func (s *Store) UpdateRuntimeStatus(runtime, status, version, metadata string) error {
	now := time.Now().UnixMilli()
	if metadata == "" {
		metadata = "{}"
	}

	_, err := s.db.Exec(`
		INSERT INTO runtime_status (runtime, status, version, metadata, checked_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(runtime) DO UPDATE SET
			status     = excluded.status,
			version    = excluded.version,
			metadata   = excluded.metadata,
			checked_at = excluded.checked_at
	`, runtime, status, version, metadata, now)
	return err
}

// GetRuntimeStatuses returns the health status of all runtimes.
func (s *Store) GetRuntimeStatuses() ([]RuntimeStatus, error) {
	rows, err := s.db.Query(`
		SELECT runtime, status, version, metadata, checked_at
		FROM runtime_status ORDER BY runtime ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var statuses []RuntimeStatus
	for rows.Next() {
		var rs RuntimeStatus
		if err := rows.Scan(&rs.Runtime, &rs.Status, &rs.Version, &rs.Metadata, &rs.CheckedAt); err != nil {
			continue
		}
		statuses = append(statuses, rs)
	}
	if statuses == nil {
		statuses = []RuntimeStatus{}
	}
	return statuses, nil
}

// GetRuntimeStatus returns the status of a specific runtime.
func (s *Store) GetRuntimeStatus(runtime string) (*RuntimeStatus, error) {
	var rs RuntimeStatus
	err := s.db.QueryRow(`
		SELECT runtime, status, version, metadata, checked_at
		FROM runtime_status WHERE runtime = ?
	`, runtime).Scan(&rs.Runtime, &rs.Status, &rs.Version, &rs.Metadata, &rs.CheckedAt)
	if err != nil {
		return nil, err
	}
	return &rs, nil
}
