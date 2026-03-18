import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "$/pages/api/auth/[...nextauth]";
import { openai } from "../../lib/openai";

interface RequestBody {
  messages: { id: string; role: string; content: string }[];
  maxTokens?: number;
  stop?: string[];
  stream?: boolean;
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { body }: { body: RequestBody } = req;
  const { messages, maxTokens, stop, stream } = body;
  if (!messages) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {
      const openaistream = await openai.chat.completions.create({
        model: "gpt-5-nano",
        messages: messages.map(({ role, content }) => ({
          role: role as "system" | "user" | "assistant",
          content,
        })),
        max_completion_tokens: maxTokens,
        stop: stop,
        stream: true,
      });

      // Stream data to the client
      for await (const chunk of openaistream) {
        if (chunk.choices[0]?.delta?.content) {
          const message = JSON.stringify({
            content: chunk.choices[0].delta.content,
          });

          // Use socket.write() to send data
          res.write(`data: ${message}\n\n`);
        }
      }

      // Send the [DONE] message and end the response
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Error streaming response:", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: messages.map(({ role, content }) => ({
        role: role as "system" | "user" | "assistant",
        content,
      })),
      max_tokens: maxTokens,
      stop: stop,
    });
    return res.json(completion.choices[0].message.content);
  } catch (error) {
    console.error("Error streaming response:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export default handler;
