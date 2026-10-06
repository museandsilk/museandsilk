import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { storeLocations } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { locationSchema } from "@/lib/locations";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Shop not found." }, { status: 404 });

  const parsed = locationSchema.partial().safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid shop details." }, { status: 400 });
  const data = parsed.data;

  const [existing] = await db.select().from(storeLocations).where(eq(storeLocations.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Shop not found." }, { status: 404 });
  // The main shop cannot be switched off or un-marked – make another shop the main one instead.
  if (existing.isMain && (data.active === false || data.isMain === false)) {
    return Response.json({ error: "This is your main shop. Make another shop the main one first." }, { status: 409 });
  }

  const [row] = await db
    .update(storeLocations)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.hours !== undefined ? { hours: data.hours } : {}),
      ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
      ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.isMain === true ? { isMain: true, active: true } : {}),
      updatedAt: new Date(),
    })
    .where(eq(storeLocations.id, id))
    .returning();
  if (data.isMain === true) await db.update(storeLocations).set({ isMain: false }).where(ne(storeLocations.id, id));

  await auditLogEntry({ actorEmail: admin.email, action: "location.update", entityType: "location", entityId: id, detail: { name: row.name } });
  return Response.json({ location: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Shop not found." }, { status: 404 });

  const [existing] = await db.select().from(storeLocations).where(eq(storeLocations.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Shop not found." }, { status: 404 });
  if (existing.isMain) {
    const [{ n }] = await db.select({ n: count() }).from(storeLocations).where(and(ne(storeLocations.id, id)));
    return Response.json({ error: n ? "This is your main shop. Make another shop the main one first." : "You need at least one shop." }, { status: 409 });
  }
  await db.delete(storeLocations).where(eq(storeLocations.id, id));
  await auditLogEntry({ actorEmail: admin.email, action: "location.delete", entityType: "location", entityId: id, detail: { name: existing.name } });
  return Response.json({ ok: true });
}
