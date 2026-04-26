export const OPENCLAW_DEFAULT_SETUP_MAX_ATTEMPTS = 3;

interface RuntimeInstallRecovery {
  detail: string;
  delayMs: number;
}

function getRecoveryMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = value as { error?: unknown; detail?: unknown; message?: unknown };
    if (typeof candidate.error === "string") return candidate.error;
    if (typeof candidate.detail === "string") return candidate.detail;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "";
}

export function getOpenClawInstallRecovery(runtime: string, value: unknown): RuntimeInstallRecovery | null {
  if (runtime !== "openclaw") return null;

  const message = getRecoveryMessage(value);
  if (!message) return null;

  if (/device unreachable|failed to communicate with device|timeout|timed out|gateway.*not.*healthy|gateway did not come up/i.test(message)) {
    return {
      detail: "OpenClaw is still starting. Waiting for the gateway to become reachable, then retrying...",
      delayMs: 5000,
    };
  }

  if (/config.*not ready|openclaw\.json|gateway config/i.test(message)) {
    return {
      detail: "OpenClaw is still writing its gateway configuration. Waiting a moment, then retrying...",
      delayMs: 4000,
    };
  }

  if (/daemon.*start|daemon.*install|launchctl|bootstrap failed|input\/output error/i.test(message)) {
    return {
      detail: "OpenClaw's daemon setup is still settling. Retrying the install step shortly...",
      delayMs: 6000,
    };
  }

  return null;
}
