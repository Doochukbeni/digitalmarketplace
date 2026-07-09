import type { CollectionConfig } from "payload";

// A tenant is a seller storefront. Self-serve signup creates a `pending`
// tenant; a platform admin approves it before it can publish / appear at
// /shop/[slug]. (Seller onboarding + Stripe Connect wiring land in F2 Clerk
// integration and P5 respectively.)
export const Tenants: CollectionConfig = {
  slug: "tenants",
  admin: {
    useAsTitle: "name",
    description: "Seller storefronts on the marketplace",
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === "admin",
    update: ({ req }) => req.user?.role === "admin",
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Storefront URL slug — powers /shop/[slug]",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending approval", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Suspended", value: "suspended" },
      ],
      access: {
        // Only platform admins may change approval status.
        update: ({ req }) => req.user?.role === "admin",
      },
    },
    {
      name: "stripeConnectAccountId",
      type: "text",
      admin: {
        readOnly: true,
        description: "Stripe Connect account id (set during onboarding — P5)",
      },
    },
  ],
};
