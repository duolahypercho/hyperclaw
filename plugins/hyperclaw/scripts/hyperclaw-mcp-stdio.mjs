#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";

const connectorURL = (process.env.HYPERCLAW_CONNECTOR_URL || "http://127.0.0.1:18790").replace(/\/$/, "");
let input = Buffer.alloc(0);

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

function authHeaders() {
  const token = readToken();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function postJSON(path, payload) {
  const response = await fetch(`${connectorURL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { success: false, error: text || "empty connector response" };
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `connector returned HTTP ${response.status}`);
  }
  return data;
}

function fallbackTools() {
  return [
    {
      name: "hyperclaw.tools.list",
      description: "List the live Hyperclaw connector tool catalog.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "hyperclaw.call",
      description: "Call any Hyperclaw connector tool by name.",
      inputSchema: {
        type: "object",
        properties: {
          toolName: { type: "string" },
          arguments: { type: "object" },
          confirmed: { type: "boolean" },
        },
        required: ["toolName"],
      },
    },
    {
      name: "hyperclaw.bridge.dispatch",
      description: "Advanced escape hatch: call a connector-native /bridge action directly. Use curated hyperclaw.* tools first when they exist.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string" },
          params: { type: "object" },
        },
        required: ["action"],
      },
    },
  ];
}

async function listTools() {
  const bridgeDispatchTool = fallbackTools().find((tool) => tool.name === "hyperclaw.bridge.dispatch");
  try {
    const result = await postJSON("/bridge", { action: "hyperclaw-tools-list" });
    const tools = Array.isArray(result.tools) ? result.tools : [];
    const mapped = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || { type: "object", properties: {} },
    }));
    return bridgeDispatchTool ? [...mapped, bridgeDispatchTool] : mapped;
  } catch {
    return fallbackTools();
  }
}

async function callTool(params = {}) {
  const name = params.name;
  const args = params.arguments || {};

  if (name === "hyperclaw.tools.list") {
    return { content: [{ type: "text", text: JSON.stringify(await listTools(), null, 2) }] };
  }

  if (name === "hyperclaw.call") {
    const result = await postJSON("/mcp/call", {
      name: args.toolName,
      arguments: args.arguments || {},
      confirmed: args.confirmed === true,
      requestingAgentId: args.requestingAgentId || process.env.HYPERCLAW_AGENT_ID || "codex",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: result?.ok === false || result?.success === false,
    };
  }

  if (name === "hyperclaw.bridge.dispatch") {
    const result = await postJSON("/bridge", {
      action: args.action,
      ...(args.params || {}),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: result?.ok === false || result?.success === false,
    };
  }

  const confirmed = args.confirmed === true || args.confirm === true;
  const cleanedArgs = { ...args };
  delete cleanedArgs.confirmed;
  delete cleanedArgs.confirm;

  const result = await postJSON("/mcp/call", {
    name,
    arguments: cleanedArgs,
    confirmed,
    requestingAgentId: args.requestingAgentId || process.env.HYPERCLAW_AGENT_ID || "codex",
  });

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: result?.ok === false || result?.success === false,
  };
}

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(message) {
  if (!message || typeof message !== "object") {
    return;
  }
  if (!("id" in message)) {
    return;
  }

  try {
    switch (message.method) {
      case "initialize":
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion || "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "hyperclaw", version: "0.1.0" },
          },
        });
        break;
      case "tools/list":
        send({ jsonrpc: "2.0", id: message.id, result: { tools: await listTools() } });
        break;
      case "tools/call":
        send({ jsonrpc: "2.0", id: message.id, result: await callTool(message.params) });
        break;
      default:
        sendError(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    sendError(message.id, -32000, error?.message || String(error));
  }
}

function pump() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }
    const header = input.slice(0, headerEnd).toString("utf8");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) {
      input = input.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + length;
    if (input.length < messageEnd) {
      return;
    }
    const raw = input.slice(messageStart, messageEnd).toString("utf8");
    input = input.slice(messageEnd);
    try {
      void handle(JSON.parse(raw));
    } catch (error) {
      sendError(null, -32700, error?.message || "parse error");
    }
  }
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  pump();
});
