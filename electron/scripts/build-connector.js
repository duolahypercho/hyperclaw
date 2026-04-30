#!/usr/bin/env node
/**
 * build-connector.js
 *
 * Compiles the hyperclaw-connector Go binary for one or more platforms, then
 * syncs both Electron resource aliases and public dev-onboarding downloads.
 *
 * Usage:
 *   node scripts/build-connector.js                  # current platform only
 *   node scripts/build-connector.js --all            # all supported targets
 *   node scripts/build-connector.js --platform mac   # mac arm64 + x64
 *
 * Env vars:
 *   CONNECTOR_SRC   Path to the hyperclaw-connector Go source tree.
 *                   Defaults to: <repo>/connector
 */

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ── Config ────────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, "..", "resources", "connector");
const PUBLIC_DOWNLOADS_DIR = path.join(__dirname, "..", "..", "public", "downloads");
const UPDATE_MANIFEST = path.join(PUBLIC_DOWNLOADS_DIR, "connector-update.json");

// Default connector source: vendored into this repository for local-first builds.
const REPO_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_SRC = path.join(REPO_ROOT, "connector");
const CONNECTOR_SRC = process.env.CONNECTOR_SRC || DEFAULT_SRC;

const TARGETS = {
  "darwin-arm64": {
    GOOS: "darwin",
    GOARCH: "arm64",
    publicOut: "hyperclaw-connector-darwin-arm64",
    electronOut: "hyperclaw-connector-darwin-arm64",
    manifestKey: "darwin-arm64",
  },
  "darwin-amd64": {
    GOOS: "darwin",
    GOARCH: "amd64",
    publicOut: "hyperclaw-connector-darwin-amd64",
    electronOut: "hyperclaw-connector-darwin-x64",
    manifestKey: "darwin-amd64",
  },
  "linux-amd64": {
    GOOS: "linux",
    GOARCH: "amd64",
    publicOut: "hyperclaw-connector-linux-amd64",
    electronOut: "hyperclaw-connector-linux",
    manifestKey: "linux-amd64",
  },
  "linux-arm64": {
    GOOS: "linux",
    GOARCH: "arm64",
    publicOut: "hyperclaw-connector-linux-arm64",
    electronOut: "hyperclaw-connector-linux-arm64",
    manifestKey: "linux-arm64",
  },
  "windows-amd64": {
    GOOS: "windows",
    GOARCH: "amd64",
    publicOut: "hyperclaw-connector-windows-amd64.exe",
    electronOut: "hyperclaw-connector-win.exe",
    manifestKey: "windows-amd64",
  },
  "windows-arm64": {
    GOOS: "windows",
    GOARCH: "arm64",
    publicOut: "hyperclaw-connector-windows-arm64.exe",
    electronOut: "hyperclaw-connector-win-arm64.exe",
    manifestKey: "windows-arm64",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[build-connector] ${msg}`); }
function die(msg) { console.error(`[build-connector] ERROR: ${msg}`); process.exit(1); }

function currentPlatformKey() {
  const plat = process.platform; // darwin | linux | win32
  const arch = process.arch;     // arm64 | x64
  const goArch = arch === "x64" ? "amd64" : arch;
  if (plat === "win32") return `windows-${goArch}`;
  return `${plat}-${goArch}`;
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
      if (plat === "windows" || plat === "win") return k.startsWith("windows");
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
  const { GOOS, GOARCH, publicOut, electronOut } = TARGETS[key];
  const publicPath = path.join(PUBLIC_DOWNLOADS_DIR, publicOut);
  const electronPath = path.join(OUT_DIR, electronOut);
  log(`Building ${key} → ${publicOut} ...`);

  const env = {
    ...process.env,
    GOOS,
    GOARCH,
    CGO_ENABLED: "0", // cross-compile without CGO
  };

  const result = spawnSync(
    "go",
    ["build", "-ldflags", "-s -w", "-o", publicPath, "./cmd"],
    {
      cwd: CONNECTOR_SRC,
      env,
      stdio: "inherit",
    }
  );

  if (result.error) {
    die(`Build failed for ${key}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    die(`Build failed for ${key} (exit ${result.status})`);
  }

  fs.copyFileSync(publicPath, electronPath);

  // Make executable (not needed on Windows but harmless)
  try { fs.chmodSync(publicPath, 0o755); } catch (_) {}
  try { fs.chmodSync(electronPath, 0o755); } catch (_) {}
  log(`✓ ${publicPath}`);
  log(`✓ ${electronPath}`);
}

function readConnectorVersion() {
  const mainGo = path.join(CONNECTOR_SRC, "cmd", "main.go");
  const source = fs.readFileSync(mainGo, "utf8");
  const match = source.match(/^\s*version\s*=\s*"([^"]+)"/m);
  if (!match) {
    log("WARNING: Could not read connector version from cmd/main.go; preserving manifest minVersion");
  }
  return match ? match[1] : null;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function updateManifest(targetKeys) {
  const version = readConnectorVersion();
  const manifest = fs.existsSync(UPDATE_MANIFEST)
    ? JSON.parse(fs.readFileSync(UPDATE_MANIFEST, "utf8"))
    : { mandatory: true, binaries: {} };
  const previousMinVersion = manifest.minVersion;

  if (version) {
    manifest.minVersion = version;
  }
  manifest.mandatory = manifest.mandatory ?? true;
  if (!manifest.releaseNotes || (version && previousMinVersion !== version)) {
    manifest.releaseNotes = version ? `v${version}-dev connector refresh.` : "Connector refresh.";
  }
  manifest.binaries = manifest.binaries || {};

  for (const key of targetKeys) {
    const target = TARGETS[key];
    const publicPath = path.join(PUBLIC_DOWNLOADS_DIR, target.publicOut);
    manifest.binaries[target.manifestKey] = {
      checksum: `sha256:${sha256(publicPath)}`,
    };
  }

  const skipped = Object.keys(TARGETS).filter((key) => !targetKeys.includes(key));
  if (skipped.length > 0) {
    log(`WARNING: ${skipped.join(", ")} checksums were not refreshed; run --all before publishing downloads`);
  }

  fs.writeFileSync(UPDATE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`Updated ${UPDATE_MANIFEST}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // Validate source exists
  const goModPath = path.join(CONNECTOR_SRC, "go.mod");
  const mainGoPath = path.join(CONNECTOR_SRC, "cmd", "main.go");
  if (!fs.existsSync(CONNECTOR_SRC) || !fs.existsSync(goModPath) || !fs.existsSync(mainGoPath)) {
    die(
      `Connector source not found at: ${CONNECTOR_SRC}\n` +
      `  Expected go.mod and cmd/main.go under that directory.\n` +
      `  Vendor hyperclaw-connector into <repo>/connector or set CONNECTOR_SRC.\n` +
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

  // Create output dirs
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DOWNLOADS_DIR, { recursive: true });

  const targets = selectTargets(process.argv.slice(2));
  log(`Targets: ${targets.join(", ")}`);

  for (const key of targets) {
    buildTarget(key);
  }

  updateManifest(targets);

  log("Done.");
}

main();
