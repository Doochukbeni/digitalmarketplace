# F2 — Auth (Clerk) & Multi-tenancy — Design Spec

Status: in progress. Depends on F1 (build-green). Branch: `feat/payload3-foundation`.
See `PROGRESS.md` for the master roadmap.

## Goal
Make the platform a true per-seller multi-vendor marketplace with **Clerk as the sole identity
provider** and enforced per-tenant data isolation.

## Part 1 — Multi-tenancy data model  ✅ (implemented, build-green)
- `@payloadcms/plugin-multi-tenant` wired in `payload.config.ts`.
- New `tenants` collection (`src/collections/Tenants.ts`): `name`, `slug` (unique, → `/shop/[slug]`),
  `status` (pending/approved/suspended), `stripeConnectAccountId` (P5). Admin-only writes; approval gate
  via `status`.
- Plugin scopes **products / media / product_files** (adds a `tenant` field + tenant-filtered access; adds
  a tenants array to `users`). `userHasAccessToAllTenants: user.role === 'admin'`.
- **Orders deliberately excluded** from tenant scoping: a buyer cart spans multiple sellers, so tenancy on
  orders is modeled as **per-seller sub-orders** in the commerce phase (P4), not a single `tenant` field.

## Part 2 — Clerk identity (NEXT increment — needs Clerk keys to verify)
Clerk replaces Payload's email/password auth entirely.

### 2a. Wiring
- `@clerk/nextjs` (installed). `<ClerkProvider>` wraps the `(app)` layout; add `middleware.ts` with
  `clerkMiddleware()` (matcher excludes `/api/(payload)` static assets as needed).
- Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`,
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (add placeholders to `.env` so build
  stays green without live keys).

### 2b. Payload custom auth strategy (unifies /admin + storefront + API)
- `users` collection: `auth: { disableLocalStrategy: true, strategies: [clerkStrategy] }`.
- `clerkStrategy.authenticate({ headers, payload })`: verify the Clerk session token from the request
  (Clerk `authenticateRequest` / `verifyToken`), look up (or JIT-create) the Payload user by `clerkUserId`,
  return `{ user }` (Payload user doc with `role`). Return `{ user: null }` when unauthenticated.
- `users` fields: add `clerkUserId` (text, unique, index, admin-readonly); keep `role`; the plugin's
  tenants array handles seller→store mapping. Remove password/verify UI reliance.
- After this lands, the F1 tRPC `signIn`/`createPayloadUser`/`verifyEmail` router + the temporary
  `payload-token` cookie are **retired**; `getServerSideUser` already uses `payload.auth` so it keeps working
  through the Clerk strategy. `use-auth` logout → Clerk `signOut`. `(auth)/sign-in|sign-up` → Clerk components.

### 2c. Role + tenant sync (Clerk → Payload)
- Source of truth = Clerk `publicMetadata` (`role`: buyer/seller/admin, `tenantId`).
- Clerk webhook `app/api/webhooks/clerk/route.ts` (Svix-verified): on `user.created/updated`, upsert the
  Payload user (`clerkUserId`, `email`, `role`) and reconcile tenant membership; JIT upsert on first request
  as a fallback so authz never blocks on webhook lag.

### 2d. Seller onboarding + approval
- Self-serve: a signed-in user requests a store → creates a `pending` tenant (owner = user), assigns the
  user to that tenant, sets Clerk `role: seller`. Admin flips `status: approved` in `/admin`. Only `approved`
  tenants publish / appear on the storefront.

## Verification
- Build green with Clerk wired (placeholder keys).
- With real Clerk keys: sign in via Clerk → authenticated in `/admin` and storefront; seller sees only their
  tenant's products/media/files; admin sees all; a second seller cannot read/write the first's rows (F2.7).
- `payload generate:importmap` must include the multi-tenant plugin's client components for the admin
  TenantSelector to render (blocked by the current generate CLI issue — fix first).

## Open decisions (resolve in build)
- Cross-tenant order model detail (single order + sub-orders vs separate orders) — finalize in P4 spec.
- Guest checkout identity: guest orders keyed by email, claimable on later Clerk signup (P3/P4).
