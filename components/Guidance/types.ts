export type GuidanceStepPosition =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "center";

export interface GuidanceStep {
  id: string;
  target: string; // CSS selector or data attribute
  title: string;
  description: string;
  position?: GuidanceStepPosition;
  offset?: { x?: number; y?: number };
  highlightPadding?: number;
  skipIfNotFound?: boolean;
  beforeStep?: () => void | Promise<void>;
  afterStep?: () => void | Promise<void>;
}

export interface GuidanceConfig {
  id: string;
  steps: GuidanceStep[];
  storageKey?: string; // localStorage key to track completion
  showSkipButton?: boolean;
  showProgress?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}
