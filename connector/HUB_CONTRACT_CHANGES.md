# Hub Contract Changes Required

This file documents changes needed in **hyperclaw-hub** to support connector-side
fixes for stable device identity across re-onboards (Fix 3).

## Background

When a connector re-onboards (e.g. after a fresh install or pairing-token refresh),
`internal/setup/setup.go:createDevice` POSTs to `POST /api/devices`. Previously this
always created a brand-new Mongo ObjectId, causing the dashboard, hub, and connector
to drift to different device identities.

The connector now sends an optional `existing_device_id` field in the request body:

```json
{
  "name":               "my-laptop",
  "type":               "connector",
  "existing_device_id": "64e1a2b3c4d5e6f700000001"
}
```

## Required Hub Change

**File:** `hyperclaw-hub/internal/api/devices.go` (or wherever `POST /api/devices` is handled)

**Logic:**

1. If `existing_device_id` is present in the request body **and** a device with that
   `_id` exists in MongoDB for the requesting user, return that existing device's `_id`
   instead of inserting a new document.
2. If the `existing_device_id` is not found (deleted, different user, malformed), fall
   back to the current behaviour: create a new device and return the new `_id`.
3. Do **not** reject the request — this field is strictly advisory. The connector
   handles the fallback gracefully.

**Pseudocode:**

```js
const existingID = req.body.existing_device_id;
if (existingID) {
  const existing = await Device.findOne({ _id: existingID, userId: req.user.id });
  if (existing) {
    return res.json({ _id: existing._id });   // honour existing identity
  }
  // not found → fall through to create
  log.warn(`existing_device_id ${existingID} not found for user ${req.user.id} — creating new`);
}
// existing create-device logic ...
const device = await Device.create({ name, type, userId: req.user.id });
return res.json(device);
```

## Why Not Client-Side Only

The connector could skip calling `POST /api/devices` entirely when `device.id` exists,
but that risks using a stale token for a device that was manually deleted from the
dashboard. Asking the hub to validate the existing ID is safer: the hub can return a
fresh pairing token scoped to the correct record, and the connector trusts the returned
ID as the authoritative identity.

## Coordination

- Connector change: `internal/setup/setup.go` — already shipped.
- Hub change: implement the `existing_device_id` lookup above.
- No protocol version bump needed (the field is additive and optional).
