package bridge

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

// writeBackOpenClawJobs writes OpenClaw cron jobs from SQLite back to jobs.json
// so the openclaw CLI can still list them. Uses atomic write (temp + rename).
func (b *BridgeHandler) writeBackOpenClawJobs() {
	if b.store == nil {
		return
	}
	jobs, err := b.store.GetCronJobs("openclaw")
	if err != nil {
		log.Printf("[cron-writeback] failed to read openclaw jobs: %v", err)
		return
	}
	if len(jobs) == 0 {
		return
	}

	// Build the jobs array from raw_json
	var jobsList []json.RawMessage
	for _, j := range jobs {
		jobsList = append(jobsList, json.RawMessage(j.RawJSON))
	}

	data, err := json.MarshalIndent(map[string]interface{}{"jobs": jobsList}, "", "  ")
	if err != nil {
		log.Printf("[cron-writeback] marshal error: %v", err)
		return
	}

	// Determine jobs.json path
	home, _ := os.UserHomeDir()
	jobsPath := filepath.Join(home, ".openclaw", "cron", "jobs.json")
	tmpPath := jobsPath + ".tmp"

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(jobsPath), 0755); err != nil {
		log.Printf("[cron-writeback] mkdir error: %v", err)
		return
	}

	// Atomic write: write to temp, then rename
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		log.Printf("[cron-writeback] write error: %v", err)
		return
	}
	if err := os.Rename(tmpPath, jobsPath); err != nil {
		log.Printf("[cron-writeback] rename error: %v", err)
		os.Remove(tmpPath)
		return
	}

	log.Printf("[cron-writeback] wrote %d openclaw jobs to jobs.json", len(jobsList))
}
