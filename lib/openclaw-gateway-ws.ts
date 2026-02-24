/**
 * Connect to the OpenClaw gateway WebSocket from the renderer (browser context).
 * Gateway is at ws://127.0.0.1:<port> (default 18789). Server sends connect.challenge first.
 */

export function gatewayHttpToWs(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/**
 * Probe gateway: open WebSocket, wait for first frame (connect.challenge), then close.
 * Use this in the renderer only (browser has native WebSocket).
 */
export function probeGatewayWs(
  wsUrl: string,
  timeoutMs = 5000
): Promise<{ healthy: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (healthy: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
      resolve(healthy ? { healthy: true } : { healthy: false, error });
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      return done(false, e instanceof Error ? e.message : "WebSocket failed");
    }

    const timer = setTimeout(() => done(false, "Connection timeout"), timeoutMs);

    ws.onmessage = (ev) => {
      try {
        const msg = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (msg && (msg.event === "connect.challenge" || (msg.type === "event" && msg.event))) {
          return done(true);
        }
      } catch {
        /* ignore */
      }
      done(false, "Unexpected response");
    };

    ws.onerror = () => done(false, "Connection failed");
    ws.onclose = (ev: CloseEvent) => {
      const { code, reason } = ev;
      if (!settled) {
        const r = reason && String(reason).trim() ? String(reason) : `Closed (${code})`;
        done(false, r);
      }
    };
  });
}
