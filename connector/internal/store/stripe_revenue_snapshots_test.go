package store_test

import (
	"fmt"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestStripeRevenueSnapshotsInsertListDelete(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	for i := int64(0); i < 3; i++ {
		ms := int64(10_000 + i)
		payload := fmt.Sprintf(`{"by_currency":{"usd":12000},"subscriptions":1,"computed_at":%d}`, ms)
		if err := s.StripeRevenueSnapshotInsert(ms, payload); err != nil {
			t.Fatalf("insert %d: %v", i, err)
		}
	}

	rows, err := s.StripeRevenueSnapshotsList(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("want 3 rows, got %d", len(rows))
	}
	if rows[0].ComputedAtMs < rows[1].ComputedAtMs {
		t.Fatalf("expected newest first: %#v", rows)
	}

	n, err := s.StripeRevenueSnapshotsCount()
	if err != nil || n != 3 {
		t.Fatalf("count: n=%d err=%v", n, err)
	}

	if err := s.StripeRevenueSnapshotsDeleteAll(); err != nil {
		t.Fatal(err)
	}
	n, _ = s.StripeRevenueSnapshotsCount()
	if n != 0 {
		t.Fatalf("after delete all want 0, got %d", n)
	}
}

func TestStripeRevenueSnapshotStoreLatestWritesKVAndSnapshot(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	const cacheKey = "stripe:arr:cache"
	const payload = `{"by_currency":{"usd":12000},"by_currency_mrr":{"usd":1000},"subscriptions":1}`

	if err := s.StripeRevenueSnapshotStoreLatest(cacheKey, 1234, payload); err != nil {
		t.Fatal(err)
	}

	got, err := s.KVGet(cacheKey)
	if err != nil {
		t.Fatal(err)
	}
	if got != payload {
		t.Fatalf("kv payload: want %s, got %s", payload, got)
	}

	rows, err := s.StripeRevenueSnapshotsList(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 snapshot, got %d", len(rows))
	}
	if rows[0].ComputedAtMs != 1234 || rows[0].Data != payload {
		t.Fatalf("unexpected snapshot row: %#v", rows[0])
	}
}

func TestStripeRevenueSnapshotsPruneKeepsMax(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	max := store.StripeRevenueSnapshotMaxKeep
	extra := 12
	for i := 0; i < max+extra; i++ {
		ms := int64(i + 1)
		payload := fmt.Sprintf(`{"by_currency":{"usd":%d},"subscriptions":1}`, 100+i)
		if err := s.StripeRevenueSnapshotInsert(ms, payload); err != nil {
			t.Fatalf("insert %d: %v", i, err)
		}
	}

	n, err := s.StripeRevenueSnapshotsCount()
	if err != nil {
		t.Fatal(err)
	}
	if n != max {
		t.Fatalf("after prune want count %d, got %d", max, n)
	}

	rows, err := s.StripeRevenueSnapshotsList(max + 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != max {
		t.Fatalf("list want %d rows, got %d", max, len(rows))
	}
	// Oldest surviving row should be snapshot (extra+1) — first "extra" were pruned.
	wantOldestMs := int64(extra + 1)
	minMs := rows[len(rows)-1].ComputedAtMs
	if minMs != wantOldestMs {
		t.Fatalf("oldest row computed_at_ms: want %d, got %d", wantOldestMs, minMs)
	}
}
