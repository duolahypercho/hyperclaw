"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, X, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Types
interface VoiceOverlayProps {
  className?: string;
}

export default function VoiceOverlayPage() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioData, setAudioData] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("main");
  const [selectedSession, setSelectedSession] = useState("main");
  const [showPicker, setShowPicker] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Hide overlay handler
  const hideOverlay = useCallback(() => {
    if (window.electronAPI?.voiceOverlay) {
      window.electronAPI.voiceOverlay.hide();
    }
  }, []);

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

  // Start audio analysis for waveform
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

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateAudioData = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const bars = 5;
        const step = Math.floor(dataArray.length / bars);
        const normalizedData: number[] = [];
        
        for (let i = 0; i < bars; i++) {
          const value = dataArray[i * step];
          normalizedData.push(value / 255);
        }
        
        setAudioData(normalizedData);
        animationFrameRef.current = requestAnimationFrame(updateAudioData);
      };

      updateAudioData();
    } catch (error) {
      console.error("Error starting audio analysis:", error);
    }
  }, []);

  // Start voice recognition
  const startListening = useCallback(async () => {
    setTranscript("");
    setInterimTranscript("");
    
    // Start audio analysis for waveform
    await startAudioAnalysis();

    // Check for Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error("Speech recognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcriptPart;
        } else {
          interim += transcriptPart;
        }
      }

      if (final) {
        setTranscript(prev => prev + " " + final);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      stopAudioAnalysis();
    };

    recognition.onend = () => {
      setIsListening(false);
      stopAudioAnalysis();
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [startAudioAnalysis, stopAudioAnalysis]);

  // Stop voice recognition
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopAudioAnalysis();
  }, [stopAudioAnalysis]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Send message
  const sendMessage = useCallback(() => {
    const text = transcript.trim();
    if (!text) return;

    // Send via IPC to main process
    if (window.electronAPI?.openClaw) {
      window.electronAPI.openClaw.sendMessage({
        agentId: selectedAgent,
        sessionKey: `agent:${selectedAgent}:${selectedSession}`,
        message: text,
      });
    }

    // Hide overlay after sending
    setTimeout(() => {
      hideOverlay();
    }, 500);
  }, [transcript, selectedAgent, selectedSession, hideOverlay]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideOverlay();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        sendMessage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hideOverlay, sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const fullTranscript = (transcript + " " + interimTranscript).trim();

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={cn(
          "w-full max-w-lg bg-background/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-border/50 overflow-hidden",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-3 h-3 rounded-full",
              isListening ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"
            )} />
            <span className="text-sm font-medium text-foreground">
              {isListening ? "Recording..." : "Voice Input"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={hideOverlay}
            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Transcript Area */}
        <div className="p-4 min-h-[80px]">
          <AnimatePresence mode="wait">
            {fullTranscript ? (
              <motion.p
                key="transcript"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-lg text-foreground leading-relaxed"
              >
                {fullTranscript}
                {isListening && (
                  <span className="inline-block w-2 h-4 ml-1 bg-primary/60 animate-pulse" />
                )}
              </motion.p>
            ) : (
              <motion.p
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-muted-foreground text-center py-4"
              >
                {isListening ? "Listening..." : "Press the mic to start recording"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Waveform */}
        {isListening && (
          <div className="flex items-center justify-center gap-1 h-12 px-4">
            {audioData.map((value, i) => (
              <motion.div
                key={i}
                className="w-1 bg-primary rounded-full"
                animate={{ height: Math.max(4, value * 40) }}
                transition={{ duration: 0.1 }}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-muted/20">
          {/* Agent/Session Picker */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPicker(!showPicker)}
              className="h-8 text-xs"
            >
              <span className="mr-1">🤖</span>
              {selectedAgent}
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
            
            {showPicker && (
              <div className="absolute top-full left-4 mt-1 bg-background border border-border rounded-lg shadow-lg p-2 z-50">
                <div className="text-xs text-muted-foreground mb-1">Agent</div>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                >
                  <option value="main">main</option>
                  <option value="ada">ada</option>
                  <option value="echo">echo</option>
                  <option value="clio">clio</option>
                </select>
                <div className="text-xs text-muted-foreground mb-1 mt-2">Session</div>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                >
                  <option value="main">main</option>
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant={isListening ? "destructive" : "default"}
              size="sm"
              onClick={toggleListening}
              className="h-9 w-9 p-0"
            >
              {isListening ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
            
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={!transcript.trim()}
              className="h-9 px-3"
            >
              <Send className="w-4 h-4 mr-1" />
              Send
            </Button>
          </div>
        </div>

        {/* Hint */}
        <div className="text-center text-xs text-muted-foreground/60 py-2">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to close • <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Ctrl+Enter</kbd> to send
        </div>
      </motion.div>
    </div>
  );
}
