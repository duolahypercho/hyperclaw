import type { SkillStatusEntry } from "./types";

export type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const SKILL_SOURCE_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  sources: string[];
}> = [
  { id: "workspace", label: "Workspace Skills", sources: ["openclaw-workspace"] },
  { id: "built-in", label: "Built-in Skills", sources: ["openclaw-bundled"] },
  {
    id: "installed",
    label: "Installed Skills",
    sources: ["openclaw-managed"],
  },
  { id: "extra", label: "Extra Skills", sources: ["openclaw-extra"] },
];

/** Group skills by source, matching OpenClaw's own UI grouping logic.
 *  Skills flagged `bundled` always land in "Built-in" regardless of source. */
export function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }
  const builtInGroup = SKILL_SOURCE_GROUPS.find((g) => g.id === "built-in");
  const other: SkillGroup = { id: "other", label: "Other Skills", skills: [] };

  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : SKILL_SOURCE_GROUPS.find((g) => g.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }

  const ordered = SKILL_SOURCE_GROUPS.map((g) => groups.get(g.id)).filter(
    (g): g is SkillGroup => Boolean(g && g.skills.length > 0),
  );
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}
