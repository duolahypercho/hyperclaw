#!/usr/bin/env node
/**
 * Build /public/soul-templates.json from a local checkout/extract of
 * mergisi/awesome-openclaw-agents.
 *
 * Usage:
 *   node scripts/build-soul-templates.mjs <path-to-extracted-repo>
 *
 * If no path is given, we look for /tmp/awesome-openclaw-agents-main.
 *
 * The output is a single static JSON the client fetches from the CDN —
 * no /api/ function, no cron, no runtime GitHub call.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT =
  process.argv[2] || "/tmp/awesome-openclaw-agents-main";
const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const OUT = path.join(REPO_ROOT, "public", "soul-templates.json");
const VERSION_OUT = path.join(REPO_ROOT, "lib", "soul-templates-build-id.ts");

const CATEGORY_EMOJI = {
  automation: "⚙️",
  business: "💼",
  compliance: "📋",
  creative: "🎨",
  "customer-success": "💬",
  data: "📊",
  development: "💻",
  devops: "🛠️",
  ecommerce: "🛍️",
  education: "🎓",
  finance: "💰",
  freelance: "🧑‍💻",
  healthcare: "🏥",
  hr: "👥",
  legal: "⚖️",
  marketing: "📣",
  moltbook: "📖",
  personal: "✨",
  productivity: "📋",
  "real-estate": "🏠",
  saas: "☁️",
  security: "🛡️",
  "supply-chain": "🚚",
  voice: "🎙️",
};

const INTRO_HEADINGS = new Set([
  "identity",
  "core identity",
  "overview",
  "about",
  "role",
  "purpose",
  "mission",
  "description",
]);

/**
 * Parse SOUL.md content to extract a short description. Handles two shapes:
 *   (a) prose directly under the H1 title
 *   (b) an `## Identity` / `## Overview` / `## Purpose` section right below
 */
function extractDescription(content, fallback) {
  const lines = content.split("\n");
  let i = 0;

  // Move past the first H1
  while (i < lines.length && !lines[i].startsWith("# ")) i++;
  i++;

  const collectParagraph = (startIdx) => {
    const paragraph = [];
    let j = startIdx;
    // Skip blank lines at the top
    while (j < lines.length && lines[j].trim() === "") j++;
    while (j < lines.length) {
      const line = lines[j].trim();
      if (line.startsWith("#")) break;
      if (line === "" && paragraph.length > 0) break;
      if (line !== "" && !line.startsWith("- ")) paragraph.push(line);
      if (line.startsWith("- ") && paragraph.length === 0) {
        // Skip metadata bullet-lists like `- **Role:** …`
        j++;
        continue;
      }
      j++;
    }
    return paragraph.join(" ").trim();
  };

  // Try shape (a): paragraph directly under H1
  let text = collectParagraph(i);

  // Try shape (b): first intro H2
  if (!text) {
    let j = i;
    while (j < lines.length) {
      const line = lines[j];
      if (line.startsWith("## ")) {
        const heading = line.replace(/^##\s+/, "").trim().toLowerCase();
        if (INTRO_HEADINGS.has(heading)) {
          text = collectParagraph(j + 1);
          break;
        }
      }
      j++;
    }
  }

  if (!text) return fallback;
  // Trim to ~240 chars for card display
  return text.length > 240 ? text.slice(0, 237).trimEnd() + "…" : text;
}

/** Parse SOUL.md to try to find an explicit Role line (e.g. `- **Role:** …`). */
function extractRole(content, fallback) {
  const match = content.match(/\*\*Role:\*\*\s*(.+)$/m);
  if (match) return match[1].trim();
  return fallback;
}

/** Turn a slug like "nps-followup" into "NPS Followup". */
function humanize(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Derive tags from category + slug tokens. */
function deriveTags(category, slug) {
  const tokens = slug.split("-").filter((t) => t.length > 2);
  const unique = new Set([category, ...tokens]);
  return Array.from(unique).slice(0, 5);
}

function main() {
  const manifestPath = path.join(ROOT, "agents.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found at ${manifestPath}`);
    console.error("Download the repo tarball first:");
    console.error(
      "  curl -sL https://github.com/mergisi/awesome-openclaw-agents/archive/refs/heads/main.tar.gz -o /tmp/repo.tgz && tar -xzf /tmp/repo.tgz -C /tmp",
    );
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const agents = Array.isArray(manifest?.agents) ? manifest.agents : [];

  const templates = [];
  let skipped = 0;

  for (const entry of agents) {
    const soulPath = path.join(ROOT, entry.path);
    if (!fs.existsSync(soulPath)) {
      skipped++;
      continue;
    }

    const content = fs.readFileSync(soulPath, "utf8");
    const slug = entry.id;
    const category = entry.category;

    // If the manifest only has the raw slug as name, humanize it.
    const rawName = entry.name || "";
    const name =
      !rawName || rawName === slug ? humanize(slug) : rawName;

    const role = entry.role || extractRole(content, humanize(slug));
    const emoji = CATEGORY_EMOJI[category] || "🤖";
    const description = extractDescription(
      content,
      `A ${humanize(category)} agent powered by OpenClaw.`,
    );

    templates.push({
      slug,
      name,
      role,
      emoji,
      category,
      description,
      tags: deriveTags(category, slug),
      sourcePath: entry.path,
      content,
    });
  }

  // Sort: alpha within category, categories alpha
  templates.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  // Stamp every build with a unique id derived from the wall clock. The
  // loader appends `?v=<BUILD_ID>` to the JSON URL so any rebuild
  // automatically busts the browser cache without users having to
  // hard-refresh.
  const buildId = new Date().toISOString().replace(/[^0-9]/g, "");

  const out = {
    version: "2.0.0",
    build_id: buildId,
    curated_at: new Date().toISOString().slice(0, 10),
    source: "github.com/mergisi/awesome-openclaw-agents",
    license: "MIT",
    templates,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  // Also write a tiny TS constant the client imports, so the bundle hash
  // changes on every rebuild and we can use it as a cache-busting query.
  const versionFile = `// AUTO-GENERATED by scripts/build-soul-templates.mjs — do not edit.
// Bumped on every rebuild so the client can cache-bust the JSON catalog.
export const SOUL_TEMPLATES_BUILD_ID = "${buildId}";
`;
  fs.writeFileSync(VERSION_OUT, versionFile);

  console.log(`Wrote ${templates.length} templates to ${OUT}`);
  console.log(`Build id: ${buildId}`);
  console.log(`Wrote build id constant to ${VERSION_OUT}`);
  console.log(`Categories: ${new Set(templates.map((t) => t.category)).size}`);
  console.log(`Skipped (missing SOUL.md): ${skipped}`);
  const sizeMb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log(`File size: ${sizeMb} MB`);
}

main();
