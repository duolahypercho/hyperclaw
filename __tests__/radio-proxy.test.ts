import { describe, it, expect } from "vitest";

// Mirrors the CORS origin validation from pages/api/radio-proxy.ts
function getAllowedOrigin(origin: string): string {
  const allowed = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/([a-z0-9-]+\.)?hypercho\.com$/,
  ];
  return allowed.some((re) => re.test(origin)) ? origin : "";
}

describe("radio-proxy CORS validation", () => {
  it("allows localhost", () => {
    expect(getAllowedOrigin("http://localhost")).toBe("http://localhost");
  });

  it("allows localhost with port", () => {
    expect(getAllowedOrigin("http://localhost:1000")).toBe("http://localhost:1000");
  });

  it("allows 127.0.0.1", () => {
    expect(getAllowedOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("allows hypercho.com", () => {
    expect(getAllowedOrigin("https://hypercho.com")).toBe("https://hypercho.com");
  });

  it("allows subdomains of hypercho.com", () => {
    expect(getAllowedOrigin("https://app.hypercho.com")).toBe("https://app.hypercho.com");
  });

  it("rejects random origins", () => {
    expect(getAllowedOrigin("https://evil.com")).toBe("");
  });

  it("rejects empty origin", () => {
    expect(getAllowedOrigin("")).toBe("");
  });

  it("rejects origin that contains hypercho.com but isn't", () => {
    expect(getAllowedOrigin("https://nothypercho.com")).toBe("");
  });
});
