# faster-whisper Transcription Server

This directory contains the Python server for local speech-to-text transcription.

## Setup

### Install Python Dependencies

```bash
pip install faster-whisper
```

### Model

By default the server uses `base.en` via `faster-whisper`.
If no bundled model is provided, it is downloaded on first run into:

```bash
~/.cache/hyperclaw/faster-whisper
```

To vendor a model into the app build so it never needs to be fetched again, place a
local CTranslate2 model directory at:

```bash
electron/python/models/faster-whisper-base.en
```

The Electron build bundler will prefer that folder over downloading from upstream.
You can also point the bundler at a custom local folder with:

```bash
HYPERCLAW_LOCAL_WHISPER_MODEL_DIR=/absolute/path/to/model
```

You can override it with environment variables:

```bash
HYPERCLAW_WHISPER_MODEL=small.en
HYPERCLAW_WHISPER_DEVICE=auto
HYPERCLAW_WHISPER_COMPUTE_TYPE=int8
```

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
5. Python uses `faster-whisper` to run transcription
6. Result is returned via stdout as JSON

## Supported Languages

Whisper supports many languages. This server defaults to English (`en`) for better dictation accuracy.
