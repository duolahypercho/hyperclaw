/**
 * SOUL.md template catalog.
 *
 * Two sources are merged at runtime:
 *   1. `/soul-templates.json` — curated from
 *      github.com/mergisi/awesome-openclaw-agents. Treat as upstream data.
 *   2. `/soul-templates.local.json` — hand-edited overrides + custom
 *      templates. Anything in here wins by `slug`, so you can both add new
 *      personalities and override upstream ones without rebuilding.
 *
 * Workflow:
 *   1. Client fetches both files (local file is optional; missing is fine)
 *   2. Local templates override upstream by slug, then everything is sorted
 *      by category → name for stable rendering
 *   3. User picks a template → we transform the canonical SOUL content into
 *      the target runtime's personality file shape
 *   4. Caller feeds the transformed content into AddAgentDialog's submit flow
 */

export type SoulTemplateCategory =
  | "development"
  | "customer-success"
  | "productivity"
  | "marketing"
  | "finance"
  | "hr"
  | "devops"
  | "data"
  | "automation"
  | "other";

export interface SoulTemplate {
  slug: string;
  name: string;
  role: string;
  emoji: string;
  category: SoulTemplateCategory | string;
  description: string;
  tags: string[];
  /**
   * Path in the upstream awesome-openclaw-agents repo — used for the
   * "View source" link only. Optional because hand-authored local templates
   * have no upstream path.
   */
  sourcePath?: string;
  /** Canonical SOUL.md content. Transformed per-runtime at apply time. */
  content: string;
  /**
   * True when the template originated from `/soul-templates.local.json`.
   * Stamped by the loader; you should never set this by hand. The gallery
   * uses it to surface a "Custom" pill and skip the upstream source link.
   */
  isLocal?: boolean;
}

export interface SoulTemplateCatalog {
  version: string;
  /**
   * Unique stamp for the checked-in upstream catalog. The loader uses this for
   * cache busting; UIs can ignore it.
   */
  build_id?: string;
  curated_at: string;
  source: string;
  license: string;
  templates: SoulTemplate[];
}

/** Supported target runtimes for transform. */
export type SoulTargetRuntime = "openclaw" | "hermes" | "claude-code" | "codex";

/* ── Fetch ───────────────────────────────────────────────────────────────── */

import { SOUL_TEMPLATES_BUILD_ID } from "./soul-templates-build-id";

// Append the build id as a query string so any rebuild of
// `public/soul-templates.json` is treated as a brand-new resource by the
// browser cache. Because the constant is baked into the JS bundle, the bundle
// hash changes too — bullet-proof cache busting end-to-end.
const UPSTREAM_URL = `/soul-templates.json?v=${SOUL_TEMPLATES_BUILD_ID}`;
const LOCAL_OVERRIDES_URL = "/soul-templates.local.json";

let cached: SoulTemplateCatalog | null = null;
let inflight: Promise<SoulTemplateCatalog> | null = null;

/** Shape of the optional local overrides file. */
interface LocalOverridesFile {
  /** Optional human-readable doc string — ignored by the loader. */
  _readme?: string;
  templates?: SoulTemplate[];
}

/**
 * Load the catalog once per page lifetime. The catalog is the merge of:
 *   - `/soul-templates.json` (required, built from upstream)
 *   - `/soul-templates.local.json` (optional, hand-edited overrides)
 *
 * Local entries win by `slug` so you can both add new templates and override
 * upstream ones without rebuilding. Local entries are stamped with
 * `isLocal: true` so the UI can mark them.
 */
export async function loadSoulTemplates(): Promise<SoulTemplateCatalog> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const [upstream, locals] = await Promise.all([
      fetchUpstream(),
      fetchLocalOverrides(),
    ]);

    if (locals.length === 0) {
      cached = upstream;
      return upstream;
    }

    const bySlug = new Map<string, SoulTemplate>();
    for (const t of upstream.templates) bySlug.set(t.slug, t);
    for (const t of locals) bySlug.set(t.slug, { ...t, isLocal: true });

    const merged: SoulTemplateCatalog = {
      ...upstream,
      templates: Array.from(bySlug.values()).sort(compareTemplates),
    };
    cached = merged;
    return merged;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function fetchUpstream(): Promise<SoulTemplateCatalog> {
  // The `?v=<BUILD_ID>` query in `UPSTREAM_URL` already busts the cache on
  // every rebuild (the constant changes => bundle hash changes => URL
  // changes), so we can let the browser cache the response normally between
  // builds. No need for `cache: "no-store"` here.
  const res = await fetch(UPSTREAM_URL);
  if (!res.ok) {
    throw new Error(`Failed to load SOUL templates (${res.status})`);
  }
  return (await res.json()) as SoulTemplateCatalog;
}

async function fetchLocalOverrides(): Promise<SoulTemplate[]> {
  try {
    const res = await fetch(LOCAL_OVERRIDES_URL, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as LocalOverridesFile;
    if (!Array.isArray(data?.templates)) return [];
    return data.templates.filter(isValidLocalTemplate);
  } catch {
    return [];
  }
}

function isValidLocalTemplate(t: unknown): t is SoulTemplate {
  if (!t || typeof t !== "object") return false;
  const v = t as Partial<SoulTemplate>;
  return (
    typeof v.slug === "string" &&
    typeof v.name === "string" &&
    typeof v.role === "string" &&
    typeof v.emoji === "string" &&
    typeof v.category === "string" &&
    typeof v.description === "string" &&
    Array.isArray(v.tags) &&
    typeof v.content === "string"
  );
}

function compareTemplates(a: SoulTemplate, b: SoulTemplate): number {
  const cat = String(a.category).localeCompare(String(b.category));
  if (cat !== 0) return cat;
  return a.name.localeCompare(b.name);
}

/** Test/dev escape hatch — drops the in-memory cache so the next call refetches. */
export function __resetSoulTemplateCacheForTests(): void {
  cached = null;
  inflight = null;
}

/* ── Lookup helpers ──────────────────────────────────────────────────────── */

export function findBySlug(
  catalog: SoulTemplateCatalog,
  slug: string,
): SoulTemplate | undefined {
  return catalog.templates.find((t) => t.slug === slug);
}

export function listCategories(catalog: SoulTemplateCatalog): string[] {
  const seen = new Set<string>();
  for (const t of catalog.templates) seen.add(t.category);
  return Array.from(seen).sort();
}

export function filterTemplates(
  catalog: SoulTemplateCatalog,
  opts: { category?: string | null; query?: string | null },
): SoulTemplate[] {
  const query = opts.query?.trim().toLowerCase() ?? "";
  return catalog.templates.filter((t) => {
    if (opts.category && opts.category !== "all" && t.category !== opts.category) {
      return false;
    }
    if (!query) return true;
    const haystack = [
      t.name,
      t.role,
      t.description,
      t.category,
      t.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

/* ── Runtime transformation ──────────────────────────────────────────────── */

/**
 * Build the personality-file content for a given runtime from a canonical
 * SOUL template. Keeps the logic in one place so AddAgentDialog and the
 * onboarding flow stay aligned.
 */
export function renderTemplateForRuntime(
  template: SoulTemplate,
  runtime: SoulTargetRuntime,
  overrides?: { name?: string; role?: string; emoji?: string; description?: string },
): string {
  const name = overrides?.name?.trim() || template.name;

  // Replace the first H1 header in the canonical content with the user's
  // chosen name so edits in the form flow through.
  const bodyWithRenamedHeader = template.content.replace(
    /^#\s+.*$/m,
    `# ${name}`,
  );

  switch (runtime) {
    case "openclaw":
      // OpenClaw uses IDENTITY.md metadata block + SOUL.md body; we return
      // the SOUL content here. IDENTITY is built separately by the caller.
      return bodyWithRenamedHeader;

    case "hermes":
      // Hermes SOUL.md: H1 + short description is the convention, but the
      // full template body works fine too.
      return bodyWithRenamedHeader;

    case "claude-code":
    case "codex":
      // Claude Code and Codex still get the full persona in SOUL.md.
      // Their runtime startup files are generated separately as CLAUDE.md /
      // AGENTS.md workspace instructions.
      return bodyWithRenamedHeader;

    default: {
      // Exhaustiveness guard — if a new runtime is added, surface the mismatch.
      const _exhaustive: never = runtime;
      void _exhaustive;
      return bodyWithRenamedHeader;
    }
  }
}

/* ── UI helpers ──────────────────────────────────────────────────────────── */

/**
 * Returns the upstream "View source" link for a template, or `""` for local
 * / hand-authored templates with no upstream path. The gallery treats an
 * empty string as "no link", so this is safe to render directly.
 */
export function attributionUrl(template: SoulTemplate): string {
  if (template.isLocal || !template.sourcePath) return "";
  return `https://github.com/mergisi/awesome-openclaw-agents/blob/main/${template.sourcePath}`;
}
