#!/usr/bin/env python3
# -*- encoding: utf-8 -*-
"""
SenseVoice Transcription Server
Run as: python sensevoice_server.py

Accepts audio from stdin, outputs transcription to stdout
Protocol: JSON lines (one JSON per line)
"""

import sys
import json
import asyncio
import signal
import os
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from funasr_onnx import SenseVoiceSmall
    from funasr_onnx.utils.postprocess_utils import rich_transcription_postprocess
    FUNASR_AVAILABLE = True
except ImportError:
    FUNASR_AVAILABLE = False
    print("ERROR: funasr_onnx not installed. Run: pip install funasr-onnx", file=sys.stderr)


class TranscriptionServer:
    def __init__(self, model_dir="iic/SenseVoiceSmall"):
        self.model_dir = model_dir
        self.model = None
        self.initialized = False
        
    def initialize(self):
        """Load the SenseVoice model"""
        if not FUNASR_AVAILABLE:
            return False
            
        try:
            print(f"Loading SenseVoice model from {self.model_dir}...", file=sys.stderr)
            self.model = SenseVoiceSmall(
                self.model_dir, 
                batch_size=1, 
                quantize=True,
                device="cpu"  # Use CPU for broader compatibility
            )
            self.initialized = True
            print("SenseVoice model loaded successfully!", file=sys.stderr)
            return True
        except Exception as e:
            print(f"Failed to load model: {e}", file=sys.stderr)
            return False
    
    def transcribe(self, audio_path):
        """Transcribe an audio file"""
        if not self.initialized or not self.model:
            return {"success": False, "error": "Model not initialized"}
        
        try:
            # Run inference
            res = self.model(
                [audio_path],
                language="auto",
                textnorm="withitn"  # Text normalization with ITN (inverse text normalization)
            )
            
            if res and len(res) > 0:
                text = rich_transcription_postprocess(res[0])
                return {"success": True, "text": text}
            else:
                return {"success": True, "text": ""}
                
        except Exception as e:
            return {"success": False, "error": str(e)}


# Global server instance
server = TranscriptionServer()


def handle_request(line):
    """Handle a single JSON request"""
    try:
        request = json.loads(line.strip())
        action = request.get("action")
        
        if action == "init":
            success = server.initialize()
            return json.dumps({"success": success})
        
        elif action == "transcribe":
            if not server.initialized:
                return json.dumps({"success": False, "error": "Model not initialized"})
            
            audio_path = request.get("audio_path")
            if not audio_path:
                return json.dumps({"success": False, "error": "No audio_path provided"})
            
            result = server.transcribe(audio_path)
            return json.dumps(result)
        
        elif action == "status":
            return json.dumps({
                "success": True, 
                "initialized": server.initialized,
                "model_dir": server.model_dir
            })
        
        else:
            return json.dumps({"success": False, "error": f"Unknown action: {action}"})
            
    except json.JSONDecodeError:
        return json.dumps({"success": False, "error": "Invalid JSON"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


def main():
    """Main server loop - read JSON from stdin, write to stdout"""
    print("SenseVoice Transcription Server starting...", file=sys.stderr)
    
    # Auto-initialize on startup
    if FUNASR_AVAILABLE:
        server.initialize()
    
    # Read lines from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        response = handle_request(line)
        print(response, flush=True)


if __name__ == "__main__":
    main()
