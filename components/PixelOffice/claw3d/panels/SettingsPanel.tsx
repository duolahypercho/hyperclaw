"use client";

import { useState } from "react";

// --- Stubbed voice catalog ---
// TODO: Wire to real ElevenLabs voice catalog when available
const CURATED_ELEVENLABS_VOICES: { id: string | null; label: string; description: string }[] = [
  { id: null, label: "Default", description: "System default voice" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", description: "Deep, authoritative male voice" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella", description: "Warm, friendly female voice" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", description: "Calm, professional male voice" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Emily", description: "Clear, articulate female voice" },
];

type SettingsPanelProps = {
  gatewayStatus?: string;
  gatewayUrl?: string;
  onGatewayDisconnect?: () => void;
  onOpenOnboarding?: () => void;
  officeTitle: string;
  officeTitleLoaded: boolean;
  onOfficeTitleChange: (title: string) => void;
  remoteOfficeEnabled: boolean;
  remoteOfficeSourceKind: "presence_endpoint" | "openclaw_gateway";
  remoteOfficeLabel: string;
  remoteOfficePresenceUrl: string;
  remoteOfficeGatewayUrl: string;
  remoteOfficeTokenConfigured: boolean;
  onRemoteOfficeEnabledChange: (enabled: boolean) => void;
  onRemoteOfficeSourceKindChange: (kind: "presence_endpoint" | "openclaw_gateway") => void;
  onRemoteOfficeLabelChange: (label: string) => void;
  onRemoteOfficePresenceUrlChange: (url: string) => void;
  onRemoteOfficeGatewayUrlChange: (url: string) => void;
  onRemoteOfficeTokenChange: (token: string) => void;
  voiceRepliesEnabled: boolean;
  voiceRepliesVoiceId: string | null;
  voiceRepliesSpeed: number;
  voiceRepliesLoaded: boolean;
  onVoiceRepliesToggle: (enabled: boolean) => void;
  onVoiceRepliesVoiceChange: (voiceId: string | null) => void;
  onVoiceRepliesSpeedChange: (speed: number) => void;
  onVoiceRepliesPreview: (voiceId: string | null, voiceName: string) => void;
};

export function SettingsPanel({
  gatewayStatus,
  gatewayUrl,
  onGatewayDisconnect,
  onOpenOnboarding,
  officeTitle,
  officeTitleLoaded,
  onOfficeTitleChange,
  remoteOfficeEnabled,
  remoteOfficeSourceKind,
  remoteOfficeLabel,
  remoteOfficePresenceUrl,
  remoteOfficeGatewayUrl,
  remoteOfficeTokenConfigured,
  onRemoteOfficeEnabledChange,
  onRemoteOfficeSourceKindChange,
  onRemoteOfficeLabelChange,
  onRemoteOfficePresenceUrlChange,
  onRemoteOfficeGatewayUrlChange,
  onRemoteOfficeTokenChange,
  voiceRepliesEnabled,
  voiceRepliesVoiceId,
  voiceRepliesSpeed,
  voiceRepliesLoaded,
  onVoiceRepliesToggle,
  onVoiceRepliesVoiceChange,
  onVoiceRepliesSpeedChange,
  onVoiceRepliesPreview,
}: SettingsPanelProps) {
  const normalizedGatewayUrl = gatewayUrl?.trim() ?? "";
  const gatewayStateLabel = gatewayStatus
    ? gatewayStatus.charAt(0).toUpperCase() + gatewayStatus.slice(1)
    : "Unknown";
  const gatewayDisconnectDisabled = gatewayStatus !== "connected";
  const [remoteOfficeTokenDraft, setRemoteOfficeTokenDraft] = useState("");

  return (
    <div className="px-4 py-4">
      <div className="rounded-lg border border-cyan-500/10 bg-black/20 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Remote office</div>
            <div className="mt-1 text-[10px] text-white/75">
              Attach a second read-only office from either another Claw3D or a remote OpenClaw gateway.
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {remoteOfficeEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="ui-settings-row mt-3 flex min-h-[72px] items-center justify-between gap-6 rounded-lg border border-cyan-500/10 bg-black/15 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-label="Remote office"
              aria-checked={remoteOfficeEnabled}
              className={`ui-switch self-center ${remoteOfficeEnabled ? "ui-switch--on" : ""}`}
              onClick={() => onRemoteOfficeEnabledChange(!remoteOfficeEnabled)}
            >
              <span className="ui-switch-thumb" />
            </button>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-white">Show second office</span>
              <span className="text-[10px] text-white/80">
                Remote agents stay visible but non-interactive.
              </span>
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {remoteOfficeTokenConfigured ? "Token set" : "No token"}
          </span>
        </div>
        <div className="mt-3 grid gap-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
              Source type
            </div>
            <select
              value={remoteOfficeSourceKind}
              onChange={(event) =>
                onRemoteOfficeSourceKindChange(
                  event.target.value as "presence_endpoint" | "openclaw_gateway"
                )
              }
              className="w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors focus:border-cyan-400/30"
            >
              <option value="presence_endpoint">Remote Claw3D presence endpoint</option>
              <option value="openclaw_gateway">Remote OpenClaw gateway</option>
            </select>
            <div className="mt-1 text-[10px] text-white/50">
              Use a presence endpoint when the other machine runs Claw3D. Use gateway mode when the other machine only runs OpenClaw.
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
              Label
            </div>
            <input
              type="text"
              value={remoteOfficeLabel}
              maxLength={48}
              onChange={(event) => onRemoteOfficeLabelChange(event.target.value)}
              placeholder="Remote Office"
              className="w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
            />
          </div>
          {remoteOfficeSourceKind === "presence_endpoint" ? (
            <>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Presence URL
                </div>
                <input
                  type="url"
                  value={remoteOfficePresenceUrl}
                  onChange={(event) => onRemoteOfficePresenceUrlChange(event.target.value)}
                  placeholder="https://other-office.example.com/api/office/presence"
                  className="w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
                />
                <div className="mt-1 text-[10px] text-white/50">
                  Studio polls this endpoint server-side when the other machine is also running Claw3D.
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Optional token
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={remoteOfficeTokenDraft}
                    onChange={(event) => setRemoteOfficeTokenDraft(event.target.value)}
                    placeholder={remoteOfficeTokenConfigured ? "Token configured. Enter a new one to replace it." : "Enter token"}
                    className="min-w-0 flex-1 rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemoteOfficeTokenChange(remoteOfficeTokenDraft);
                      setRemoteOfficeTokenDraft("");
                    }}
                    className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15"
                  >
                    Save
                  </button>
                  {remoteOfficeTokenConfigured ? (
                    <button
                      type="button"
                      onClick={() => {
                        onRemoteOfficeTokenChange("");
                        setRemoteOfficeTokenDraft("");
                      }}
                      className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-100 transition-colors hover:border-rose-400/40 hover:bg-rose-500/15"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Gateway URL
                </div>
                <input
                  type="text"
                  value={remoteOfficeGatewayUrl}
                  onChange={(event) => onRemoteOfficeGatewayUrlChange(event.target.value)}
                  placeholder="wss://remote-gateway.example.com"
                  className="w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
                />
                <div className="mt-1 text-[10px] text-white/50">
                  Claw3D connects from the browser directly to the remote OpenClaw gateway and derives a read-only presence snapshot.
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Shared gateway token
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={remoteOfficeTokenDraft}
                    onChange={(event) => setRemoteOfficeTokenDraft(event.target.value)}
                    placeholder={remoteOfficeTokenConfigured ? "Token configured. Enter a new one to replace it." : "Enter token"}
                    className="min-w-0 flex-1 rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemoteOfficeTokenChange(remoteOfficeTokenDraft);
                      setRemoteOfficeTokenDraft("");
                    }}
                    className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15"
                  >
                    Save
                  </button>
                  {remoteOfficeTokenConfigured ? (
                    <button
                      type="button"
                      onClick={() => {
                        onRemoteOfficeTokenChange("");
                        setRemoteOfficeTokenDraft("");
                      }}
                      className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-100 transition-colors hover:border-rose-400/40 hover:bg-rose-500/15"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  Optional. Browser-based remote presence and messaging can work without it when the remote gateway already allows your Control UI origin.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="ui-settings-row mt-3 flex min-h-[72px] items-center justify-between gap-6 rounded-lg border border-cyan-500/10 bg-black/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-label="Voice replies"
            aria-checked={voiceRepliesEnabled}
            className={`ui-switch self-center ${voiceRepliesEnabled ? "ui-switch--on" : ""}`}
            onClick={() => onVoiceRepliesToggle(!voiceRepliesEnabled)}
            disabled={!voiceRepliesLoaded}
          >
            <span className="ui-switch-thumb" />
          </button>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-white">Voice replies</span>
            <span className="text-[10px] text-white/80">
              Play finalized assistant replies with a natural voice.
            </span>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
          {voiceRepliesLoaded ? (voiceRepliesEnabled ? "On" : "Off") : "Loading"}
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-cyan-500/10 bg-black/20 px-4 py-3">
        <div className="text-[11px] font-medium text-white">Voice</div>
        <div className="mt-1 text-[10px] text-white/75">
          Choose the voice used for spoken agent replies.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CURATED_ELEVENLABS_VOICES.map((voice) => {
            const selected = voice.id === voiceRepliesVoiceId;
            return (
              <button
                key={voice.id ?? "default"}
                type="button"
                onClick={() => {
                  onVoiceRepliesVoiceChange(voice.id);
                  onVoiceRepliesPreview(voice.id, voice.label);
                }}
                disabled={!voiceRepliesLoaded}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-cyan-400/40 bg-cyan-500/12 text-white"
                    : "border-cyan-500/10 bg-black/15 text-white/80 hover:border-cyan-400/20 hover:bg-cyan-500/6"
                }`}
              >
                <div className="text-[11px] font-medium">{voice.label}</div>
                <div className="mt-1 text-[10px] text-white/65">{voice.description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-cyan-500/10 bg-black/20 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Speed</div>
            <div className="mt-1 text-[10px] text-white/75">
              Adjust how fast the selected voice speaks.
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {voiceRepliesSpeed.toFixed(2)}x
          </span>
        </div>
        <input
          type="range"
          min="0.7"
          max="1.2"
          step="0.05"
          value={voiceRepliesSpeed}
          disabled={!voiceRepliesLoaded}
          onChange={(event) =>
            onVoiceRepliesSpeedChange(Number.parseFloat(event.target.value))
          }
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-cyan-500/15 accent-cyan-400"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
          <span>Slower</span>
          <span>Faster</span>
        </div>
      </div>
    </div>
  );
}
