#!/usr/bin/env npx tsx
/**
 * Verification script for HyperClaw Task OS features.
 *
 * Tests: queryTasks, upsertTask, claimTask, session upsert/append/get.
 *
 * Usage:
 *   npx tsx scripts/test-task-os.ts          # runs against ~/.hyperclaw
 *   DATA_DIR=/tmp/hc-test npx tsx scripts/test-task-os.ts   # custom dir
 */

import path from "node:path";

// Dynamically import the bridge (handles ts extension)
const bridgePath = path.resolve(__dirname, "../extensions/hyperclaw/bridge");

async function main() {
  const { HyperClawBridge } = await import(bridgePath);
  const dataDir = process.env.DATA_DIR || undefined;
  const bridge = new HyperClawBridge(dataDir);

  let passed = 0;
  let failed = 0;

  function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  }

  // ── 1. Upsert Task (create) ───────────────────────────────────────────
  console.log("\n── upsertTask (create) ──");
  const created = bridge.upsertTask({
    externalId: "test-ext-001",
    data: {
      title: "Task OS Test Task",
      description: "Created by test-task-os.ts",
      agent: "test-agent",
      data: { kind: "test", sessionKey: "sess-001", runId: "run-1" },
    },
  });
  assert("task created", !!created.id);
  assert("external_id stored", (created.data as any)?.external_id === "test-ext-001");
  assert("sessionKey stored", (created.data as any)?.sessionKey === "sess-001");
  assert("has title", created.title === "Task OS Test Task");
  const taskId = created.id as string;

  // ── 2. Upsert Task (update) ───────────────────────────────────────────
  console.log("\n── upsertTask (update) ──");
  const updated = bridge.upsertTask({
    externalId: "test-ext-001",
    data: { title: "Updated Task OS Test", status: "in_progress" },
  });
  assert("same ID", updated.id === taskId);
  assert("title updated", updated.title === "Updated Task OS Test");
  assert("status updated", updated.status === "in_progress");
  assert("external_id preserved", (updated.data as any)?.external_id === "test-ext-001");
  assert("sessionKey preserved", (updated.data as any)?.sessionKey === "sess-001");

  // ── 3. Query Tasks ────────────────────────────────────────────────────
  console.log("\n── queryTasks ──");
  const byAgent = bridge.queryTasks({ agent: "test-agent" });
  assert("filter by agent", byAgent.some((t: any) => t.id === taskId));

  const byStatus = bridge.queryTasks({ status: "in_progress" });
  assert("filter by status", byStatus.some((t: any) => t.id === taskId));

  const byKind = bridge.queryTasks({ kind: "test" });
  assert("filter by kind", byKind.some((t: any) => t.id === taskId));

  const limited = bridge.queryTasks({ limit: 1 });
  assert("limit works", limited.length <= 1);

  // ── 4. Claim Task ────────────────────────────────────────────────────
  console.log("\n── claimTask ──");

  const claimWhileInProgress = bridge.claimTask({
    id: taskId,
    claimant: "agent-A",
    leaseSeconds: 5,
  });
  assert("cannot claim in_progress task", !claimWhileInProgress.success);
  assert(
    "in_progress rejection reason",
    claimWhileInProgress.reason?.includes("status=in_progress") ?? false,
  );

  const claimable = bridge.upsertTask({
    externalId: "test-ext-claimable",
    data: {
      title: "Claimable Task",
      description: "Pending task for claimTask tests",
      agent: "test-agent",
      status: "pending",
      data: { kind: "test" },
    },
  });
  const claimableId = claimable.id as string;

  const claim1 = bridge.claimTask({
    id: claimableId,
    claimant: "agent-A",
    leaseSeconds: 5,
  });
  assert("first claim succeeds", claim1.success);
  assert("lease set", !!(claim1.task?.data as any)?.lease?.claimedBy);
  assert("claim sets status to in_progress", claim1.task?.status === "in_progress");

  const claim2 = bridge.claimTask({
    id: claimableId,
    claimant: "agent-B",
    leaseSeconds: 5,
  });
  assert("reclaim of in_progress task fails", !claim2.success);
  assert("reason mentions in_progress status", claim2.reason?.includes("status=in_progress") ?? false);

  const blockedTask = bridge.upsertTask({
    externalId: "test-ext-blocked",
    data: {
      title: "Blocked Task",
      agent: "test-agent",
      status: "blocked",
      data: { kind: "test" },
    },
  });
  const blockedClaim = bridge.claimTask({
    id: blockedTask.id as string,
    claimant: "agent-C",
    leaseSeconds: 5,
  });
  assert("cannot claim blocked task", !blockedClaim.success);
  assert("blocked rejection reason", blockedClaim.reason?.includes("status=blocked") ?? false);

  const completedTask = bridge.upsertTask({
    externalId: "test-ext-completed",
    data: {
      title: "Completed Task",
      agent: "test-agent",
      status: "completed",
      data: { kind: "test" },
    },
  });
  const completedClaim = bridge.claimTask({
    id: completedTask.id as string,
    claimant: "agent-D",
    leaseSeconds: 5,
  });
  assert("cannot claim completed task", !completedClaim.success);
  assert("completed rejection reason", completedClaim.reason?.includes("status=completed") ?? false);

  // Claim by externalId should also respect non-pending status.
  const claim3 = bridge.claimTask({
    externalId: "test-ext-claimable",
    claimant: "agent-E",
    leaseSeconds: 0,
  });
  assert("claim by externalId while in_progress fails", !claim3.success);
  assert("externalId rejection reason mentions status", claim3.reason?.includes("status=in_progress") ?? false);

  // ── 5. Session Upsert ────────────────────────────────────────────────
  console.log("\n── sessionUpsert ──");
  const session = bridge.sessionUpsert({
    sessionKey: "sess-001",
    agentId: "test-agent",
    label: "Test Session",
  });
  assert("session created", session.session_key === "sess-001");

  // Update
  const sessionUp = bridge.sessionUpsert({
    sessionKey: "sess-001",
    label: "Updated Test Session",
  });
  assert("session updated", sessionUp.session_key === "sess-001");

  // ── 6. Session Append Messages ────────────────────────────────────────
  console.log("\n── sessionAppendMessages ──");
  const appendResult = bridge.sessionAppendMessages("sess-001", [
    { runId: "run-1", role: "user", content: "Hello, agent!" },
    { runId: "run-1", role: "assistant", content: "Hi! How can I help?" },
    { runId: "run-1", stream: "tool", content: { tool: "search", result: "found 3 items" } },
  ]);
  assert("appended 3 messages", appendResult.count === 3);

  // ── 7. Session Get Messages ───────────────────────────────────────────
  console.log("\n── sessionGetMessages ──");
  const msgs = bridge.sessionGetMessages("sess-001");
  assert("retrieved messages", msgs.length >= 3);

  const firstMsg = msgs[0];
  const rawContent = firstMsg.content_json ?? firstMsg.content;
  let parsed: unknown = rawContent;
  if (typeof rawContent === "string") {
    try { parsed = JSON.parse(rawContent); } catch { parsed = rawContent; }
  }
  assert("first message is user", (firstMsg.role === "user") && parsed === "Hello, agent!");

  const filtered = bridge.sessionGetMessages("sess-001", { runId: "run-1" });
  assert("filter by runId", filtered.length >= 3);

  const paginated = bridge.sessionGetMessages("sess-001", { limit: 1, offset: 1 });
  assert("pagination works", paginated.length === 1);

  // ── Cleanup ───────────────────────────────────────────────────────────
  console.log("\n── cleanup ──");
  const deleted = bridge.deleteTask(taskId);
  assert("task deleted", deleted);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
