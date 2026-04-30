---
name: credential-management
description: Store, list, delete, and apply credentials/secrets on a device securely.
---

# Credential Management

Manage secrets and credentials stored on the active device.

## When to use

- User needs to store an API key, token, or other secret
- Listing what credentials are available
- Applying a credential to a service or agent
- Removing an expired or compromised credential

## Workflows

### List Credentials
1. Call `credentials.list()`
2. Present: key name, type, created date (values are NOT returned for security)

### Store a Credential
1. Gather: key name, value, optional metadata (type, description)
2. Call `credentials.store(key, value, { type, description })`
3. Confirm storage — the value is encrypted with the device's Ed25519 key

### Delete a Credential
1. Confirm with the user
2. Call `credentials.delete(key)`

### Apply a Credential
1. Identify the credential key and the target (agent, service, etc.)
2. Call `credentials.apply(key, { target, ...config })`
3. Confirm the credential was applied

## Important

- Credentials are encrypted at rest using the device's Ed25519 key pair
- The `credentials.list()` call returns key names only, never values
- Only use `credentials.apply()` when the workflow explicitly requires it
- If a credential is compromised, delete and re-create it immediately
- Credential keys should be descriptive: `OPENAI_API_KEY`, `GH_TOKEN`, etc.
