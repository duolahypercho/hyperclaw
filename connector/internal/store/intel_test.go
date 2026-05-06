package store

import (
	"encoding/json"
	"testing"
)

func TestIntelStoreUpdateAndDeleteAllowRowIDWhere(t *testing.T) {
	store, err := NewIntelStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewIntelStore() error = %v", err)
	}
	defer store.Close()

	if _, err := store.Insert("contacts", map[string]interface{}{"name": "first"}, "agent-a"); err != nil {
		t.Fatalf("Insert(first) error = %v", err)
	}
	if _, err := store.Insert("contacts", map[string]interface{}{"name": "second"}, "agent-a"); err != nil {
		t.Fatalf("Insert(second) error = %v", err)
	}

	queryResult, err := store.Query(`SELECT _rowid_ AS "__hyperclaw_rowid", * FROM "contacts" WHERE id IS NULL ORDER BY _rowid_ ASC`)
	if err != nil {
		t.Fatalf("Query() error = %v", err)
	}
	rows := queryResult["rows"].([]map[string]interface{})
	if len(rows) != 2 {
		t.Fatalf("expected two rows with null primary keys, got %d", len(rows))
	}

	firstRowID := rows[0]["__hyperclaw_rowid"]
	if firstRowID == nil {
		t.Fatal("expected query to expose an internal rowid")
	}

	where := map[string]interface{}{"rowid": firstRowID}
	encodedWhere, err := json.Marshal(where)
	if err != nil {
		t.Fatalf("Marshal(where) error = %v", err)
	}
	var jsonWhere map[string]interface{}
	if err := json.Unmarshal(encodedWhere, &jsonWhere); err != nil {
		t.Fatalf("Unmarshal(where) error = %v", err)
	}
	if _, ok := jsonWhere["rowid"].(float64); !ok {
		t.Fatalf("json rowid type = %T, want float64", jsonWhere["rowid"])
	}

	if _, err := store.Update(
		"contacts",
		map[string]interface{}{"status": "qualified"},
		jsonWhere,
	); err != nil {
		t.Fatalf("Update(rowid) error = %v", err)
	}

	if _, err := store.Update(
		"contacts",
		map[string]interface{}{"rowid": 99},
		map[string]interface{}{"rowid": firstRowID},
	); err == nil {
		t.Fatal("Update(data rowid) error = nil, want rejection")
	}

	updatedResult, err := store.Query(`SELECT _rowid_ AS "__hyperclaw_rowid", status FROM "contacts" ORDER BY _rowid_ ASC`)
	if err != nil {
		t.Fatalf("Query(updated) error = %v", err)
	}
	updatedRows := updatedResult["rows"].([]map[string]interface{})
	if got := updatedRows[0]["status"]; got != "qualified" {
		t.Fatalf("first row status = %v, want qualified", got)
	}
	if got := updatedRows[1]["status"]; got == "qualified" {
		t.Fatalf("second row status = %v, rowid update touched more than one row", got)
	}

	if _, err := store.Delete("contacts", map[string]interface{}{"rowid": firstRowID}); err != nil {
		t.Fatalf("Delete(rowid) error = %v", err)
	}

	remainingResult, err := store.Query(`SELECT _rowid_ AS "__hyperclaw_rowid", * FROM "contacts" WHERE id IS NULL`)
	if err != nil {
		t.Fatalf("Query(remaining) error = %v", err)
	}
	remainingRows := remainingResult["rows"].([]map[string]interface{})
	if len(remainingRows) != 1 {
		t.Fatalf("remaining rows = %d, want 1", len(remainingRows))
	}
}

func TestIntelStoreQuerySerializesUnsafeIntegersAsStrings(t *testing.T) {
	store, err := NewIntelStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewIntelStore() error = %v", err)
	}
	defer store.Close()

	const firstID = "2051718910555156700"
	const secondID = "2051718910555156701"

	if _, err := store.Execute(`
		CREATE TABLE big_ids (
			id INTEGER PRIMARY KEY,
			label TEXT NOT NULL
		)
	`, ""); err != nil {
		t.Fatalf("Create big_ids error = %v", err)
	}
	if _, err := store.Execute(`
		INSERT INTO big_ids (id, label)
		VALUES (2051718910555156700, 'first'), (2051718910555156701, 'second')
	`, ""); err != nil {
		t.Fatalf("Insert big ids error = %v", err)
	}

	queryResult, err := store.Query(`SELECT _rowid_ AS "__hyperclaw_rowid", id, label FROM big_ids ORDER BY id ASC`)
	if err != nil {
		t.Fatalf("Query(big_ids) error = %v", err)
	}
	rows := queryResult["rows"].([]map[string]interface{})
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}

	if got := rows[0]["id"]; got != firstID {
		t.Fatalf("first id = %#v (%T), want %q", got, got, firstID)
	}
	if got := rows[1]["id"]; got != secondID {
		t.Fatalf("second id = %#v (%T), want %q", got, got, secondID)
	}
	if got := rows[0]["__hyperclaw_rowid"]; got != firstID {
		t.Fatalf("first rowid = %#v (%T), want %q", got, got, firstID)
	}

	if _, err := store.Update("big_ids", map[string]interface{}{"label": "updated"}, map[string]interface{}{"rowid": rows[0]["__hyperclaw_rowid"]}); err != nil {
		t.Fatalf("Update(big rowid string) error = %v", err)
	}
	updatedResult, err := store.Query(`SELECT label FROM big_ids WHERE id = 2051718910555156700`)
	if err != nil {
		t.Fatalf("Query(updated big rowid) error = %v", err)
	}
	updatedRows := updatedResult["rows"].([]map[string]interface{})
	if got := updatedRows[0]["label"]; got != "updated" {
		t.Fatalf("updated label = %v, want updated", got)
	}

	if _, err := store.Delete("big_ids", map[string]interface{}{"rowid": rows[1]["__hyperclaw_rowid"]}); err != nil {
		t.Fatalf("Delete(big rowid string) error = %v", err)
	}
	remainingResult, err := store.Query(`SELECT id FROM big_ids`)
	if err != nil {
		t.Fatalf("Query(remaining big_ids) error = %v", err)
	}
	remainingRows := remainingResult["rows"].([]map[string]interface{})
	if len(remainingRows) != 1 {
		t.Fatalf("remaining big id rows = %d, want 1", len(remainingRows))
	}

	encodedRows, err := json.Marshal(rows)
	if err != nil {
		t.Fatalf("Marshal(rows) error = %v", err)
	}
	var jsonRows []map[string]interface{}
	if err := json.Unmarshal(encodedRows, &jsonRows); err != nil {
		t.Fatalf("Unmarshal(rows) error = %v", err)
	}
	if got := jsonRows[0]["id"]; got != firstID {
		t.Fatalf("json first id = %#v (%T), want %q", got, got, firstID)
	}
	if got := jsonRows[1]["id"]; got != secondID {
		t.Fatalf("json second id = %#v (%T), want %q", got, got, secondID)
	}
}
