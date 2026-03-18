// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { convertType } from "@/types/form";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import sharp from "sharp";

type optionsType = {
  type: convertType;
  format?: "file" | "buffer";
  quality?: number;
};

async function convertImage(image: string, options: optionsType) {
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

  const imageBuffer = Buffer.from(base64Data, "base64");
  let sharpInstance = sharp(imageBuffer);

  switch (options.type) {
    case "png":
      sharpInstance = sharpInstance.png({ quality: options.quality });
      break;
    case "jpeg":
      sharpInstance = sharpInstance.jpeg({ quality: options.quality });
      break;
    case "webp":
      sharpInstance = sharpInstance.webp({ quality: options.quality });
      break;
    case "avif":
      sharpInstance = sharpInstance.avif({ quality: options.quality });
      break;
    case "jp2":
      sharpInstance = sharpInstance.jp2({ quality: options.quality });
      break;
    case "tiff":
      sharpInstance = sharpInstance.tiff({ quality: options.quality });
      break;
    case "jxl":
      sharpInstance = sharpInstance.jxl({ quality: options.quality });
      break;
    case "heif":
      sharpInstance = sharpInstance.heif({ quality: options.quality });
      break;
    case "gif":
      sharpInstance = sharpInstance.gif();
      break;
    default:
      throw new Error("Unsupported image format");
  }

  const buffer = await sharpInstance.toBuffer();
  return buffer;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // post
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    //convert req.body to json
    const { options, image } = JSON.parse(req.body);
    const convertedImage = await convertImage(image, options);
    res.status(200).json({
      convertedImage: `data:image/${
        options.type
      };base64,${convertedImage.toString("base64")}`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to convert image" });
  }
}
