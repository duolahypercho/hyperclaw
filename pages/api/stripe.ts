import Stripe from "stripe";
import { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "$/lib/stripe";
import {
  cancelUserSubscription,
  updateUserSubscription,
} from "$/services/user";

type metaDataType = {
  product: string;
  studioId: string;
  userId: string;
  interval: "month" | "year";
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  const webhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET!;

  if (req.method === "POST") {
    const sig = req.headers["stripe-signature"]!;

    let event: Stripe.Event;

    try {
      const body = await buffer(req);
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      // On error, log and return the error message
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;
    // Successfully constructed event
    switch (event.type) {
      case "checkout.session.completed":
        const customerId = session.customer as string;
        const metadata: metaDataType = session.metadata as metaDataType;
        //create a new subscription
        try {
          await updateUserSubscription({
            userId: metadata.userId,
            plan: metadata.product,
            period: metadata.interval,
            customerId,
          });
        } catch (e) {
          console.log(e);
        }
        break;

      case "customer.subscription.deleted":
        const subscriptionDeleted = event.data.object as Stripe.Subscription;
        try {
          await cancelUserSubscription({
            userId: subscriptionDeleted.customer as string,
          });
        } catch (e) {
          console.log(e);
        }
        break;
      default:
        break;
    }
    // Return a response to acknowledge receipt of the event
    res.json({ received: true });
  } else {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
  }
};

export const config = {
  api: {
    bodyParser: false,
  },
};

const buffer = (req: NextApiRequest) => {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks as unknown as Uint8Array[]));
    });

    req.on("error", reject);
  });
};

export default handler;
