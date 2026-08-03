import { z } from "zod";
import { asc } from "drizzle-orm";
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

const createSchema = z.object({
  name: z.string().min(1),
  cities: z.union([z.array(z.string()), z.string()]).optional(),
  provinces: z.union([z.array(z.string()), z.string()]).optional(),
  deliveryCharge: z.coerce.number().int().min(0),
  estimatedDaysMin: z.coerce.number().int().min(1).optional(),
  estimatedDaysMax: z.coerce.number().int().min(1).optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

function toList(value: string[] | string | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : listFromText(value);
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(deliveryZones).orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.name));
  return Response.json({ zones: rows });
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid delivery zone payload." }, { status: 400 });
  const data = parsed.data;

  let row;
  try {
    [row] = await db
      .insert(deliveryZones)
      .values({
        name: data.name,
        cities: toList(data.cities),
        provinces: toList(data.provinces),
        deliveryCharge: data.deliveryCharge,
        estimatedDaysMin: data.estimatedDaysMin ?? 2,
        estimatedDaysMax: data.estimatedDaysMax ?? 5,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: `A delivery zone named "${data.name}" already exists.` }, { status: 409 });
    }
    throw error;
  }

  await auditLogEntry({ actorEmail: admin.email, action: "delivery-zone.create", entityType: "delivery-zone", entityId: row.id, detail: { name: data.name } });

  return Response.json({ zone: row }, { status: 201 });
}
