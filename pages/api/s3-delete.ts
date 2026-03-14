// pages/api/deleteObject.ts
import { NextApiRequest, NextApiResponse } from 'next';
import logger from "$/lib/logger";

import { S3 } from "@aws-sdk/client-s3";

const s3 = new S3({ region: process.env.S3_UPLOAD_REGION!, credentials: { accessKeyId: process.env.S3_UPLOAD_KEY!, secretAccessKey: process.env.S3_UPLOAD_SECRET! }});

async function deleteObjectFromS3(objectKey: string): Promise<void> {
  try {
    const params = {
      Bucket: process.env.S3_UPLOAD_BUCKET!,
      Key: objectKey,
    };

    await s3.deleteObject(params);
  } catch (error) {
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).end();
  }

  const { objectKey } = req.body;

  if (!objectKey || typeof objectKey !== "string" || objectKey.includes("..") || objectKey.startsWith("/")) {
    return res.status(400).json({ message: "Invalid object key." });
  }

  try {
    await deleteObjectFromS3(objectKey);
    res.status(200).json({ message: 'Object deleted successfully.' });
  } catch (error: any) {
    logger.error({ err: error, objectKey }, "S3 delete failed");
    res.status(500).json({ message: 'Failed to delete object.' });
  }
}