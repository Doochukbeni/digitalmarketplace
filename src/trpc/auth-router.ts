// relative imports only

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getPayloadClient } from "../get-payload";
import { AuthCredentialValidator } from "../lib/validators/account-credentials-validator";
import { publicProcedure, router } from "./trpc";

export const authRouter = router({
  createPayloadUser: publicProcedure
    .input(AuthCredentialValidator)
    .mutation(async ({ input }) => {
      const { email, password } = input;
      const payload = await getPayloadClient();

      // check if user already exists
      const { docs: users } = await payload.find({
        collection: "users",
        where: {
          email: {
            equals: email,
          },
        },
      });
      if (users.length !== 0) throw new TRPCError({ code: "CONFLICT" });

      await payload.create({
        collection: "users",
        data: {
          email,
          password,
          role: "user",
        },
      });

      return { success: true, sentToEmail: email };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const { token } = input;

      const payload = await getPayloadClient();

      const isVerified = await payload.verifyEmail({
        collection: "users",
        token,
      });

      if (!isVerified) throw new TRPCError({ code: "UNAUTHORIZED" });

      return { success: true };
    }),

  signIn: publicProcedure
    .input(AuthCredentialValidator)
    .mutation(async ({ input, ctx }) => {
      const { email, password } = input;

      const payload = await getPayloadClient();

      try {
        const result = await payload.login({
          collection: "users",
          data: {
            email,
            password,
          },
        });

        if (result.token) {
          const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
          const maxAge = 60 * 60 * 24 * 7; // 7 days
          ctx.resHeaders.append(
            "Set-Cookie",
            `payload-token=${result.token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${maxAge}`
          );
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
    }),
});
