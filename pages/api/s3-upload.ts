import { APIRoute } from "next-s3-upload";
import { getServerSession } from "next-auth";
import { authOptions } from "$/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";
import { buildUserScopedS3Key } from "$/lib/s3-object-key";

const s3Route = APIRoute.configure({
  key(req) {
    const { Id, userId: prefix } = req.body || {};
    const sessionUserId = (req as NextApiRequest & { sessionUserId?: string }).sessionUserId;
    return buildUserScopedS3Key({
      prefix,
      objectId: Id,
      userId: sessionUserId,
    });
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

  (req as NextApiRequest & { sessionUserId?: string }).sessionUserId =
    session.user.userId;

  return s3Route(req, res);
}
