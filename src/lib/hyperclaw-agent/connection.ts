/**
 * HyperClaw Agent — WebSocket connection manager.
 *
 * Connects to the Hub's /ws/dashboard endpoint using JWT auth.
 * Handles reconnection, heartbeat, and request/response correlation.
 */
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  HubMessage,
  RequestPayload,
  ResponsePayload,
  PendingRequest,
} from './types';
import {
  buildDashboardWsUrl,
  RECONNECT_DELAYS,
  PING_INTERVAL,
  DEFAULT_TIMEOUT,
} from './config';

export class HubConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private hubUrl: string;
  private jwtToken: string;
  private autoReconnect: boolean;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pending = new Map<string, PendingRequest>();
  private _connected = false;
  private _closed = false; // user-initiated disconnect

  constructor(hubUrl: string, jwtToken: string, autoReconnect = true) {
    super();
    this.hubUrl = hubUrl;
    this.jwtToken = jwtToken;
    this.autoReconnect = autoReconnect;
  }

  get connected(): boolean {
    return this._connected;
  }

  // ---------------------------------------------------------------------------
  // Connect / Disconnect
  // ---------------------------------------------------------------------------

  connect(): Promise<void> {
    this._closed = false;
    return new Promise<void>((resolve, reject) => {
      const url = buildDashboardWsUrl(this.hubUrl, this.jwtToken);

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }

      const onOpen = () => {
        cleanup();
        this._connected = true;
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        this.emit('connected');
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        reject(new Error('WebSocket closed before open'));
      };

      const cleanup = () => {
        this.ws?.removeListener('open', onOpen);
        this.ws?.removeListener('error', onError);
        this.ws?.removeListener('close', onClose);
        // Attach permanent handlers after initial connect
        if (this.ws) {
          this.ws.on('message', (data) => this.handleMessage(data));
          this.ws.on('close', (code, reason) => this.handleClose(code, reason));
          this.ws.on('error', (err) => this.emit('error', err));
        }
      };

      this.ws.once('open', onOpen);
      this.ws.once('error', onError);
      this.ws.once('close', onClose);
    });
  }

  disconnect(): void {
    this._closed = true;
    this.stopHeartbeat();
    this.clearReconnect();
    this.rejectAllPending('Connection closed');
    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, 'Agent disconnect');
      }
      this.ws = null;
    }
    this._connected = false;
    this.emit('disconnected');
  }

  // ---------------------------------------------------------------------------
  // Send / Request
  // ---------------------------------------------------------------------------

  /**
   * Send a raw Hub message (fire-and-forget).
   */
  send(msg: HubMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Send a request and wait for the matching response by requestId.
   */
  request(
    requestType: string,
    params: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT,
  ): Promise<unknown> {
    const requestId = globalThis.crypto?.randomUUID?.() ?? randomId();

    const payload: RequestPayload = { requestId, requestType, params };
    const msg: HubMessage = {
      type: 'req',
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.send(msg);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Internal handlers
  // ---------------------------------------------------------------------------

  private handleMessage(raw: WebSocket.Data): void {
    let msg: HubMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed
    }

    // Pong handling (server responding to our ping)
    if (msg.type === 'pong') {
      return;
    }

    // Ping from server — respond with pong
    if (msg.type === 'ping') {
      this.send({ type: 'pong', timestamp: Date.now() });
      return;
    }

    // Response — match to pending request
    if (msg.type === 'res' && msg.payload) {
      const res = msg.payload as unknown as ResponsePayload;
      const id = res.requestId || (msg.payload as Record<string, unknown>).id as string;
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (res.status === 'error') {
          pending.reject(new Error(
            typeof res.data === 'string'
              ? res.data
              : (res.data as Record<string, unknown>)?.error as string || 'Request failed',
          ));
        } else {
          pending.resolve(res.data);
        }
        return;
      }
    }

    // Events — emit for consumers
    if (
      msg.type === 'event' ||
      msg.type === 'evt' ||
      msg.type === 'approval_request'
    ) {
      this.emit('hub_event', msg);
      return;
    }

    // Unknown message type — emit for debugging
    this.emit('message', msg);
  }

  private handleClose(code: number, reason: Buffer): void {
    this._connected = false;
    this.stopHeartbeat();
    this.emit('disconnected', { code, reason: reason.toString() });

    if (!this._closed && this.autoReconnect) {
      this.scheduleReconnect();
    } else {
      this.rejectAllPending('Connection closed');
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, PING_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnect
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
      this.emit('reconnect_failed');
      this.rejectAllPending('Reconnect failed');
      return;
    }

    const delay = RECONNECT_DELAYS[this.reconnectAttempt];
    this.reconnectAttempt++;

    this.emit('reconnecting', { attempt: this.reconnectAttempt, delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // handleClose will schedule next attempt
      }
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
  }

  private rejectAllPending(reason: string): void {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    });
    this.pending.clear();
  }
}

// Fallback ID generator for environments without crypto.randomUUID
function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
