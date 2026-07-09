import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getPayloadClient } from "@/get-payload";
import type { User } from "@/payload-types";

// Payload 3 has no Express middleware populating `req.user`. We derive the
// authenticated user from the request headers via Payload's local auth.
// (In F2 this same call is backed by the Clerk custom auth strategy.)
export const createContext = async ({ req, resHeaders }: FetchCreateContextFnOptions) => {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  return { req, resHeaders, user: (user as unknown as User | null) ?? null };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const middleware = t.middleware;

const isAuth = middleware(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.user.id) {
    throw new TRPCError({
      message: "you are not logged in",
      code: "UNAUTHORIZED",
    });
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const privateProcedure = t.procedure.use(isAuth);
