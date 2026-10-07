import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { faqs } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

/** Saves a new order: the first id becomes number 0, and so on. Ids that do not exist are simply skipped. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid order." }, { status: 400 });
  for (const [index, id] of parsed.data.ids.entries()) await db.update(faqs).set({ sortOrder: index, updatedAt: new Date() }).where(eq(faqs.id, id));
  await auditLogEntry({ actorEmail: admin.email, action: "faq.reorder", entityType: "faq", entityId: "all", detail: { count: parsed.data.ids.length } });
  return Response.json({ ok: true });
}
