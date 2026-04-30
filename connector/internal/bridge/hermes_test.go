package bridge

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestExtractHermesSessionIDAcceptsHermesCLIAndUUIDForms(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"session_id: 20260426_010517_51f08c":                "20260426_010517_51f08c",
		"session_id: 95b9e019-db1c-4516-bb3d-61add08973a3":  "95b9e019-db1c-4516-bb3d-61add08973a3",
		"assistant said session_id: 20260426_010517_51f08c": "",
		"session_id: yes": "",
		"session_id: ab":  "",
	}

	for input, want := range cases {
		if got := extractHermesSessionID(input); got != want {
			t.Fatalf("extractHermesSessionID(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestShouldSuppressHermesCLILineFiltersNonUserNotices(t *testing.T) {
	t.Parallel()

	suppressed := []string{
		"↻ Resumed session 20260426_010517_51f08c",
		"⚠️ Normalized model 'minimax/MiniMax-M2.7' to 'MiniMax-M2.7' for minimax.",
		"Normalized model 'minimax/MiniMax-M2.7' to 'MiniMax-M2.7' for minimax.",
	}
	for _, line := range suppressed {
		if !shouldSuppressHermesCLILine(line) {
			t.Fatalf("expected %q to be suppressed", line)
		}
	}

	if shouldSuppressHermesCLILine("Here is the answer.") {
		t.Fatal("assistant content should not be suppressed")
	}
}

func TestAppendHermesCLIResumeArgOnlyUsesExistingSession(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	dbPath := filepath.Join(home, ".hermes", "profiles", "sage", "state.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO sessions (id) VALUES (?)`, "20260426_010517_51f08c"); err != nil {
		t.Fatal(err)
	}

	base := []string{"chat", "-q", "hello", "-Q"}
	params := map[string]interface{}{"sessionId": "20260426_010517_51f08c"}
	got := appendHermesCLIResumeArg(append([]string{}, base...), "sage", params)
	want := []string{"chat", "-q", "hello", "-Q", "--resume", "20260426_010517_51f08c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("appendHermesCLIResumeArg existing session = %#v, want %#v", got, want)
	}

	params["sessionId"] = "95b9e019-db1c-4516-bb3d-61add08973a3"
	got = appendHermesCLIResumeArg(append([]string{}, base...), "sage", params)
	if !reflect.DeepEqual(got, base) {
		t.Fatalf("appendHermesCLIResumeArg unknown session = %#v, want %#v", got, base)
	}

	params["sessionId"] = "20260426_010517_51f08c"
	got = appendHermesCLIResumeArg(append([]string{}, base...), "hermes:sage", params)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("appendHermesCLIResumeArg prefixed agent = %#v, want %#v", got, want)
	}

	rootDBPath := filepath.Join(home, ".hermes", "state.db")
	rootDB, err := sql.Open("sqlite", rootDBPath)
	if err != nil {
		t.Fatal(err)
	}
	defer rootDB.Close()
	if _, err := rootDB.Exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	if _, err := rootDB.Exec(`INSERT INTO sessions (id) VALUES (?)`, "20260426_010518_abcdef"); err != nil {
		t.Fatal(err)
	}

	params["sessionId"] = "20260426_010518_abcdef"
	got = appendHermesCLIResumeArg(append([]string{}, base...), "main", params)
	want = []string{"chat", "-q", "hello", "-Q", "--resume", "20260426_010518_abcdef"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("appendHermesCLIResumeArg main agent = %#v, want %#v", got, want)
	}
}

func TestLatestHermesCLISessionIDFindsSessionCreatedForCurrentTurn(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	dbPath := filepath.Join(home, ".hermes", "profiles", "sage", "state.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE sessions (id TEXT PRIMARY KEY, started_at REAL);
		CREATE TABLE messages (session_id TEXT, role TEXT, content TEXT, timestamp REAL);
	`); err != nil {
		t.Fatal(err)
	}

	notBefore := time.Now()
	oldStarted := float64(notBefore.Add(-30*time.Second).UnixNano()) / float64(time.Second)
	currentStarted := float64(notBefore.Add(1*time.Second).UnixNano()) / float64(time.Second)
	if _, err := db.Exec(`INSERT INTO sessions (id, started_at) VALUES (?, ?)`, "20260426_010000_old", oldStarted); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)`, "20260426_010000_old", "user", "hello", oldStarted); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO sessions (id, started_at) VALUES (?, ?)`, "20260426_010517_51f08c", currentStarted); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)`, "20260426_010517_51f08c", "user", "hello", currentStarted); err != nil {
		t.Fatal(err)
	}

	if got := latestHermesCLISessionID("sage", "hello", notBefore); got != "20260426_010517_51f08c" {
		t.Fatalf("latestHermesCLISessionID() = %q, want current turn session", got)
	}
	if got := latestHermesCLISessionID("missing", "hello", notBefore); got != "" {
		t.Fatalf("missing profile latestHermesCLISessionID() = %q, want empty", got)
	}
}

func TestHermesChatViaCLIResolvesSessionFromStateDBWhenMarkerMissing(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	binDir := t.TempDir()
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	hermesBin := filepath.Join(binDir, "hermes")
	if err := os.WriteFile(hermesBin, []byte("#!/bin/sh\nprintf 'hello from hermes\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	dbPath := filepath.Join(home, ".hermes", "profiles", "sage", "state.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE sessions (id TEXT PRIMARY KEY, started_at REAL);
		CREATE TABLE messages (session_id TEXT, role TEXT, content TEXT, timestamp REAL);
	`); err != nil {
		t.Fatal(err)
	}

	startedAt := float64(time.Now().Add(time.Second).UnixNano()) / float64(time.Second)
	if _, err := db.Exec(`INSERT INTO sessions (id, started_at) VALUES (?, ?)`, "20260426_010517_51f08c", startedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)`, "20260426_010517_51f08c", "user", "hello", startedAt); err != nil {
		t.Fatal(err)
	}

	result := (&BridgeHandler{}).hermesChatViaCLI("hello", map[string]interface{}{"agentId": "sage"})
	if result.err != nil {
		t.Fatalf("hermesChatViaCLI failed: %s", result.err)
	}
	resp, ok := result.data.(map[string]interface{})
	if !ok {
		t.Fatalf("result data = %#v, want map", result.data)
	}
	if got := resp["sessionId"]; got != "20260426_010517_51f08c" {
		t.Fatalf("sessionId = %#v, want state.db session", got)
	}
}

func TestHermesAPIAvailableRequiresAuthenticatedEndpoint(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("API_SERVER_KEY", "")

	if err := os.MkdirAll(filepath.Join(home, ".hermes"), 0o700); err != nil {
		t.Fatalf("mkdir hermes home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, ".hermes", ".env"), []byte("API_SERVER_KEY=current-key\n"), 0o600); err != nil {
		t.Fatalf("write hermes env: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/v1/models":
			if r.Header.Get("Authorization") != "Bearer current-key" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv("HERMES_API_URL", server.URL)

	if !hermesAPIAvailable() {
		t.Fatal("expected Hermes API to be available with the current API_SERVER_KEY")
	}
}

func TestHermesAPIAvailableRejectsStaleAPIKeyEvenWhenHealthIsOK(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("API_SERVER_KEY", "")

	if err := os.MkdirAll(filepath.Join(home, ".hermes"), 0o700); err != nil {
		t.Fatalf("mkdir hermes home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, ".hermes", ".env"), []byte("API_SERVER_KEY=stale-key\n"), 0o600); err != nil {
		t.Fatalf("write hermes env: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/v1/models":
			if r.Header.Get("Authorization") != "Bearer live-key" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv("HERMES_API_URL", server.URL)

	if hermesAPIAvailable() {
		t.Fatal("expected stale API_SERVER_KEY to make Hermes API unavailable")
	}
}

func TestHermesAPIAvailableAllowsLocalServerWithoutConfiguredKey(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("API_SERVER_KEY", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/models":
			if r.Header.Get("Authorization") != "" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv("HERMES_API_URL", server.URL)

	if !hermesAPIAvailable() {
		t.Fatal("expected Hermes API to be available when the local server has no configured key")
	}
}

func TestBuildHermesChatCompletionMessagesUsesHistory(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	got := buildHermesChatCompletionMessages(map[string]interface{}{
		"messages": []interface{}{
			map[string]interface{}{"role": "user", "content": "hello"},
			map[string]interface{}{"role": "assistant", "content": "hi"},
			map[string]interface{}{"role": "user", "content": "continue"},
		},
	}, "continue", "main")

	want := []map[string]interface{}{
		{"role": "user", "content": "hello"},
		{"role": "assistant", "content": "hi"},
		{"role": "user", "content": "continue"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("messages = %#v, want %#v", got, want)
	}
}

func TestHermesChatStreamViaAPIForwardsSSEDeltas(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if body["stream"] != true {
			t.Fatalf("stream = %#v, want true", body["stream"])
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()
	t.Setenv("HERMES_API_URL", server.URL)

	toHub := make(chan []byte, 100)
	(&BridgeHandler{}).hermesChatStreamViaAPI(
		context.Background(),
		"hello",
		map[string]interface{}{"messages": []interface{}{map[string]interface{}{"role": "user", "content": "hello"}}},
		"req-1",
		"session-key",
		"sess-1",
		"client-1",
		toHub,
	)

	var joined strings.Builder
	for len(toHub) > 0 {
		joined.Write(<-toHub)
		joined.WriteByte('\n')
	}
	out := joined.String()
	if !strings.Contains(out, `"delta":"Hel"`) || !strings.Contains(out, `"delta":"lo"`) {
		t.Fatalf("stream output did not include deltas: %s", out)
	}
	if !strings.Contains(out, `"content":"Hello"`) {
		t.Fatalf("final response did not include accumulated content: %s", out)
	}
}
