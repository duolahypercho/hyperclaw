/**
 * Stripe ARR client.
 *
 * The Stripe restricted key is stored on the connector via the existing
 * end-to-end-encrypted credentials flow (see lib/credential-client.ts).
 * Computation and caching happen entirely on the connector — see
 * hyperclaw-connector/internal/bridge/stripe_arr.go.
 *
 * Numbers come back in minor currency units (cents) keyed by ISO 4217
 * lowercase codes ("usd", "eur", ...). Never sum across currencies; render
 * the largest one and disclose the others.
 */
import { storeAndApply } from "./credential-client";
import { bridgeInvoke } from "./hyperclaw-bridge-client";

export interface ArrCacheEntry {
  by_currency: Record<string, number>;
  subscriptions: number;
  computed_at: number;
  ttl_seconds: number;
  stripe_account?: string;
  live_mode: boolean;
}

export interface StripeArrResponse {
  cache: ArrCacheEntry | null;
  stale?: boolean;
  refreshed?: boolean;
}

export interface StripeArrStatus {
  connected: boolean;
  cache?: ArrCacheEntry;
}

const STRIPE_PROVIDER = "stripe";

/**
 * Push a Stripe restricted key to the connector (E2E encrypted), then run
 * an immediate refresh to validate the key and warm the cache.
 */
export async function connectStripe(
  deviceId: string,
  apiKey: string
): Promise<{ success: boolean; cache?: ArrCacheEntry; error?: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { success: false, error: "API key is empty" };
  if (!isPlausibleStripeKey(trimmed)) {
    return {
      success: false,
      error:
        "That doesn't look like a Stripe key. Restricted keys start with rk_live_ or rk_test_.",
    };
  }

  const stored = await storeAndApply(deviceId, STRIPE_PROVIDER, "api_key", trimmed);
  if (!stored.success) {
    return { success: false, error: stored.error || "Failed to store key" };
  }

  try {
    const refreshed = (await bridgeInvoke("stripe-arr-refresh", {})) as
      | StripeArrResponse
      | { success?: false; error?: string };

    // Error envelope from the connector (bad key, Stripe 401, no subs, etc.)
    if (refreshed && typeof refreshed === "object") {
      if ("error" in refreshed && refreshed.error) {
        return { success: false, error: refreshed.error };
      }
      if ("success" in refreshed && refreshed.success === false) {
        return {
          success: false,
          error: (refreshed as { error?: string }).error || "Stripe refresh failed",
        };
      }
    }

    const stripeResp = refreshed as StripeArrResponse;
    if (!stripeResp.cache) {
      return { success: false, error: "Stripe responded but no cache was returned" };
    }
    return { success: true, cache: stripeResp.cache };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe refresh failed";
    return { success: false, error: msg };
  }
}

export async function getStripeArrStatus(): Promise<StripeArrStatus> {
  try {
    return (await bridgeInvoke("stripe-arr-status", {})) as StripeArrStatus;
  } catch {
    return { connected: false };
  }
}

export async function getStripeArr(): Promise<StripeArrResponse | null> {
  try {
    return (await bridgeInvoke("stripe-arr-get", {})) as StripeArrResponse;
  } catch {
    return null;
  }
}

export async function refreshStripeArr(): Promise<StripeArrResponse | null> {
  try {
    return (await bridgeInvoke("stripe-arr-refresh", {})) as StripeArrResponse;
  } catch {
    return null;
  }
}

export async function disconnectStripe(): Promise<boolean> {
  try {
    const res = (await bridgeInvoke("stripe-arr-disconnect", {})) as { success?: boolean };
    return !!res?.success;
  } catch {
    return false;
  }
}

/**
 * Format a minor-units integer (cents) as a localized currency string.
 * Defaults to USD when the currency is not a recognized 3-letter code.
 */
export function formatARR(minorUnits: number, currency: string): string {
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(0)} ${code}`;
  }
}

/**
 * Pick the dominant currency for a one-line summary. Returns null when the
 * cache has no recurring revenue at all.
 */
export function dominantCurrency(
  byCurrency: Record<string, number>
): { currency: string; amount: number } | null {
  let bestCurrency = "";
  let bestAmount = 0;
  for (const [currency, amount] of Object.entries(byCurrency)) {
    if (amount > bestAmount) {
      bestAmount = amount;
      bestCurrency = currency;
    }
  }
  if (!bestCurrency) return null;
  return { currency: bestCurrency, amount: bestAmount };
}

/**
 * Loose plausibility check — full validation happens on the connector when
 * we hit /v1/account. This blocks obvious typos and accidentally-pasted
 * webhook secrets before we ship them through E2E encryption.
 */
function isPlausibleStripeKey(key: string): boolean {
  return /^(rk|sk)_(live|test)_[A-Za-z0-9]{16,}$/.test(key);
}
