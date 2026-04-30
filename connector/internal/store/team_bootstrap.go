package store

import "time"

type TeamRuntimeBootstrap struct {
	Runtime    string `json:"runtime"`
	Status     string `json:"status"`
	Detected   bool   `json:"detected"`
	AuthStatus string `json:"authStatus"`
	SyncStatus string `json:"syncStatus"`
	ToolMode   string `json:"toolMode"`
	Message    string `json:"message"`
	ConfigPath string `json:"configPath,omitempty"`
	Metadata   string `json:"metadata,omitempty"`
	CheckedAt  int64  `json:"checkedAt"`
	UpdatedAt  int64  `json:"updatedAt"`
}

func (s *Store) UpsertTeamRuntimeBootstrap(status TeamRuntimeBootstrap) error {
	now := time.Now().UnixMilli()
	status.CheckedAt = now
	status.UpdatedAt = now
	if status.Metadata == "" {
		status.Metadata = "{}"
	}
	_, err := s.db.Exec(`
		INSERT INTO team_runtime_bootstrap
		(runtime, status, detected, auth_status, sync_status, tool_mode, message, config_path, metadata, checked_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(runtime) DO UPDATE SET
			status = excluded.status,
			detected = excluded.detected,
			auth_status = excluded.auth_status,
			sync_status = excluded.sync_status,
			tool_mode = excluded.tool_mode,
			message = excluded.message,
			config_path = excluded.config_path,
			metadata = excluded.metadata,
			checked_at = excluded.checked_at,
			updated_at = excluded.updated_at
	`, status.Runtime, status.Status, boolToInt(status.Detected), status.AuthStatus, status.SyncStatus, status.ToolMode, status.Message, status.ConfigPath, status.Metadata, status.CheckedAt, status.UpdatedAt)
	return err
}

func (s *Store) ListTeamRuntimeBootstrap() ([]TeamRuntimeBootstrap, error) {
	rows, err := s.db.Query(`
		SELECT runtime, status, detected, auth_status, sync_status, tool_mode, message, config_path, metadata, checked_at, updated_at
		FROM team_runtime_bootstrap
		ORDER BY runtime ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []TeamRuntimeBootstrap
	for rows.Next() {
		var item TeamRuntimeBootstrap
		var detected int
		if err := rows.Scan(&item.Runtime, &item.Status, &detected, &item.AuthStatus, &item.SyncStatus, &item.ToolMode, &item.Message, &item.ConfigPath, &item.Metadata, &item.CheckedAt, &item.UpdatedAt); err != nil {
			continue
		}
		item.Detected = detected == 1
		items = append(items, item)
	}
	if items == nil {
		items = []TeamRuntimeBootstrap{}
	}
	return items, nil
}
