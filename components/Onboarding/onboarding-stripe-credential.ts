import { storeAndApply, type StoreCredentialResult } from "$/lib/credential-client";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

const STRIPE_PROVIDER = "stripe";
const STRIPE_CREDENTIAL_TYPE = "api_key";
const STRIPE_KEY_SHAPE = /^(rk|sk)_(live|test)_[A-Za-z0-9]{16,}$/;

export interface PersistOnboardingStripeKeyResult {
  success: boolean;
  error?: string;
  refreshed?: boolean;
  skipped?: boolean;
}

interface PersistOnboardingStripeKeyDeps {
  storeAndApply?: typeof storeAndApply;
  bridgeInvoke?: typeof bridgeInvoke;
}

export function isPlausibleStripeKey(key: string): boolean {
  return STRIPE_KEY_SHAPE.test(key.trim());
}

export async function persistOnboardingStripeKey(
  deviceId: string | null | undefined,
  apiKey: string | null | undefined,
  deps: PersistOnboardingStripeKeyDeps = {},
): Promise<PersistOnboardingStripeKeyResult> {
  const trimmed = apiKey?.trim() ?? "";
  if (!trimmed) return { success: true, skipped: true };

  if (!deviceId) {
    return { success: false, error: "No paired device was available for Stripe setup." };
  }

  if (!isPlausibleStripeKey(trimmed)) {
    return {
      success: false,
      error: "That doesn't look like a Stripe key. Restricted keys start with rk_live_ or rk_test_.",
    };
  }

  const saveCredential = deps.storeAndApply ?? storeAndApply;
  const invokeBridge = deps.bridgeInvoke ?? bridgeInvoke;
  const stored: StoreCredentialResult = await saveCredential(
    deviceId,
    STRIPE_PROVIDER,
    STRIPE_CREDENTIAL_TYPE,
    trimmed,
  );

  if (!stored.success) {
    return { success: false, error: stored.error || "Failed to store Stripe key on the connector." };
  }

  try {
    const refreshed = await invokeBridge("stripe-arr-refresh", {});
    if (refreshed && typeof refreshed === "object") {
      const result = refreshed as { success?: boolean; error?: string; cache?: unknown };
      if (result.success === false || result.error) {
        return {
          success: false,
          error: result.error || "Stripe key was stored, but Stripe validation failed.",
        };
      }
      return { success: true, refreshed: Boolean(result.cache) };
    }
    // Storage is the durable operation. If the bridge returns an unexpected
    // non-object response, keep the saved key and let the dashboard refresh later.
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe validation failed.";
    return { success: false, error: message };
  }

  return { success: true, refreshed: false };
}
