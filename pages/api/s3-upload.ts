import { APIRoute } from "next-s3-upload";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";

const s3Route = APIRoute.configure({
  key(req, filename) {
    let { Id, userId } = req.body;
    return `${userId}${Id}`;
  },
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return s3Route(req, res);
}
