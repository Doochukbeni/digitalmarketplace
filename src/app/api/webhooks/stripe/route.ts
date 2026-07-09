import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Resend } from "resend";

import { stripe } from "@/lib/stripe";
import { getPayloadClient } from "@/get-payload";
import { Product, User } from "@/payload-types";
import { ReceiptEmailHtml } from "@/components/emails/ReceiptEmail";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err) {
    return new NextResponse(
      `Webhook Error: ${err instanceof Error ? err.message : "Unknown Error"}`,
      { status: 400 }
    );
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (!session?.metadata?.userId || !session?.metadata?.orderId) {
    return new NextResponse("Webhook Error: No user present in metadata", {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const payload = await getPayloadClient();

    const { docs: users } = await payload.find({
      collection: "users",
      where: { id: { equals: session.metadata.userId } },
    });
    const [user] = users as unknown as User[];
    if (!user) {
      return NextResponse.json({ error: "No such user exists." }, { status: 404 });
    }

    const { docs: orders } = await payload.find({
      collection: "orders",
      depth: 2,
      where: { id: { equals: session.metadata.orderId } },
    });
    const [order] = orders;
    if (!order) {
      return NextResponse.json({ error: "No such order exists." }, { status: 404 });
    }

    await payload.update({
      collection: "orders",
      data: { _isPaid: true },
      where: { id: { equals: session.metadata.orderId } },
    });

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const html = await ReceiptEmailHtml({
        date: new Date(),
        email: user.email,
        orderId: session.metadata.orderId,
        products: order.products as Product[],
      });

      const data = await resend.emails.send({
        from: "DigitalMarket place <onboarding@resend.dev>",
        to: [user.email],
        subject: "Thanks for your order! This is your receipt.",
        html,
      });

      return NextResponse.json({ data });
    } catch (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
  }

  return new NextResponse(null, { status: 200 });
}
