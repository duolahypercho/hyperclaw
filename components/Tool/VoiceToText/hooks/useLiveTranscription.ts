import { useState, useEffect, useCallback, useRef } from 'react';

/** Interval (ms) between interim transcription chunks while recording. */
const INTERIM_INTERVAL_MS = 2500;

export const useLiveTranscription = () => {
    const [transcript, setTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioData, setAudioData] = useState<number[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // PCM capture for chunked transcription
    const pcmBufferRef = useRef<Float32Array>(new Float32Array(0));
    const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
    const interimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sampleRateRef = useRef<number>(44100);

    // Stop audio analysis (waveform visualization + mic stream)
    const stopAudioAnalysis = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        // Stop interim transcription timer
        if (interimTimerRef.current) {
            clearInterval(interimTimerRef.current);
            interimTimerRef.current = null;
        }

        // Disconnect ScriptProcessorNode
        if (scriptNodeRef.current) {
            try { scriptNodeRef.current.disconnect(); } catch {}
            scriptNodeRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }

        analyserRef.current = null;
        setAudioData([]);
    }, []);

    // Resample Float32Array from source sample rate to 16kHz Int16
    const resampleToInt16 = useCallback((float32Data: Float32Array, sourceSampleRate: number): number[] => {
        const targetSampleRate = 16000;
        let resampled: Float32Array;

        if (sourceSampleRate !== targetSampleRate) {
            const ratio = sourceSampleRate / targetSampleRate;
            const newLength = Math.round(float32Data.length / ratio);
            resampled = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
                const srcIndex = Math.round(i * ratio);
                resampled[i] = float32Data[Math.min(srcIndex, float32Data.length - 1)];
            }
        } else {
            resampled = float32Data;
        }

        const int16Array: number[] = new Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
            const sample = Math.max(-1, Math.min(1, resampled[i]));
            int16Array[i] = Math.round(sample * 32767);
        }
        return int16Array;
    }, []);

    // Send accumulated PCM buffer for interim transcription
    const sendInterimTranscription = useCallback(async () => {
        const sensevoice = window.electronAPI?.voiceOverlay?.sensevoice;
        if (!sensevoice) return;

        const buffer = pcmBufferRef.current;
        if (buffer.length < 4000) return; // Too short, skip

        try {
            const status = await sensevoice.getStatus();
            if (!status.ready) {
                const initResult = await sensevoice.initialize();
                if (!initResult.success) return;
            }

            const audioData = resampleToInt16(buffer, sampleRateRef.current);
            if (audioData.length === 0) return;

            const result = await sensevoice.transcribe(audioData);
            if (result.success && result.text) {
                setInterimTranscript(result.text.trim());
            }
        } catch {
            // Silently ignore interim transcription errors
        }
    }, [resampleToInt16]);

    // Start audio analysis for waveform visualization + MediaRecorder for SenseVoice
    const startAudioAnalysis = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;
            sampleRateRef.current = audioContext.sampleRate;

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            // ScriptProcessorNode to capture raw PCM for chunked transcription
            pcmBufferRef.current = new Float32Array(0);
            const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
            scriptNodeRef.current = scriptNode;

            scriptNode.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const prev = pcmBufferRef.current;
                const next = new Float32Array(prev.length + input.length);
                next.set(prev);
                next.set(input, prev.length);
                pcmBufferRef.current = next;
            };

            source.connect(scriptNode);
            // ScriptProcessorNode must connect to destination to fire events,
            // but route through a silent GainNode to avoid echoing mic to speakers
            const silentGain = audioContext.createGain();
            silentGain.gain.value = 0;
            scriptNode.connect(silentGain);
            silentGain.connect(audioContext.destination);

            // Start interim transcription interval
            interimTimerRef.current = setInterval(() => {
                sendInterimTranscription();
            }, INTERIM_INTERVAL_MS);

            // Analyze audio data for waveform
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateAudioData = () => {
                if (!analyserRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArray);

                // Normalize and extract relevant frequency bands for visualization
                const bars = 5;
                const step = Math.floor(dataArray.length / bars);
                const normalizedData: number[] = [];

                for (let i = 0; i < bars; i++) {
                    const index = i * step;
                    const value = dataArray[index] || 0;
                    normalizedData.push(value / 255);
                }

                setAudioData(normalizedData);
                animationFrameRef.current = requestAnimationFrame(updateAudioData);
            };

            updateAudioData();

            // Start MediaRecorder to capture audio for final SenseVoice transcription
            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm',
            });

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current = recorder;
            recorder.start(1000); // Collect data every second

        } catch (err: any) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError('Microphone access denied. Please allow microphone access in your browser settings and reload the page.');
            } else if (err.name === 'NotFoundError') {
                setError('No microphone found. Please connect a microphone and try again.');
            } else {
                console.warn('Error starting audio analysis:', err);
                setError(`Failed to access microphone: ${err.message || 'Unknown error'}`);
            }
            throw err; // Re-throw so startListening knows it failed
        }
    }, [sendInterimTranscription]);

    // Convert recorded audio blob to PCM Int16 array for SenseVoice
    const blobToInt16Array = useCallback(async (blob: Blob): Promise<number[]> => {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const float32Data = audioBuffer.getChannelData(0);
            return resampleToInt16(float32Data, audioBuffer.sampleRate);
        } finally {
            await audioContext.close();
        }
    }, [resampleToInt16]);

    // Send recorded audio to SenseVoice for transcription
    const transcribeWithSenseVoice = useCallback(async (audioBlob: Blob) => {
        const sensevoice = window.electronAPI?.voiceOverlay?.sensevoice;
        if (!sensevoice) {
            setError('SenseVoice transcription is not available');
            setIsTranscribing(false);
            return;
        }

        setIsTranscribing(true);
        try {
            // Initialize SenseVoice if needed
            const status = await sensevoice.getStatus();
            if (!status.ready) {
                const initResult = await sensevoice.initialize();
                if (!initResult.success) {
                    setError(`Failed to initialize transcription: ${initResult.error || 'Unknown error'}`);
                    return;
                }
            }

            // Convert audio to PCM Int16 array
            const audioData = await blobToInt16Array(audioBlob);

            if (audioData.length === 0) {
                setError('No audio data recorded');
                return;
            }

            // Send to SenseVoice via IPC
            const result = await sensevoice.transcribe(audioData);

            if (result.success && result.text) {
                setTranscript(result.text.trim());
                setInterimTranscript(""); // Clear interim once final is ready
            } else if (!result.success) {
                setError(result.error || 'Transcription failed');
            }
            // If success but empty text, leave transcript empty (silence)
        } catch (err: any) {
            console.error('SenseVoice transcription error:', err);
            setError(`Transcription error: ${err.message || 'Unknown error'}`);
        } finally {
            setIsTranscribing(false);
        }
    }, [blobToInt16Array]);

    const stopListening = useCallback(() => {
        // Stop MediaRecorder and collect audio for transcription
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            // Use onstop to get the final blob after all data is flushed
            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
                audioChunksRef.current = [];
                mediaRecorderRef.current = null;

                // Transcribe the recorded audio
                if (audioBlob.size > 0) {
                    transcribeWithSenseVoice(audioBlob);
                }
            };
            recorder.stop();
        } else {
            mediaRecorderRef.current = null;
        }

        setIsListening(false);
        stopAudioAnalysis();
    }, [stopAudioAnalysis, transcribeWithSenseVoice]);

    const startListening = useCallback(async () => {
        setError(null);
        setTranscript("");
        setInterimTranscript("");

        try {
            // Start audio analysis (waveform) and MediaRecorder (for SenseVoice)
            await startAudioAnalysis();
            setIsListening(true);
        } catch (err: any) {
            // Error already set in startAudioAnalysis
            setIsListening(false);
            stopAudioAnalysis();
        }
    }, [startAudioAnalysis, stopAudioAnalysis]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try {
                    mediaRecorderRef.current.stop();
                } catch (err) {
                    // Ignore errors during cleanup
                }
                mediaRecorderRef.current = null;
            }
            if (interimTimerRef.current) {
                clearInterval(interimTimerRef.current);
                interimTimerRef.current = null;
            }
            stopAudioAnalysis();
        };
    }, [stopAudioAnalysis]);

    const clearTranscript = useCallback(() => {
        setTranscript("");
        setInterimTranscript("");
    }, []);

    return {
        transcript,
        interimTranscript,
        isListening,
        isTranscribing,
        error,
        audioData,
        startListening,
        stopListening,
        clearTranscript
    };
};
