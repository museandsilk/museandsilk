import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZones } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { isUniqueViolation } from "@/lib/db/errors";

export const dynamic = "force-dynamic";

const listFromText = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

function toList(value: string[] | string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : listFromText(value);
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  cities: z.union([z.array(z.string()), z.string()]).optional(),
  provinces: z.union([z.array(z.string()), z.string()]).optional(),
  deliveryCharge: z.coerce.number().int().min(0).optional(),
  estimatedDaysMin: z.coerce.number().int().min(1).optional(),
  estimatedDaysMax: z.coerce.number().int().min(1).optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid delivery zone payload." }, { status: 400 });
  const data = parsed.data;
  const cities = toList(data.cities);
  const provinces = toList(data.provinces);

  let row;
  try {
    [row] = await db
      .update(deliveryZones)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(cities !== undefined ? { cities } : {}),
        ...(provinces !== undefined ? { provinces } : {}),
        ...(data.deliveryCharge !== undefined ? { deliveryCharge: data.deliveryCharge } : {}),
        ...(data.estimatedDaysMin !== undefined ? { estimatedDaysMin: data.estimatedDaysMin } : {}),
        ...(data.estimatedDaysMax !== undefined ? { estimatedDaysMax: data.estimatedDaysMax } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        updatedAt: new Date(),
      })
      .where(eq(deliveryZones.id, id))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: `A delivery zone named "${data.name}" already exists.` }, { status: 409 });
    }
    throw error;
  }
  if (!row) return Response.json({ error: "Delivery zone not found." }, { status: 404 });

  await auditLogEntry({ actorEmail: admin.email, action: "delivery-zone.update", entityType: "delivery-zone", entityId: id, detail: data });

  return Response.json({ zone: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [row] = await db
    .update(deliveryZones)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(deliveryZones.id, id))
    .returning();
  if (!row) return Response.json({ error: "Delivery zone not found." }, { status: 404 });

  await auditLogEntry({ actorEmail: admin.email, action: "delivery-zone.deactivate", entityType: "delivery-zone", entityId: id });

  return Response.json({ ok: true });
}
