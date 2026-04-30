package bridge

import "testing"

func TestFillMRRFromARR(t *testing.T) {
	e := &arrCacheEntry{
		ByCurrency: map[string]int64{"usd": 12000, "eur": 600},
	}
	fillMRRFromARR(e)
	if e.ByCurrencyMRR["usd"] != 1000 {
		t.Fatalf("usd MRR: want 1000, got %d", e.ByCurrencyMRR["usd"])
	}
	if e.ByCurrencyMRR["eur"] != 50 {
		t.Fatalf("eur MRR: want 50, got %d", e.ByCurrencyMRR["eur"])
	}
}
