import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { slateEditor } from "@payloadcms/richtext-slate";
import { s3Storage } from "@payloadcms/storage-s3";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Users } from "./collections/users";
import { Products } from "./collections/products/Products";
import { Media } from "./collections/Media";
import { ProductFiles } from "./collections/Productfile";
import { Orders } from "./collections/Orders";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const r2PublicUrl = process.env.R2_PUBLIC_URL ?? "";
const generateR2FileURL =
  (prefix: string) =>
  ({ filename }: { filename: string }) =>
    `${r2PublicUrl}/${prefix}/${filename}`;

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || "",
  secret: process.env.PAYLOAD_SECRET || "",
  collections: [Users, Products, Media, ProductFiles, Orders],
  admin: {
    user: "users",
    meta: {
      titleSuffix: ".DigitalMarketplace",
    },
  },
  editor: slateEditor({}),
  db: mongooseAdapter({
    url: process.env.MONGODB_URL || "",
  }),
  sharp,
  email: nodemailerAdapter({
    defaultFromAddress: "onboarding@resend.dev",
    defaultFromName: "Digital marketplace",
    transportOptions: {
      host: "smtp.resend.com",
      secure: true,
      port: 465,
      auth: {
        user: "resend",
        pass: process.env.RESEND_API_KEY,
      },
    },
  }),
  plugins: [
    s3Storage({
      enabled: Boolean(process.env.R2_BUCKET),
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: generateR2FileURL("media"),
        },
        product_files: {
          disablePayloadAccessControl: true,
          generateFileURL: generateR2FileURL("product-files"),
        },
      },
      bucket: process.env.R2_BUCKET || "",
      config: {
        region: "auto",
        endpoint: process.env.R2_ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
        },
      },
    }),
  ],
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
