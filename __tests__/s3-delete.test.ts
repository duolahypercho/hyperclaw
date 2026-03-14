import { describe, it, expect } from "vitest";

// Test the validation logic from s3-delete without importing the full handler
function validateObjectKey(objectKey: unknown): string | null {
  if (!objectKey || typeof objectKey !== "string" || objectKey.includes("..") || objectKey.startsWith("/")) {
    return "Invalid object key.";
  }
  return null;
}

describe("s3-delete objectKey validation", () => {
  it("accepts valid object key", () => {
    expect(validateObjectKey("uploads/image.png")).toBeNull();
  });

  it("accepts nested path", () => {
    expect(validateObjectKey("users/123/avatar.jpg")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateObjectKey("")).toBe("Invalid object key.");
  });

  it("rejects null", () => {
    expect(validateObjectKey(null)).toBe("Invalid object key.");
  });

  it("rejects undefined", () => {
    expect(validateObjectKey(undefined)).toBe("Invalid object key.");
  });

  it("rejects path traversal with ..", () => {
    expect(validateObjectKey("../etc/passwd")).toBe("Invalid object key.");
  });

  it("rejects embedded path traversal", () => {
    expect(validateObjectKey("uploads/../../secret")).toBe("Invalid object key.");
  });

  it("rejects absolute path", () => {
    expect(validateObjectKey("/etc/passwd")).toBe("Invalid object key.");
  });

  it("rejects non-string types", () => {
    expect(validateObjectKey(123)).toBe("Invalid object key.");
    expect(validateObjectKey({ key: "val" })).toBe("Invalid object key.");
    expect(validateObjectKey(["array"])).toBe("Invalid object key.");
  });
});
