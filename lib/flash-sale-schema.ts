import { z } from "zod";

/** Validation for creating / editing a flash sale (admin API). */
export const saleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.number().int().min(1).max(1_000_000),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    active: z.boolean().default(true),
    appliesToAll: z.boolean().default(false),
    productIds: z.array(z.string().uuid()).max(500).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === "percent" && value.discountValue > 90) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "A percentage discount can be at most 90%." });
    }
    if (new Date(value.endsAt) <= new Date(value.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The sale must end after it starts." });
    }
    if (!value.appliesToAll && value.productIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Pick at least one product, or apply the sale to everything." });
    }
  });
