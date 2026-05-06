#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";

const connectorURL = process.env.HYPERCLAW_CONNECTOR_URL || "http://127.0.0.1:18790";
const [name, rawArgs = "{}"] = process.argv.slice(2);

if (!name) {
  console.error("usage: hermes-call.mjs <toolName> [jsonArguments] [--confirmed]");
  process.exit(2);
}

function readToken() {
  if (process.env.HYPERCLAW_CONNECTOR_TOKEN) {
    return process.env.HYPERCLAW_CONNECTOR_TOKEN.trim();
  }
  try {
    return fs.readFileSync(`${os.homedir()}/.hyperclaw/connector.token`, "utf8").trim();
  } catch {
    return "";
  }
}

let args;
try {
  args = JSON.parse(rawArgs);
} catch (error) {
  console.error(`invalid JSON arguments: ${error.message}`);
  process.exit(2);
}

const baseURL = connectorURL.replace(/\/$/, "");
const bridgeAction = name.startsWith("bridge:") ? name.slice("bridge:".length) : "";
const response = await fetch(`${baseURL}${bridgeAction ? "/bridge" : "/mcp/call"}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(readToken() ? { authorization: `Bearer ${readToken()}` } : {}),
  },
  body: JSON.stringify(
    bridgeAction
      ? { action: bridgeAction, ...args }
      : {
          name,
          arguments: args,
          confirmed: process.argv.includes("--confirmed"),
          requestingAgentId: process.env.HYPERCLAW_AGENT_ID || "hermes",
        }
  ),
});

const body = await response.text();
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}

if (!response.ok) {
  process.exit(1);
}
