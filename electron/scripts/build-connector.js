#!/usr/bin/env node
/**
 * build-connector.js
 *
 * Compiles the hyperclaw-connector Go binary for one or more platforms and places
 * the output in electron/resources/connector/.
 *
 * Usage:
 *   node scripts/build-connector.js                  # current platform only
 *   node scripts/build-connector.js --all            # mac arm64 + x64, linux, windows
 *   node scripts/build-connector.js --platform mac   # mac arm64 + x64
 *
 * Env vars:
 *   CONNECTOR_SRC   Path to the hyperclaw-connector Go source tree.
 *                   Defaults to: ~/code/hyperclaw-connector
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ── Config ────────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, "..", "resources", "connector");

// Default connector source: ~/code/hyperclaw-connector (local dev convention)
const DEFAULT_SRC = path.join(os.homedir(), "code", "hyperclaw-connector");
const CONNECTOR_SRC = process.env.CONNECTOR_SRC || DEFAULT_SRC;

const TARGETS = {
  "darwin-arm64": { GOOS: "darwin", GOARCH: "arm64", out: "hyperclaw-connector-darwin-arm64" },
  "darwin-x64":   { GOOS: "darwin", GOARCH: "amd64", out: "hyperclaw-connector-darwin-x64" },
  "linux-x64":    { GOOS: "linux",  GOARCH: "amd64", out: "hyperclaw-connector-linux" },
  "win32-x64":    { GOOS: "windows", GOARCH: "amd64", out: "hyperclaw-connector-win.exe" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[build-connector] ${msg}`); }
function die(msg) { console.error(`[build-connector] ERROR: ${msg}`); process.exit(1); }

function currentPlatformKey() {
  const plat = process.platform; // darwin | linux | win32
  const arch = process.arch;     // arm64 | x64
  return `${plat}-${arch}`;
}

function selectTargets(argv) {
  if (argv.includes("--all")) return Object.keys(TARGETS);
  if (argv.includes("--platform")) {
    const idx = argv.indexOf("--platform");
    const plat = argv[idx + 1];
    if (!plat) die("--platform requires an argument (mac|linux|windows)");
    const keys = Object.keys(TARGETS).filter((k) => {
      if (plat === "mac") return k.startsWith("darwin");
      if (plat === "linux") return k.startsWith("linux");
      if (plat === "windows" || plat === "win") return k.startsWith("win32");
      return k === plat;
    });
    if (keys.length === 0) die(`Unknown platform: ${plat}`);
    return keys;
  }
  // Default: current platform only
  const key = currentPlatformKey();
  if (!TARGETS[key]) die(`No target configured for platform: ${key}`);
  return [key];
}

function buildTarget(key) {
  const { GOOS, GOARCH, out } = TARGETS[key];
  const outPath = path.join(OUT_DIR, out);
  log(`Building ${key} → ${out} ...`);

  const env = {
    ...process.env,
    GOOS,
    GOARCH,
    CGO_ENABLED: "0", // cross-compile without CGO
  };

  const result = spawnSync(
    "go",
    ["build", "-ldflags", "-s -w", "-o", outPath, "./cmd"],
    {
      cwd: CONNECTOR_SRC,
      env,
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    die(`Build failed for ${key} (exit ${result.status})`);
  }

  // Make executable (not needed on Windows but harmless)
  try { fs.chmodSync(outPath, 0o755); } catch (_) {}
  log(`✓ ${outPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // Validate source exists
  if (!fs.existsSync(CONNECTOR_SRC)) {
    die(
      `Connector source not found at: ${CONNECTOR_SRC}\n` +
      `  Set CONNECTOR_SRC env var to the hyperclaw-connector directory.\n` +
      `  Example: CONNECTOR_SRC=/path/to/hyperclaw-connector node scripts/build-connector.js`
    );
  }

  // Ensure Go is available
  const goCheck = spawnSync("go", ["version"], { encoding: "utf-8" });
  if (goCheck.status !== 0) {
    die("Go is not installed or not in PATH. Install Go from https://go.dev/dl/");
  }
  log(`Go: ${(goCheck.stdout || "").trim()}`);
  log(`Source: ${CONNECTOR_SRC}`);

  // Create output dir
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targets = selectTargets(process.argv.slice(2));
  log(`Targets: ${targets.join(", ")}`);

  for (const key of targets) {
    buildTarget(key);
  }

  log("Done.");
}

main();
