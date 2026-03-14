import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";

// Inline the schema so tests don't trigger the auto-validating `env` export
const serverSchema = z.object({
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
});

describe("env validation", () => {
  it("passes with valid required vars", () => {
    const result = serverSchema.safeParse({
      NEXTAUTH_URL: "http://localhost:1000",
      NEXTAUTH_SECRET: "test-secret-value",
    });
    expect(result.success).toBe(true);
  });

  it("fails when NEXTAUTH_URL is missing", () => {
    const result = serverSchema.safeParse({
      NEXTAUTH_SECRET: "test-secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("NEXTAUTH_URL"))).toBe(true);
    }
  });

  it("fails when NEXTAUTH_URL is not a valid URL", () => {
    const result = serverSchema.safeParse({
      NEXTAUTH_URL: "not-a-url",
      NEXTAUTH_SECRET: "test-secret",
    });
    expect(result.success).toBe(false);
  });

  it("fails when NEXTAUTH_SECRET is empty", () => {
    const result = serverSchema.safeParse({
      NEXTAUTH_URL: "http://localhost:1000",
      NEXTAUTH_SECRET: "",
    });
    expect(result.success).toBe(false);
  });

  it("passes with optional vars omitted", () => {
    const result = serverSchema.safeParse({
      NEXTAUTH_URL: "http://localhost:1000",
      NEXTAUTH_SECRET: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.GOOGLE_CLIENT_ID).toBeUndefined();
    }
  });

  it("defaults NODE_ENV to development", () => {
    const result = serverSchema.safeParse({
      NEXTAUTH_URL: "http://localhost:1000",
      NEXTAUTH_SECRET: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe("development");
    }
  });
});
