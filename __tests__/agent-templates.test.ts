import { describe, expect, it } from "vitest";
import {
  buildAgentTemplates,
  buildClaudeCodeMd,
  buildRuntimeSoulMd,
  buildWorkspaceInstructionsMd,
} from "$/lib/agent-templates";
import { renderTemplateForRuntime, type SoulTemplate } from "$/lib/soul-templates";

describe("buildAgentTemplates", () => {
  it("uses explicit template SOUL content while keeping identity from the form", () => {
    const files = buildAgentTemplates({
      name: "Ada",
      emoji: "A",
      role: "Research Analyst",
      description: "Tracks competitors and explains the signal.",
      soulContent: "# Ada\n\nTemplate-born behavior.\n",
    });

    expect(files["IDENTITY.md"]).toContain("- **Name:** Ada");
    expect(files["IDENTITY.md"]).toContain("- **Role:** Research Analyst");
    expect(files["IDENTITY.md"]).toContain("\n---\n\n");
    expect(files["IDENTITY.md"]).toContain("Tracks competitors and explains the signal.");
    expect(files["SOUL.md"]).toBe("# Ada\n\nTemplate-born behavior.\n");
  });

  it("falls back to the default SOUL.md when no template content is provided", () => {
    const files = buildAgentTemplates({
      name: "Mira",
      role: "Ops",
    });

    expect(files["SOUL.md"]).toContain("You are **Mira**");
    expect(files["SOUL.md"]).toContain("## Core Principles");
  });

  it("keeps workspace rules separate from persona content", () => {
    const files = buildAgentTemplates({
      name: "Dora",
      role: "Ops",
      description: "Keep deploys boring.",
    });

    expect(files["SOUL.md"]).toContain("You are **Dora**");
    expect(files["AGENTS.md"]).toContain("This folder is home. Treat it that way.");
    expect(files["AGENTS.md"]).not.toContain("You are **Dora**");
    expect(buildWorkspaceInstructionsMd("CLAUDE.md")).toContain("# CLAUDE.md - Your Workspace");
  });

  it("embeds Claude Code soul content in CLAUDE.md startup instructions", () => {
    const content = buildClaudeCodeMd({
      name: "Ada",
      role: "Research Agent",
      description: "Keeps context sharp.",
      soulContent: "# Ada\n\nNever lose the thread.\n",
    });

    expect(content).toContain("# CLAUDE.md - Your Workspace");
    expect(content).toContain("## Agent Personality (SOUL.md)");
    expect(content).toContain("# Ada\n\nNever lose the thread.");
  });

  it("builds runtime-neutral SOUL.md for non-OpenClaw runtimes", () => {
    const content = buildRuntimeSoulMd({
      name: "Hermes",
      role: "Research Agent",
      description: "Keeps context sharp.",
    });

    expect(content).toContain("You are the Research Agent.");
    expect(content).toContain("Keeps context sharp.");
    expect(content).not.toContain("sessions_spawn");
  });

  it("seeds USER.md with the current user profile and creation context", () => {
    const files = buildAgentTemplates({
      name: "Dora",
      role: "Ops",
      description: "Keep deploys boring.",
      userProfile: {
        name: "Test User",
        email: "test@example.com",
        username: "testuser",
        about: "Building things.",
      },
    });

    expect(files["USER.md"]).toContain("- **Name:** Test User");
    expect(files["USER.md"]).toContain("- **Email:** test@example.com");
    expect(files["USER.md"]).toContain("- **Agent:** Dora");
    expect(files["USER.md"]).toContain("- **Need:** Keep deploys boring.");
  });

  it("keeps USER.md usable when no profile is available", () => {
    const files = buildAgentTemplates({
      name: "Pax",
    });

    expect(files["USER.md"]).toContain("- **Name:**");
    expect(files["USER.md"]).toContain("- **Agent:** Pax");
    expect(files["USER.md"]).not.toContain("undefined");
  });

  it("renders Codex and Claude Code templates as SOUL.md persona content", () => {
    const template: SoulTemplate = {
      slug: "operator",
      name: "Operator",
      role: "Runtime specialist",
      emoji: "O",
      category: "automation",
      description: "Keeps the loop moving.",
      content: "# Operator\n\nFull persona body.\n",
      tags: [],
      sourcePath: "",
      isLocal: true,
    };

    expect(renderTemplateForRuntime(template, "codex", { name: "Pax" })).toBe("# Pax\n\nFull persona body.\n");
    expect(renderTemplateForRuntime(template, "claude-code", { name: "Pax" })).toBe("# Pax\n\nFull persona body.\n");
  });
});
