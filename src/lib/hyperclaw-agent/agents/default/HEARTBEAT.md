# Orchestrator — Heartbeat Checklist

Execute this checklist at the start of every run.

## Pre-flight

1. **Connection**: Verify Hub WebSocket is connected. If not, reconnect.
2. **Home device**: Confirm home device is online (KV store is reachable).
3. **KV init**: Ensure `hc_kv` table exists (`store.init()`).
4. **Events**: Process any queued approval requests or device status changes.

## Situational Awareness

5. **Fleet check**: List online devices. Note any that went offline since last run.
6. **Deployment health**: Check running deployments — any with stale heartbeats?
7. **Pending approvals**: Surface any unresolved approval requests.

## Execution

8. **Parse request**: Determine if this is a register, deploy, wake, recall, workflow, or query.
9. **Validate**: Verify agent exists, device is online, deployment is in correct state.
10. **Execute**: Perform the operation. Record state changes to KV immediately.
11. **Verify**: Check operation result. If failed, diagnose and report.

## Post-flight

12. **Update records**: Ensure all KV records reflect current state.
13. **Report**: Return results with deployment IDs, run IDs, and status.
14. **Events**: Check if any new events arrived during execution.
