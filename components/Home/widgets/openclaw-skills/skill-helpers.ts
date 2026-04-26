import type { SkillStatusEntry, SkillsStatusFilter } from "./types";

/** Flat list of human-readable missing requirement labels. */
export function computeSkillMissing(skill: SkillStatusEntry): string[] {
  return [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
}

/** Human-readable reasons why a skill is not eligible. */
export function computeSkillReasons(skill: SkillStatusEntry): string[] {
  const reasons: string[] = [];
  if (skill.disabled) reasons.push("disabled");
  if (skill.blockedByAllowlist) reasons.push("blocked by allowlist");
  return reasons;
}

/** Whether a skill matches the given status filter tab. */
export function skillMatchesStatus(
  skill: SkillStatusEntry,
  status: SkillsStatusFilter,
): boolean {
  switch (status) {
    case "all":
      return true;
    case "ready":
      return !skill.disabled && skill.eligible;
    case "needs-setup":
      return !skill.disabled && !skill.eligible;
    case "disabled":
      return skill.disabled;
  }
}

/** CSS-friendly status class for a skill's dot indicator. */
export function skillStatusClass(skill: SkillStatusEntry): string {
  if (skill.disabled) return "muted";
  return skill.eligible ? "ok" : "warn";
}
