/**
 * HyperClaw Agent — configuration defaults and helpers.
 */
import type { HyperClawAgentConfig } from './types';

export const DEFAULT_TIMEOUT = 60_000;
export const LONG_TIMEOUT = 180_000;
export const REPAIR_TIMEOUT = 15 * 60_000;
export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
export const PING_INTERVAL = 30_000;

/** Actions that take longer and need an extended timeout. */
const LONG_ACTIONS = new Set([
  'openclaw-doctor-fix',
  'openclaw-security-audit-deep',
  'openclaw-status-all',
  'gateway-restart',
  'intel-execute',
  'cron-run',
]);

export function isLongAction(action: string): boolean {
  return LONG_ACTIONS.has(action);
}

export function resolveConfig(
  partial: HyperClawAgentConfig,
): Required<HyperClawAgentConfig> {
  return {
    hubUrl: partial.hubUrl,
    jwtToken: partial.jwtToken,
    deviceId: partial.deviceId ?? '',
    reconnect: partial.reconnect ?? true,
    timeout: partial.timeout ?? DEFAULT_TIMEOUT,
  };
}

/**
 * Build the dashboard WebSocket URL from a Hub base URL.
 * Converts http(s) to ws(s) and appends /ws/dashboard with token.
 */
export function buildDashboardWsUrl(hubUrl: string, token: string): string {
  const base = hubUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/ws/dashboard?token=${encodeURIComponent(token)}`;
}
