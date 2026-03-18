import { NextResponse, NextRequest } from "next/server";
import { stripe } from "$/lib/stripe";
import { absoluteURL } from "$/utils";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

async function stripeCheckout({
  email,
  userId,
  product,
  customerId,
  interval,
}: {
  email: string;
  userId: string;
  product: string;
  customerId: string;
  interval: "month" | "year";
}) {
  try {
    // Select the appropriate price ID based on interval
    const priceId =
      interval === "month"
        ? process.env.STRIPE_MONTHLY_PLAN_ID
        : process.env.STRIPE_ANNUAL_PLAN_ID;

    if (!priceId) {
      throw new Error(
        `Stripe price ID not configured for ${interval} interval`
      );
    }

    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      /*       automatic_tax: {
        enabled: true,
      }, */
      payment_method_collection: "always",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: absoluteURL(`/`),
      cancel_url: absoluteURL(`/`),
      client_reference_id: userId,
      customer: customerId === "" ? undefined : customerId,
      customer_email: customerId === "" ? email : undefined,
      metadata: {
        userId: userId,
        product: product,
        interval: interval,
        email: email,
      },
    });

    // Return URL if available, otherwise return session ID
    return stripeSession.url || stripeSession.id;
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
    const { email, userId, product, customerId, interval } = req.body;

    // Verify userId matches the authenticated user
    if (userId && userId !== (session.user as any).userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!email || !userId || !product) {
      return res.status(400).json({
        error: "`email`, `userId`, `product` is required",
      });
    }

    // Default to monthly if interval not provided
    const subscriptionInterval: "month" | "year" = interval || "month";

    const checkoutResult = await stripeCheckout({
      email,
      userId,
      product,
      customerId: customerId || "",
      interval: subscriptionInterval,
    });

    // Return URL if it's a URL, otherwise return sessionId for Stripe.js redirect
    if (
      typeof checkoutResult === "string" &&
      checkoutResult.startsWith("https://")
    ) {
      return res.status(200).json({ url: checkoutResult });
    }
    return res.status(200).json({ sessionId: checkoutResult });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
