import { describe, expect, it } from "vitest";
import { isLongRunningBridgeAction } from "$/lib/hub-direct";

describe("hub direct bridge action routing", () => {
  it("treats individual onboarding agent provisioning as long-running", () => {
    expect(isLongRunningBridgeAction("onboarding-provision-agent")).toBe(true);
    expect(isLongRunningBridgeAction("onboarding-provision-workspace")).toBe(true);
    expect(isLongRunningBridgeAction("onboarding-install-runtime")).toBe(true);
    expect(isLongRunningBridgeAction("onboarding-configure-workspace")).toBe(true);
    expect(isLongRunningBridgeAction("openclaw-doctor-fix")).toBe(true);
    expect(isLongRunningBridgeAction("hermes-chat")).toBe(false);
    expect(isLongRunningBridgeAction(undefined)).toBe(false);
  });
});
