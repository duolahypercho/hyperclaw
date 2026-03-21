/**
 * Whisper ONNX Transcription Service
 * Manages Python subprocess for local speech-to-text.
 * Uses bundled whisper-tiny ONNX model — no network dependency at runtime.
 * (File kept as sensevoice-service.js to avoid breaking IPC handler references.)
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Buffer } = require("buffer");

// Configuration
const CONFIG = {
  pythonPath: process.platform === "win32" ? "python" : "python3",
  serverScript: path.join(__dirname, "python", "whisper_server.py"),
  startupTimeout: 30000, // 30 seconds
  requestTimeout: 15000, // 15 seconds per request
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
  return path.join(__dirname, "python");
}

/**
 * Write audio data to a WAV file
 */
function writeWavFile(audioData) {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `sensevoice_${Date.now()}.wav`);

  // Convert to Float32Array if needed
  let floatData;
  if (Array.isArray(audioData)) {
    floatData = new Float32Array(audioData);
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
 * Initialize the SenseVoice server
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

    console.log("[SenseVoice] Starting Python server...");

    try {
      serverProcess = spawn(CONFIG.pythonPath, [CONFIG.serverScript], {
        cwd: getPythonDir(),
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONPATH: getPythonDir(),
          PYTHONUNBUFFERED: "1"
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
          console.log("[SenseVoice Python]", msg);
        }
      });

      // Handle process exit — reject queued requests so they don't hang
      serverProcess.on("close", (code) => {
        console.log("[SenseVoice] Server closed with code:", code);
        serverProcess = null;
        ready = false;
        initialized = false;
        initPromise = null;

        // Reject any pending requests
        while (messageQueue.length > 0) {
          const [, rej] = messageQueue.shift();
          rej(new Error("Server process exited"));
        }
      });

      serverProcess.on("error", (err) => {
        console.error("[SenseVoice] Server error:", err);
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
          console.error("[SenseVoice] Startup timeout");
          initPromise = null;
          initResolve = null;
          initReject = null;
          reject(new Error("Startup timeout"));
        }
      }, CONFIG.startupTimeout);

    } catch (error) {
      console.error("[SenseVoice] Failed to start:", error);
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
    console.log("[SenseVoice] Response:", JSON.stringify(response).substring(0, 100));

    // Init response — Python returns { "initialized": true/false }
    if (response.initialized !== undefined && !ready) {
      ready = response.initialized;
      initialized = true;

      if (ready) {
        console.log("[SenseVoice] Server ready!");
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
    console.error("[SenseVoice] Failed to parse response:", line.substring(0, 100), error);
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
    console.log("[SenseVoice] Transcribing file:", tempFile);

    // Send transcription request
    const result = await sendRequest({
      action: "transcribe",
      audio_path: tempFile,
    });

    return result;

  } catch (error) {
    console.error("[SenseVoice] Transcription error:", error);
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
    return { ready: false, error: error.message };
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
    console.log("[SenseVoice] Server stopped");
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
  // Exported for testing
  _writeWavFile: writeWavFile,
  _handleResponse: handleResponse,
};
