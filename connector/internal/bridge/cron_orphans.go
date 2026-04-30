package bridge

import (
	"log"
	"sync"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// CronOrphanScanner runs a background goroutine that periodically:
//  1. Re-seeds cron jobs from each runtime's jobs.json into SQLite (via seedFuncs).
//  2. Logs stub messages for runtimes whose orphan scan is not yet implemented.
//  3. Purges cron_runs rows older than 90 days.
type CronOrphanScanner struct {
	store     *store.Store
	seedFuncs []func() // one seed function per runtime
	quit      chan struct{}
	wg        sync.WaitGroup
}

// NewCronOrphanScanner creates a new scanner. Each seedFunc should call the same
// logic as the corresponding seedCronJobs function in cmd/main.go.
func NewCronOrphanScanner(s *store.Store, seedFuncs ...func()) *CronOrphanScanner {
	return &CronOrphanScanner{
		store:     s,
		seedFuncs: seedFuncs,
		quit:      make(chan struct{}),
	}
}

// Start launches the background scanning goroutine.
func (sc *CronOrphanScanner) Start() {
	sc.wg.Add(1)
	go func() {
		defer sc.wg.Done()
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				sc.scan()
			case <-sc.quit:
				return
			}
		}
	}()
}

// Stop signals the scanner to stop and waits for it to exit cleanly.
func (sc *CronOrphanScanner) Stop() {
	select {
	case <-sc.quit:
		// already closed
	default:
		close(sc.quit)
	}
	sc.wg.Wait()
}

// scan performs one full orphan-discovery and retention sweep.
func (sc *CronOrphanScanner) scan() {
	// Re-seed from jobs.json for each registered runtime so any externally
	// added/removed jobs are reflected in SQLite without waiting for the
	// fsnotify watcher.
	for _, fn := range sc.seedFuncs {
		fn()
	}

	// Stub for runtimes that will get native orphan scanning in future phases.
	log.Println("[orphan-scanner] claude-code orphan scan: not yet implemented")

	// 90-day retention sweep: purge stale cron run history.
	if sc.store != nil {
		cutoff := time.Now().Add(-90 * 24 * time.Hour).UnixMilli()
		deleted, err := sc.store.PurgeCronRunsOlderThan(cutoff)
		if err != nil {
			log.Printf("[orphan-scanner] purge error: %v", err)
		} else if deleted > 0 {
			log.Printf("[orphan-scanner] purged %d old cron_runs rows", deleted)
		}
	}
}
