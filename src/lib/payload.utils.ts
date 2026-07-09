import { headers as nextHeaders } from "next/headers";
import { getPayloadClient } from "@/get-payload";
import type { User } from "../payload-types";

// Payload 3 local auth: resolves the current user in-process from the request
// headers/cookies (no HTTP hop to /api/users/me). Replaced by Clerk in F2.
export const getServerSideUser = async () => {
  const payload = await getPayloadClient();
  const headers = await nextHeaders();
  const { user } = await payload.auth({ headers });

  return { user: (user as unknown as User | null) ?? null };
};
