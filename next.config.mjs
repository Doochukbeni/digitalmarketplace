import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "localhost",
        pathname: "**",
        port: "3000",
        protocol: "http",
      },
      // Cloudflare R2 public bucket host (set R2_PUBLIC_URL, e.g. https://pub-xxxx.r2.dev)
      ...(process.env.R2_PUBLIC_URL
        ? [
            {
              protocol: "https",
              hostname: new URL(process.env.R2_PUBLIC_URL).hostname,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },
};

export default withPayload(nextConfig);
