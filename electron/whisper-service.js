/**
 * Local transcription service
 * Manages Python subprocess for local speech-to-text.
 * Uses a Python faster-whisper server for better accuracy.
 */

const { spawn, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Buffer } = require("buffer");
const { app } = require("electron");

function getRuntimeBaseDir() {
  return __dirname.includes("app.asar")
    ? __dirname.replace("app.asar", "app.asar.unpacked")
    : __dirname;
}

function getBundleTargetId() {
  return `${process.platform}-${process.arch}`;
}

function getBundledRuntimeDir() {
  const devPath = path.join(getRuntimeBaseDir(), "bundled-python", getBundleTargetId());
  if (fs.existsSync(devPath)) return devPath;

  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, "bundled-python", getBundleTargetId());
    if (fs.existsSync(packagedPath)) return packagedPath;
  }

  return null;
}

function getBundledPythonPath() {
  const runtimeDir = getBundledRuntimeDir();
  if (!runtimeDir) return null;
  const candidate = process.platform === "win32"
    ? path.join(runtimeDir, "Scripts", "python.exe")
    : path.join(runtimeDir, "bin", "python3");
  if (!fs.existsSync(candidate)) return null;
  // Verify the binary actually runs (venv can break if the base Python moves)
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 5000 });
    return candidate;
  } catch {
    console.warn("[Whisper] Bundled Python exists but is broken, skipping:", candidate);
    return null;
  }
}

function getBundledModelCacheDir() {
  const runtimeDir = getBundledRuntimeDir();
  if (!runtimeDir) return null;
  const candidate = path.join(runtimeDir, "model-cache");
  return fs.existsSync(candidate) ? candidate : null;
}

function getBundledRuntimeManifest() {
  const runtimeDir = getBundledRuntimeDir();
  if (!runtimeDir) return null;
  const manifestPath = path.join(runtimeDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function getBundledModelPath() {
  const manifest = getBundledRuntimeManifest();
  if (!manifest?.modelPath || typeof manifest.modelPath !== "string") return null;
  return fs.existsSync(manifest.modelPath) ? manifest.modelPath : null;
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function getManagedRuntimeDir() {
  return path.join(app.getPath("userData"), "voice-runtime", getBundleTargetId());
}

function getManagedPythonPath() {
  const runtimeDir = getManagedRuntimeDir();
  const candidate = process.platform === "win32"
    ? path.join(runtimeDir, "Scripts", "python.exe")
    : path.join(runtimeDir, "bin", "python3");
  return fs.existsSync(candidate) ? candidate : null;
}

function getManagedModelCacheDir() {
  const cacheDir = path.join(app.getPath("userData"), "whisper-model-cache");
  ensureDir(cacheDir);
  return cacheDir;
}

function getManagedRuntimeManifestPath() {
  return path.join(getManagedRuntimeDir(), "manifest.json");
}

function resolveSystemPythonCandidate() {
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

  throw new Error("No usable Python interpreter found for Whisper");
}

function runBootstrapCommand(cmd, args) {
  execFileSync(cmd, args, {
    cwd: getPythonDir(),
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      HYPERCLAW_WHISPER_CACHE_DIR: getManagedModelCacheDir(),
    },
  });
}

function writeManagedRuntimeManifest(pythonPath) {
  const manifest = {
    python: pythonPath,
    requirements: path.join(getPythonDir(), "requirements.txt"),
    modelCacheDir: getManagedModelCacheDir(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getManagedRuntimeManifestPath(), JSON.stringify(manifest, null, 2));
}

function ensureManagedRuntime() {
  const existingPython = getManagedPythonPath();
  if (existingPython) {
    return existingPython;
  }

  const runtimeDir = getManagedRuntimeDir();
  ensureDir(path.dirname(runtimeDir));

  const basePython = resolveSystemPythonCandidate();
  console.log("[Whisper] Creating managed Python runtime at:", runtimeDir);
  const venvArgs =
    process.platform === "win32"
      ? ["-3", "-m", "venv", runtimeDir]
      : ["-m", "venv", runtimeDir];

  runBootstrapCommand(basePython, venvArgs);

  const managedPython = getManagedPythonPath();
  if (!managedPython) {
    throw new Error("Managed Whisper runtime was created but python executable was not found");
  }

  console.log("[Whisper] Installing faster-whisper dependencies into managed runtime...");
  runBootstrapCommand(managedPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"]);
  runBootstrapCommand(managedPython, ["-m", "pip", "install", "-r", path.join(getPythonDir(), "requirements.txt")]);

  // Patch faster_whisper/audio.py to remove av import, then uninstall av.
  // We read WAV files with stdlib wave module so av (PyAV/FFmpeg) is not needed.
  try {
    const libDir = path.join(runtimeDir, "lib");
    const pyDirs = fs.readdirSync(libDir).filter((d) => d.startsWith("python"));
    for (const pyDir of pyDirs) {
      const audioPy = path.join(libDir, pyDir, "site-packages", "faster_whisper", "audio.py");
      if (fs.existsSync(audioPy)) {
        let src = fs.readFileSync(audioPy, "utf8");
        src = src.replace(/^import av$/m, "# import av  # removed — av not bundled");
        fs.writeFileSync(audioPy, src);
        console.log("[Whisper] Patched faster_whisper/audio.py to remove av import");
      }
    }
    runBootstrapCommand(managedPython, ["-m", "pip", "uninstall", "-y", "av"]);
    console.log("[Whisper] Removed av (PyAV) — not needed for WAV input");
  } catch (err) {
    console.warn("[Whisper] Failed to remove av:", err.message);
  }

  writeManagedRuntimeManifest(managedPython);
  return managedPython;
}

function getResolvedPythonPath() {
  return getBundledPythonPath() || getManagedPythonPath() || ensureManagedRuntime();
}

function getResolvedModelCacheDir() {
  return getBundledModelCacheDir() || getManagedModelCacheDir();
}

// Configuration
const CONFIG = {
  startupTimeout: 600000, // allow managed runtime bootstrap + first-run model download
  requestTimeout: 180000,
};

// Singleton instance
let serverProcess = null;
let initialized = false;
let ready = false;
let messageQueue = [];
// Deferred pattern: store the Promise AND its resolve/reject callbacks separately
let initPromise = null;
let initResolve = null;
let initReject = null;
let buffer = "";

/**
 * Get the Python packages directory
 */
function getPythonDir() {
  return path.join(getRuntimeBaseDir(), "python");
}

/**
 * Write audio data to a WAV file
 */
function writeWavFile(audioData) {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `whisper_${Date.now()}.wav`);

  // Convert to Float32Array if needed
  let floatData;
  if (Array.isArray(audioData)) {
    // Renderer sends int16 values (-32768..32767) via resampleToInt16 — normalise to float
    floatData = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      floatData[i] = audioData[i] / 32768.0;
    }
  } else if (audioData instanceof Uint8Array || Buffer.isBuffer(audioData)) {
    // If it's raw PCM bytes, convert to float
    const int16Array = new Int16Array(audioData.length / 2);
    const view = new DataView(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    for (let i = 0; i < int16Array.length; i++) {
      int16Array[i] = view.getInt16(i * 2, true);
    }
    floatData = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      floatData[i] = int16Array[i] / 32768.0;
    }
  } else if (audioData instanceof Float32Array) {
    floatData = audioData;
  } else {
    throw new Error("Unsupported audio data format");
  }

  // Create WAV file
  const numChannels = 1;
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = floatData.length * bytesPerSample;
  const fileSize = 36 + dataSize;

  const wavBuffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  wavBuffer.write("RIFF", offset); offset += 4;
  wavBuffer.writeUInt32LE(fileSize, offset); offset += 4;
  wavBuffer.write("WAVE", offset); offset += 4;

  // fmt chunk
  wavBuffer.write("fmt ", offset); offset += 4;
  wavBuffer.writeUInt32LE(16, offset); offset += 4; // chunk size
  wavBuffer.writeUInt16LE(1, offset); offset += 2; // audio format (PCM)
  wavBuffer.writeUInt16LE(numChannels, offset); offset += 2;
  wavBuffer.writeUInt32LE(sampleRate, offset); offset += 4;
  wavBuffer.writeUInt32LE(byteRate, offset); offset += 4;
  wavBuffer.writeUInt16LE(blockAlign, offset); offset += 2;
  wavBuffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data chunk
  wavBuffer.write("data", offset); offset += 4;
  wavBuffer.writeUInt32LE(dataSize, offset); offset += 4;

  // Write audio samples
  for (let i = 0; i < floatData.length; i++) {
    const sample = Math.max(-1, Math.min(1, floatData[i]));
    const int16 = Math.round(sample * 32767);
    wavBuffer.writeInt16LE(int16, offset);
    offset += 2;
  }

  fs.writeFileSync(tempFile, wavBuffer);
  return tempFile;
}

/**
 * Initialize the Whisper server
 */
function initialize() {
  if (initialized && ready) {
    return Promise.resolve(true);
  }

  // If there's already an init in progress, return the same promise (safe re-entry)
  if (initPromise) {
    return initPromise;
  }

  initPromise = new Promise((resolve, reject) => {
    // Store callbacks so handleResponse can resolve/reject from outside
    initResolve = resolve;
    initReject = reject;
    buffer = ""; // Reset buffer

    console.log("[Whisper] Starting Python server...");

    try {
      const pythonPath = getResolvedPythonPath();
      serverProcess = spawn(pythonPath, [path.join(getPythonDir(), "whisper_server.py")], {
        cwd: getPythonDir(),
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONPATH: getPythonDir(),
          PYTHONUNBUFFERED: "1",
          ...(getBundledModelPath()
            ? { HYPERCLAW_WHISPER_MODEL_PATH: getBundledModelPath() }
            : {}),
          ...(getResolvedModelCacheDir()
            ? { HYPERCLAW_WHISPER_CACHE_DIR: getResolvedModelCacheDir() }
            : {}),
        },
      });

      // Handle stdout (responses)
      serverProcess.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            handleResponse(line);
          }
        }
      });

      // Handle stderr (logging)
      serverProcess.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) {
          console.log("[Whisper Python]", msg);
        }
      });

      // Handle process exit — reject queued requests so they don't hang
      serverProcess.on("close", (code) => {
        console.log("[Whisper] Server closed with code:", code);
        serverProcess = null;
        ready = false;
        initialized = false;
        initPromise = null;

        // Reject the init promise if still pending (e.g. Python binary crashed)
        if (initReject) {
          initReject(new Error(`Server process exited with code ${code}`));
          initResolve = null;
          initReject = null;
        }

        // Reject any pending requests
        while (messageQueue.length > 0) {
          const [, rej] = messageQueue.shift();
          rej(new Error("Server process exited"));
        }
      });

      serverProcess.on("error", (err) => {
        console.error("[Whisper] Server error:", err);
        initPromise = null;
        initResolve = null;
        initReject = null;
        reject(err);
      });

      // Send init request after a short delay (let Python start up)
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          const requestStr = JSON.stringify({ action: "init" }) + "\n";
          serverProcess.stdin.write(requestStr);
        }
      }, 1500);

      // Timeout
      setTimeout(() => {
        if (!ready) {
          console.error("[Whisper] Startup timeout");
          initPromise = null;
          initResolve = null;
          initReject = null;
          reject(new Error("Startup timeout"));
        }
      }, CONFIG.startupTimeout);

    } catch (error) {
      console.error("[Whisper] Failed to start:", error);
      initPromise = null;
      initResolve = null;
      initReject = null;
      reject(error);
    }
  });

  return initPromise;
}

/**
 * Handle a response from the Python server
 */
function handleResponse(line) {
  try {
    const response = JSON.parse(line.trim());
    console.log("[Whisper] Response:", JSON.stringify(response).substring(0, 100));

    // Init response — Python returns { "initialized": true/false }
    if (response.initialized !== undefined && !ready) {
      ready = response.initialized;
      initialized = true;

      if (ready) {
        console.log("[Whisper] Server ready!");
        if (initResolve) {
          initResolve(true);
          initResolve = null;
          initReject = null;
        }
      } else {
        if (initReject) {
          initReject(new Error(response.error || "Init failed"));
          initResolve = null;
          initReject = null;
        }
      }
      return;
    }

    // Handle queued messages
    if (messageQueue.length > 0) {
      const [resolve, reject] = messageQueue.shift();

      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error || "Unknown error"));
      }
    }

  } catch (error) {
    console.error("[Whisper] Failed to parse response:", line.substring(0, 100), error);
  }
}

/**
 * Send a request to the Python server
 */
function sendRequest(request) {
  return new Promise((resolve, reject) => {
    if (!serverProcess || serverProcess.killed) {
      reject(new Error("Server not running"));
      return;
    }

    // Add timeout so requests don't hang if Python crashes mid-request
    const timer = setTimeout(() => {
      // Remove this entry from the queue
      const idx = messageQueue.findIndex(([r]) => r === wrappedResolve);
      if (idx !== -1) messageQueue.splice(idx, 1);
      reject(new Error("Transcription timed out"));
    }, CONFIG.requestTimeout);

    const wrappedResolve = (val) => { clearTimeout(timer); resolve(val); };
    const wrappedReject = (err) => { clearTimeout(timer); reject(err); };

    messageQueue.push([wrappedResolve, wrappedReject]);
    const requestStr = JSON.stringify(request) + "\n";
    serverProcess.stdin.write(requestStr);
  });
}

/**
 * Transcribe audio data
 */
async function transcribe(audioData) {
  if (!ready) {
    await initialize();
  }

  let tempFile = null;

  try {
    // Write audio to WAV file
    tempFile = writeWavFile(audioData);
    console.log("[Whisper] Transcribing file:", tempFile);

    // Send transcription request
    const result = await sendRequest({
      action: "transcribe",
      audio_path: tempFile,
    });

    return result;

  } catch (error) {
    console.error("[Whisper] Transcription error:", error);
    return { success: false, error: error.message };
  } finally {
    // Clean up temp file
    if (tempFile) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Get server status
 */
async function getStatus() {
  try {
    const result = await sendRequest({ action: "status" });
    return result;
  } catch (error) {
    return {
      ready: false,
      error: error.message,
      pythonPath: getBundledPythonPath() || getManagedPythonPath(),
      modelPath: getBundledModelPath(),
      cacheDir: getResolvedModelCacheDir(),
    };
  }
}

/**
 * Check if server is ready
 */
function isReady() {
  return ready;
}

/**
 * Stop the server
 */
function stop() {
  if (serverProcess) {
    serverProcess.kill();
    console.log("[Whisper] Server stopped");
  }
  // Always reset state, even if no process was running
  serverProcess = null;
  ready = false;
  initialized = false;
  initPromise = null;
  initResolve = null;
  initReject = null;
}

/**
 * Restart the server
 */
async function restart() {
  stop();
  await initialize();
}

module.exports = {
  initialize,
  transcribe,
  getStatus,
  isReady,
  stop,
  restart,
  getPythonDir,
  getBundledPythonPath,
  getManagedPythonPath,
  getResolvedPythonPath,
  // Exported for testing
  _writeWavFile: writeWavFile,
  _handleResponse: handleResponse,
};
