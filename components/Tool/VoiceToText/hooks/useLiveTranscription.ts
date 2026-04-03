import { useState, useEffect, useCallback, useRef } from 'react';

type SpeechRecognitionEvent = Event & {
    results: SpeechRecognitionResultList;
    resultIndex: number;
};

/** Returns true when the browser supports the Web Speech API. */
const hasSpeechRecognition = () =>
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export const useLiveTranscription = () => {
    const [transcript, setTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioData, setAudioData] = useState<number[]>([]);

    // Audio analysis refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Web Speech API ref
    const recognitionRef = useRef<any>(null);
    // Accumulated final text for Web Speech API
    const finalTextRef = useRef('');

    // ── Stop audio analysis (waveform + mic stream) ──

    const stopAudioAnalysis = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
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

    // ── Start waveform analyser from a mic stream ──

    const startWaveformAnalysis = useCallback(async (stream: MediaStream) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        audioContextRef.current = audioContext;

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
    }, []);

    // ── Browser (Web Speech API) ──

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
            if (event.error === 'no-speech') return;
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
            recognitionRef.current = null;
            try { recognition.stop(); } catch {}
        }
    }, []);

    // ── Public API ──

    const stopListening = useCallback(() => {
        stopBrowserListening();
        stopAudioAnalysis();
        setIsListening(false);
    }, [stopAudioAnalysis, stopBrowserListening]);

    const startListening = useCallback(async () => {
        setError(null);
        setTranscript("");
        setInterimTranscript("");
        finalTextRef.current = '';

        try {
            if (hasSpeechRecognition()) {
                await startBrowserListening();
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
            setIsListening(false);
            stopAudioAnalysis();
        }
    }, [startBrowserListening, stopAudioAnalysis]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch {}
                recognitionRef.current = null;
            }
            stopAudioAnalysis();
        };
    }, [stopAudioAnalysis]);

    const clearTranscript = useCallback(() => {
        setTranscript("");
        setInterimTranscript("");
        finalTextRef.current = '';
    }, []);

    /** Read current audio level directly from the AnalyserNode. */
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
