import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productVariants } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string().min(1),
  color: z.string().min(1),
  size: z.string().optional(),
  fabric: z.string().optional(),
  gtin: z.string().optional(),
  price: z.coerce.number().int().min(0),
  compareAtPrice: z.coerce.number().int().min(0).optional(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid variant payload." }, { status: 400 });
  const data = parsed.data;

  // Determine defaulting: the first variant for a product is always the default; explicit isDefault
  // requests demote any existing default so exactly one variant stays marked default per product.
  const existingVariants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, data.productId));
  const shouldBeDefault = data.isDefault || existingVariants.length === 0;

  if (shouldBeDefault && existingVariants.length) {
    await db
      .update(productVariants)
      .set({ isDefault: false })
      .where(eq(productVariants.productId, data.productId));
  }

  const [row] = await db
    .insert(productVariants)
    .values({
      productId: data.productId,
      name: data.name,
      sku: data.sku,
      color: data.color,
      size: data.size || null,
      fabric: data.fabric || null,
      gtin: data.gtin || null,
      price: data.price,
      compareAtPrice: data.compareAtPrice ?? null,
      stockQuantity: data.stockQuantity ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? 3,
      isDefault: shouldBeDefault,
      status: data.status ?? "active",
    })
    .returning();

  await auditLogEntry({
    actorEmail: admin.email,
    action: "variant.create",
    entityType: "variant",
    entityId: row.id,
    detail: { productId: data.productId, sku: data.sku },
  });

  return Response.json({ variant: row }, { status: 201 });
}
