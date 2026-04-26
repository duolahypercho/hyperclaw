import { describe, expect, it, vi } from "vitest";
import {
  isPlausibleStripeKey,
  persistOnboardingStripeKey,
} from "$/components/Onboarding/onboarding-stripe-credential";

describe("onboarding Stripe credential persistence", () => {
  it("accepts Stripe restricted and secret key shapes", () => {
    expect(isPlausibleStripeKey("rk_live_1234567890abcdef")).toBe(true);
    expect(isPlausibleStripeKey("sk_test_1234567890abcdef")).toBe(true);
    expect(isPlausibleStripeKey("whsec_1234567890abcdef")).toBe(false);
  });

  it("does not attempt storage when the key shape is invalid", async () => {
    const storeAndApply = vi.fn();
    const bridgeInvoke = vi.fn();

    const result = await persistOnboardingStripeKey("device-1", "whsec_bad", {
      storeAndApply,
      bridgeInvoke,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Restricted keys start");
    expect(storeAndApply).not.toHaveBeenCalled();
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("requires a target device when a key was provided", async () => {
    const storeAndApply = vi.fn();
    const bridgeInvoke = vi.fn();

    const result = await persistOnboardingStripeKey(null, "rk_live_1234567890abcdef", {
      storeAndApply,
      bridgeInvoke,
    });

    expect(result).toEqual({
      success: false,
      error: "No paired device was available for Stripe setup.",
    });
    expect(storeAndApply).not.toHaveBeenCalled();
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("surfaces storage failures instead of treating onboarding as complete", async () => {
    const storeAndApply = vi.fn().mockResolvedValue({
      success: false,
      error: "Device has no encryption key. Is the connector running?",
    });

    const result = await persistOnboardingStripeKey(
      "device-1",
      "rk_live_1234567890abcdef",
      {
        storeAndApply,
        bridgeInvoke: vi.fn(),
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Device has no encryption key. Is the connector running?",
    });
  });

  it("stores the key and warms the ARR cache when Stripe refresh succeeds", async () => {
    const storeAndApply = vi.fn().mockResolvedValue({ success: true, provider: "stripe" });
    const bridgeInvoke = vi.fn().mockResolvedValue({
      cache: {
        by_currency: { usd: 120000 },
        subscriptions: 3,
        computed_at: 1,
        ttl_seconds: 21600,
        live_mode: true,
      },
    });

    const result = await persistOnboardingStripeKey(
      "device-1",
      " rk_live_1234567890abcdef ",
      { storeAndApply, bridgeInvoke },
    );

    expect(result).toEqual({ success: true, refreshed: true });
    expect(storeAndApply).toHaveBeenCalledWith(
      "device-1",
      "stripe",
      "api_key",
      "rk_live_1234567890abcdef",
    );
    expect(bridgeInvoke).toHaveBeenCalledWith("stripe-arr-refresh", {});
  });

  it("surfaces Stripe validation failures after storage", async () => {
    const result = await persistOnboardingStripeKey(
      "device-1",
      "rk_live_1234567890abcdef",
      {
        storeAndApply: vi.fn().mockResolvedValue({ success: true, provider: "stripe" }),
        bridgeInvoke: vi.fn().mockResolvedValue({
          success: false,
          error: "Stripe authentication failed: invalid API key",
        }),
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Stripe authentication failed: invalid API key",
    });
  });
});
