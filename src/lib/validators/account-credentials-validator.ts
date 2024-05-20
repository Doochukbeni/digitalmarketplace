import { z } from "zod";

export const AuthCredentialValidator = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(5, { message: "Password must be at least 5 character long" }),
});

export type TAuthCredentialValidator = z.infer<typeof AuthCredentialValidator>;
