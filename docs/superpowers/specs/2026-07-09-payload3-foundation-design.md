# F1 — Payload 3 + Vercel + R2 Runtime Foundation — Design Spec

Status: approved-plan → executable. Scope: **F1 only** (runtime lift). Auth stays Payload-native
just long enough to boot; Clerk replaces it in F2. No commerce/domain changes here.
Branch: `feat/payload3-foundation`. See `PROGRESS.md` for the master roadmap and F1.1 spike findings.

## Goal
Turn the app from "Express boots Payload + proxies Next" into **one Next.js App Router app with
Payload 3 embedded**, deployable on Vercel, with product images on Cloudflare R2. Behavior parity
with today (digital-download domain kept as-is for now; it's stripped in Phase 1).

## Target structure
```
src/app/
  (payload)/                      ← NEW: generated Payload 3 route group (boilerplate from template)
    layout.tsx
    admin/[[...segments]]/page.tsx + not-found
    api/[...slug]/route.ts
    api/graphql/route.ts
    api/graphql-playground/route.ts
    custom.scss
    importMap.js
  api/
    trpc/[trpc]/route.ts          ← KEEP (already App Router); context now uses payload.auth()
    webhooks/stripe/route.ts      ← NEW: replaces Express webhook (raw-body signature verify)
  (app)/ or existing groups...    ← storefront pages unchanged
src/payload.config.ts             ← rewritten (no webpack, R2 storage, /admin default)
src/get-payload.ts                ← rewritten to getPayload({ config })
```

## Changes — file by file

### Dependencies (`package.json`)
- Upgrade: `payload` → `^3.x`, `@payloadcms/db-mongodb` → `^3.x`, `@payloadcms/richtext-slate` → `^3.x`,
  `next` → `^15` (Payload 3 peer), `react`/`react-dom` as required by Next 15.
- Add: `@payloadcms/next`, `@payloadcms/storage-s3`, `graphql`, `@payloadcms/ui`.
- Remove: `@payloadcms/bundler-webpack`, `express`, `body-parser`, `@types/express`, `nodemon`,
  `copyfiles`, `cross-env` (if unused after script rewrite), `nodemailer` stays (Payload email) — verify
  Payload 3 email adapter (`@payloadcms/email-nodemailer`) and add it.
- Scripts → `dev: next dev`, `build: next build`, `start: next start`, `generate:types:
  payload generate:types`, `generate:importmap: payload generate:importmap`. Remove
  `build:payload/build:server/copyfiles`.
- `engines.node`: `>=20.9.0`. Remove `main: dist/server.js`.

### `src/payload.config.ts` (rewrite)
- `buildConfig` from `'payload'`; `import { mongooseAdapter } from '@payloadcms/db-mongodb'`;
  `import { slateEditor } from '@payloadcms/richtext-slate'`; `import { s3Storage } from '@payloadcms/storage-s3'`.
- Remove `webpackBundler` + `admin.bundler`. Remove `routes.admin:'/sell'` → default `/admin`.
- Keep `collections`, `admin.meta`, `rateLimit`, `db: mongooseAdapter({ url: MONGODB_URL })`,
  `editor: slateEditor({})`, `typescript.outputFile`.
- Add `sharp` import + pass (Payload 3 needs `sharp` for image resizing) — add `sharp` dep.
- Add `secret: PAYLOAD_SECRET`, `serverURL`, and email adapter.
- Add `storage`/`plugins` R2 block:
  ```ts
  s3Storage({
    enabled: Boolean(process.env.R2_BUCKET),
    collections: {
      media:         { disablePayloadAccessControl: true, generateFileURL: r2Url('media') },
      product_files: { disablePayloadAccessControl: true, generateFileURL: r2Url('product-files') },
    },
    bucket: process.env.R2_BUCKET!,
    config: { region:'auto', endpoint: process.env.R2_ENDPOINT, forcePathStyle:true,
              credentials:{ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } },
  })
  ```
  (`product_files` kept in F1 only because the collection still exists; it's removed in Phase 1.)

### `src/get-payload.ts` (rewrite)
- Replace Express `payload.init(...)` singleton with the Payload 3 cached `getPayload({ config })` pattern
  (Payload 3 caches internally; keep a thin `getPayloadClient()` wrapper for existing call sites, or
  migrate call sites to `getPayload({ config })` directly). Keep Resend/Nodemailer email via the Payload 3
  nodemailer email adapter in the config, not here.

### `app/(payload)/*` (new, from template)
- Scaffold the route-group files from the official Payload 3 blank template (or `npx create-payload-app`
  into a temp dir and copy `src/app/(payload)`), then run `payload generate:importmap`.

### tRPC (`src/trpc/trpc.ts`, `src/app/api/trpc/[trpc]/route.ts`)
- Context no longer reads Express `req.user`. In the fetch-adapter context, resolve the user via
  `const { user } = await payload.auth({ headers: req.headers })` and put it on ctx. `isAuth` middleware
  reads `ctx.user`. (In F2 this same call is backed by the Clerk custom strategy — no further change needed.)
- Router surface (auth/payment/getInfiniteProducts) unchanged.

### Stripe webhook (`src/app/api/webhooks/stripe/route.ts`, new; delete `src/webhooks.ts` Express handler)
- App Router `POST` handler: `const body = await req.text()` (raw string) for
  `stripe.webhooks.constructEvent(body, sig, secret)`; `sig = req.headers.get('stripe-signature')`.
  Logic ported as-is for F1 (the double-send / retry / `!order` bugs are fixed in H1, not here — but do
  NOT reintroduce the Express `rawBody` plumbing).

### Server-side user (`src/lib/payload.utils.ts`)
- Replace the `/api/users/me` HTTP hop in `getServerSideUser` with `payload.auth({ headers: await headers() })`
  (Payload 3 local). Callers (`Navbar.tsx`, `thank-you/page.tsx`) unchanged in signature. (Fully replaced by
  Clerk in F2.)

### RSC data fetches
- `product/[productId]/page.tsx`, `thank-you/page.tsx`, `trpc/*`: swap `getPayloadClient()` usage to the
  Payload 3 accessor. Query API (`payload.find/create/update`) is unchanged in v3.

### Collections (`src/collections/*`)
- Fix type import paths: `payload/types` and `payload/dist/collections/config/types` → `'payload'`
  (`CollectionConfig`, `Access`, `BeforeChangeHook` equivalents). No behavior change in F1 (authz holes +
  tenant scoping handled in F2/H1). Add null-guards only where required to compile.

### `next.config.mjs`
- Wrap with `withPayload(nextConfig)` from `@payloadcms/next/withPayload`.
- `images.remotePatterns`: add the R2 public host (`R2_PUBLIC_URL`) and the production domain; keep localhost
  for dev.

### Deletions
- `src/server.ts`, `src/next-utils.ts`, `src/webhooks.ts` (Express handler), `nodemon.json`,
  `tsconfig.server.json`, the committed `dist/` tree. Add `dist/` (+ `.next/`) to `.gitignore`.

## Env vars
Keep: `MONGODB_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `NODE_ENV`. Remove: `PORT`, `NEXT_BUILD`.
Add: `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`.

## Verification (F1.6)
1. `pnpm|yarn install`; `payload generate:importmap`; `payload generate:types`.
2. `next build` passes; `next dev` boots with no Express.
3. `/admin` loads; can log in (Payload native, temporary); create a product → Stripe product still created
   via `Products.beforeChange` hook; product image uploads land in **R2** and render on the storefront.
4. Storefront: home + product page + product reel render; add-to-cart works; checkout redirects to Stripe.
5. Stripe webhook reachable at `/api/webhooks/stripe` (test with `stripe listen --forward-to`).
6. Green Vercel preview deploy (Node 20; env vars set); smoke-test the preview URL.

## Risks / notes
- Next 15 + React 19 peer bumps may surface minor breakages in existing components (shadcn/radix) — expect
  small fixes.
- Slate v3 adapter: confirm exact version resolves; fallback Lexical would require rich-text data conversion
  (avoid in F1).
- The `(payload)` route group files are generated boilerplate — treat as vendored; regenerate importMap after
  any collection/config change (`payload generate:importmap`).
