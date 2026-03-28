#!/usr/bin/env python3
"""
faster-whisper transcription server
Runs as a subprocess, reads JSON commands from stdin, writes JSON responses to stdout.

Notes:
- Uses faster-whisper instead of the custom ONNX decoder for better accuracy.
- By default the model is downloaded on first run into a local cache dir.
- Model/config can be overridden with environment variables.
"""

import json
import os
import sys
import wave
from pathlib import Path

import numpy as np

try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    print(
        "ERROR: faster-whisper not installed. Run: pip install faster-whisper",
        file=sys.stderr,
    )


DEFAULT_MODEL = os.environ.get("HYPERCLAW_WHISPER_MODEL", "base.en")
DEFAULT_MODEL_PATH = os.environ.get("HYPERCLAW_WHISPER_MODEL_PATH")
DEFAULT_DEVICE = os.environ.get("HYPERCLAW_WHISPER_DEVICE", "auto")
DEFAULT_COMPUTE_TYPE = os.environ.get("HYPERCLAW_WHISPER_COMPUTE_TYPE", "int8")
DEFAULT_LANGUAGE = os.environ.get("HYPERCLAW_WHISPER_LANGUAGE", "en")
CACHE_DIR = Path(
    os.environ.get(
        "HYPERCLAW_WHISPER_CACHE_DIR",
        str(Path.home() / ".cache" / "hyperclaw" / "faster-whisper"),
    )
)


class FasterWhisperServer:
    def __init__(self) -> None:
        self.model = None
        self.initialized = False
        self.init_error = None

    def initialize(self) -> bool:
        if self.initialized and self.model is not None:
            return True

        if not FASTER_WHISPER_AVAILABLE:
            self.init_error = "faster-whisper not installed"
            return False

        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            model_source = DEFAULT_MODEL_PATH or DEFAULT_MODEL
            print(
                f"Loading faster-whisper model={model_source} device={DEFAULT_DEVICE} compute_type={DEFAULT_COMPUTE_TYPE}",
                file=sys.stderr,
            )
            self.model = WhisperModel(
                model_source,
                device=DEFAULT_DEVICE,
                compute_type=DEFAULT_COMPUTE_TYPE,
                download_root=str(CACHE_DIR),
            )
            self.initialized = True
            self.init_error = None
            print("faster-whisper model loaded!", file=sys.stderr)
            return True
        except Exception as exc:
            self.init_error = str(exc)
            print(f"Failed to load faster-whisper model: {exc}", file=sys.stderr)
            return False

    def _load_wav_as_numpy(self, audio_path: str) -> np.ndarray:
        """Read a 16kHz mono 16-bit WAV file into a float32 numpy array."""
        with wave.open(audio_path, "rb") as wf:
            frames = wf.readframes(wf.getnframes())
            return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

    def transcribe(self, audio_path: str) -> dict:
        if not self.initialized or self.model is None:
            return {"success": False, "error": "Model not initialized"}

        try:
            audio = self._load_wav_as_numpy(audio_path)
            segments, info = self.model.transcribe(
                audio,
                beam_size=5,
                best_of=5,
                vad_filter=True,
                condition_on_previous_text=False,
                language=DEFAULT_LANGUAGE or None,
            )
            text = "".join(segment.text for segment in segments).strip()
            return {
                "success": True,
                "text": text,
                "language": getattr(info, "language", None),
                "duration": getattr(info, "duration", None),
            }
        except Exception as exc:
            print(f"Transcription error: {exc}", file=sys.stderr)
            return {"success": False, "error": str(exc)}


server = FasterWhisperServer()


def handle_request(line: str) -> str:
    try:
        req = json.loads(line.strip())
        action = req.get("action")

        if action == "init":
            ok = server.initialize()
            return json.dumps({"initialized": ok, "error": None if ok else server.init_error})

        if action == "transcribe":
            if not server.initialized:
                return json.dumps({"success": False, "error": "Model not initialized"})
            audio_path = req.get("audio_path")
            if not audio_path:
                return json.dumps({"success": False, "error": "No audio_path"})
            return json.dumps(server.transcribe(str(audio_path)))

        if action == "status":
            return json.dumps(
                {
                    "success": True,
                    "initialized": server.initialized,
                    "ready": server.initialized,
                    "error": server.init_error,
                    "model": DEFAULT_MODEL,
                    "modelPath": DEFAULT_MODEL_PATH,
                    "device": DEFAULT_DEVICE,
                    "computeType": DEFAULT_COMPUTE_TYPE,
                    "cacheDir": str(CACHE_DIR),
                }
            )

        return json.dumps({"success": False, "error": f"Unknown action: {action}"})
    except json.JSONDecodeError:
        return json.dumps({"success": False, "error": "Invalid JSON"})
    except Exception as exc:
        return json.dumps({"success": False, "error": str(exc)})


def main() -> None:
    print("faster-whisper server starting...", file=sys.stderr)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        print(handle_request(line), flush=True)


if __name__ == "__main__":
    main()
