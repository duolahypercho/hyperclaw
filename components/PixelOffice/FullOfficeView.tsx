"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { AgentInfoPanel } from "./AgentInfoPanel";
import { useClaw3DAgents } from "./claw3d/useClaw3DAgents";
import type { AgentInfo } from "./claw3d/useClaw3DAgents";
import { usePixelOffice } from "./provider/pixelOfficeProvider";
import { useOpenClawContext } from "$/Providers/OpenClawProv";

// Dynamic import to avoid SSR issues with Three.js
const Claw3DOffice = dynamic(
  () => import("./claw3d/Claw3DOffice"),
  { ssr: false }
);

export interface FullOfficeViewProps {
  /** When true, hide toolbars/zoom/edit UI for embedding in dashboard widget. */
  embedMode?: boolean;
}

// --- localStorage-backed settings ---

const LS_PREFIX = "hyperclaw-office-";

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch { /* ignore quota errors */ }
}

export function FullOfficeView(props: FullOfficeViewProps = {}) {
  const { embedMode = false } = props;
  const monitorViewEnabled = false;
  const {
    officeAgents,
    officeName,
    getAgentInfo,
    deskHoldByAgentId,
    monitorByAgentId,
    runCountByAgentId,
    lastSeenByAgentId,
  } = useClaw3DAgents();
  const { refresh } = usePixelOffice();
  const openClaw = useOpenClawContext();

  // --- Agent interaction state ---
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [monitorAgentId, setMonitorAgentId] = useState<string | null>(null);

  // --- Office title (persisted) ---
  const [officeTitle, setOfficeTitle] = useState(() =>
    lsGet("officeTitle", "")
  );
  const officeTitleLoaded = useRef(false);
  useEffect(() => { officeTitleLoaded.current = true; }, []);
  const effectiveTitle = officeTitle || officeName || "Hyperclaw HQ";
  const handleOfficeTitleChange = useCallback((title: string) => {
    setOfficeTitle(title);
    lsSet("officeTitle", title);
  }, []);

  // --- Voice replies settings (persisted) ---
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(() =>
    lsGet("voiceRepliesEnabled", false)
  );
  const [voiceRepliesVoiceId, setVoiceRepliesVoiceId] = useState<string | null>(() =>
    lsGet("voiceRepliesVoiceId", null)
  );
  const [voiceRepliesSpeed, setVoiceRepliesSpeed] = useState(() =>
    lsGet("voiceRepliesSpeed", 1)
  );
  const handleVoiceRepliesToggle = useCallback((enabled: boolean) => {
    setVoiceRepliesEnabled(enabled);
    lsSet("voiceRepliesEnabled", enabled);
  }, []);
  const handleVoiceRepliesVoiceChange = useCallback((voiceId: string | null) => {
    setVoiceRepliesVoiceId(voiceId);
    lsSet("voiceRepliesVoiceId", voiceId);
  }, []);
  const handleVoiceRepliesSpeedChange = useCallback((speed: number) => {
    setVoiceRepliesSpeed(speed);
    lsSet("voiceRepliesSpeed", speed);
  }, []);
  const handleVoiceRepliesPreview = useCallback((_voiceId: string | null, _voiceName: string) => {
    // Voice preview — could trigger TTS sample playback in future
  }, []);

  // --- Remote office settings (persisted) ---
  const [remoteOfficeEnabled, setRemoteOfficeEnabled] = useState(() =>
    lsGet("remoteOfficeEnabled", false)
  );
  const [remoteOfficeSourceKind, setRemoteOfficeSourceKind] = useState<"presence_endpoint" | "openclaw_gateway">(() =>
    lsGet("remoteOfficeSourceKind", "presence_endpoint")
  );
  const [remoteOfficeLabel, setRemoteOfficeLabel] = useState(() =>
    lsGet("remoteOfficeLabel", "Remote Office")
  );
  const [remoteOfficePresenceUrl, setRemoteOfficePresenceUrl] = useState(() =>
    lsGet("remoteOfficePresenceUrl", "")
  );
  const [remoteOfficeGatewayUrl, setRemoteOfficeGatewayUrl] = useState(() =>
    lsGet("remoteOfficeGatewayUrl", "")
  );
  const [remoteOfficeToken, setRemoteOfficeToken] = useState(() =>
    lsGet("remoteOfficeToken", "")
  );

  const handleRemoteOfficeEnabledChange = useCallback((enabled: boolean) => {
    setRemoteOfficeEnabled(enabled);
    lsSet("remoteOfficeEnabled", enabled);
  }, []);
  const handleRemoteOfficeSourceKindChange = useCallback((kind: "presence_endpoint" | "openclaw_gateway") => {
    setRemoteOfficeSourceKind(kind);
    lsSet("remoteOfficeSourceKind", kind);
  }, []);
  const handleRemoteOfficeLabelChange = useCallback((label: string) => {
    setRemoteOfficeLabel(label);
    lsSet("remoteOfficeLabel", label);
  }, []);
  const handleRemoteOfficePresenceUrlChange = useCallback((url: string) => {
    setRemoteOfficePresenceUrl(url);
    lsSet("remoteOfficePresenceUrl", url);
  }, []);
  const handleRemoteOfficeGatewayUrlChange = useCallback((url: string) => {
    setRemoteOfficeGatewayUrl(url);
    lsSet("remoteOfficeGatewayUrl", url);
  }, []);
  const handleRemoteOfficeTokenChange = useCallback((token: string) => {
    setRemoteOfficeToken(token);
    lsSet("remoteOfficeToken", token);
  }, []);

  const remoteOfficeStatusText = remoteOfficeEnabled
    ? `Remote office: ${remoteOfficeLabel}`
    : "Remote office disabled.";

  // --- Desk assignments (persisted) ---
  const [deskAssignments, setDeskAssignments] = useState<Record<string, string>>(() =>
    lsGet("deskAssignments", {})
  );
  const handleDeskAssignmentChange = useCallback((deskUid: string, agentId: string | null) => {
    setDeskAssignments((prev) => {
      const next = { ...prev };
      if (agentId) {
        next[deskUid] = agentId;
      } else {
        delete next[deskUid];
      }
      lsSet("deskAssignments", next);
      return next;
    });
  }, []);
  const handleDeskAssignmentsReset = useCallback((deskUids: string[]) => {
    setDeskAssignments((prev) => {
      const next = { ...prev };
      for (const uid of deskUids) delete next[uid];
      lsSet("deskAssignments", next);
      return next;
    });
  }, []);

  // --- Gateway status ---
  const gatewayStatus = openClaw.gatewayHealthy === true
    ? "connected"
    : openClaw.gatewayHealthy === false
      ? "error"
      : "disconnected";

  // --- Callbacks ---
  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleCloseAgentInfo = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  const handleMonitorSelect = useCallback((agentId: string | null) => {
    setMonitorAgentId(agentId);
  }, []);

  const handleAgentEdit = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleAgentDelete = useCallback((_agentId: string) => {
    // Agent deletion — would need bridge endpoint (delete-agent)
    // For now, just refresh the list
    refresh();
  }, [refresh]);

  const handleAddAgent = useCallback(() => {
    // Agent addition — would need bridge endpoint (add-agent)
    // For now, just refresh the list
    refresh();
  }, [refresh]);

  const handlePhoneCallComplete = useCallback((_agentId: string) => {
    // Phone call completed — agent returns to desk
  }, []);

  const handleTextMessageComplete = useCallback((_agentId: string) => {
    // Text message completed — agent returns to desk
  }, []);

  const handleGithubReviewDismiss = useCallback(() => {
    // Github review dismissed
  }, []);

  const handleQaLabDismiss = useCallback(() => {
    // QA lab dismissed
  }, []);

  const selectedAgentInfo: AgentInfo | null = selectedAgentId
    ? getAgentInfo(selectedAgentId)
    : null;

  return (
    <div
      className="pixel-office-root"
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
    >
      <Claw3DOffice
        agents={officeAgents}
        readOnly={embedMode}
        // Office title
        officeTitle={effectiveTitle}
        officeTitleLoaded={officeTitleLoaded.current}
        onOfficeTitleChange={handleOfficeTitleChange}
        // Agent interaction callbacks
        onAgentChatSelect={handleAgentClick}
        onAgentEdit={!embedMode ? handleAgentEdit : undefined}
        onAgentDelete={!embedMode ? handleAgentDelete : undefined}
        onAddAgent={!embedMode ? handleAddAgent : undefined}
        // Desk hold: working agents stay at their desks
        deskHoldByAgentId={deskHoldByAgentId}
        // Desk assignments
        deskAssignmentByDeskUid={deskAssignments}
        onDeskAssignmentChange={handleDeskAssignmentChange}
        onDeskAssignmentsReset={handleDeskAssignmentsReset}
        // Monitor: desk screen immersive view
        monitorAgentId={monitorViewEnabled ? monitorAgentId : null}
        monitorByAgentId={monitorByAgentId}
        onMonitorSelect={monitorViewEnabled ? handleMonitorSelect : undefined}
        // Agent analytics
        runCountByAgentId={runCountByAgentId}
        lastSeenByAgentId={lastSeenByAgentId}
        // Gateway status
        gatewayStatus={gatewayStatus}
        // Voice replies settings
        voiceRepliesEnabled={voiceRepliesEnabled}
        voiceRepliesVoiceId={voiceRepliesVoiceId}
        voiceRepliesSpeed={voiceRepliesSpeed}
        voiceRepliesLoaded={true}
        onVoiceRepliesToggle={handleVoiceRepliesToggle}
        onVoiceRepliesVoiceChange={handleVoiceRepliesVoiceChange}
        onVoiceRepliesSpeedChange={handleVoiceRepliesSpeedChange}
        onVoiceRepliesPreview={handleVoiceRepliesPreview}
        // Remote office settings
        remoteOfficeEnabled={remoteOfficeEnabled}
        remoteOfficeSourceKind={remoteOfficeSourceKind}
        remoteOfficeLabel={remoteOfficeLabel}
        remoteOfficePresenceUrl={remoteOfficePresenceUrl}
        remoteOfficeGatewayUrl={remoteOfficeGatewayUrl}
        remoteOfficeStatusText={remoteOfficeStatusText}
        remoteOfficeTokenConfigured={remoteOfficeToken.length > 0}
        onRemoteOfficeEnabledChange={handleRemoteOfficeEnabledChange}
        onRemoteOfficeSourceKindChange={handleRemoteOfficeSourceKindChange}
        onRemoteOfficeLabelChange={handleRemoteOfficeLabelChange}
        onRemoteOfficePresenceUrlChange={handleRemoteOfficePresenceUrlChange}
        onRemoteOfficeGatewayUrlChange={handleRemoteOfficeGatewayUrlChange}
        onRemoteOfficeTokenChange={handleRemoteOfficeTokenChange}
        // Interaction completion callbacks
        onPhoneCallComplete={handlePhoneCallComplete}
        onTextMessageComplete={handleTextMessageComplete}
        onGithubReviewDismiss={handleGithubReviewDismiss}
        onQaLabDismiss={handleQaLabDismiss}
      />

      {selectedAgentId != null && selectedAgentInfo && (
        <AgentInfoPanel
          key={selectedAgentId}
          agent={selectedAgentInfo}
          onClose={handleCloseAgentInfo}
        />
      )}

      {/* Vignette overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--pixel-vignette)",
          pointerEvents: "none",
          zIndex: 40,
        }}
      />
    </div>
  );
}
