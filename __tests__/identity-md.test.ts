import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDENTITY_AVATAR_URL,
  toIdentityAvatarUrl,
  updateIdentityField,
} from "$/lib/identity-md";

describe("identity markdown avatar references", () => {
  it("stores uploaded avatar data as a stable URL reference", () => {
    expect(toIdentityAvatarUrl("data:image/avif;base64,AAAA")).toBe(DEFAULT_IDENTITY_AVATAR_URL);
  });

  it("keeps existing URL and path avatar values unchanged", () => {
    expect(toIdentityAvatarUrl("https://cdn.example.com/luffy.png")).toBe("https://cdn.example.com/luffy.png");
    expect(toIdentityAvatarUrl("/avatar.png")).toBe("/avatar.png");
  });

  it("updates IDENTITY.md without embedding the image payload", () => {
    const content = "- **Name:** Luffy\n- **Role:** Software Engineer\n\n---\n\nLuffy from One Piece\n";
    const avatar = toIdentityAvatarUrl("data:image/avif;base64,AAAA");

    const updated = updateIdentityField(content, "Avatar", avatar);

    expect(updated).toContain("- **Avatar:** /avatar.png");
    expect(updated).not.toContain("data:image");
  });

  it("treats every data URI as file content rather than identity metadata", () => {
    expect(toIdentityAvatarUrl("data:application/octet-stream;base64,AAAA")).toBe(DEFAULT_IDENTITY_AVATAR_URL);
  });
});
