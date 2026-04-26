import { describe, expect, it } from "vitest";
import {
  getDefaultMemorySearchModel,
  getMemorySearchProviderOption,
  normalizeMemorySearchProvider,
  parseOpenClawBoolean,
  resolveMemorySearchSettings,
  unwrapOpenClawConfigValue,
} from "$/components/Home/widgets/openclaw-memory-search";

describe("openclaw memory search settings", () => {
  it("treats an onboarding provider as enabled even without an explicit enabled flag", () => {
    expect(resolveMemorySearchSettings({
      enabledValue: null,
      providerValue: "gemini",
      modelValue: null,
    })).toEqual({
      enabled: true,
      provider: "gemini",
      model: getDefaultMemorySearchModel("gemini"),
    });
  });

  it("respects an explicit disabled flag over a configured provider", () => {
    expect(resolveMemorySearchSettings({
      enabledValue: "false",
      providerValue: "gemini",
      modelValue: "text-embedding-004",
    })).toEqual({
      enabled: false,
      provider: "gemini",
      model: "text-embedding-004",
    });
  });

  it("normalizes connector config responses without converting null to enabled", () => {
    expect(unwrapOpenClawConfigValue({ value: null })).toBeNull();
    expect(unwrapOpenClawConfigValue({ value: "  gemini  " })).toBe("gemini");
    expect(parseOpenClawBoolean("1")).toBe(true);
    expect(parseOpenClawBoolean("0")).toBe(false);
  });

  it("does not auto-enable corrupted provider values", () => {
    expect(normalizeMemorySearchProvider("unknown-provider")).toBeNull();
    expect(resolveMemorySearchSettings({
      enabledValue: null,
      providerValue: "unknown-provider",
      modelValue: null,
    })).toEqual({
      enabled: false,
      provider: "openai",
      model: getDefaultMemorySearchModel("openai"),
    });
  });

  it("falls back to the default provider option for unknown ids", () => {
    expect(getMemorySearchProviderOption("not-real").id).toBe("openai");
  });
});
