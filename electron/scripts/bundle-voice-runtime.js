const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REQUIREMENTS = path.join(ROOT, "python", "requirements.txt");
const TARGET_ID = `${process.platform}-${process.arch}`;
const RUNTIME_DIR = path.join(ROOT, "bundled-python", TARGET_ID);
const MODEL_CACHE_DIR = path.join(RUNTIME_DIR, "model-cache");
const DEFAULT_MODEL = process.env.HYPERCLAW_WHISPER_MODEL || "base.en";
const LOCAL_MODEL_SOURCE =
  process.env.HYPERCLAW_LOCAL_WHISPER_MODEL_DIR ||
  path.join(ROOT, "python", "models", `faster-whisper-${DEFAULT_MODEL}`);

function log(message) {
  process.stdout.write(`[bundle-voice-runtime] ${message}\n`);
}

function resolvePythonCandidate() {
  if (process.env.HYPERCLAW_BUNDLED_PYTHON) {
    return process.env.HYPERCLAW_BUNDLED_PYTHON;
  }

  const candidates =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];

  for (const candidate of candidates) {
    try {
      const args = candidate === "py" ? ["-3", "--version"] : ["--version"];
      execFileSync(candidate, args, { stdio: "ignore" });
      return candidate;
    } catch {}
  }

  throw new Error("No Python interpreter found for bundling voice runtime");
}

function rimraf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyDir(source, destination) {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(sourcePath);
      const realStat = fs.statSync(realPath);
      if (realStat.isDirectory()) {
        copyDir(realPath, destinationPath);
      } else {
        fs.copyFileSync(realPath, destinationPath);
      }
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function bundledPythonPath() {
  return process.platform === "win32"
    ? path.join(RUNTIME_DIR, "Scripts", "python.exe")
    : path.join(RUNTIME_DIR, "bin", "python3");
}

function pipArgs(args) {
  return process.platform === "win32"
    ? ["-m", "pip", ...args]
    : ["-m", "pip", ...args];
}

function run(cmd, args, extraEnv = {}) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function tryRun(cmd, args, extraEnv = {}) {
  try {
    run(cmd, args, extraEnv);
    return true;
  } catch {
    return false;
  }
}

function isMachOBinary(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    const magic = header.readUInt32BE(0);
    return [
      0xfeedface,
      0xfeedfacf,
      0xcefaedfe,
      0xcffaedfe,
      0xcafebabe,
      0xbebafeca,
      0xcafebabf,
      0xbfbafeca,
    ].includes(magic);
  } catch {
    return false;
  }
}

function walkFiles(rootDir, files = []) {
  if (!fs.existsSync(rootDir)) return files;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function findBundledModelDir(rootDir) {
  if (!fs.existsSync(rootDir)) return null;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));
    if (
      names.has("model.bin") &&
      (names.has("tokenizer.json") || names.has("config.json") || names.has("preprocessor_config.json"))
    ) {
      return current;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }
  return null;
}

function stripSignaturesOnMac(runtimeDir) {
  if (process.platform !== "darwin") return;
  const files = walkFiles(runtimeDir);
  for (const filePath of files) {
    if (!isMachOBinary(filePath)) continue;
    try {
      execFileSync("codesign", ["--remove-signature", filePath], { stdio: "ignore" });
    } catch {}
  }
}

function materializeSymlink(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.lstatSync(filePath);
  if (!stat.isSymbolicLink()) return null;

  const resolvedPath = fs.realpathSync(filePath);
  const tempPath = `${filePath}.tmp-copy`;
  fs.copyFileSync(resolvedPath, tempPath);
  fs.unlinkSync(filePath);
  fs.renameSync(tempPath, filePath);
  return resolvedPath;
}

function readPyVenvHome(runtimeDir) {
  const cfgPath = path.join(runtimeDir, "pyvenv.cfg");
  if (!fs.existsSync(cfgPath)) return null;
  const contents = fs.readFileSync(cfgPath, "utf8");
  const match = contents.match(/^home\s*=\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function findMacFrameworkSupport(runtimeDir) {
  const homeDir = readPyVenvHome(runtimeDir);
  const candidates = [];

  if (homeDir) {
    const normalizedHome = homeDir.replace(/\/+$/, "");
    const homeParent = path.dirname(normalizedHome);
    const homeGrandparent = path.dirname(homeParent);
    candidates.push(path.join(homeGrandparent, "Library", "Frameworks", "Python3.framework", "Python3"));
    candidates.push(path.join(homeGrandparent, "Library", "Frameworks", "Python3.framework", "Versions"));
  }

  candidates.push("/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Python3");
  candidates.push("/Library/Frameworks/Python.framework/Python");

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function materializeMacFrameworkSupport(runtimeDir) {
  if (process.platform !== "darwin") return;
  const frameworkBinary = findMacFrameworkSupport(runtimeDir);
  if (!frameworkBinary) return;

  for (const supportName of ["Python3", "Python", ".Python"]) {
    const targetPath = path.join(runtimeDir, supportName);
    if (fs.existsSync(targetPath)) continue;
    fs.copyFileSync(frameworkBinary, targetPath);
  }
}

function materializeVenvPythonBinaries(runtimeDir) {
  if (process.platform === "win32") return;
  const binDir = path.join(runtimeDir, "bin");
  if (!fs.existsSync(binDir)) return;

  for (const name of ["python", "python3"]) {
    materializeSymlink(path.join(binDir, name));
  }

  materializeMacFrameworkSupport(runtimeDir);
}

function main() {
  if (process.env.SKIP_VOICE_RUNTIME_BUNDLE === "1") {
    log("Skipping voice runtime bundle because SKIP_VOICE_RUNTIME_BUNDLE=1");
    return;
  }

  const python = resolvePythonCandidate();
  const force = process.env.FORCE_VOICE_RUNTIME_REBUNDLE === "1";

  if (force) {
    log(`Removing existing runtime at ${RUNTIME_DIR}`);
    rimraf(RUNTIME_DIR);
  }

  ensureDir(path.dirname(RUNTIME_DIR));

  if (!fs.existsSync(bundledPythonPath())) {
    log(`Creating virtualenv at ${RUNTIME_DIR}`);
    const copyArgs =
      process.platform === "win32"
        ? ["-3", "-m", "venv", "--copies", RUNTIME_DIR]
        : ["-m", "venv", "--copies", RUNTIME_DIR];
    const defaultArgs =
      process.platform === "win32"
        ? ["-3", "-m", "venv", RUNTIME_DIR]
        : ["-m", "venv", RUNTIME_DIR];

    if (!tryRun(python, copyArgs)) {
      log("Python venv --copies is unsupported here, falling back to a standard venv and materializing interpreter symlinks");
      run(python, defaultArgs);
      materializeVenvPythonBinaries(RUNTIME_DIR);
    }
  } else {
    log(`Reusing existing virtualenv at ${RUNTIME_DIR}`);
  }

  // Heal reused macOS venvs that were created before framework support files
  // were copied into the runtime root.
  materializeVenvPythonBinaries(RUNTIME_DIR);

  const venvPython = bundledPythonPath();

  log("Upgrading pip/setuptools/wheel");
  run(venvPython, pipArgs(["install", "--upgrade", "pip", "setuptools", "wheel"]));

  log(`Installing Python dependencies from ${REQUIREMENTS}`);
  run(venvPython, pipArgs(["install", "-r", REQUIREMENTS]));

  ensureDir(MODEL_CACHE_DIR);
  let resolvedModelPath = null;
  if (fs.existsSync(LOCAL_MODEL_SOURCE)) {
    const vendoredModelTarget = path.join(MODEL_CACHE_DIR, path.basename(LOCAL_MODEL_SOURCE));
    rimraf(vendoredModelTarget);
    log(`Using vendored faster-whisper model from ${LOCAL_MODEL_SOURCE}`);
    copyDir(LOCAL_MODEL_SOURCE, vendoredModelTarget);
    resolvedModelPath = findBundledModelDir(vendoredModelTarget) || vendoredModelTarget;
  } else {
    log(`Pre-downloading faster-whisper model '${DEFAULT_MODEL}' into ${MODEL_CACHE_DIR}`);
    run(
      venvPython,
      [
        "-c",
        [
          "from faster_whisper import WhisperModel",
          `WhisperModel(${JSON.stringify(DEFAULT_MODEL)}, device='auto', compute_type='int8', download_root=${JSON.stringify(MODEL_CACHE_DIR)})`,
        ].join("; "),
      ],
      {
        HYPERCLAW_WHISPER_MODEL: DEFAULT_MODEL,
        HYPERCLAW_WHISPER_CACHE_DIR: MODEL_CACHE_DIR,
      }
    );
    resolvedModelPath = findBundledModelDir(MODEL_CACHE_DIR);
  }

  if (!resolvedModelPath) {
    throw new Error(`Unable to locate downloaded faster-whisper model under ${MODEL_CACHE_DIR}`);
  }

  const manifest = {
    platform: process.platform,
    arch: process.arch,
    model: DEFAULT_MODEL,
    modelPath: resolvedModelPath,
    modelSource: fs.existsSync(LOCAL_MODEL_SOURCE) ? LOCAL_MODEL_SOURCE : "downloaded",
    createdAt: new Date().toISOString(),
    python: venvPython,
  };
  fs.writeFileSync(path.join(RUNTIME_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  stripSignaturesOnMac(RUNTIME_DIR);
  log(`Voice runtime bundled successfully for ${TARGET_ID}`);
}

main();
