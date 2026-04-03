/**
 * HyperClaw Agent — Hub REST API client.
 *
 * Provides typed methods for device management, pairing, and approvals
 * via the Hub's REST API (all require JWT auth).
 */
import type { Device, Approval } from './types';

export class HubApiClient {
  private baseUrl: string;
  private jwtToken: string;

  constructor(hubUrl: string, jwtToken: string) {
    this.baseUrl = hubUrl.replace(/\/+$/, '');
    this.jwtToken = jwtToken;
  }

  // ---------------------------------------------------------------------------
  // Devices
  // ---------------------------------------------------------------------------

  async listDevices(): Promise<Device[]> {
    return this.get<Device[]>('/api/devices');
  }

  async getDevice(deviceId: string): Promise<Device> {
    return this.get<Device>(`/api/devices/${deviceId}`);
  }

  async createDevice(body: {
    name: string;
    platform?: string;
    arch?: string;
    hostname?: string;
  }): Promise<Device> {
    return this.post<Device>('/api/devices', body);
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.del(`/api/devices/${deviceId}`);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.post(`/api/devices/${deviceId}/revoke`, {});
  }

  async generatePairingToken(deviceId: string): Promise<{ token: string }> {
    return this.post<{ token: string }>(
      `/api/devices/${deviceId}/pairing-token`,
      {},
    );
  }

  /**
   * Send a command to a device via REST (alternative to WebSocket bridge).
   */
  async sendCommand(
    deviceId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.post(`/api/devices/${deviceId}/command`, body);
  }

  /**
   * Pick the most recently updated online device, or the first device if none
   * are online. Mirrors the dashboard's getActiveDeviceId logic.
   */
  async getActiveDeviceId(): Promise<string | null> {
    const devices = await this.listDevices();
    if (!devices || devices.length === 0) return null;

    const online = devices.filter((d) => d.status === 'online');
    const pick =
      online.length > 0
        ? online.reduce((a, b) =>
            (a.updatedAt || '') > (b.updatedAt || '') ? a : b,
          )
        : devices[0];

    return pick.id || pick._id || null;
  }

  // ---------------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------------

  async listApprovals(): Promise<Approval[]> {
    return this.get<Approval[]>('/api/approvals');
  }

  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
  ): Promise<void> {
    await this.post(`/api/approvals/${approvalId}/resolve`, { decision });
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.jwtToken}`,
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(false),
    });
    if (!res.ok) throw new Error(`Hub API ${path}: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private async post<T = unknown>(
    path: string,
    body: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Hub API ${path}: ${res.status} ${res.statusText}`);
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(false),
    });
    if (!res.ok) throw new Error(`Hub API ${path}: ${res.status} ${res.statusText}`);
  }
}
