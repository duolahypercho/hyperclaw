import type { NextApiRequest, NextApiResponse } from "next";
import { exec, spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

function runCommand(command: string, timeoutMs = 15000): Promise<{ stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "0" };
  if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
    env.OPENCLAW_CONFIG_PATH = OPENCLAW_CONFIG_PATH;
  }
  return new Promise((resolve, reject) => {
    exec(`openclaw ${command}`, {
      cwd: fs.existsSync(OPENCLAW_HOME) ? OPENCLAW_HOME : os.homedir(),
      env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject({ code: error.code, stderr: stderr.trim(), message: error.message });
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

function runCommandWithArgs(args: string[], timeoutMs = 20000): Promise<{ stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "0" };
  if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
    env.OPENCLAW_CONFIG_PATH = OPENCLAW_CONFIG_PATH;
  }
  const cwd = fs.existsSync(OPENCLAW_HOME) ? OPENCLAW_HOME : os.homedir();
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, { env, cwd });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => errChunks.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject({ message: "Command timed out", stderr: Buffer.concat(errChunks as unknown as readonly Uint8Array[]).toString().trim() });
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks as unknown as readonly Uint8Array[]).toString().trim();
      const stderr = Buffer.concat(errChunks as unknown as readonly Uint8Array[]).toString().trim();
      if (code !== 0) {
        reject({ code, signal, stderr, message: stderr || `Exit ${code}` });
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject({ message: err.message, stderr: Buffer.concat(errChunks as unknown as readonly Uint8Array[]).toString().trim() });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, args, params: bodyParams } = req.body as {
    action: string;
    args?: string;
    params?: { channel?: string; account?: string; target: string; message?: string; media?: string; replyTo?: string; silent?: boolean };
  };

  try {
    switch (action) {
      case "check-installed": {
        try {
          const result = await runCommand("--version", 5000);
          return res.json({ installed: true, version: result.stdout });
        } catch {
          // Fallback: consider installed if "openclaw cron list" works (CLI may not support --version or PATH differs)
          try {
            await runCommand("cron list", 10000);
            return res.json({ installed: true, version: null });
          } catch {
            return res.json({ installed: false, version: null });
          }
        }
      }

      case "status": {
        const result = await runCommand("status");
        return res.json({ success: true, data: result.stdout });
      }

      case "gateway-health": {
        try {
          const result = await runCommand("health --json --timeout 5000", 8000);
          const data = JSON.parse(result.stdout) as { ok?: boolean };
          return res.json({
            healthy: data?.ok === true,
            ...(data?.ok !== true ? { error: "Gateway health check did not return ok" } : {}),
          });
        } catch (err: unknown) {
          const message = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Gateway unreachable";
          return res.json({ healthy: false, error: message });
        }
      }

      case "cron-list": {
        const result = await runCommand("cron list");
        return res.json({ success: true, data: result.stdout });
      }

      case "cron-list-json": {
        const result = await runCommand("cron list --json --all", 30000);
        const parsed = JSON.parse(result.stdout);
        return res.json({ success: true, data: parsed });
      }

      case "cron-enable": {
        const id = typeof args === "string" ? args.trim() : "";
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) {
          return res.status(400).json({ success: false, error: "Invalid job id" });
        }
        await runCommand(`cron enable ${id}`, 15000);
        return res.json({ success: true });
      }

      case "cron-disable": {
        const id = typeof args === "string" ? args.trim() : "";
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) {
          return res.status(400).json({ success: false, error: "Invalid job id" });
        }
        await runCommand(`cron disable ${id}`, 15000);
        return res.json({ success: true });
      }

      case "agent-list": {
        const workspacePath = path.join(OPENCLAW_HOME, "workspace");
        if (!fs.existsSync(workspacePath)) {
          return res.json({ success: true, data: [] });
        }
        const dirs = fs.readdirSync(workspacePath, { withFileTypes: true })
          .filter((d) => d.isDirectory());

        const agents = dirs.map((dir) => {
          const soulPath = path.join(workspacePath, dir.name, "SOUL.md");
          const memoryPath = path.join(workspacePath, dir.name, "MEMORY.md");
          const hasSoul = fs.existsSync(soulPath);
          let soulContent: string | null = null;
          if (hasSoul) {
            try { soulContent = fs.readFileSync(soulPath, "utf-8").slice(0, 2000); } catch {}
          }
          return {
            name: dir.name,
            hasSoul,
            hasMemory: fs.existsSync(memoryPath),
            soulContent,
          };
        });
        return res.json({ success: true, data: agents });
      }

      case "message-send": {
        const p = bodyParams;
        if (!p || typeof p.target !== "string" || !p.target.trim()) {
          return res.status(400).json({ success: false, error: "target is required" });
        }
        const hasMessage = typeof p.message === "string" && p.message.trim().length > 0;
        const hasMedia = typeof p.media === "string" && p.media.trim().length > 0;
        if (!hasMessage && !hasMedia) {
          return res.status(400).json({ success: false, error: "message or media is required" });
        }
        const sendArgs: string[] = ["message", "send", "--target", p.target.trim()];
        if (typeof p.channel === "string" && p.channel.trim()) sendArgs.push("--channel", p.channel.trim());
        if (typeof p.account === "string" && p.account.trim()) sendArgs.push("--account", p.account.trim());
        if (hasMessage) sendArgs.push("--message", p.message!.trim());
        if (hasMedia) sendArgs.push("--media", p.media!.trim());
        if (typeof p.replyTo === "string" && p.replyTo.trim()) sendArgs.push("--reply-to", p.replyTo.trim());
        if (p.silent === true) sendArgs.push("--silent");
        try {
          await runCommandWithArgs(sendArgs, 30000);
          return res.json({ success: true, data: "Message sent." });
        } catch (err: unknown) {
          const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Send failed";
          const stderr = err && typeof err === "object" && "stderr" in err ? String((err as { stderr: string }).stderr) : "";
          return res.json({ success: false, error: stderr || msg });
        }
      }

      case "run-command": {
        if (!args || typeof args !== "string") {
          return res.json({ success: false, error: "Invalid command arguments" });
        }
        const blocked = ["rm ", "sudo ", "eval ", "exec "];
        if (blocked.some((b) => args.toLowerCase().includes(b))) {
          return res.json({ success: false, error: "Command blocked for safety" });
        }
        const result = await runCommand(args);
        return res.json({ success: true, data: result.stdout });
      }

      case "memory-list": {
        const memoryPath = path.join(OPENCLAW_HOME, "workspace", "memory");
        if (!fs.existsSync(memoryPath)) {
          return res.json({ success: true, data: [] });
        }

        const files: { name: string; path: string; content: string; updatedAt?: string; sizeBytes?: number }[] = [];

        function scanDirectory(dirPath: string, basePath: string) {
          try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dirPath, entry.name);
              const relativePath = path.relative(basePath, fullPath);

              if (entry.isDirectory()) {
                scanDirectory(fullPath, basePath);
              } else if (entry.isFile()) {
                try {
                  const content = fs.readFileSync(fullPath, "utf-8");
                  const stat = fs.statSync(fullPath);
                  files.push({
                    name: entry.name,
                    path: relativePath,
                    content: content.slice(0, 5000),
                    updatedAt: stat.mtime.toISOString(),
                    sizeBytes: stat.size,
                  });
                } catch {
                  try {
                    const stat = fs.statSync(fullPath);
                    files.push({
                      name: entry.name,
                      path: relativePath,
                      content: "[Unable to read file]",
                      updatedAt: stat.mtime.toISOString(),
                      sizeBytes: stat.size,
                    });
                  } catch {
                    files.push({
                      name: entry.name,
                      path: relativePath,
                      content: "[Unable to read file]",
                    });
                  }
                }
              }
            }
          } catch {
            // Ignore permission errors
          }
        }

        scanDirectory(memoryPath, memoryPath);
        return res.json({ success: true, data: files });
      }

      case "memory-read": {
        if (!args || typeof args !== "string") {
          return res.json({ success: false, error: "Invalid file path" });
        }
        
        const memoryPath = path.join(OPENCLAW_HOME, "workspace", "memory");
        const filePath = path.join(memoryPath, args);
        
        // Security check: ensure the resolved path is within memoryPath
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(memoryPath))) {
          return res.json({ success: false, error: "Invalid path" });
        }
        
        if (!fs.existsSync(resolvedPath)) {
          return res.json({ success: false, error: "File not found" });
        }
        
        try {
          const content = fs.readFileSync(resolvedPath, "utf-8");
          return res.json({ success: true, data: content });
        } catch (err: unknown) {
          return res.json({ success: false, error: err instanceof Error ? err.message : "Failed to read file" });
        }
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return res.json({ success: false, error: err.message || err.stderr || "Command failed" });
  }
}
