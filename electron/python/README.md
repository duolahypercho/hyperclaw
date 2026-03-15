# SenseVoice Python Server

This directory contains the Python server for SenseVoice transcription.

## Setup

### 1. Install Python Dependencies

```bash
cd electron/python
pip install -r requirements.txt
```

### 2. Model Download

The first time you run the app, the SenseVoice model will be automatically downloaded from ModelScope (~160MB).

The model is cached at:
- macOS: `~/.cache/modelscope/hub/iic/SenseVoiceSmall/`
- Windows: `%USERPROFILE%\.cache\modelscope\hub\iic\SenseVoiceSmall\`

## Testing

### Test Python Server Manually

```bash
cd electron/python
python3 sensevoice_server.py
```

Then in another terminal:

```bash
echo '{"action": "status"}' | python3 sensevoice_server.py
```

### Test with Audio File

```bash
echo '{"action": "transcribe", "audio_path": "/path/to/audio.wav"}' | python3 sensevoice_server.py
```

## Troubleshooting

### funasr_onnx not found

Make sure you're in the python directory when installing:

```bash
cd electron/python
pip install funasr-onnx
```

### Model Download Fails

The model is downloaded from ModelScope. If it fails, you can manually download:

```bash
# Install modelscope
pip install modelscope

# Download model
python -c "from modelscope.hub import snapshot; snapshot.download('iic/SenseVoiceSmall', cache_dir='~/.cache/modelscope/hub')"
```

## How It Works

1. Electron spawns a Python subprocess running `sensevoice_server.py`
2. Audio is captured in the overlay (HTML/JS)
3. Audio is written to a temp WAV file
4. Path is sent to Python server via stdin
5. Python uses `funasr_onnx` to run ONNX inference
6. Result is returned via stdout as JSON

## Supported Languages

SenseVoice supports 50+ languages including:
- English (en)
- Chinese (zh)
- Cantonese (yue)
- Japanese (ja)
- Korean (ko)
- And many more...

The language is automatically detected when using `language="auto"`.
