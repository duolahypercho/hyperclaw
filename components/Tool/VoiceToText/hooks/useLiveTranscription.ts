import { useState, useEffect, useCallback, useRef } from 'react';

/** Interval (ms) between interim transcription chunks while recording (Whisper only). */
const INTERIM_INTERVAL_MS = 1500;

/** Cached flag — true when user has enabled local Whisper in voice settings. */
let whisperEnabledCache = false;

type SpeechRecognitionEvent = Event & {
    results: SpeechRecognitionResultList;
    resultIndex: number;
};

/** Returns true when running inside Electron with the Whisper IPC bridge AND local whisper is enabled. */
const hasWhisper = () => !!window.electronAPI?.voiceOverlay?.whisper && whisperEnabledCache;

/** Returns true when the browser supports the Web Speech API. */
const hasSpeechRecognition = () =>
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

const getWhisperApi = () => window.electronAPI?.voiceOverlay?.whisper;
const WHISPER_STARTUP_GRACE_MS = 2500;

export const useLiveTranscription = () => {
    const [transcript, setTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioData, setAudioData] = useState<number[]>([]);

    // Audio analysis refs (shared by both engines)
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Whisper-specific refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const pcmBufferRef = useRef<Float32Array>(new Float32Array(0));
    const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
    const interimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sampleRateRef = useRef<number>(44100);
    const whisperInitializedRef = useRef(false);
    const interimInFlightRef = useRef(false);
    // Track which engine is active so stop uses the same one as start
    const activeEngineRef = useRef<'whisper' | 'browser' | null>(null);

    // Web Speech API ref
    const recognitionRef = useRef<any>(null);
    // Used to cancel stale Whisper transcriptions after clearTranscript
    const cancelledRef = useRef(false);
    // Accumulated final text for Web Speech API (ref so clearTranscript can reset it)
    const finalTextRef = useRef('');

    const ensureWhisperReady = useCallback(async () => {
        const whisper = getWhisperApi();
        if (!whisper) {
            throw new Error('Whisper transcription is not available');
        }

        if (whisperInitializedRef.current) {
            return whisper;
        }

        const status = await whisper.getStatus();
        if (!status.ready) {
            const initResult = await whisper.initialize();
            if (!initResult.success) {
                throw new Error(initResult.error || 'Whisper initialization failed');
            }
        }

        whisperInitializedRef.current = true;
        return whisper;
    }, []);

    const canUseWhisperNow = useCallback(async () => {
        const whisper = getWhisperApi();
        if (!whisper) return false;
        if (whisperInitializedRef.current) return true;

        try {
            const status = await whisper.getStatus();
            if (status?.ready) {
                whisperInitializedRef.current = true;
                return true;
            }
        } catch {}

        return false;
    }, []);

    const tryPrepareWhisperForStart = useCallback(async () => {
        const whisper = getWhisperApi();
        if (!whisper) return false;
        if (await canUseWhisperNow()) return true;

        try {
            const initResult = await Promise.race([
                whisper.initialize(),
                new Promise<{ success: false; error: string }>((resolve) =>
                    setTimeout(() => resolve({ success: false, error: 'Whisper startup timed out' }), WHISPER_STARTUP_GRACE_MS)
                ),
            ]);
            if (initResult?.success) {
                whisperInitializedRef.current = true;
                return true;
            }
        } catch {}

        return false;
    }, [canUseWhisperNow]);

    // ── Pre-initialize Whisper when available and enabled ──

    useEffect(() => {
        const whisper = window.electronAPI?.voiceOverlay?.whisper;
        if (!whisper) return;

        // Check if local whisper is enabled before attempting init
        whisper.runtimeStatus?.().then((status: any) => {
            whisperEnabledCache = !!(status?.enabled && status?.installed);
            if (!whisperEnabledCache || whisperInitializedRef.current) return;

            const tryInit = (retries = 2) => {
                whisper.initialize().then((result: { success: boolean; error?: string }) => {
                    whisperInitializedRef.current = result.success;
                    if (!result.success && retries > 0) {
                        setTimeout(() => tryInit(retries - 1), 3000);
                    } else if (!result.success) {
                        console.warn('[VoiceToText] Whisper pre-init failed after retries:', result.error || 'Unknown error');
                    }
                }).catch((error: any) => {
                    if (retries > 0) setTimeout(() => tryInit(retries - 1), 3000);
                    else console.warn('[VoiceToText] Whisper pre-init failed after retries:', error?.message || 'Unknown error');
                });
            };

            setTimeout(() => tryInit(), 1000);
        }).catch(() => {
            whisperEnabledCache = false;
        });
    }, []);

    // ── Shared: stop audio analysis (waveform + mic stream) ──

    const stopAudioAnalysis = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (interimTimerRef.current) {
            clearInterval(interimTimerRef.current);
            interimTimerRef.current = null;
        }

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

    // ── Shared: start waveform analyser from a mic stream ──

    const startWaveformAnalysis = useCallback(async (stream: MediaStream) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Chromium suspends AudioContext without a user gesture — force it running
        // so ScriptProcessorNode.onaudioprocess fires in the overlay window.
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        audioContextRef.current = audioContext;
        sampleRateRef.current = audioContext.sampleRate;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateAudioData = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            const bars = 5;
            const step = Math.floor(dataArray.length / bars);
            const normalizedData: number[] = [];
            for (let i = 0; i < bars; i++) {
                normalizedData.push((dataArray[i * step] || 0) / 255);
            }

            setAudioData(normalizedData);
            animationFrameRef.current = requestAnimationFrame(updateAudioData);
        };

        updateAudioData();
        return { audioContext, source };
    }, []);

    // ── Whisper helpers ──

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

    const sendInterimTranscription = useCallback(async () => {
        if (cancelledRef.current) return;
        // Prevent overlapping interim requests (previous one still running)
        if (interimInFlightRef.current) return;

        const buffer = pcmBufferRef.current;
        if (buffer.length < 4000) return;

        interimInFlightRef.current = true;
        try {
            const whisper = await ensureWhisperReady();

            const audioData = resampleToInt16(buffer, sampleRateRef.current);
            if (audioData.length === 0) return;

            const result = await whisper.transcribe(audioData);
            if (result.success && result.text) {
                setInterimTranscript(result.text.trim());
            }
        } catch {
            // Silently ignore interim errors
        } finally {
            interimInFlightRef.current = false;
        }
    }, [ensureWhisperReady, resampleToInt16]);

    const transcribeWithWhisper = useCallback(async (audioData: number[]) => {
        setIsTranscribing(true);
        try {
            const whisper = await ensureWhisperReady();

            if (audioData.length === 0) {
                setError('No audio data recorded');
                return;
            }

            const result = await whisper.transcribe(audioData);
            if (cancelledRef.current) return; // Session was cancelled while transcribing
            if (result.success && result.text) {
                setTranscript(result.text.trim());
                setInterimTranscript("");
            } else if (!result.success) {
                setError(result.error || 'Transcription failed');
            }
        } catch (err: any) {
            console.error('Whisper transcription error:', err);
            setError(`Transcription error: ${err.message || 'Unknown error'}`);
        } finally {
            setIsTranscribing(false);
        }
    }, [ensureWhisperReady]);

    // ── Start: Electron (Whisper) path ──

    const startWhisperListening = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const { audioContext, source } = await startWaveformAnalysis(stream);

        // PCM capture for interim chunks
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
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        scriptNode.connect(silentGain);
        silentGain.connect(audioContext.destination);

        interimTimerRef.current = setInterval(sendInterimTranscription, INTERIM_INTERVAL_MS);

        // MediaRecorder for final transcription
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm',
        });
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current = recorder;
        recorder.start(1000);
    }, [startWaveformAnalysis, sendInterimTranscription]);

    const stopWhisperListening = useCallback(() => {
        const pcmSnapshot = pcmBufferRef.current;
        const finalAudioData = resampleToInt16(pcmSnapshot, sampleRateRef.current);
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.onstop = () => {};
            recorder.stop();
            mediaRecorderRef.current = null;
        } else {
            mediaRecorderRef.current = null;
        }
        audioChunksRef.current = [];
        stopAudioAnalysis();
        if (finalAudioData.length > 0) {
            void transcribeWithWhisper(finalAudioData);
        } else {
            setError('No audio data recorded');
        }
    }, [resampleToInt16, stopAudioAnalysis, transcribeWithWhisper]);

    // ── Start: Browser (Web Speech API) path ──

    const startBrowserListening = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        await startWaveformAnalysis(stream);

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = ''; // auto-detect

        finalTextRef.current = '';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTextRef.current += result[0].transcript;
                    setTranscript(finalTextRef.current.trim());
                    setInterimTranscript("");
                } else {
                    interim += result[0].transcript;
                }
            }
            if (interim) {
                setInterimTranscript(interim.trim());
            }
        };

        recognition.onerror = (event: any) => {
            if (event.error === 'no-speech') return; // Normal, not an error
            console.error('Speech recognition error:', event.error);
            setError(`Speech recognition error: ${event.error}`);
        };

        recognition.onend = () => {
            // Restart if still supposed to be listening (browser stops after silence)
            if (recognitionRef.current) {
                try { recognition.start(); } catch {}
            }
        };

        recognition.start();
    }, [startWaveformAnalysis]);

    const stopBrowserListening = useCallback(() => {
        if (recognitionRef.current) {
            const recognition = recognitionRef.current;
            recognitionRef.current = null; // Prevent auto-restart in onend
            try { recognition.stop(); } catch {}
        }
    }, []);

    // ── Public API ──

    const stopListening = useCallback(() => {
        if (activeEngineRef.current === 'whisper') {
            stopWhisperListening();
        } else if (activeEngineRef.current === 'browser') {
            stopBrowserListening();
            stopAudioAnalysis();
        }
        activeEngineRef.current = null;
        setIsListening(false);
    }, [stopAudioAnalysis, stopWhisperListening, stopBrowserListening]);

    const startListening = useCallback(async () => {
        setError(null);
        setTranscript("");
        setInterimTranscript("");
        cancelledRef.current = false;
        finalTextRef.current = '';

        try {
            if (hasWhisper()) {
                console.log('[VoiceToText] Using Whisper engine');
                try {
                    await startWhisperListening();
                    activeEngineRef.current = 'whisper';
                    void tryPrepareWhisperForStart();
                } catch (whisperErr: any) {
                    // Mic hardware errors affect all engines — don't fallback, propagate
                    if (whisperErr.name === 'NotFoundError' ||
                        whisperErr.name === 'NotAllowedError' ||
                        whisperErr.name === 'PermissionDeniedError') {
                        throw whisperErr;
                    }
                    // Whisper-specific failure — fall back to Web Speech API
                    console.warn('[VoiceToText] Whisper failed, falling back to Web Speech API:', whisperErr);
                    setError(`Whisper unavailable: ${whisperErr?.message || 'Unknown error'}`);
                    if (hasSpeechRecognition()) {
                        await startBrowserListening();
                        activeEngineRef.current = 'browser';
                        setError(null);
                    } else {
                        throw whisperErr;
                    }
                }
            } else if (hasSpeechRecognition()) {
                console.log('[VoiceToText] Using Web Speech API engine');
                await startBrowserListening();
                activeEngineRef.current = 'browser';
            } else {
                setError('Speech recognition is not supported in this browser.');
                return;
            }
            setIsListening(true);
        } catch (err: any) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError('Microphone access denied. Please allow microphone access in your browser settings and reload the page.');
            } else if (err.name === 'NotFoundError') {
                setError('No microphone found. Please connect a microphone and try again.');
            } else {
                console.warn('[VoiceToText] Error starting audio analysis:', err);
                setError(`Failed to access microphone: ${err.message || 'Unknown error'}`);
            }
            activeEngineRef.current = null;
            setIsListening(false);
            stopAudioAnalysis();
        }
    }, [tryPrepareWhisperForStart, startWhisperListening, startBrowserListening, stopAudioAnalysis]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try { mediaRecorderRef.current.stop(); } catch {}
                mediaRecorderRef.current = null;
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch {}
                recognitionRef.current = null;
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
        cancelledRef.current = true; // Prevent any in-flight Whisper transcription from writing back
        finalTextRef.current = '';
    }, []);

    /** Read current audio level directly from the AnalyserNode (not throttled by rAF). */
    const getAudioLevel = useCallback((): number => {
        const analyser = analyserRef.current;
        if (!analyser) return 0;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        let max = 0;
        for (let i = 0; i < buf.length; i++) { if (buf[i] > max) max = buf[i]; }
        return max / 255;
    }, []);

    return {
        transcript,
        interimTranscript,
        isListening,
        isTranscribing,
        error,
        audioData,
        getAudioLevel,
        startListening,
        stopListening,
        clearTranscript
    };
};
