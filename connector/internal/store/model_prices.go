package store

// ModelPrice holds pricing for one model at a point in time.
type ModelPrice struct {
	Model          string
	InputPer1M     float64
	OutputPer1M    float64
	CacheReadPer1M float64
	EffectiveFrom  int64
}

// seedPrices is the built-in price table. Add new entries when prices change;
// old entries are kept for historical cost accuracy.
var seedPrices = []ModelPrice{
	// Anthropic
	{Model: "claude-opus-4-6", InputPer1M: 15.0, OutputPer1M: 75.0, CacheReadPer1M: 1.5, EffectiveFrom: 0},
	{Model: "claude-sonnet-4-6", InputPer1M: 3.0, OutputPer1M: 15.0, CacheReadPer1M: 0.30, EffectiveFrom: 0},
	{Model: "claude-haiku-4-5", InputPer1M: 0.80, OutputPer1M: 4.0, CacheReadPer1M: 0.08, EffectiveFrom: 0},
	// OpenAI
	{Model: "gpt-4o", InputPer1M: 2.50, OutputPer1M: 10.0, EffectiveFrom: 0},
	{Model: "gpt-4o-mini", InputPer1M: 0.15, OutputPer1M: 0.60, EffectiveFrom: 0},
	{Model: "o3", InputPer1M: 10.0, OutputPer1M: 40.0, EffectiveFrom: 0},
	{Model: "o4-mini", InputPer1M: 1.10, OutputPer1M: 4.40, EffectiveFrom: 0},
}

// SeedModelPrices inserts built-in prices using INSERT OR IGNORE so existing
// rows (including user-added entries) are never overwritten.
func (s *Store) SeedModelPrices() error {
	for _, p := range seedPrices {
		_, err := s.db.Exec(`
			INSERT OR IGNORE INTO model_prices
				(model, input_per_1m, output_per_1m, cache_read_per_1m, effective_from)
			VALUES (?, ?, ?, ?, ?)
		`, p.Model, p.InputPer1M, p.OutputPer1M, p.CacheReadPer1M, p.EffectiveFrom)
		if err != nil {
			return err
		}
	}
	return nil
}

// ComputeCostUSD calculates cost for a usage record using the most recent
// price row for the given model that is <= recordedAt.
func (s *Store) ComputeCostUSD(model string, inputTokens, outputTokens, cacheReadTokens int64, recordedAt int64) float64 {
	var p ModelPrice
	err := s.db.QueryRow(`
		SELECT input_per_1m, output_per_1m, cache_read_per_1m
		FROM model_prices
		WHERE model = ? AND effective_from <= ?
		ORDER BY effective_from DESC LIMIT 1
	`, model, recordedAt).Scan(&p.InputPer1M, &p.OutputPer1M, &p.CacheReadPer1M)
	if err != nil {
		return 0
	}
	return (float64(inputTokens)*p.InputPer1M +
		float64(outputTokens)*p.OutputPer1M +
		float64(cacheReadTokens)*p.CacheReadPer1M) / 1_000_000
}

