import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// We test the exported helpers and the handleResponse/writeWavFile logic.
// The full init/transcribe flow requires a real Python subprocess so we focus
// on the units that had bugs: response parsing, WAV creation, and timeout.

describe('sensevoice-service', () => {
  let service;

  beforeEach(() => {
    // Use the singleton but reset its state before each test
    service = require('./sensevoice-service');
    service.stop(); // Resets ready/initialized/process state
  });

  describe('writeWavFile', () => {
    it('creates a valid WAV file from a Float32Array', () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const filePath = service._writeWavFile(samples);

      try {
        expect(fs.existsSync(filePath)).toBe(true);

        const buf = fs.readFileSync(filePath);
        // RIFF header
        expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
        expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
        // fmt chunk
        expect(buf.toString('ascii', 12, 16)).toBe('fmt ');
        expect(buf.readUInt16LE(20)).toBe(1); // PCM format
        expect(buf.readUInt16LE(22)).toBe(1); // mono
        expect(buf.readUInt32LE(24)).toBe(16000); // sample rate
        expect(buf.readUInt16LE(34)).toBe(16); // bits per sample
        // data chunk
        expect(buf.toString('ascii', 36, 40)).toBe('data');
        // Data size = 5 samples * 2 bytes
        expect(buf.readUInt32LE(40)).toBe(10);
        // Total file size = 44 header + 10 data
        expect(buf.length).toBe(54);
      } finally {
        fs.unlinkSync(filePath);
      }
    });

    it('creates a valid WAV file from a regular array', () => {
      const samples = [0, 0.5, -0.5];
      const filePath = service._writeWavFile(samples);

      try {
        expect(fs.existsSync(filePath)).toBe(true);
        const buf = fs.readFileSync(filePath);
        expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
        // 3 samples * 2 bytes = 6 bytes of audio data
        expect(buf.readUInt32LE(40)).toBe(6);
      } finally {
        fs.unlinkSync(filePath);
      }
    });

    it('creates a valid WAV file from a Buffer (PCM Int16 bytes)', () => {
      // 2 samples of Int16LE: 0 and 16384 (0.5 * 32768)
      const pcmBuf = Buffer.alloc(4);
      pcmBuf.writeInt16LE(0, 0);
      pcmBuf.writeInt16LE(16384, 2);

      const filePath = service._writeWavFile(pcmBuf);

      try {
        expect(fs.existsSync(filePath)).toBe(true);
        const buf = fs.readFileSync(filePath);
        expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
        // 2 samples * 2 bytes = 4 bytes
        expect(buf.readUInt32LE(40)).toBe(4);
      } finally {
        fs.unlinkSync(filePath);
      }
    });

    it('clamps samples to [-1, 1] range', () => {
      const samples = new Float32Array([2.0, -3.0]); // Out of range
      const filePath = service._writeWavFile(samples);

      try {
        const buf = fs.readFileSync(filePath);
        // Sample at offset 44 should be clamped to 32767 (max Int16)
        expect(buf.readInt16LE(44)).toBe(32767);
        // Sample at offset 46 should be clamped to -32768 (min Int16)
        // Note: Math.round(-1 * 32767) = -32767, not -32768
        expect(buf.readInt16LE(46)).toBe(-32767);
      } finally {
        fs.unlinkSync(filePath);
      }
    });

    it('throws for unsupported audio format', () => {
      expect(() => service._writeWavFile("not audio")).toThrow("Unsupported audio data format");
      expect(() => service._writeWavFile(42)).toThrow("Unsupported audio data format");
    });
  });

  describe('handleResponse - init response parsing', () => {
    // handleResponse modifies module-level state. We test it indirectly
    // by checking that the service correctly transitions to ready state.

    it('recognizes { initialized: true } as a successful init', () => {
      // Before init, service should not be ready
      expect(service.isReady()).toBe(false);

      // Simulate the Python server responding with the init response
      service._handleResponse(JSON.stringify({ initialized: true }));

      expect(service.isReady()).toBe(true);
    });

    it('recognizes { initialized: false } as a failed init', () => {
      service._handleResponse(JSON.stringify({ initialized: false, error: "model not found" }));
      expect(service.isReady()).toBe(false);
    });

    it('does not treat { success: true } as an init response', () => {
      // This was the old bug — Python returned { success: true } which has
      // initialized === undefined, so it should NOT trigger the init path
      service._handleResponse(JSON.stringify({ success: true }));
      expect(service.isReady()).toBe(false);
    });
  });

  describe('getPythonDir', () => {
    it('returns the python subdirectory', () => {
      const dir = service.getPythonDir();
      expect(dir).toBe(path.join(__dirname, 'python'));
    });
  });

  describe('isReady / stop', () => {
    it('isReady returns false initially', () => {
      expect(service.isReady()).toBe(false);
    });

    it('stop resets state', () => {
      // Simulate ready state
      service._handleResponse(JSON.stringify({ initialized: true }));
      expect(service.isReady()).toBe(true);

      service.stop();
      expect(service.isReady()).toBe(false);
    });
  });
});
