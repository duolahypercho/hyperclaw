import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Hypercho-Radio-Proxy/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get content type from the original response
    const contentType = response.headers.get("content-type") || "audio/mpeg";

    // Set appropriate headers for streaming
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range");
    res.setHeader("Cache-Control", "no-cache");

    // Handle range requests for seeking
    const range = req.headers.range;
    if (range) {
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", contentLength);
      }
    }

    // Stream the response instead of buffering
    if (response.body) {
      // @ts-ignore - Node.js types
      response.body.pipe(res);
    } else {
      // Fallback for environments where body.pipe is not available
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (error) {
    console.error("Radio proxy error:", error);

    // Send appropriate error response
    if (error instanceof Error) {
      if (error.message.includes("HTTP 404")) {
        return res.status(404).json({ error: "Radio stream not found" });
      } else if (error.message.includes("HTTP 403")) {
        return res.status(403).json({ error: "Access to radio stream denied" });
      } else if (error.message.includes("HTTP 5")) {
        return res.status(502).json({ error: "Radio stream server error" });
      }
    }

    res.status(500).json({ error: "Failed to proxy radio stream" });
  }
}
