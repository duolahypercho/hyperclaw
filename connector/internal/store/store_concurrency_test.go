package store

import "testing"

func TestStoreAllowsConcurrentReadConnections(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	defer s.Close()

	stats := s.DB().Stats()
	if stats.MaxOpenConnections < 4 {
		t.Fatalf("MaxOpenConnections = %d, want at least 4", stats.MaxOpenConnections)
	}
}
