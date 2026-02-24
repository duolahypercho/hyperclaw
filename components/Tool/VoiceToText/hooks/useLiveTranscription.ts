import { useState, useEffect, useCallback, useRef } from 'react';

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
}

interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
    error: string;
    message: string;
}

interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    [index: number]: SpeechRecognitionAlternative;
    isFinal: boolean;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

export const useLiveTranscription = () => {
    const [transcript, setTranscript] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioData, setAudioData] = useState<number[]>([]);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Stop audio analysis
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

    // Start audio analysis for waveform visualization
    const startAudioAnalysis = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

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
                    // Normalize to 0-1 range (0-255 -> 0-1)
                    normalizedData.push(value / 255);
                }

                setAudioData(normalizedData);
                animationFrameRef.current = requestAnimationFrame(updateAudioData);
            };

            updateAudioData();
        } catch (err: any) {
            console.warn('Error starting audio analysis:', err);
            // Don't fail transcription if audio analysis fails
        }
    }, []);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (err) {
                // Recognition might already be stopped
                console.warn('Error stopping recognition:', err);
            }
            recognitionRef.current = null;
            setIsListening(false);
        }
        stopAudioAnalysis();
    }, [stopAudioAnalysis]);

    const startListening = useCallback(() => {
        // Standard check for browser support
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SpeechRecognition) {
            setError('Speech recognition is not supported in this browser');
            return;
        }

        // Stop any existing recognition
        if (recognitionRef.current) {
            stopListening();
        }

        const recognition = new SpeechRecognition() as SpeechRecognition;
        recognition.continuous = true;
        recognition.interimResults = true; // THE "LIGHTNING SPEED" KEY
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const segments: Array<{ text: string; isFinal: boolean }> = [];

            // Collect all segments with their finalization status
            for (let i = 0; i < event.results.length; ++i) {
                const result = event.results[i];
                const text = result[0].transcript.trim();
                if (text) {
                    segments.push({
                        text,
                        isFinal: result.isFinal
                    });
                }
            }

            // Intelligently join segments with space or newline
            let fullText = "";
            for (let i = 0; i < segments.length; ++i) {
                const current = segments[i];
                const previous = i > 0 ? segments[i - 1] : null;

                if (i > 0) {
                    // Determine separator: newline or space
                    const shouldUseNewline =
                        previous &&
                        previous.isFinal && // Previous segment is finalized
                        /[.!?]\s*$/.test(previous.text) && // Ends with sentence punctuation
                        /^[A-Z]/.test(current.text); // Current starts with capital letter

                    fullText += shouldUseNewline ? "\n" : " ";
                }

                fullText += current.text;
            }

            setTranscript(fullText);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('Speech recognition error:', event.error, event.message);
            setError(`Speech recognition error: ${event.error}`);
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
            setIsListening(true);
            setError(null);

            // Start audio analysis for waveform
            startAudioAnalysis();
        } catch (err: any) {
            console.error('Error starting recognition:', err);
            setError(`Failed to start recognition: ${err.message || 'Unknown error'}`);
            setIsListening(false);
            stopAudioAnalysis();
        }
    }, [stopListening, startAudioAnalysis, stopAudioAnalysis]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                } catch (err) {
                    // Ignore errors during cleanup
                }
                recognitionRef.current = null;
            }
        };
    }, []);

    const clearTranscript = useCallback(() => {
        setTranscript("");
    }, []);

    return {
        transcript,
        isListening,
        error,
        audioData, // Audio data for waveform visualization
        startListening,
        stopListening,
        clearTranscript
    };
};