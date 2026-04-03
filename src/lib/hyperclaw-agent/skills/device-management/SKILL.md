---
name: device-management
description: Manage HyperClaw devices — list, create, pair, monitor status, revoke, and delete devices via Hub REST API.
---

# Device Management

Manage the fleet of devices connected to the HyperClaw Hub.

## When to use

- User asks about devices, their status, or connectivity
- Need to onboard a new device (create + pair)
- Need to remove or revoke a compromised device
- Switching active device for subsequent commands

## Workflows

### List & Status Check
1. Call `devices.list()` to get all devices
2. Present as table: name, status, platform, last updated
3. Highlight which device is currently active

### Onboard a New Device
1. Call `devices.create({ name, platform, arch, hostname })`
2. Call `devices.pairingToken(deviceId)` to generate a 10-minute token
3. Give the user the token and device ID — they'll enter these in the connector's `.env`
4. Monitor: the device status will change from `provisioning` → `connecting` → `online`

### Switch Active Device
1. Call `devices.list()` to show options
2. Call `setActiveDevice(deviceId)` to switch
3. Confirm the switch — all subsequent bridge commands now target this device

### Revoke a Device
1. Confirm with the user — this is irreversible
2. Call `devices.revoke(deviceId)`
3. Device status becomes `revoked` and cannot reconnect

### Delete a Device
1. Confirm with the user — removes all record
2. Call `devices.delete(deviceId)`

## Important

- Pairing tokens expire after 10 minutes
- A device can only be online from one connector at a time
- Revoking is permanent — the device must be re-created to reconnect
- The Hub auto-detects offline devices when the WebSocket disconnects
