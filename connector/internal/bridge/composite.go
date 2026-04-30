package bridge

import (
	"sort"
	"strings"
	"time"
)

const activeCronWindowMs = 10 * 60 * 1000 // 10 minutes

func (b *BridgeHandler) getEmployeeStatus() actionResult {
	team := b.resolveTeamFast()
	crons := getCronsFromJSON(b.paths)
	now := time.Now().UnixMilli()

	type cronSummary struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Schedule string `json:"schedule"`
		AgentID  string `json:"agentId,omitempty"`
	}

	type cronWithRun struct {
		cronSummary
		LastRunAtMs int64 `json:"lastRunAtMs,omitempty"`
		NextRunAtMs int64 `json:"nextRunAtMs,omitempty"`
	}

	type employee struct {
		ID                string          `json:"id"`
		Name              string          `json:"name"`
		Status            string          `json:"status"`
		CurrentTask       string          `json:"currentTask"`
		CurrentWorkingJobs []cronSummary  `json:"currentWorkingJobs"`
		PreviousTasks     []cronWithRun   `json:"previousTasks"`
		NextComingCrons   []cronWithRun   `json:"nextComingCrons"`
	}

	employees := make([]employee, 0, len(team))

	for _, a := range team {
		aID := strings.ToLower(a.ID)
		aName := strings.ToLower(a.Name)

		// Find crons assigned to this agent
		var assignedCrons []parsedCronJob
		for _, c := range crons {
			aid := strings.ToLower(c.AgentID)
			if aid != "" && (aid == aID || aid == aName) {
				assignedCrons = append(assignedCrons, c)
			}
		}

		// Find currently working jobs
		var currentWorkingJobs []parsedCronJob
		for _, c := range assignedCrons {
			lastStatus := strings.ToLower(c.LastStatus)
			if lastStatus == "running" {
				currentWorkingJobs = append(currentWorkingJobs, c)
				continue
			}
			if c.LastRunAtMs != nil && now-*c.LastRunAtMs <= activeCronWindowMs {
				currentWorkingJobs = append(currentWorkingJobs, c)
			}
		}

		// Next coming crons
		var nextComing []cronWithRun
		for _, c := range assignedCrons {
			if c.NextRun != nil && *c.NextRun > now {
				nextComing = append(nextComing, cronWithRun{
					cronSummary: cronSummary{ID: c.ID, Name: c.Name, Schedule: c.Schedule, AgentID: c.AgentID},
					NextRunAtMs: *c.NextRun,
				})
			}
		}
		sort.Slice(nextComing, func(i, j int) bool {
			return nextComing[i].NextRunAtMs < nextComing[j].NextRunAtMs
		})

		// Previous tasks (not currently working)
		currentWorkingSet := make(map[string]bool)
		for _, c := range currentWorkingJobs {
			currentWorkingSet[c.ID] = true
		}

		var prevTasks []cronWithRun
		for _, c := range assignedCrons {
			if c.LastRunAtMs != nil && !currentWorkingSet[c.ID] {
				prevTasks = append(prevTasks, cronWithRun{
					cronSummary: cronSummary{ID: c.ID, Name: c.Name, Schedule: c.Schedule, AgentID: c.AgentID},
					LastRunAtMs: *c.LastRunAtMs,
				})
			}
		}
		sort.Slice(prevTasks, func(i, j int) bool {
			return prevTasks[i].LastRunAtMs > prevTasks[j].LastRunAtMs
		})
		if len(prevTasks) > 5 {
			prevTasks = prevTasks[:5]
		}

		// Determine status
		status := "idle"
		currentTask := "Idle"
		if len(currentWorkingJobs) > 0 {
			status = "working"
			// Sort by recency
			sort.Slice(currentWorkingJobs, func(i, j int) bool {
				li, lj := int64(0), int64(0)
				if currentWorkingJobs[i].LastRunAtMs != nil {
					li = *currentWorkingJobs[i].LastRunAtMs
				}
				if currentWorkingJobs[j].LastRunAtMs != nil {
					lj = *currentWorkingJobs[j].LastRunAtMs
				}
				return li > lj
			})
			var names []string
			for _, c := range currentWorkingJobs {
				names = append(names, c.Name)
			}
			currentTask = strings.Join(names, ", ")
		} else if len(prevTasks) > 0 {
			currentTask = prevTasks[0].Name
		}
		if currentTask == "" {
			currentTask = "Idle"
		}

		// Build working jobs summary
		var workingJobsSummary []cronSummary
		for _, c := range currentWorkingJobs {
			workingJobsSummary = append(workingJobsSummary, cronSummary{
				ID: c.ID, Name: c.Name, Schedule: c.Schedule, AgentID: c.AgentID,
			})
		}
		if workingJobsSummary == nil {
			workingJobsSummary = []cronSummary{}
		}
		if prevTasks == nil {
			prevTasks = []cronWithRun{}
		}
		if nextComing == nil {
			nextComing = []cronWithRun{}
		}

		employees = append(employees, employee{
			ID:                 a.ID,
			Name:               a.Name,
			Status:             status,
			CurrentTask:        currentTask,
			CurrentWorkingJobs: workingJobsSummary,
			PreviousTasks:      prevTasks,
			NextComingCrons:    nextComing,
		})
	}

	return okResult(map[string]interface{}{"employees": employees})
}
