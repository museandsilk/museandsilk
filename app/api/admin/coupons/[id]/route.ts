import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discountCodes } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const updateSchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    description: z.string().trim().optional().nullable(),
    type: z.enum(["percentage", "fixed"]).optional(),
    value: z.coerce.number().int().positive().optional(),
    minOrderAmount: z.coerce.number().int().min(0).optional(),
    maxDiscountAmount: z.coerce.number().int().positive().optional().nullable(),
    maxRedemptions: z.coerce.number().int().positive().optional().nullable(),
    appliesToDelivery: z.boolean().optional(),
    startsAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine((data) => data.type !== "percentage" || data.value === undefined || data.value <= 100, {
    message: "Percentage discounts cannot exceed 100.",
    path: ["value"],
  });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
  if (!row) return Response.json({ error: "Coupon not found." }, { status: 404 });
  return Response.json({ coupon: row });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid coupon payload." }, { status: 400 });
  }
  const data = parsed.data;

  if (data.code !== undefined) {
    const code = data.code.toUpperCase();
    const [existing] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code));
    if (existing && existing.id !== id) {
      return Response.json({ error: "A coupon with this code already exists." }, { status: 409 });
    }
  }

  const startsAt = toDate(data.startsAt);
  const expiresAt = toDate(data.expiresAt);

  const [row] = await db
    .update(discountCodes)
    .set({
      ...(data.code !== undefined ? { code: data.code.toUpperCase() } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.minOrderAmount !== undefined ? { minOrderAmount: data.minOrderAmount } : {}),
      ...(data.maxDiscountAmount !== undefined ? { maxDiscountAmount: data.maxDiscountAmount } : {}),
      ...(data.maxRedemptions !== undefined ? { maxRedemptions: data.maxRedemptions } : {}),
      ...(data.appliesToDelivery !== undefined ? { appliesToDelivery: data.appliesToDelivery } : {}),
      ...(startsAt !== undefined ? { startsAt } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(discountCodes.id, id))
    .returning();
  if (!row) return Response.json({ error: "Coupon not found." }, { status: 404 });

  const action = data.active === false ? "coupon.disable" : data.active === true ? "coupon.enable" : "coupon.update";
  await auditLogEntry({ actorEmail: admin.email, action, entityType: "discount-code", entityId: id, detail: data });

  return Response.json({ coupon: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  // Soft-delete only: discountRedemptions.discountCodeId cascades on delete, so a hard delete
  // here would silently wipe historical redemption records for past orders. Deactivating keeps
  // the coupon (and its usage history) intact while making it unusable at checkout — the same
  // effect as the per-row "Disable" action.
  const [row] = await db
    .update(discountCodes)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(discountCodes.id, id))
    .returning();
  if (!row) return Response.json({ error: "Coupon not found." }, { status: 404 });

  await auditLogEntry({ actorEmail: admin.email, action: "coupon.delete", entityType: "discount-code", entityId: id });

  return Response.json({ ok: true });
}
