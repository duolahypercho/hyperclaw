import { describe, expect, it } from "vitest";
import {
  fileExtension,
  getCodeLanguage,
  getFileViewType,
  isPreviewableTextMimeType,
} from "$/components/ensemble/views/knowledge/file-preview-routing";

describe("knowledge file preview routing", () => {
  it("does not treat extensionless names as file extensions", () => {
    expect(fileExtension("company")).toBe("");
    expect(getFileViewType("company")).toBe("unknown");
  });

  it("keeps known extensionless code files previewable as code", () => {
    expect(getFileViewType("Dockerfile")).toBe("code");
    expect(getFileViewType("Makefile")).toBe("code");
    expect(getCodeLanguage("Makefile")).toBe("Makefile");
    expect(getCodeLanguage("company")).toBe("Plain Text");
  });

  it("detects connector text mime types even with charset parameters", () => {
    expect(isPreviewableTextMimeType("text/plain; charset=utf-8")).toBe(true);
    expect(isPreviewableTextMimeType("application/json")).toBe(true);
    expect(isPreviewableTextMimeType("application/octet-stream")).toBe(false);
  });
});
