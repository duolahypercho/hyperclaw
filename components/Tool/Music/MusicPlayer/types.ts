export type PlayMode = "order" | "random" | "recursive";

export const PRELOAD_CONFIG = {
  retryAttempts: 3,
  retryDelay: 1000,
};

// Custom frequency settings interface
export interface CustomFrequencySettings {
  binaural: {
    baseFrequency: number;
    beatFrequency: number;
  };
  isochronic: {
    baseFrequency: number;
    beatFrequency: number;
    waveform: OscillatorType;
  };
}

// Base interface for all audio types
export interface BaseAudio {
  id: string;
  title: string;
  description: string;
  category: string;
}

// Binaural Beat interface
export interface BinauralBeat extends BaseAudio {
  type: "binaural";
  baseFrequency: number;
  beatFrequency: number;
}

// Isochronic Tone interface
export interface IsochronicTone extends BaseAudio {
  type: "isochronic";
  baseFrequency: number;
  beatFrequency: number;
  waveform: OscillatorType;
}

// Lofi Music interface
export interface AudioStream extends BaseAudio {
  type: "audioStream";
  url: string;
  country?: string;
  language?: string;
  favicon?: string;
}

// YouTube audio interface
export interface YouTubeAudio extends BaseAudio {
  type: "youtube";
  videoId: string;
  url: string;
  thumbnail?: string;
}

// Union type for all audio types
export type AudioType =
  | BinauralBeat
  | IsochronicTone
  | AudioStream
  | YouTubeAudio;

// Audio context interface for different audio types
export interface AudioContextRef {
  audioContext: AudioContext | null;
  gainNode: GainNode | null;
  // Binaural specific
  leftOscillator?: OscillatorNode | null;
  rightOscillator?: OscillatorNode | null;
  leftPanner?: StereoPannerNode | null;
  rightPanner?: StereoPannerNode | null;
  // Isochronic specific
  oscillator?: OscillatorNode | null;
  beatGain?: GainNode | null;
  modulator?: OscillatorNode | null;
  // Lofi specific
  audioElement?: HTMLAudioElement | null;
}

// Audio state interface
export interface AudioState {
  isPlaying: boolean;
  isLoading: boolean;
  currentAudio: AudioType | null;
  volume: number;
  isMuted: boolean;
  audioType:
    | "music"
    | "binaural"
    | "isochronic"
    | "audioStream"
    | "youtube"
    | null;
  customFrequencies: CustomFrequencySettings;
}
