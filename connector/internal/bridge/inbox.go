package bridge

import (
	"encoding/json"
	"fmt"
	"time"
)

// ── inbox-list ────────────────────────────────────────────────────────────────
// Returns inbox items from connector.db. Defaults to pending items only.
// Params:
//   status  string  "pending" | "approved" | "rejected" | "dismissed" | "all"
//   limit   int     max rows (default 50)

func (b *BridgeHandler) inboxList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store unavailable", 503)
	}

	status := "pending"
	if s, ok := params["status"].(string); ok && s != "" {
		status = s
	}

	limit := 50
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	var (
		rows *[]map[string]interface{}
		err  error
	)

	db := b.store.DB()

	var query string
	var args []interface{}
	if status == "all" {
		query = `SELECT id, agent_id, kind, title, body, context_json, task_id,
			             status, resolution_note, created_at, updated_at, resolved_at
			      FROM inbox_items
			      ORDER BY created_at DESC
			      LIMIT ?`
		args = []interface{}{limit}
	} else {
		query = `SELECT id, agent_id, kind, title, body, context_json, task_id,
			             status, resolution_note, created_at, updated_at, resolved_at
			      FROM inbox_items
			      WHERE status = ?
			      ORDER BY created_at DESC
			      LIMIT ?`
		args = []interface{}{status, limit}
	}

	sqlRows, err := db.Query(query, args...)
	if err != nil {
		return errResultStatus(fmt.Sprintf("inbox-list query: %v", err), 500)
	}
	defer sqlRows.Close()

	items := []map[string]interface{}{}
	for sqlRows.Next() {
		var (
			id             int64
			agentID        string
			kind           string
			title          string
			body           *string
			contextJSON    *string
			taskID         *string
			itemStatus     string
			resolutionNote *string
			createdAt      int64
			updatedAt      int64
			resolvedAt     *int64
		)
		if err := sqlRows.Scan(&id, &agentID, &kind, &title, &body, &contextJSON,
			&taskID, &itemStatus, &resolutionNote, &createdAt, &updatedAt, &resolvedAt); err != nil {
			continue
		}
		item := map[string]interface{}{
			"id":        id,
			"agent_id":  agentID,
			"kind":      kind,
			"title":     title,
			"status":    itemStatus,
			"createdAt": createdAt,
			"updatedAt": updatedAt,
		}
		if body != nil {
			item["body"] = *body
		}
		if contextJSON != nil && *contextJSON != "" {
			var ctx interface{}
			if json.Unmarshal([]byte(*contextJSON), &ctx) == nil {
				item["context"] = ctx
			}
		}
		if taskID != nil {
			item["task_id"] = *taskID
		}
		if resolutionNote != nil {
			item["resolution_note"] = *resolutionNote
		}
		if resolvedAt != nil {
			item["resolvedAt"] = *resolvedAt
		}
		items = append(items, item)
	}
	_ = rows

	return okResult(map[string]interface{}{"items": items, "count": len(items)})
}

// ── inbox-resolve ─────────────────────────────────────────────────────────────
// Resolves an inbox item and optionally moves the linked task to completed.
// Params:
//   id               int     inbox item ID (required)
//   resolution       string  "approved" | "rejected" | "dismissed" (required)
//   resolution_note  string  optional human note

func (b *BridgeHandler) inboxResolve(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store unavailable", 503)
	}

	idRaw, ok := params["id"]
	if !ok {
		return errResultStatus("id required", 400)
	}
	var itemID int64
	switch v := idRaw.(type) {
	case float64:
		itemID = int64(v)
	case int64:
		itemID = v
	default:
		return errResultStatus("id must be a number", 400)
	}

	resolution, ok := params["resolution"].(string)
	if !ok || resolution == "" {
		return errResultStatus("resolution required (approved|rejected|dismissed)", 400)
	}
	if resolution != "approved" && resolution != "rejected" && resolution != "dismissed" {
		return errResultStatus("resolution must be approved, rejected, or dismissed", 400)
	}

	note, _ := params["resolution_note"].(string)
	now := time.Now().UnixMilli()

	db := b.store.DB()

	// Fetch the item to get task_id before updating
	var taskID *string
	var contextJSON *string
	db.QueryRow(`SELECT task_id, context_json FROM inbox_items WHERE id = ?`, itemID).Scan(&taskID, &contextJSON)

	_, err := db.Exec(
		`UPDATE inbox_items
		 SET status = ?, resolution_note = ?, updated_at = ?, resolved_at = ?
		 WHERE id = ?`,
		resolution, note, now, now, itemID,
	)
	if err != nil {
		return errResultStatus(fmt.Sprintf("inbox-resolve update: %v", err), 500)
	}

	// If approved and linked to a task → move task to completed
	if resolution == "approved" && taskID != nil && *taskID != "" {
		patch := map[string]interface{}{"status": "completed"}
		_, _ = b.store.UpdateTask(*taskID, patch)
	}

	result := map[string]interface{}{
		"id":         itemID,
		"resolution": resolution,
		"resolvedAt": now,
	}
	if contextJSON != nil && *contextJSON != "" {
		var ctx interface{}
		if json.Unmarshal([]byte(*contextJSON), &ctx) == nil {
			result["context"] = ctx
		}
	}
	return okResult(result)
}
