import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "$/pages/api/auth/[...nextauth]";

const HERMES_API_URL = process.env.HERMES_API_URL || "http://127.0.0.1:8642";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const upstream = await fetch(`${HERMES_API_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (upstream.ok) {
      return res.json({ status: "ok", available: true });
    }
    return res.json({ available: false });
  } catch {
    return res.json({ available: false });
  }
};

export default handler;
