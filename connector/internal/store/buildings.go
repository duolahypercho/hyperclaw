package store

import (
	"database/sql"
	"time"
)

// Building represents a building section or config from a runtime.
type Building struct {
	ID        string `json:"id"`
	Runtime   string `json:"runtime"`
	Type      string `json:"type"`
	Name      string `json:"name"`
	RawJSON   string `json:"rawJson"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// UpsertBuilding creates or updates a building section.
func (s *Store) UpsertBuilding(b Building) error {
	now := time.Now().UnixMilli()
	if b.CreatedAt == 0 {
		b.CreatedAt = now
	}

	_, err := s.db.Exec(`
		INSERT INTO buildings (id, runtime, type, name, raw_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			runtime    = excluded.runtime,
			type       = excluded.type,
			name       = excluded.name,
			raw_json   = excluded.raw_json,
			updated_at = excluded.updated_at
	`, b.ID, b.Runtime, b.Type, b.Name, b.RawJSON, b.CreatedAt, now)
	return err
}

// GetBuildings returns all buildings, optionally filtered by runtime.
func (s *Store) GetBuildings(runtime string) ([]Building, error) {
	var rows *sql.Rows
	var err error

	if runtime != "" {
		rows, err = s.db.Query(`
			SELECT id, runtime, type, name, raw_json, created_at, updated_at
			FROM buildings WHERE runtime = ?
			ORDER BY name ASC
		`, runtime)
	} else {
		rows, err = s.db.Query(`
			SELECT id, runtime, type, name, raw_json, created_at, updated_at
			FROM buildings ORDER BY name ASC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var buildings []Building
	for rows.Next() {
		var b Building
		if err := rows.Scan(&b.ID, &b.Runtime, &b.Type, &b.Name, &b.RawJSON, &b.CreatedAt, &b.UpdatedAt); err != nil {
			continue
		}
		buildings = append(buildings, b)
	}
	if buildings == nil {
		buildings = []Building{}
	}
	return buildings, nil
}

// GetBuildingByID returns a single building by ID.
func (s *Store) GetBuildingByID(id string) (*Building, error) {
	var b Building
	err := s.db.QueryRow(`
		SELECT id, runtime, type, name, raw_json, created_at, updated_at
		FROM buildings WHERE id = ?
	`, id).Scan(&b.ID, &b.Runtime, &b.Type, &b.Name, &b.RawJSON, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// DeleteBuilding removes a building by ID.
func (s *Store) DeleteBuilding(id string) error {
	_, err := s.db.Exec("DELETE FROM buildings WHERE id = ?", id)
	return err
}
