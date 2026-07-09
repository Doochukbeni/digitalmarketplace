# Physical Multi-Vendor Marketplace (Shopify-grade) — Master Plan & Progress Tracker

> **Single source of truth for the whole platform build. Survives context loss.**
> On resuming ANY session, read this file top-to-bottom first, then update the checkboxes
> and the "Current Status" pointer.
> **Process (superpowers track):** every epic runs brainstorming → spec (`docs/superpowers/specs/`)
> → writing-plans → **eng-review** → build → **verification-before-completion**. Before Phase-1
> build begins, run **product-validation** (defend the MVP line) and **eng-review** (architecture)
> on this master plan.

---

## Context — what we're building and why

We started from a tutorial-grade **digital-download** store (Payload 2 + custom Express + Next 14 +
tRPC + Stripe hosted Checkout + MongoDB) that a review found not production-ready (broken webhook,
money bugs, authz holes, ephemeral local file storage, single-instance Express).

The target has since been redefined to a **production-grade, Shopify-quality physical-goods
multi-vendor marketplace** (Etsy/Amazon-shaped: a shared pool of buyers browsing many independent
sellers). **This is a platform, not a feature** — multi-quarter. The digital-download domain is
mostly obsolete scaffolding now; what survives is the tech foundation, not the business logic.

**MVP definition (the hard line):** real sellers can onboard and get approved, list physical products
(with variants + stock), buyers can browse across sellers, add multi-seller carts, check out once with
tax + shipping, pay by card; funds split to each seller's Stripe Connect account (platform keeps a
fee); sellers see and fulfill their orders (mark shipped w/ tracking); buyers have accounts + order
history; sellers get paid out. Everything beyond that line is **post-MVP** (see Parking Lot).

## Locked decisions (do not relitigate without user sign-off)

| Area | Decision |
|---|---|
| Product / platform | **Physical-goods multi-vendor marketplace**, shared buyers (Etsy/Amazon model), Shopify-grade quality bar |
| Runtime | **Vercel-native**; drop custom Express (`server.ts`, `next-utils.ts`) |
| CMS | **Payload 2.16 → Payload 3** (App-Router-native); **keep MongoDB**; **keep Slate** editor; admin at **`/admin`** |
| File storage | **Cloudflare R2** (S3 adapter) for **product images** (public) + store/media assets |
| Auth | **Clerk** = sole identity provider (buyers, sellers, admins). **Clerk everywhere** via a Payload custom auth strategy. Social login / password reset / 2FA via Clerk |
| Roles + tenant | Source of truth = **Clerk `publicMetadata`** (role, tenantId), **synced to Payload** via Clerk webhooks; Payload mirrors for access control |
| Tenancy | **Per-seller stores** via `@payloadcms/plugin-multi-tenant`; row-level isolation (`tenant` field) in shared Mongo. **Self-serve + admin approval**. Storefronts at **`/shop/[slug]`** (path-based) |
| Fulfillment | **Merchant-fulfilled** (sellers ship own orders, manage own stock) |
| Shipping | **Flat / per-seller rates** (optionally per-region); no live carrier calls at MVP |
| Tax | **Stripe Tax** (automated at checkout) |
| Variants | **Yes at MVP** — product options (size/color) → per-variant SKU / price / stock |
| Payments | **Stripe Connect (Express accounts)**; multi-seller cart → **separate charges & transfers** (platform charges buyer, transfers each seller share, retains platform fee); **custom checkout (PaymentIntents + Stripe Elements)**, NOT hosted Checkout |
| Orders | Cross-tenant buyer order **splits into per-seller sub-orders** (each its own fulfillment + transfer + lifecycle) |
| Currency | **Multi-currency AT MVP** (user-confirmed). Model TBD in P6 spec (per-seller native pricing vs base+FX presentment; Stripe multi-currency/Adaptive Pricing interplay with Tax + Connect transfers) |
| Buyer checkout | **Guest checkout allowed** — email + shipping address; account optional (create post-purchase). Order history tied to email until claimed |

### ⚠️ Scope guard for eng-review
- MVP is large: variants + multi-currency + Stripe Tax + Connect (separate charges & transfers) + shipping +
  guest checkout. This is the ceiling — **eng-review must pressure-test feasibility; no further scope creep**
  without cutting something. Multi-currency × per-seller transfers × Tax is the single riskiest interaction.

## Roadmap

### Phase 0 — Foundation (technical enablers; sequential)
| ID | Epic | Status | Depends |
|----|------|--------|---------|
| **F1** | Payload 3 + Vercel + R2 + Mongo runtime lift | 🟡 in progress | — |
| **F2** | Clerk auth + multi-tenancy + roles/isolation | ⚪ | F1 |

### Phase 1 — Commerce MVP (the marketplace core)
| ID | Epic | Status | Depends |
|----|------|--------|---------|
| **P1** | Catalog & inventory (products, variants, stock, categories, images) | ⚪ | F1,F2 |
| **P2** | Storefronts & marketplace browse (/shop/[slug], search, product pages, cart) | ⚪ | P1 |
| **P3** | Checkout, tax & payments (Stripe Tax + Connect separate charges & transfers) | ⚪ | P2 |
| **P4** | Orders, shipping & fulfillment (per-seller sub-orders, flat rates, shipment status, buyer order history) | ⚪ | P3 |
| **P5** | Payouts & merchant financials (Connect onboarding, transfers/payouts, fee reconciliation) | ⚪ | P3 |
| **P6** | Multi-currency pricing & settlement (presentment model, per-currency prices, Tax + transfer interplay) | ⚪ | P1,P3 |

### Phase 2 — Hardening & Ops (cross-cutting; can overlap Phase 1 tail)
| ID | Epic | Status | Depends |
|----|------|--------|---------|
| **H1** | Correctness & security hardening (webhook robustness, authz, idempotency) | ⚪ | P3,P4 |
| **H2** | Data-access layer (tenant-aware services, kill casts, search/pagination) | ⚪ | P1 |
| **H3** | Ops (secrets, logging/Sentry, rate limiting, CI/CD, preview deploys) | ⚪ | F1 |

Legend: ⚪ not started · 🟡 in progress · 🟢 done · 🔴 blocked

---

## Domain model (target — physical marketplace)

New/changed core entities (Payload collections), all tenant-scoped unless noted:
- **tenants** (stores): name, slug (→ `/shop/[slug]`), owner→user, status(pending/approved/suspended),
  stripeConnectAccountId, shipping settings, payout status. *(global; the tenant registry)*
- **users** (Clerk-synced; global): clerkUserId(unique), email, role(buyer/seller/admin), tenant(seller).
- **customers/addresses**: buyer shipping + billing addresses, order history. Buyer = Clerk user (role buyer)
  OR **guest** (email-keyed, no account) — guest orders claimable on later signup.
- **products** (physical): title, description, category, images(R2), status/approval, tenant, base attrs.
- **variants**: option values (size/color…), SKU, price(minor units), stock/inventory, weight (future carrier).
- **categories**: marketplace taxonomy for browse/search.
- **shipping profiles**: per-seller flat/regional rates.
- **carts**: buyer cart, line items(variant+qty) — may span multiple tenants.
- **orders**: buyer-level order (payment, tax, totals, ship address) → **sub-orders per tenant**.
- **sub-orders / fulfillments**: per-seller portion — items, seller transfer, lifecycle
  (pending→paid→fulfilled→shipped→delivered / cancelled / refunded), tracking number.
- **payments**: PaymentIntent, per-seller transfers, platform fee, Stripe Tax records.

**Removed/deprecated (digital-only leftovers):** `product_files` collection, presigned file downloads,
"instant delivery" copy, receipt-with-download-link, hosted Stripe Checkout Session flow. R2 keeps
**product images** only.

---

## Phase 0 detail

### F1 — Payload 3 + Vercel + R2 + Mongo runtime lift  🟡
Collapse Express+Next into one App-Router app with Payload 3 embedded (admin `app/(payload)/admin/...`,
Payload API `app/(payload)/api/...`, tRPC + webhooks as route handlers), R2 for images, delete
`server.ts`/`next-utils.ts`/`nodemon.json`/`tsconfig.server.json`/`dist/` + old build scripts
(`next build` only). Keep Mongo + Slate; `/admin` route. **Auth left native only long enough to boot;
replaced in F2.** Spike first to verify Payload 3 API specifics.
- [x] **F1.0** Materialize tracker → repo `PROGRESS.md` + commit
- [x] **F1.1** Spike: Payload 3 APIs verified against current docs (see findings below)
- [x] **F1.2** Spec written + self-reviewed → `docs/superpowers/specs/2026-07-09-payload3-foundation-design.md` (F1 architecture eng-review rides with the Phase-1 commerce eng-review)
- [ ] **F1.3** Deps + `payload.config.ts` (no webpack; Mongo, Slate, R2; `/admin`)
  - **Resolved dependency set (verified on npm 2026-07-09):** `payload@3.85.2` + all `@payloadcms/*@3.85.2`
    (`next`, `db-mongodb`, `richtext-slate` ✓exists, `storage-s3`, `email-nodemailer`, `ui`); `graphql@^16.8.1`;
    **`next@16.2.10`** (Payload 3.85 supports `>=16.2.6 <17`) → **React 19** (`react`/`react-dom`/`@types/*@^19`);
    add `sharp`. Remove `@payloadcms/bundler-webpack`, `express`, `body-parser`, `@types/express`, `nodemon`,
    `copyfiles`. Watch: React-19 peers may force bumps of `@radix-ui/*`, `@tanstack/react-query` (v4→v5), `lucide-react`.
- [ ] **F1.4** Port collections; Payload 3 init; admin/api routes; delete Express plumbing + dist + scripts
- [ ] **F1.5** R2 image storage; `next.config.mjs` remotePatterns
- [ ] **F1.6** Green local run + green Vercel preview

#### F1.1 Spike findings (verified against Payload docs, v3.85 era)
- **Init:** `import { getPayload } from 'payload'` + `import config from '@payload-config'` →
  `await getPayload({ config })`. Replaces the Express `payload.init` singleton in `get-payload.ts`.
- **App Router mounts:** admin + REST/GraphQL live in an `app/(payload)/` route group whose files
  (layout, `admin/[[...segments]]/page.tsx`, `api/[...slug]/route.ts`, `importMap.js`) are **generated
  boilerplate** from the Payload 3 Next template — copy them in, don't hand-write. Route bases are
  configurable via `routes.{admin,api,graphQL}` + `admin.importMap`. Default admin `/admin` = leave routes default.
- **Config:** remove `@payloadcms/bundler-webpack` + `admin.bundler` (v3 doesn't bundle admin). `buildConfig`
  imported from `'payload'`.
- **R2 storage:** `@payloadcms/storage-s3` (NOT storage-r2, which is for CF Workers). Config:
  `{ region:'auto', endpoint: R2_ENDPOINT, forcePathStyle:true, credentials:{...} }`, per-collection
  `disablePayloadAccessControl:true` + `generateFileURL` → `${R2_PUBLIC_URL}/${key}` for public images.
  Plugin also supports `signedDownloads` (not needed — images are public).
- **Clerk feasibility (F2) CONFIRMED:** Payload 3 supports collection `auth.strategies: [customStrategy]`
  where `authenticate({ payload, headers }) => { user }` (+ optional `responseHeaders`), and
  `auth.disableLocalStrategy: true` to kill password auth. → a Clerk strategy that verifies the Clerk
  session from headers and returns the Payload user is the sanctioned path. **The whole Clerk-everywhere plan is viable.**
- **Type imports:** Payload 3 exports `CollectionConfig`, `Access`, `Strategy`, hook types from `'payload'`
  (NOT `payload/types` or `payload/dist/...`). Fix these import paths when porting collections.
- **Node:** Payload 3 needs Node `^18.20.2 || >=20.9.0` → pin **Node 20** on Vercel.
- **Slate:** `@payloadcms/richtext-slate` has v3 releases (Lexical is the v3 default). High confidence; confirm
  exact version at F1.3. If friction, Lexical is the fallback (would need rich-text data conversion — avoid).

### F2 — Clerk auth + multi-tenancy + isolation  ⚪
- Clerk provider + middleware; **Payload custom auth strategy** trusting Clerk sessions (unifies /admin,
  storefront, API). Retire Payload native auth (`auth-router`, `getServerSideUser`, `use-auth` logout,
  `/api/users/me|logout`, `payload-token`); sign-in/up → Clerk components.
- **Clerk webhook** (Svix-verified) → upsert Payload user (clerkUserId, role, tenant); JIT fallback.
- **Multi-tenant plugin** + `tenants` collection + `tenant` on products/variants/media/orders; tenant-aware
  access control + reusable `isAdmin`/`isSellerOfTenant`/`isBuyerOrPublic` helpers (also closes the review's
  world-readable-users + unguarded-`req.user` holes).
- Seller onboarding: self-serve signup → `pending` tenant → admin approval in `/admin` → publishable.
- [ ] **F2.1** Spec (roles/claims model) + eng-review
- [ ] **F2.2** Clerk install + provider + middleware + custom Payload strategy
- [ ] **F2.3** Clerk webhook + user/role/tenant sync; swap auth pages
- [ ] **F2.4** Multi-tenant plugin + `tenants` + tenant fields
- [ ] **F2.5** Tenant-aware access control + helpers
- [ ] **F2.6** Seller onboarding + admin approval flow
- [ ] **F2.7** Verify isolation: seller A cannot touch seller B's data

---

## Phase 1 detail (epics — specs written just-in-time)

- **P1 Catalog & inventory:** products + variants (options→SKU/price/stock) + categories; seller product
  CRUD in `/admin` (or custom dashboard); image upload→R2; per-product approval gate. Prices as integer
  minor units. Inventory decrement on paid order; oversell guard.
- **P2 Storefronts & browse:** `/shop/[slug]` seller store; marketplace browse + search + category filter
  (replace offset "cursor" pagination with keyset); product/variant detail; cart (multi-seller aware).
- **P3 Checkout, tax & payments:** address capture; **Stripe Tax** quote; **PaymentIntent + Elements**;
  **separate charges & transfers** splitting to each seller Connect account, platform fee retained; robust
  idempotent webhook creating order + sub-orders + decrementing stock.
- **P4 Orders, shipping & fulfillment:** flat per-seller shipping at checkout; per-seller sub-orders;
  seller order queue + mark fulfilled/shipped(+tracking); buyer order history + status; cancel/refund basics.
- **P5 Payouts & financials:** Connect Express onboarding for sellers; transfers/payout status; platform-fee
  reconciliation; seller earnings view.
- **P6 Multi-currency:** decide presentment model (per-seller native price vs base+FX display); per-currency
  prices in minor units; ensure Stripe Tax, PaymentIntent presentment currency, and per-seller transfers all
  agree; buyer currency selection/detection. Highest-risk MVP interaction — spec + eng-review before build.
- **Guest checkout (spans P3/P4):** email + address purchase path; guest order records keyed by email;
  post-purchase account claim links guest orders to a new Clerk user.

## Parking Lot — explicitly POST-MVP (do not build now)
Real-time carrier rates + shipping labels (EasyPost/Shippo) · platform-fulfilled/warehousing · dropshipping
· subdomain/custom domains · reviews & ratings · discounts/coupons
· abandoned-cart · analytics dashboards · returns/RMA automation · apps/extensions ecosystem · messaging/chat
· wishlist/favorites · SEO/theming customization.

---

## Global verification strategy
Commerce + auth + money + isolation → verify end-to-end at each gate:
1. **Local run** — buyer journey (browse→multi-seller cart→checkout→order history) + seller journey
   (onboard→approve→list w/ variants→receive order→ship) + admin (approvals).
2. **Isolation** — seller A provably cannot read/write seller B's products/orders (F2.7).
3. **Payments** — Stripe **test mode + `stripe listen`**: PaymentIntent succeeds, transfers land on correct
   connected accounts, platform fee correct, Stripe Tax applied, webhook idempotent (no double order/stock).
4. **Inventory** — concurrent purchase can't oversell.
5. **Fulfillment** — status transitions + tracking visible to buyer.
6. **Storage/Deploy** — images from R2; green Vercel preview per PR.
7. Automated tests: webhook/order-split, access-control + tenant predicates, price/fee/tax math, inventory.

## Current Status  ← update every session
- **Phase:** Phase 0 / F1 in progress. Plan approved. Working on branch `feat/payload3-foundation`.
- **Done:** F1.0 (tracker committed); F1.1 (Payload 3 spike — all critical assumptions verified, incl.
  Clerk custom-strategy feasibility; findings recorded above).
- **Next concrete step:** F1.2 — write the F1 foundation spec to `docs/superpowers/specs/` (concrete file
  moves/creates/deletes, config diffs, env vars) and self-review; F1 architecture eng-review deferred with
  the commerce eng-review is fine, but a light spec review before F1.3 build is worth it.
- **Settled:** multi-currency IN at MVP (P6); guest checkout allowed; Connect = separate charges & transfers.
- **Deferred rigor:** full commerce-architecture eng-review (Connect split, order-split, multi-currency ×
  Tax × transfers) runs before Phase-1 build, not now (F1/F2 don't depend on those contested decisions).
- **Code changed so far:** none beyond adding this tracker.
