import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getPayloadClient } from "../get-payload";
import { stripe } from "../lib/stripe";
import { privateProcedure, router } from "./trpc";
import { Product } from "@/payload-types";

export const paymentRouter = router({
  createSession: privateProcedure
    .input(z.object({ productIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      let { productIds } = input;

      if (productIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const payload = await getPayloadClient();

      const { docs: products } = (await payload.find({
        collection: "products",
        where: {
          id: {
            in: productIds,
          },
        },
      })) as unknown as { docs: Product[] };

      const filteredProducts = products.filter((product) =>
        Boolean(product.priceId)
      );

      const order = await payload.create({
        collection: "orders",
        data: {
          _isPaid: false,
          products: filteredProducts,
          user: user.id,
        },
      });

      try {
        const stripeSession = await stripe.checkout.sessions.create({
          success_url: `${process.env.NEXT_PUBLIC_SERVER_URL}/thank-you?orderId=${order.id}`,
        });
      } catch (error) {}
    }),
});
