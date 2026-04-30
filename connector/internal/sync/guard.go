package sync

import (
	gosync "sync"
	"time"
)

const guardTTL = 3 * time.Second

type guardEntry struct {
	hash      string
	expiresAt time.Time
}

// WriteGuard prevents fsnotify echo loops by tracking recently-written file hashes.
type WriteGuard struct {
	mu      gosync.Mutex
	entries map[string]guardEntry
}

func newWriteGuard() *WriteGuard {
	return &WriteGuard{entries: make(map[string]guardEntry)}
}

// Set marks filePath as recently written with the given hash.
func (g *WriteGuard) Set(filePath, hash string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.entries[filePath] = guardEntry{hash: hash, expiresAt: time.Now().Add(guardTTL)}
}

// Remove clears the guard for a path (called on write failure).
func (g *WriteGuard) Remove(filePath string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.entries, filePath)
}

// IsOurWrite returns true if filePath was recently written by us with the given hash.
func (g *WriteGuard) IsOurWrite(filePath, hash string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	e, ok := g.entries[filePath]
	if !ok {
		return false
	}
	if time.Now().After(e.expiresAt) {
		delete(g.entries, filePath)
		return false
	}
	return e.hash == hash
}
