# Whisper ONNX Transcription Server

This directory contains the Python server for Whisper speech-to-text transcription.

## Setup

### Install Python Dependencies

```bash
pip install onnxruntime numpy tokenizers
```

### Model

The whisper-tiny ONNX model is bundled at `models/whisper-tiny/`. No download needed.

## Testing

### Test Python Server Manually

```bash
cd electron/python
python3 whisper_server.py
```

Then send a command:

```bash
echo '{"action": "status"}' | python3 whisper_server.py
```

### Test with Audio File

```bash
echo '{"action": "transcribe", "audio_path": "/path/to/audio.wav"}' | python3 whisper_server.py
```

## How It Works

1. Electron spawns a Python subprocess running `whisper_server.py`
2. Audio is captured in the overlay (HTML/JS)
3. Audio is written to a temp WAV file (16kHz mono PCM)
4. Path is sent to Python server via stdin
5. Python uses `onnxruntime` to run Whisper ONNX inference
6. Result is returned via stdout as JSON

## Supported Languages

Whisper supports 99 languages including English, Chinese, Japanese, Korean, Spanish, French, German, and many more. Language is auto-detected.
