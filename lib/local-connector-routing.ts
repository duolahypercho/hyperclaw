export function isLocalConnectorContext(): boolean {
  if (typeof window === "undefined") return false;

  if (
    process.env.NEXT_PUBLIC_LOCAL_BRIDGE === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return true;
  }

  const host = window.location.hostname;
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");
  const hasElectronBridge = Boolean(window.electronAPI?.hyperClawBridge);

  return isLocalHost || hasElectronBridge;
}

export function shouldBlockRemoteHubFallback(): boolean {
  if (!isLocalConnectorContext()) return false;
  return process.env.NEXT_PUBLIC_ALLOW_HUB_FALLBACK !== "true";
}

export function getGatewayUnavailableMessage(): string {
  return shouldBlockRemoteHubFallback()
    ? "Start the local connector on this machine."
    : "No hub configured";
}
