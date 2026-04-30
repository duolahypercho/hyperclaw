// Package bridge — Stripe ARR (Annual Recurring Revenue) bridge actions.
//
// Design notes:
//   - The Stripe API key is stored in the existing encrypted credentials.enc
//     file under provider="stripe" (see internal/credentials). The dashboard
//     ships the key end-to-end encrypted via the existing credentials:store
//     action; this file never sees plaintext key material on the wire.
//   - The computed ARR/MRR is cached as JSON in the kv table under key
//     "stripe:arr:cache". Each successful refresh also appends a row to
//     stripe_revenue_snapshots (capped at 500 rows) for history and agent use.
//   - All Stripe network calls are on-demand (triggered by stripe-arr-refresh
//     or by stripe-arr-get when the cache is stale). There are no background
//     goroutines, tickers, or in-memory caches — the connector stays cold
//     unless the dashboard pulls it.
//   - ARR is grouped by currency. Stripe data is multi-currency by nature; we
//     never sum across currencies because the result would be meaningless.
package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/credentials"
)

const (
	stripeARRCacheKey  = "stripe:arr:cache"
	stripeProviderName = "stripe"
	stripeAPIBase      = "https://api.stripe.com/v1"
	stripeARRCacheTTL  = 6 * time.Hour
	stripeHTTPTimeout  = 25 * time.Second
)

var (
	stripeHTTPClient       = &http.Client{}
	stripeStatusesIncluded = []string{"active", "trialing", "past_due"}
)

// arrCacheEntry is the JSON shape stored in the kv table and snapshot rows.
type arrCacheEntry struct {
	ByCurrency       map[string]int64 `json:"by_currency"`       // currency code → ARR in minor units (annual)
	ByCurrencyMRR    map[string]int64 `json:"by_currency_mrr"`   // same keys → MRR in minor units (normalized monthly)
	StatusesIncluded []string         `json:"statuses_included"` // subscription statuses included in the totals
	Subs             int              `json:"subscriptions"`     // total counted subscriptions
	ComputedAt       int64            `json:"computed_at"`       // unix ms
	TTLSeconds       int              `json:"ttl_seconds"`
	StripeAcct       string           `json:"stripe_account,omitempty"` // acct_xxx if available (Connect mode)
	LiveMode         bool             `json:"live_mode"`
}

// fillMRRFromARR sets by_currency_mrr from by_currency (MRR ≈ ARR/12, rounded
// to the nearest minor unit). Single source of truth after annualized sums.
func fillMRRFromARR(entry *arrCacheEntry) {
	if entry == nil || len(entry.ByCurrency) == 0 {
		if entry != nil {
			entry.ByCurrencyMRR = map[string]int64{}
		}
		return
	}
	entry.ByCurrencyMRR = make(map[string]int64, len(entry.ByCurrency))
	for c, arrMinor := range entry.ByCurrency {
		entry.ByCurrencyMRR[c] = roundAnnualToMRRMinor(arrMinor)
	}
}

func roundAnnualToMRRMinor(annualMinor int64) int64 {
	if annualMinor >= 0 {
		return (annualMinor + 6) / 12
	}
	return (annualMinor - 6) / 12
}

// stripeSubscriptionsPage is the subset of the Stripe response we need.
type stripeSubscriptionsPage struct {
	Data []struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Currency string `json:"currency"`
		Discount *struct {
			Coupon struct {
				PercentOff *float64 `json:"percent_off"`
			} `json:"coupon"`
		} `json:"discount"`
		Items struct {
			Data []struct {
				Quantity int64 `json:"quantity"`
				Price    struct {
					UnitAmount *int64 `json:"unit_amount"`
					Currency   string `json:"currency"`
					Recurring  *struct {
						Interval      string `json:"interval"`
						IntervalCount int    `json:"interval_count"`
					} `json:"recurring"`
				} `json:"price"`
			} `json:"data"`
		} `json:"items"`
	} `json:"data"`
	HasMore bool `json:"has_more"`
}

// stripeAccount is the subset of the /v1/account response we use to confirm
// the key works and surface the account ID + livemode flag.
type stripeAccount struct {
	ID       string `json:"id"`
	Livemode bool   `json:"livemode"`
}

// loadStripeKey returns the plaintext Stripe API key from credentials.enc, or
// an empty string if none is configured.
func (b *BridgeHandler) loadStripeKey() (string, error) {
	if b.deviceKey == nil {
		return "", fmt.Errorf("device key not available")
	}
	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return "", fmt.Errorf("load credentials: %w", err)
	}
	all := store.GetAll()
	cred, ok := all[stripeProviderName]
	if !ok {
		return "", nil
	}
	return strings.TrimSpace(cred.Key), nil
}

// stripeArrStatus reports whether a Stripe key is configured and surfaces the
// most recent cache metadata. Cheap — no Stripe network calls.
func (b *BridgeHandler) stripeArrStatus(_ map[string]interface{}) actionResult {
	key, err := b.loadStripeKey()
	if err != nil {
		return errResult(err.Error())
	}
	connected := key != ""

	out := map[string]interface{}{
		"connected": connected,
	}
	if b.store != nil {
		if n, err := b.store.StripeRevenueSnapshotsCount(); err == nil {
			out["snapshot_count"] = n
		}
		raw, _ := b.store.KVGet(stripeARRCacheKey)
		if raw != "" {
			var entry arrCacheEntry
			if json.Unmarshal([]byte(raw), &entry) == nil {
				if len(entry.ByCurrencyMRR) == 0 && len(entry.ByCurrency) > 0 {
					fillMRRFromARR(&entry)
				}
				out["cache"] = entry
			}
		}
	}
	return okResult(out)
}

// stripeArrGet returns the cached ARR. Refreshes if the cache is missing or
// older than stripeARRCacheTTL.
func (b *BridgeHandler) stripeArrGet(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}
	raw, _ := b.store.KVGet(stripeARRCacheKey)
	if raw != "" {
		var entry arrCacheEntry
		if err := json.Unmarshal([]byte(raw), &entry); err == nil {
			if len(entry.ByCurrencyMRR) == 0 && len(entry.ByCurrency) > 0 {
				fillMRRFromARR(&entry)
			}
			if time.Since(time.UnixMilli(entry.ComputedAt)) < stripeARRCacheTTL {
				return okResult(map[string]interface{}{
					"cache":     entry,
					"stale":     false,
					"refreshed": false,
				})
			}
		}
	}
	// Miss or stale — refresh inline.
	return b.stripeArrRefresh(params)
}

// stripeArrRefresh forces a re-pull from Stripe and overwrites the cache.
// Returns the same shape as stripeArrGet so the dashboard can rerender uniformly.
func (b *BridgeHandler) stripeArrRefresh(_ map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}
	key, err := b.loadStripeKey()
	if err != nil {
		return errResult(err.Error())
	}
	if key == "" {
		return errResult("no Stripe key configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), stripeHTTPTimeout*4)
	defer cancel()

	acct, err := stripeFetchAccount(ctx, key)
	if err != nil {
		return errResult(fmt.Sprintf("Stripe authentication failed: %v", err))
	}

	entry, err := stripeComputeARR(ctx, key)
	if err != nil {
		return errResult(fmt.Sprintf("Stripe ARR fetch failed: %v", err))
	}
	entry.StripeAcct = acct.ID
	entry.LiveMode = acct.Livemode
	entry.ComputedAt = time.Now().UnixMilli()
	entry.TTLSeconds = int(stripeARRCacheTTL / time.Second)

	payload, err := json.Marshal(entry)
	if err != nil {
		return errResult(fmt.Sprintf("marshal arr cache: %v", err))
	}
	if err := b.store.StripeRevenueSnapshotStoreLatest(stripeARRCacheKey, entry.ComputedAt, string(payload)); err != nil {
		return errResult(fmt.Sprintf("persist stripe revenue snapshot: %v", err))
	}
	return okResult(map[string]interface{}{
		"cache":     entry,
		"stale":     false,
		"refreshed": true,
	})
}

// stripeArrDisconnect removes the Stripe credential and clears the ARR cache.
func (b *BridgeHandler) stripeArrDisconnect(_ map[string]interface{}) actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}
	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return errResult("load credentials: " + err.Error())
	}
	store.Delete(stripeProviderName)
	if err := credentials.SaveCredentials(b.paths.HyperClaw, b.deviceKey, store); err != nil {
		return errResult("save credentials: " + err.Error())
	}
	if b.store != nil {
		_ = b.store.KVDelete(stripeARRCacheKey)
		_ = b.store.StripeRevenueSnapshotsDeleteAll()
	}
	return okResult(map[string]interface{}{"success": true})
}

// stripeArrSnapshotsList returns recent persisted ARR/MRR snapshots (newest first).
func (b *BridgeHandler) stripeArrSnapshotsList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}
	limit := 100
	if v, ok := params["limit"].(float64); ok && v > 0 {
		limit = int(v)
	}
	rows, err := b.store.StripeRevenueSnapshotsList(limit)
	if err != nil {
		return errResult(err.Error())
	}
	out := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		var cache arrCacheEntry
		if parseErr := json.Unmarshal([]byte(r.Data), &cache); parseErr != nil {
			out = append(out, map[string]interface{}{
				"id":             r.ID,
				"computed_at_ms": r.ComputedAtMs,
				"parse_error":    parseErr.Error(),
			})
			continue
		}
		if len(cache.ByCurrencyMRR) == 0 && len(cache.ByCurrency) > 0 {
			fillMRRFromARR(&cache)
		}
		out = append(out, map[string]interface{}{
			"id":             r.ID,
			"computed_at_ms": r.ComputedAtMs,
			"cache":          cache,
		})
	}
	return okResult(map[string]interface{}{
		"snapshots": out,
	})
}

// ── Stripe HTTP helpers ─────────────────────────────────────────────────────

func stripeFetchAccount(ctx context.Context, key string) (*stripeAccount, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, stripeAPIBase+"/account", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Stripe-Version", "2024-06-20")

	body, err := stripeDo(req)
	if err != nil {
		return nil, err
	}
	var acct stripeAccount
	if err := json.Unmarshal(body, &acct); err != nil {
		return nil, fmt.Errorf("decode account: %w", err)
	}
	return &acct, nil
}

// stripeComputeARR pages through active/trialing/past_due subscriptions and
// builds a per-currency ARR breakdown. Uses 3 separate calls because the
// Stripe API only accepts a single `status` value per request.
func stripeComputeARR(ctx context.Context, key string) (arrCacheEntry, error) {
	entry := arrCacheEntry{
		ByCurrency:       map[string]int64{},
		StatusesIncluded: append([]string(nil), stripeStatusesIncluded...),
	}
	seenSubs := map[string]struct{}{}

	for _, status := range stripeStatusesIncluded {
		startingAfter := ""
		for {
			page, err := stripeFetchSubscriptionsPage(ctx, key, status, startingAfter)
			if err != nil {
				return entry, err
			}
			for _, sub := range page.Data {
				if _, seen := seenSubs[sub.ID]; seen {
					continue
				}
				seenSubs[sub.ID] = struct{}{}
				entry.Subs++
				discount := 1.0
				if sub.Discount != nil && sub.Discount.Coupon.PercentOff != nil {
					discount = 1 - (*sub.Discount.Coupon.PercentOff / 100.0)
					if discount < 0 {
						discount = 0
					}
				}
				for _, item := range sub.Items.Data {
					if item.Price.Recurring == nil || item.Price.UnitAmount == nil {
						continue // metered/usage-based or one-time — skip
					}
					qty := item.Quantity
					if qty <= 0 {
						qty = 1
					}
					factor := annualFactor(item.Price.Recurring.Interval, item.Price.Recurring.IntervalCount)
					if factor == 0 {
						continue
					}
					unit := *item.Price.UnitAmount
					annualMinor := int64(float64(unit*qty) * factor * discount)
					currency := strings.ToLower(item.Price.Currency)
					if currency == "" {
						currency = strings.ToLower(sub.Currency)
					}
					entry.ByCurrency[currency] += annualMinor
				}
			}
			if !page.HasMore || len(page.Data) == 0 {
				break
			}
			startingAfter = page.Data[len(page.Data)-1].ID
		}
	}
	fillMRRFromARR(&entry)
	return entry, nil
}

func stripeFetchSubscriptionsPage(ctx context.Context, key, status, startingAfter string) (*stripeSubscriptionsPage, error) {
	q := url.Values{}
	q.Set("status", status)
	q.Set("limit", "100")
	q.Add("expand[]", "data.items.data.price")
	if startingAfter != "" {
		q.Set("starting_after", startingAfter)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, stripeAPIBase+"/subscriptions?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Stripe-Version", "2024-06-20")

	body, err := stripeDo(req)
	if err != nil {
		return nil, err
	}
	var page stripeSubscriptionsPage
	if err := json.Unmarshal(body, &page); err != nil {
		return nil, fmt.Errorf("decode subscriptions: %w", err)
	}
	return &page, nil
}

// stripeDo executes a Stripe request and returns the body, surfacing API
// errors with the message Stripe sends back rather than a bare HTTP status.
func stripeDo(req *http.Request) ([]byte, error) {
	resp, err := stripeHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		var errEnv struct {
			Error struct {
				Message string `json:"message"`
				Type    string `json:"type"`
			} `json:"error"`
		}
		if json.Unmarshal(body, &errEnv) == nil && errEnv.Error.Message != "" {
			return nil, fmt.Errorf("%s (%s)", errEnv.Error.Message, errEnv.Error.Type)
		}
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return body, nil
}

// annualFactor converts a Stripe billing interval into a multiplier that
// turns the per-period unit_amount into an annual figure.
func annualFactor(interval string, intervalCount int) float64 {
	if intervalCount <= 0 {
		intervalCount = 1
	}
	switch strings.ToLower(interval) {
	case "month":
		return 12.0 / float64(intervalCount)
	case "year":
		return 1.0 / float64(intervalCount)
	case "week":
		return 52.0 / float64(intervalCount)
	case "day":
		return 365.0 / float64(intervalCount)
	}
	return 0
}
