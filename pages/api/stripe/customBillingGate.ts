import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { stripe } from "$/lib/stripe";
import { absoluteURL } from "$/utils";
import { NextResponse } from "next/server";

async function stripeBillingGate({ customerId }: { customerId: string }) {
  try {
    const stripeSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: absoluteURL(`/Settings`),
    });
    return stripeSession.url;
  } catch (error) {
    console.error("Error creating Stripe session:", error);
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await getServerSession(req, res, authOptions(req, res));
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Parse the request body
    const { customerId } = req.body;
    if (!customerId) {
      return res
        .status(400)
        .json({ error: "`customerId` is required" });
    }

    const stripeSession = await stripeBillingGate({
      customerId,
    });

    return res.status(200).json({ url: stripeSession });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
