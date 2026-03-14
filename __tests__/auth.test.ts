import { describe, it, expect } from "vitest";

// Test that auth error messages don't leak user enumeration info
// Mirrors the logic in pages/api/auth/[...nextauth].ts
function sanitizeAuthError(backendMessage: string | undefined): string {
  if (
    backendMessage === "Incorrect Password" ||
    backendMessage === "This user doesn't exist"
  ) {
    return "Invalid email or password";
  }
  return "Something went wrong";
}

describe("auth error sanitization", () => {
  it("hides 'user doesn't exist' from response", () => {
    expect(sanitizeAuthError("This user doesn't exist")).toBe("Invalid email or password");
  });

  it("hides 'incorrect password' from response", () => {
    expect(sanitizeAuthError("Incorrect Password")).toBe("Invalid email or password");
  });

  it("returns same message for both cases (no enumeration)", () => {
    const noUser = sanitizeAuthError("This user doesn't exist");
    const wrongPw = sanitizeAuthError("Incorrect Password");
    expect(noUser).toBe(wrongPw);
  });

  it("returns generic message for unknown errors", () => {
    expect(sanitizeAuthError("Database connection failed")).toBe("Something went wrong");
  });

  it("handles undefined backend message", () => {
    expect(sanitizeAuthError(undefined)).toBe("Something went wrong");
  });
});
