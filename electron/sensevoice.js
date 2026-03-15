/**
 * SenseVoice ONNX Inference Module
 * Provides speech-to-text using SenseVoice-Small model
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const ort = require("onnxruntime-node");

// Model configuration
const MODEL_CONFIG = {
  modelName: "sensevoice-small.onnx",
  modelUrl: "https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/sensevoice-small.onnx",
  vocabUrl: "https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/vocab.csv",
};

// Singleton instance
let session = null;
let modelPath = null;

/**
 * Get the models directory path
 */
function getModelsDir() {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "models");
}

/**
 * Get the model file path
 */
function getModelPath() {
  if (modelPath) return modelPath;
  return path.join(getModelsDir(), MODEL_CONFIG.modelName);
}

/**
 * Download model from URL
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? require("https") : require("http");
    
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Ensure model is downloaded
 */
async function ensureModel() {
  const modelPath = getModelPath();
  
  if (fs.existsSync(modelPath)) {
    console.log("[SenseVoice] Model already exists:", modelPath);
    return modelPath;
  }
  
  console.log("[SenseVoice] Downloading model...");
  const modelsDir = getModelsDir();
  
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  
  try {
    await downloadFile(MODEL_CONFIG.modelUrl, modelPath);
    console.log("[SenseVoice] Model downloaded successfully");
    return modelPath;
  } catch (error) {
    console.error("[SenseVoice] Failed to download model:", error);
    throw error;
  }
}

/**
 * Initialize the ONNX session
 */
async function initialize() {
  if (session) return session;
  
  try {
    const modelPath = await ensureModel();
    console.log("[SenseVoice] Loading ONNX session from:", modelPath);
    
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"], // Use CPU by default
    });
    
    console.log("[SenseVoice] Session initialized successfully");
    return session;
  } catch (error) {
    console.error("[SenseVoice] Failed to initialize:", error);
    throw error;
  }
}

/**
 * Transcribe audio buffer
 * This is a simplified version - full implementation would need
 * audio preprocessing and the full SenseVoice pipeline
 * 
 * @param {Float32Array} audioData - Normalized audio data (-1 to 1)
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioData) {
  if (!session) {
    await initialize();
  }
  
  // Note: This is a placeholder for the full SenseVoice implementation
  // Full implementation requires:
  // 1. Audio preprocessing (mel spectrogram)
  // 2. Tokenizer/vocab mapping
  // 3. Model inference
  // 4. Decoding (CTC greedy or beam search)
  
  console.log("[SenseVoice] Processing audio:", audioData.length, "samples");
  
  // For now, return empty - full implementation requires tokenizer
  // This will be replaced with actual inference code
  return "";
}

/**
 * Check if model is ready
 */
function isReady() {
  return session !== null;
}

/**
 * Get model info
 */
function getModelInfo() {
  return {
    modelName: MODEL_CONFIG.modelName,
    modelPath: getModelPath(),
    isReady: isReady(),
  };
}

/**
 * Cleanup
 */
function cleanup() {
  if (session) {
    session = null;
    console.log("[SenseVoice] Session cleaned up");
  }
}

module.exports = {
  initialize,
  transcribe,
  isReady,
  getModelInfo,
  cleanup,
  getModelPath,
  ensureModel,
};
