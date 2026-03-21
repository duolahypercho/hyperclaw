#!/usr/bin/env python3
"""
Whisper ONNX Transcription Server
Runs as a subprocess, reads JSON commands from stdin, writes JSON responses to stdout.
Uses bundled whisper-tiny ONNX model — no network needed at runtime.

Dependencies: onnxruntime, numpy, tokenizers
"""

import sys
import json
import os
import numpy as np
from pathlib import Path

# Model dir is sibling to this script
MODEL_DIR = Path(__file__).parent / "models" / "whisper-tiny"

# ── Imports ──────────────────────────────────────────────────────────────

try:
    import onnxruntime as ort
    ORT_AVAILABLE = True
except ImportError:
    ORT_AVAILABLE = False
    print("ERROR: onnxruntime not installed. Run: pip install onnxruntime", file=sys.stderr)

try:
    from tokenizers import Tokenizer
    TOKENIZERS_AVAILABLE = True
except ImportError:
    TOKENIZERS_AVAILABLE = False
    print("ERROR: tokenizers not installed. Run: pip install tokenizers", file=sys.stderr)


# ── Audio preprocessing (replaces WhisperFeatureExtractor) ───────────────

def load_audio_from_wav(wav_path: str) -> np.ndarray:
    """Read a 16kHz mono WAV file into a float32 numpy array."""
    import struct

    with open(wav_path, "rb") as f:
        riff = f.read(4)
        if riff != b"RIFF":
            raise ValueError("Not a WAV file")
        f.read(4)  # file size
        wave = f.read(4)
        if wave != b"WAVE":
            raise ValueError("Not a WAV file")

        # Read chunks until we find "data"
        sample_rate = 16000
        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                raise ValueError("No data chunk found")
            chunk_size = struct.unpack("<I", f.read(4))[0]
            if chunk_id == b"fmt ":
                fmt_data = f.read(chunk_size)
                audio_format = struct.unpack("<H", fmt_data[0:2])[0]
                num_channels = struct.unpack("<H", fmt_data[2:4])[0]
                sample_rate = struct.unpack("<I", fmt_data[4:8])[0]
            elif chunk_id == b"data":
                raw = f.read(chunk_size)
                break
            else:
                f.read(chunk_size)

    # Convert to float32
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

    # Resample to 16kHz if needed
    if sample_rate != 16000:
        ratio = 16000 / sample_rate
        new_len = int(len(samples) * ratio)
        indices = np.round(np.linspace(0, len(samples) - 1, new_len)).astype(int)
        samples = samples[indices]

    return samples


def compute_log_mel_spectrogram(audio: np.ndarray, n_mels: int = 80) -> np.ndarray:
    """Compute log-Mel spectrogram matching Whisper's preprocessing."""
    sample_rate = 16000
    n_fft = 400
    hop_length = 160
    max_len = 3000  # 30 seconds at 16kHz with hop_length=160

    # Pad or trim to 30 seconds
    target_length = sample_rate * 30
    if len(audio) > target_length:
        audio = audio[:target_length]
    else:
        audio = np.pad(audio, (0, target_length - len(audio)))

    # STFT
    window = np.hanning(n_fft + 1)[:-1].astype(np.float32)
    num_frames = 1 + (len(audio) - n_fft) // hop_length
    frames = np.lib.stride_tricks.as_strided(
        audio,
        shape=(num_frames, n_fft),
        strides=(audio.strides[0] * hop_length, audio.strides[0]),
    ).copy()
    frames *= window
    fft = np.fft.rfft(frames, n=n_fft)
    magnitudes = np.abs(fft) ** 2

    # Mel filterbank
    mel_filters = _mel_filterbank(sample_rate, n_fft, n_mels)
    mel_spec = np.clip(magnitudes, a_min=0, a_max=1e10).astype(np.float64) @ mel_filters.T.astype(np.float64)
    mel_spec = np.clip(mel_spec, a_min=1e-10, a_max=None).astype(np.float32)
    log_mel = np.log10(mel_spec)

    # Normalize
    log_mel = np.maximum(log_mel, log_mel.max() - 8.0)
    log_mel = (log_mel + 4.0) / 4.0

    # Transpose to (n_mels, time) and pad/trim to max_len
    log_mel = log_mel.T
    if log_mel.shape[1] > max_len:
        log_mel = log_mel[:, :max_len]
    elif log_mel.shape[1] < max_len:
        log_mel = np.pad(log_mel, ((0, 0), (0, max_len - log_mel.shape[1])))

    return log_mel.astype(np.float32)


def _mel_filterbank(sr: int, n_fft: int, n_mels: int) -> np.ndarray:
    """Create a Mel filterbank matrix."""
    fmin, fmax = 0.0, sr / 2.0
    mel_min = 2595.0 * np.log10(1.0 + fmin / 700.0)
    mel_max = 2595.0 * np.log10(1.0 + fmax / 700.0)
    mels = np.linspace(mel_min, mel_max, n_mels + 2)
    freqs = 700.0 * (10.0 ** (mels / 2595.0) - 1.0)
    bins = np.floor((n_fft + 1) * freqs / sr).astype(int)

    fb = np.zeros((n_mels, n_fft // 2 + 1), dtype=np.float32)
    for i in range(n_mels):
        lo, mid, hi = bins[i], bins[i + 1], bins[i + 2]
        for j in range(lo, mid):
            if mid != lo:
                fb[i, j] = (j - lo) / (mid - lo)
        for j in range(mid, hi):
            if hi != mid:
                fb[i, j] = (hi - j) / (hi - mid)
    return fb


# ── Whisper ONNX inference ───────────────────────────────────────────────

class WhisperOnnxServer:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.encoder = None
        self.decoder = None
        self.tokenizer = None
        self.initialized = False

    def initialize(self) -> bool:
        if not ORT_AVAILABLE or not TOKENIZERS_AVAILABLE:
            return False

        try:
            encoder_path = self.model_dir / "encoder_model_fp16.onnx"
            decoder_path = self.model_dir / "decoder_model_merged_fp16.onnx"
            tokenizer_path = self.model_dir / "tokenizer.json"

            if not encoder_path.exists() or not decoder_path.exists():
                print(f"ERROR: Model files not found in {self.model_dir}", file=sys.stderr)
                return False

            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            opts.inter_op_num_threads = 2
            opts.intra_op_num_threads = 2

            print("Loading Whisper encoder...", file=sys.stderr)
            self.encoder = ort.InferenceSession(str(encoder_path), opts)

            print("Loading Whisper decoder...", file=sys.stderr)
            self.decoder = ort.InferenceSession(str(decoder_path), opts)

            print("Loading tokenizer...", file=sys.stderr)
            self.tokenizer = Tokenizer.from_file(str(tokenizer_path))

            self.initialized = True
            print("Whisper ONNX model loaded!", file=sys.stderr)
            return True

        except Exception as e:
            print(f"Failed to load model: {e}", file=sys.stderr)
            return False

    def transcribe(self, audio_path: str) -> dict:
        if not self.initialized:
            return {"success": False, "error": "Model not initialized"}

        try:
            # Load and preprocess audio
            audio = load_audio_from_wav(audio_path)
            mel = compute_log_mel_spectrogram(audio)
            mel = mel[np.newaxis, :, :]  # Add batch dim: (1, 80, 3000)

            # Encode
            encoder_out = self.encoder.run(None, {"input_features": mel})[0]

            # Decode (greedy)
            # Whisper special tokens
            SOT = 50258       # <|startoftranscript|>
            LANG = 50259      # <|en|> — auto-detect not trivial, default to en
            TRANSCRIBE = 50359  # <|transcribe|>
            NOTIMESTAMPS = 50363  # <|notimestamps|>
            EOT = 50257       # <|endoftext|>

            token_ids = [SOT, LANG, TRANSCRIBE, NOTIMESTAMPS]
            max_tokens = 224

            # Get decoder input names to figure out the KV cache shape
            decoder_inputs = {inp.name: inp for inp in self.decoder.get_inputs()}
            use_cache = "use_cache_branch" in decoder_inputs

            # Build initial past KV cache (zeros)
            past_kv = {}
            for inp in self.decoder.get_inputs():
                if inp.name.startswith("past_key_values"):
                    shape = [s if isinstance(s, int) else 1 for s in inp.shape]
                    # Sequence dim (usually index 2) should be 0 for first pass
                    shape[2] = 0
                    past_kv[inp.name] = np.zeros(shape, dtype=np.float32)

            for step in range(max_tokens):
                decoder_input = np.array([token_ids if step == 0 else [token_ids[-1]]], dtype=np.int64)

                feeds = {
                    "input_ids": decoder_input,
                    "encoder_hidden_states": encoder_out,
                }

                if use_cache:
                    feeds["use_cache_branch"] = np.array([step > 0])

                feeds.update(past_kv)

                outputs = self.decoder.run(None, feeds)
                logits = outputs[0]

                # Greedy: pick the most likely next token
                next_token = int(np.argmax(logits[0, -1, :]))
                token_ids.append(next_token)

                if next_token == EOT:
                    break

                # Update past KV cache from outputs
                output_names = [o.name for o in self.decoder.get_outputs()]
                new_past = {}
                for i, name in enumerate(output_names):
                    if name.startswith("present"):
                        # Map present.X.key → past_key_values.X.key
                        past_name = name.replace("present", "past_key_values")
                        new_past[past_name] = outputs[i]
                past_kv = new_past

            # Decode tokens to text (skip special tokens)
            text_tokens = [t for t in token_ids if t < 50257]
            text = self.tokenizer.decode(text_tokens)

            return {"success": True, "text": text.strip()}

        except Exception as e:
            print(f"Transcription error: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}


# ── Main server loop ─────────────────────────────────────────────────────

server = WhisperOnnxServer(MODEL_DIR)


def handle_request(line: str) -> str:
    try:
        req = json.loads(line.strip())
        action = req.get("action")

        if action == "init":
            ok = server.initialize()
            return json.dumps({"initialized": ok})

        elif action == "transcribe":
            if not server.initialized:
                return json.dumps({"success": False, "error": "Model not initialized"})
            path = req.get("audio_path")
            if not path:
                return json.dumps({"success": False, "error": "No audio_path"})
            return json.dumps(server.transcribe(path))

        elif action == "status":
            return json.dumps({"success": True, "initialized": server.initialized, "ready": server.initialized})

        else:
            return json.dumps({"success": False, "error": f"Unknown action: {action}"})

    except json.JSONDecodeError:
        return json.dumps({"success": False, "error": "Invalid JSON"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


def main():
    print("Whisper ONNX Server starting...", file=sys.stderr)
    if ORT_AVAILABLE and TOKENIZERS_AVAILABLE:
        server.initialize()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        response = handle_request(line)
        print(response, flush=True)


if __name__ == "__main__":
    main()
