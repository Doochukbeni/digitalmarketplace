import config from "@payload-config";
import { getPayload, type Payload } from "payload";

// Payload 3 caches the instance internally, so this is a thin accessor that
// preserves the existing `getPayloadClient()` call sites across the app.
export const getPayloadClient = (): Promise<Payload> => getPayload({ config });
