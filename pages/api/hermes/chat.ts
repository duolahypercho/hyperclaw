import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "$/pages/api/auth/[...nextauth]";

interface RequestBody {
  messages: { role: string; content: string }[];
  stream?: boolean;
}

const HERMES_API_URL = process.env.HERMES_API_URL || "http://127.0.0.1:8642";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { body }: { body: RequestBody } = req;
  const { messages, stream } = body;
  if (!messages) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.HERMES_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.HERMES_API_KEY}`;
  }

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {
      const upstream = await fetch(`${HERMES_API_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: messages.map(({ role, content }) => ({ role, content })),
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => "");
        res.status(upstream.status).json({ error: errBody || `Hermes returned ${upstream.status}` });
        return;
      }

      const reader = upstream.body?.getReader();
      if (!reader) {
        res.status(502).json({ error: "No response body from Hermes" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            /* skip malformed chunks */
          }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      if (error?.name === "AbortError") {
        res.end();
        return;
      }
      if (error?.cause?.code === "ECONNREFUSED" || error?.code === "ECONNREFUSED") {
        res.status(503).json({ error: "Hermes agent is not running" });
        return;
      }
      console.error("Hermes chat stream error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  // Non-streaming path
  try {
    const upstream = await fetch(`${HERMES_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: messages.map(({ role, content }) => ({ role, content })),
      }),
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => "");
      res.status(upstream.status).json({ error: errBody || `Hermes returned ${upstream.status}` });
      return;
    }

    const result = await upstream.json();
    return res.json(result.choices?.[0]?.message?.content || "");
  } catch (error: any) {
    if (error?.cause?.code === "ECONNREFUSED" || error?.code === "ECONNREFUSED") {
      return res.status(503).json({ error: "Hermes agent is not running" });
    }
    console.error("Hermes chat error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export default handler;
