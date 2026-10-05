import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminPushDevices } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { pushConfigured } from "@/lib/push/fcm";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(20).max(4096) });

/** Registers this browser for new-order alerts. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid token." }, { status: 400 });

  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db
    .insert(adminPushDevices)
    .values({ adminEmail: admin.email, token: parsed.data.token, userAgent })
    .onConflictDoUpdate({ target: adminPushDevices.token, set: { adminEmail: admin.email, userAgent, lastSeenAt: new Date() } });
  // `ready` tells the UI whether the server can actually send yet (service-account key configured).
  return Response.json({ ok: true, ready: pushConfigured() }, { status: 201 });
}

export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid token." }, { status: 400 });
  await db.delete(adminPushDevices).where(eq(adminPushDevices.token, parsed.data.token));
  return Response.json({ ok: true });
}
