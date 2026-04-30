import type { FurnitureItem } from "./core/types";

// --- Office Animation State ---
export type OfficePhoneCallRequest = {
  key: string;
  callee: string;
  message: string | null;
  phase: "needs_message" | "ready_to_call";
  requestedAt: number;
};

export type OfficeTextMessageRequest = {
  key: string;
  recipient: string;
  message: string | null;
  phase: "needs_message" | "ready_to_send";
  requestedAt: number;
};

export type OfficeStandupTriggerRequest = {
  key: string;
  message: string;
  requestedAt: number;
};

export type OfficeAnimationState = {
  awaitingApprovalByAgentId: Record<string, boolean>;
  cleaningCues: OfficeCleaningCue[];
  deskHoldByAgentId: Record<string, boolean>;
  githubHoldByAgentId: Record<string, boolean>;
  gymHoldByAgentId: Record<string, boolean>;
  manualGymUntilByAgentId: Record<string, number>;
  pendingStandupRequest: OfficeStandupTriggerRequest | null;
  phoneBoothHoldByAgentId: Record<string, boolean>;
  phoneCallByAgentId: Record<string, OfficePhoneCallRequest>;
  qaHoldByAgentId: Record<string, boolean>;
  smsBoothHoldByAgentId: Record<string, boolean>;
  skillGymHoldByAgentId: Record<string, boolean>;
  streamingByAgentId: Record<string, boolean>;
  textMessageByAgentId: Record<string, OfficeTextMessageRequest>;
  thinkingByAgentId: Record<string, boolean>;
  workingUntilByAgentId: Record<string, number>;
};

// --- Desk Monitor ---
export type OfficeDeskMonitorMode = "coding" | "browser" | "waiting" | "idle" | "error";

export type OfficeDeskMonitorEntry = {
  kind: "user" | "assistant" | "thinking" | "tool";
  text: string;
  live?: boolean;
};

export type OfficeDeskMonitor = {
  agentId: string;
  agentName: string;
  mode: OfficeDeskMonitorMode;
  title: string;
  subtitle: string;
  browserUrl: string | null;
  updatedAt: number | null;
  live: boolean;
  entries: OfficeDeskMonitorEntry[];
  editor: {
    fileName: string;
    language: string;
    lines: string[];
    terminalLines: string[];
    cursorLine: number;
    cursorColumn: number;
  } | null;
};

// --- Standup Meeting ---
export type StandupPhase = "scheduled" | "gathering" | "in_progress" | "complete";
export type StandupSourceKind = "github" | "jira" | "manual";
export type StandupTriggerKind = "manual" | "scheduled";

export type StandupCommitSummary = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string | null;
};

export type StandupTicketSummary = {
  id: string;
  key: string;
  title: string;
  status: string;
  url: string | null;
};

export type StandupSourceState = {
  kind: StandupSourceKind;
  ready: boolean;
  stale: boolean;
  updatedAt: string | null;
  error: string | null;
};

export type StandupSummaryCard = {
  agentId: string;
  agentName: string;
  speech: string;
  currentTask: string;
  blockers: string[];
  recentCommits: StandupCommitSummary[];
  activeTickets: StandupTicketSummary[];
  manualNotes: string[];
  sourceStates: StandupSourceState[];
};

export type StandupMeeting = {
  id: string;
  trigger: StandupTriggerKind;
  phase: StandupPhase;
  scheduledFor: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  currentSpeakerAgentId: string | null;
  speakerStartedAt: string | null;
  speakerDurationMs: number;
  participantOrder: string[];
  arrivedAgentIds: string[];
  cards: StandupSummaryCard[];
};

// --- Phone Call Mock ---
export type MockPhoneCallPhase = "needs_message" | "ready_to_call";

export type MockPhoneCallScenario = {
  phase: MockPhoneCallPhase;
  callee: string;
  dialNumber: string;
  promptText: string | null;
  spokenText: string | null;
  recipientReply: string | null;
  statusLine: string;
  voiceAvailable: boolean;
};

// --- Text Message Mock ---
export type MockTextMessagePhase = "needs_message" | "ready_to_send";

export type MockTextMessageScenario = {
  phase: MockTextMessagePhase;
  recipient: string;
  messageText: string | null;
  confirmationText: string | null;
  promptText: string | null;
  statusLine: string;
};

// --- Cleaning Cue ---
export type OfficeCleaningCue = {
  id: string;
  agentId: string;
  agentName: string;
  ts: number;
};

// --- Layout Snapshot ---
// Uses FurnitureItem from core/types

export type OfficeLayoutSnapshot = {
  gatewayUrl: string;
  timestamp: string;
  width: number;
  height: number;
  furniture: FurnitureItem[];
};

// --- Interaction Targets ---
export const OFFICE_INTERACTION_TARGETS = [
  "desk",
  "server_room",
  "meeting_room",
  "gym",
  "qa_lab",
  "sms_booth",
  "phone_booth",
] as const;

export type OfficeInteractionTargetId = (typeof OFFICE_INTERACTION_TARGETS)[number];

// --- Skill Status ---
export type SkillRequirementSet = {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
};

export type SkillStatusConfigCheck = {
  path: string;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv" | "download";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: SkillRequirementSet;
  missing: SkillRequirementSet;
  configChecks: SkillStatusConfigCheck[];
  install: SkillInstallOption[];
};

// --- Analytics (placeholder) ---
export type OfficeUsageAnalyticsParams = Record<string, unknown>;

// --- Feed Events ---
export type FeedEvent = {
  id: string;
  agentId: string;
  agentName: string;
  text: string;
  ts: number;
  kind: string;
};

// --- Speech Image ---
export type SpeechImageResult = {
  cleanText: string;
  imageUrl: string | null;
};

export function extractSpeechImage(
  text: string | null | undefined,
  _agentId: string,
): SpeechImageResult {
  const raw = text?.trim() ?? "";
  return { cleanText: raw, imageUrl: null };
}

// --- Browser Preview ---
export function shouldPreferBrowserScreenshot(_url: string | null | undefined): boolean {
  return false;
}

// --- Mock Scenario Builders ---
export function buildMockPhoneCallScenario(params: {
  callee: string;
  message?: string | null;
  voiceAvailable: boolean;
}): MockPhoneCallScenario {
  const callee = params.callee || "your contact";
  const message = params.message?.trim() || null;
  if (!message) {
    return {
      phase: "needs_message",
      callee,
      dialNumber: "973-619-4672",
      promptText: `What should I say to ${callee}?`,
      spokenText: null,
      recipientReply: null,
      statusLine: `Waiting for your message to ${callee}.`,
      voiceAvailable: params.voiceAvailable,
    };
  }
  return {
    phase: "ready_to_call",
    callee,
    dialNumber: "973-619-4672",
    promptText: null,
    spokenText: `Hi, this is an assistant. He told me to tell you ${message}. Thank you.`,
    recipientReply: "Got it. I will pass that along.",
    statusLine: `Connected to ${callee}.`,
    voiceAvailable: params.voiceAvailable,
  };
}

export function buildMockTextMessageScenario(params: {
  recipient: string;
  message?: string | null;
}): MockTextMessageScenario {
  const recipient = params.recipient || "your contact";
  const message = params.message?.trim() || null;
  if (!message) {
    return {
      phase: "needs_message",
      recipient,
      messageText: null,
      confirmationText: null,
      promptText: `What should I message ${recipient}?`,
      statusLine: `Waiting for your message to ${recipient}.`,
    };
  }
  return {
    phase: "ready_to_send",
    recipient,
    messageText: message,
    confirmationText: "Delivered.",
    promptText: null,
    statusLine: `Text queued for ${recipient}.`,
  };
}
