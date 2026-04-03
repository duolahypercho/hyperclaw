/**
 * Agent Definition Loader
 *
 * Reads AGENTS.md, TOOLS.md, SOUL.md, HEARTBEAT.md and resolves skills
 * from SKILL.md files. Assembles everything into a single agent context
 * that can be injected into an LLM prompt or used by the runtime.
 */
import { readFile, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentFrontmatter = {
  name: string;
  title?: string;
  skills: string[];
  tools: string[];
  reportsTo?: string | null;
};

export type SkillFrontmatter = {
  name: string;
  description: string;
};

export type SkillDefinition = {
  frontmatter: SkillFrontmatter;
  content: string;
  path: string;
};

export type AgentDefinition = {
  frontmatter: AgentFrontmatter;
  instructions: string;    // AGENTS.md body
  tools: string | null;    // TOOLS.md content
  soul: string | null;     // SOUL.md content
  heartbeat: string | null; // HEARTBEAT.md content
  skills: SkillDefinition[];
};

// ---------------------------------------------------------------------------
// Frontmatter Parser
// ---------------------------------------------------------------------------

function parseFrontmatter<T>(raw: string): { frontmatter: T; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as T, content: raw };
  }

  const yamlBlock = match[1];
  const content = match[2].trimStart();

  // Simple YAML parser — handles flat keys and string arrays
  const frontmatter: Record<string, unknown> = {};
  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item
    if (trimmed.startsWith('- ') && currentArray) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Save previous array
    if (currentArray && currentKey) {
      frontmatter[currentKey] = currentArray;
      currentArray = null;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!value) {
      // Key with no inline value — next lines might be array items
      currentKey = key;
      currentArray = [];
    } else if (value === 'null') {
      frontmatter[key] = null;
    } else {
      frontmatter[key] = value;
    }
  }

  // Save trailing array
  if (currentArray && currentKey) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter: frontmatter as T, content };
}

// ---------------------------------------------------------------------------
// File Helpers
// ---------------------------------------------------------------------------

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Skill Resolution
// ---------------------------------------------------------------------------

/**
 * Discover all available skills from the skills directory.
 * Returns a map of skill shortname → SKILL.md path.
 */
async function discoverSkills(
  skillsDir: string,
): Promise<Map<string, string>> {
  const skills = new Map<string, string>();

  if (!(await dirExists(skillsDir))) return skills;

  const entries = await readdir(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsDir, entry.name, 'SKILL.md');
    try {
      await stat(skillFile);
      skills.set(entry.name, skillFile);
    } catch {
      // No SKILL.md in this directory — skip
    }
  }

  return skills;
}

/**
 * Load a single skill definition from its SKILL.md path.
 */
async function loadSkill(skillPath: string): Promise<SkillDefinition> {
  const raw = await readFile(skillPath, 'utf-8');
  const { frontmatter, content } = parseFrontmatter<SkillFrontmatter>(raw);
  return { frontmatter, content, path: skillPath };
}

// ---------------------------------------------------------------------------
// Main Loader
// ---------------------------------------------------------------------------

/**
 * Load a complete agent definition from an agent directory.
 *
 * Expected structure:
 *   agentDir/
 *     AGENTS.md      — Agent instructions (required)
 *     TOOLS.md       — Tool reference (optional)
 *     SOUL.md        — Personality/values (optional)
 *     HEARTBEAT.md   — Run checklist (optional)
 *
 * Skills are resolved from skillsDir (default: sibling `skills/` directory).
 */
export async function loadAgentDefinition(
  agentDir: string,
  skillsDir?: string,
): Promise<AgentDefinition> {
  const absAgentDir = resolve(agentDir);
  const absSkillsDir = resolve(skillsDir ?? join(absAgentDir, '..', '..', 'skills'));

  // Load core files
  const agentsRaw = await readFile(join(absAgentDir, 'AGENTS.md'), 'utf-8');
  const { frontmatter, content: instructions } =
    parseFrontmatter<AgentFrontmatter>(agentsRaw);

  const [tools, soul, heartbeat] = await Promise.all([
    readOptional(join(absAgentDir, 'TOOLS.md')),
    readOptional(join(absAgentDir, 'SOUL.md')),
    readOptional(join(absAgentDir, 'HEARTBEAT.md')),
  ]);

  // Resolve skills
  const availableSkills = await discoverSkills(absSkillsDir);
  const desiredNames = frontmatter.skills ?? [];

  const skills: SkillDefinition[] = [];
  for (const name of desiredNames) {
    const skillPath = availableSkills.get(name);
    if (skillPath) {
      skills.push(await loadSkill(skillPath));
    }
  }

  return { frontmatter, instructions, tools, soul, heartbeat, skills };
}

/**
 * Assemble the full agent context as a single string suitable for
 * injection into an LLM system prompt.
 */
export function assembleContext(def: AgentDefinition): string {
  const parts: string[] = [];

  // Soul first — sets the tone
  if (def.soul) {
    parts.push(def.soul);
  }

  // Main instructions
  parts.push(def.instructions);

  // Heartbeat checklist
  if (def.heartbeat) {
    parts.push(def.heartbeat);
  }

  // Skills
  if (def.skills.length > 0) {
    parts.push('# Available Skills\n');
    for (const skill of def.skills) {
      parts.push(`## Skill: ${skill.frontmatter.name}\n`);
      parts.push(skill.content);
    }
  }

  // Tools reference last — it's the longest
  if (def.tools) {
    parts.push(def.tools);
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Convenience: load and assemble in one call.
 */
export async function loadAndAssemble(
  agentDir: string,
  skillsDir?: string,
): Promise<string> {
  const def = await loadAgentDefinition(agentDir, skillsDir);
  return assembleContext(def);
}
